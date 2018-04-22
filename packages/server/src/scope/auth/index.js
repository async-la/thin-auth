// @flow

import base64 from "base-64"
import crypto from "crypto"
import { getRemote } from "./getRemote"
import Mailgun from "mailgun-js"
import createSequelize, { Sequelize } from "../../db"
import type { TenantType } from "../../db"
import type {
  AliasType,
  AuthReq,
  CredentialType,
  Operation,
  SessionType,
  ThinAuthServerApi,
  Warrants,
} from "@rt2zz/thin-auth-interface"
import {
  CREDENTIAL_TYPE_EMAIL,
  CREDENTIAL_TYPE_SMS,
  CREDENTIAL_TYPE_DEV,
  MODE_CONFIRM,
  MODE_READ,
  MODE_WRITE,
  OP_VERIFY,
  OP_ALIAS_ADD,
  OP_ALIAS_UPDATE,
  OP_ALIAS_REMOVE,
} from "@rt2zz/thin-auth-interface"

import uuidV4 from "uuid/v4"
import jwt from "jsonwebtoken"
import twilio from "twilio"
import { enforceValidTenant } from "./tenantCache"
import { cryptoSign, cryptoVerify, cryptoCreateKeypair } from "../crypto"
import { SessionInactive, SessionNotLatent } from "./errors"
const JWT_SECRET = "3278ghskmnx//l382jzDS"
const CRYPTO_ALGO = "aes-256-ctr"

type CredentialData = [string, CredentialType]
type OpPayload = [Operation, CredentialData, ?CredentialData]
type CipherPayload = string
type SessionRecord = {
  id: string,
  userId: string,
  mode: number,
  publicKey: ?string,
  verifiedAt: Date,
  expiresAt: Date,
}
async function enforceActiveSession(Session: any, sessionId: string): Promise<SessionRecord> {
  let session = await Session.findOne({ where: { id: sessionId } })
  let now = new Date()
  if (!session || !session.verifiedAt || (session.expiresAt !== null && session.expiresAt < now)) {
    throw new SessionInactive({
      hasSession: !!session,
      sessionData: session && {
        verifiedAt: session.verifiedAt,
        expiresAt: session.expiresAt,
      },
    })
  }
  return session
}

// same as above except does not require verifiedAt
async function enforceLatentSession(Session: any, sessionId: string): Promise<SessionRecord> {
  let session = await Session.findOne({ where: { id: sessionId } })
  let now = new Date()
  if (!session || (session.expiresAt !== null && session.expiresAt < now)) {
    throw new SessionNotLatent({
      hasSession: !!session,
      sessionData: session && {
        verifiedAt: session.verifiedAt,
        expiresAt: session.expiresAt,
      },
    })
  }
  return session
}

async function enforceAliasUniqueness(
  Alias: any,
  { credential, type, mode = 0 }: AuthReq
): Promise<void> {
  let existingAlias = await Alias.find({
    where: { credential, type, verifiedAt: { [Sequelize.Op.ne]: null } },
  })
  if (mode === MODE_CONFIRM && existingAlias && existingAlias.some(a => a.mode !== MODE_CONFIRM))
    throw new Error("This alias already exists (duplicate alias only allowed for confirm mode)")
  if (mode !== MODE_CONFIRM && existingAlias && existingAlias.length)
    throw new Error("This alias already exists (duplicate alias only allowed for confirm mode)")
}

async function requestAuth(req: AuthReq): Promise<void> {
  let { mode = 0, type, credential } = req
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  if (!tenant.config.channelWhitelist.includes(type))
    throw new Error(`tenant does not support the requested channel ${type}`)
  const { Alias, aliasTable, Session, sequelize } = createSequelize(tenant)
  let [alias] = await sequelize.query(
    `SELECT * from \`${aliasTable}\` WHERE credential = ? AND type = ? AND deletedAt IS null AND verifiedAt IS NOT null AND mode & 2`,
    { replacements: [credential, type], type: sequelize.QueryTypes.SELECT }
  )
  if (!alias) {
    alias = {
      userId: uuidV4(),
      credential,
      secret: req.secret || null,
      type,
      mode,
      verifiedAt: null,
    }
    await Alias.create(alias)
  }

  let existingSession = await Session.findOne({ where: { id: this.sessionId } })
  if (existingSession) {
    if (existingSession.expiresAt && existingSession.expiresAt < new Date())
      throw new Error("requestAuth: sessionId is already expired")
    if (existingSession.verifiedAt) throw new Error("requestAuth: sessionId is already verified")
  } else {
    // @TODO add publicKey from this.signature (if exists)
    await Session.create({
      id: this.sessionId,
      userId: alias.userId,
      mode,
      expiresAt: null,
      verifiedAt: null,
    })
  }

  await sendLoginLink(tenant, this.sessionId, OP_VERIFY, req)
}

// @NOTE updateAlias only works if the type/credential has changed. There is currently no way to update mode on an existing credential
async function updateAlias(newReq: AuthReq, oldReq: AuthReq): Promise<void> {
  let { type, credential, mode = 0 } = newReq
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  if (!tenant.config.channelWhitelist.includes(type))
    throw new Error(`tenant does not support the requested channel ${type}`)
  const { Alias, Session } = createSequelize(tenant)
  let session = await enforceActiveSession(Session, this.sessionId)
  if (!(session.mode & MODE_WRITE)) throw new Error("cannot updateAlias without write mode session")
  await enforceAliasUniqueness(Alias, newReq)
  await Alias.create({
    credential,
    type,
    mode,
    userId: session.userId,
  })
  await sendLoginLink(tenant, this.sessionId, OP_ALIAS_UPDATE, newReq, oldReq)
}

async function addAlias(req: AuthReq): Promise<void> {
  let { type, credential, mode = 0 } = req
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  if (!tenant.config.channelWhitelist.includes(type))
    throw new Error(`tenant does not support the requested channel ${type}`)
  const { Alias, Session } = createSequelize(tenant)
  let session = await enforceActiveSession(Session, this.sessionId)
  if (!(session.mode & MODE_WRITE)) throw new Error("cannot addAlias without write mode session")
  await enforceAliasUniqueness(Alias, req)
  await Alias.create({
    credential,
    type,
    mode,
    userId: session.userId,
  })
  await sendLoginLink(tenant, this.sessionId, OP_ALIAS_ADD, req)
}

async function removeAlias(req: AuthReq): Promise<void> {
  let { type, credential } = req
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  if (!tenant.config.channelWhitelist.includes(type))
    throw new Error(`tenant does not support the requested channel ${type}`)
  const { Alias, Session } = createSequelize(tenant)
  let session = await enforceActiveSession(Session, this.sessionId)
  if (!(session.mode & MODE_WRITE)) throw new Error("cannot removeAlias without write mode session")
  Alias.update(
    { deletedAt: Sequelize.fn("NOW") },
    {
      where: {
        type,
        credential,
        userId: session.userId,
      },
    }
  )
}

async function sendLoginLink(
  tenant: TenantType,
  sessionId: string,
  operation: Operation,
  addAlias: AuthReq,
  removeAlias?: AuthReq
): Promise<void> {
  const { Op } = createSequelize(tenant)
  let op = await Op.create({
    id: uuidV4(),
    sessionId,
    operation,
    addAlias,
    removeAlias,
  })
  let cipher = encryptCipher(op.id)
  const link = `${tenant.authVerifyUrl}?op=${operation}&cipher=${cipher}`
  switch (addAlias.type) {
    case CREDENTIAL_TYPE_EMAIL:
      const { mailgunConfig } = tenant
      if (!mailgunConfig) throw new Error(`no mailgun config found for tenant ${tenant.name}`)
      const mailgun = Mailgun({
        apiKey: mailgunConfig.apiKey,
        domain: mailgunConfig.domain,
      })
      const data = {
        from: mailgunConfig.from,
        to: addAlias.credential,
        subject: mailgunConfig.subject,
        text: `Please verify your account: ${link}`,
        "o:testmode": mailgunConfig.flags && mailgunConfig.flags["o:testmode"],
      }

      mailgun.messages().send(data, function(err, body) {
        console.log(err, body)
      })
      return
    case CREDENTIAL_TYPE_SMS:
      // @TODO cache client?
      const { twilioConfig } = tenant
      if (!twilioConfig) throw new Error(`no twilio config found for tenant ${tenant.name}`)
      try {
        let twilioClient = twilio(twilioConfig.sid, twilioConfig.authToken)
        const message = await twilioClient.messages.create({
          body: link,
          to: addAlias.credential,
          from: twilioConfig.fromNumber,
        })
        console.log(`## Sent Twilio SMS to ${addAlias.credential}:`, message)
        return
      } catch (err) {
        console.error(err)
        throw err
      }
    case CREDENTIAL_TYPE_DEV:
      let remote = await getRemote(sessionId)
      remote.onDevRequest && remote.onDevRequest(cipher, operation)
      return
    default:
      throw new Error(`invalid credential type ${addAlias.type}`)
  }
}

async function approveAuth(cipher: string): Promise<void> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Alias, Op, Session } = createSequelize(tenant)

  let opId = decryptCipher(cipher)
  let op = await Op.findOne({ where: { id: opId } })
  if (!op) throw new Error(`approveAuth: op not found ${opId}`)
  let { sessionId, operation, addAlias, removeAlias } = op
  let session = await enforceLatentSession(Session, sessionId)
  // where the values are [?UpdateSession, ?DeleteAlias, ?AllAliases]
  let operations = [null, null, Alias.find({ where: { userId: session.userId } })]

  if (operation === OP_ALIAS_UPDATE) {
    if (!session.verifiedAt)
      throw new Error("approveAuth: OP_UPDATE_ALIAS requires an active session")
    if (!removeAlias)
      throw new Error(
        "approveAuth: OP_UPDATE_ALIAS requires a remove alias with credential and type "
      )
    let where = {
      credential: removeAlias.credential,
      type: removeAlias.type,
      userId: session.userId,
      deletedAt: null,
      verifiedAt: { [Sequelize.Op.ne]: null },
    }
    let oldAlias = await Alias.findOne({
      where,
    })
    if (!oldAlias) throw new Error("approveAuth: OP_UPDATE_ALIAS old alias could not be found")
    operations[1] = Alias.update({ deletedAt: Sequelize.fn("NOW") }, { where })
  }

  // @TODO should we only update verifiedAt if it is not already set?
  let updatedAlias: AliasType = await Alias.update(
    {
      verifiedAt: new Date(),
    },
    {
      where: {
        credential: addAlias.credential,
        type: addAlias.type,
        userId: session.userId,
        deletedAt: null,
      },
    }
  )

  // updated verifiedAt and mode if required, noop if unchanged
  let updatedSessionData = {
    mode: session.mode | addAlias.mode,
    // @NOTE only set verifiedAt if updatedAlias has MODE_READ
    verifiedAt: session.verifiedAt || addAlias.mode & MODE_READ ? new Date() : undefined,
  }
  if (
    session.mode !== updatedSessionData.mode ||
    session.verifiedAt !== updatedSessionData.verifiedAt
  )
    operations[0] = Session.update(updatedSessionData, { where: { id: sessionId } })

  let [sessionResult, oldAliasResult, allAlias] = await Promise.all(operations)

  // if session was updated, we need to alert client of the changes
  let warrants = createWarrants(session, allAlias)
  try {
    let remote = await getRemote(session.id)
    remote.onAuth && remote.onAuth(warrants)
  } catch (err) {
    // @NOTE noop if no remote found
    console.log("remote not found", err)
  }
}

async function rejectAuth(cipher: string): Promise<void> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Op, Session } = createSequelize(tenant)

  let opId = decryptCipher(cipher)
  let op = await Op.findOne({ where: { id: opId } })
  // @TODO do we need to track reject vs revoke vs plain expires?
  await Session.update({ expiresAt: new Date() }, { where: { id: op.sessionId } })
  // @TODO notify requesting client?
}

async function revokeAuth(sessionId: string): Promise<void> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Session } = createSequelize(tenant)

  await Session.update({ expiresAt: new Date() }, { where: { id: sessionId } })
}

async function refreshAuth(sessionId: string): Promise<Warrants> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Alias, Session } = createSequelize(tenant)

  let session = await enforceActiveSession(Session, this.sessionId)
  let allAlias = await Alias.find({ where: { userId: session.userId } })
  let warrants = createWarrants(session, allAlias)
  return warrants
}

function createWarrants(session: SessionRecord, alias: Array<AliasType>): Warrants {
  return [
    // idWarrant
    jwt.sign({ userId: session.userId, publicKey: session.publicKey }, JWT_SECRET),
    // metaWarrant
    jwt.sign({ userId: session.userId, sessionMode: session.mode, alias }, JWT_SECRET),
  ]
}

// @NOTE we stringify / parse as an easy check that the payload is valid
function encryptCipher(data: CipherPayload): string {
  var cipher = crypto.createCipher(CRYPTO_ALGO, JWT_SECRET)
  var crypted = cipher.update(JSON.stringify(data), "utf8", "hex")
  crypted += cipher.final("hex")
  return crypted
}

function decryptCipher(text: string): CipherPayload {
  var decipher = crypto.createDecipher(CRYPTO_ALGO, JWT_SECRET)
  var dec = decipher.update(text, "hex", "utf8")
  dec += decipher.final("utf8")
  return JSON.parse(dec)
}

function decodeWarrant(warrant: string): any {
  // return nothing if we are missing IdWarrant or refreshToken
  const parts = warrant.split(".")
  let raw = base64.decode(parts[1])
  let decodedToken = JSON.parse(raw)
  return decodedToken
}

async function setUserState(idWarrant: string, state: Object): Promise<void> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { State } = createSequelize(tenant)

  let { userId } = decodeWarrant(idWarrant)
  let currentState = (await State.findOne({ where: { key: userId } })) || {}
  let newState = Object.assign({}, currentState, state)
  currentState
    ? State.update({ state: newState }, { where: { key: userId } })
    : State.insert({ key: userId, state: newState })
}

async function getUserState(idWarrant: string): Promise<Object> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { State } = createSequelize(tenant)

  let { userId } = decodeWarrant(idWarrant)
  return State.findOne({ where: { key: userId } })
}

const authApi: ThinAuthServerApi = {
  // auth
  approveAuth,
  rejectAuth,
  revokeAuth,
  requestAuth,
  refreshAuth,

  // alias
  addAlias,
  updateAlias,
  removeAlias,

  // user
  getUserState,
  setUserState,

  // @NOTE ideally these methods are implemented client side, but we also expose these on the server for compatability reasons.
  cryptoCreateKeypair,
  cryptoSign,
  cryptoVerify,
}

export default authApi

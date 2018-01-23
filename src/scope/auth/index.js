// @flow

import type { ThinAuthServerApi } from "../../types"

import { getRemote } from "./getRemote"
import Mailgun from "mailgun-js"
import createSequelize, { Sequelize } from "../../db"
import type { Keypair, SessionType, Signature } from "../../types"
import uuidV4 from "uuid/v4"
import jwt from "jsonwebtoken"
import { api as sodium, Sign } from 'sodium'
import { enforceValidTenant } from './tenantCache'
import { AUTH_KEY } from "../../constants"

let mailgun = Mailgun({ apiKey: process.env.MAILGUN_API_KEY, domain: "mail.root-two.com" })
const JWT_SECRET = "3278ghskmnx//l382jzDS"

async function requestAuth(email: string): Promise<void> {
  let tenantApiKey = this.accessToken
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Alias, Session } = createSequelize(tenant)

  let existingAlias = await Alias.findOne({ where: { email } })
  let alias = existingAlias
  if (!alias) {
    alias = {
      email,
      userId: uuidV4()
    }
    // @TODO confirm this throws if fails
    await Alias.create(alias)
  }

  let session = {
    id: uuidV4(),
    userId: alias.userId,
    connectionId: this.connectionId
  }
  if (existingAlias) await Session.destroy({ where: { userId: existingAlias.userId } })
  await Session.create(session)

  const link = `${tenant.authVerifyUrl}?token=${session.id}`
  var data = {
    from: "Admin <admin@mail.root-two.com>",
    to: email,
    subject: `Welcome to ${tenant.name}`,
    text: `Please verify your account: ${link}`
  }

  mailgun.messages().send(data, function(err, body) {
    console.log(err, body)
  })
}

async function approveAuth(sessionId: string): Promise<void> {
  let tenantApiKey = this.accessToken
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Alias, Session } = createSequelize(tenant)

  // find does redis lookup of connection
  // @TODO create refreshToken, accessToken
  let session = await Session.findById(sessionId)
  console.log("has session? ", session)
  // @TODO figure out expiration, payload
  await session.update({ verifiedAt: new Date() }, { where: { id: session.id } })
  var accessToken = createAccessToken(session)
  try {
    let remote = await getRemote(AUTH_KEY, session.connectionId)
    remote.onAuthApprove({ accessToken })
  } catch (err) {
    // @NOTE noop if no remote found
    console.log("getRemote err", err)
  }
}

async function rejectAuth(sessionId: string): Promise<void> {
  let tenantApiKey = this.accessToken
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Session } = createSequelize(tenant)

  let session = delete Session.findById(sessionId)
}

async function revokeAuth(connectionId: string): Promise<void> {
  let tenantApiKey = this.accessToken
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Session } = createSequelize(tenant)

  await Session.update({ expiredAt: new Date() }, { where: { connectionId } })
}

async function refreshAccessToken(connectionId: string): Promise<string> {
  let tenantApiKey = this.accessToken
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Session } = createSequelize(tenant)
  
  let session = await Session.findOne({ where: { connectionId, expiredAt: null } })
  console.log("session", session)
  if (!session) throw new Error("Session Does not Exist")
  let accessToken = createAccessToken(session)
  return accessToken
}

function createAccessToken(session: SessionType): string {
  if (!session.verifiedAt) throw new Error("Session is Not Verified")
  return jwt.sign({ userId: session.userId }, JWT_SECRET)
}

async function crypto_sign_keypair(): Promise<Keypair> {
  var sender = sodium.crypto_sign_keypair()
  console.log('send', sender)
  return sender
}


async function cryptoSign(message: Buffer, secretKey: Buffer): Promise<Signature> {
  let a = new Sign(secretKey)
  return a.sign(message)
}

async function cryptoOpen(signature: Signature): Promise<string> {
  let verified = Sign.verify(signature)
  return verified && verified.toString('utf8')
}

const authApi: ThinAuthServerApi = {
  // auth
  approveAuth,
  rejectAuth,
  revokeAuth,
  requestAuth,
  refreshAccessToken,

  // sodium exported methods
  // @NOTE not secure, this is for prototyping conveinence
  crypto_sign_keypair,
  cryptoSign,
  cryptoOpen,
}

export default authApi

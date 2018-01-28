// @flow

import { getRemote } from "./getRemote"
import Mailgun from "mailgun-js"
import createSequelize, { Sequelize } from "../../db"
import type { Keypair, SessionType, Signature, ThinAuthServerApi } from "@rt2zz/thin-auth-interface"
import uuidV4 from "uuid/v4"
import jwt from "jsonwebtoken"
import { api as sodium, Sign } from 'sodium'
import { enforceValidTenant } from './tenantCache'
import { AUTH_KEY } from "../../constants"

let mailgun = Mailgun({ apiKey: process.env.MAILGUN_API_KEY, domain: "mail.root-two.com" })
const JWT_SECRET = "3278ghskmnx//l382jzDS"
const CRYPTOBOX_PUB_KEY = process.env.CRYPTOBOX_PUB_KEY || ''
const CRYPTOBOX_SECRET_KEY = process.env.CRYPTOBOX_SECRET_KEY || ''
const cryptoBox = new sodium.Box(JSON.parse(CRYPTOBOX_PUB_KEY), JSON.parse(CRYPTOBOX_SECRET_KEY))

async function requestAuth(email: string): Promise<void> {
  let tenantApiKey = this.authentication
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
    id: this.sessionId,
    userId: alias.userId,
  }
  let existingSession = await Session.findOne({ where: { id: this.sessionId }})
  if (existingSession) {
    let expiredAt = existingSession.expiredAt
    if (!expiredAt || expiredAt > Date.now()) throw new Error('session already exists') // @NOTE in the future we could allow a refresh on the session
    else await existingSession.destroy()
  }
  await Session.create(session)

  let cipher = await cryptoEncrypt(session.id)
  const link = `${tenant.authVerifyUrl}?cipher=${cipher}`
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

async function approveAuth(sessionCipher: string): Promise<void> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Alias, Session } = createSequelize(tenant)

  let sessionId = await cryptoDecrypt(sessionCipher)
  let session = await Session.findById(sessionId)
  // @TODO figure out expiration, payload
  await session.update({ verifiedAt: new Date() }, { where: { id: session.id } })
  var idWarrant = createIdWarrant(session)
  try {
    let remote = await getRemote(AUTH_KEY, session.id)
    remote.onAuthApprove({ idWarrant })
  } catch (err) {
    // @NOTE noop if no remote found
    console.log("getRemote err", err)
  }
}

async function rejectAuth(sessionCipher: string): Promise<void> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Session } = createSequelize(tenant)

  let sessionId = await cryptoDecrypt(sessionCipher)
  let session = Session.destroy({ where: { id: sessionId }})
  // @TODO notify requesting client?
}

async function revokeAuth(sessionId: string): Promise<void> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Session } = createSequelize(tenant)

  await Session.update({ expiredAt: new Date() }, { where: { id: sessionId } })
}

async function refreshIdWarrant(sessionId: string): Promise<string> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Session } = createSequelize(tenant)
  
  let session = await Session.findOne({ where: { id: sessionId } } )
  // @TODO test this expiredAt equality
  if (!session || (session.expiredAt && session.expiredAt < new Date())) throw new Error("Session does not exist or is expired")
  let idWarrant = createIdWarrant(session)
  return idWarrant
}

function createIdWarrant(session: SessionType): string {
  if (!session.verifiedAt) throw new Error("Session is Not Verified")
  return jwt.sign({ userId: session.userId }, JWT_SECRET)
}


async function crypto_sign_keypair(): Promise<Keypair> {
  var sender = sodium.crypto_sign_keypair()
  return sender
}

async function cryptoSign(message: Buffer, secretKey: Buffer): Promise<Signature> {
  let a = new Sign(secretKey)
  return a.sign(message)
}

async function cryptoVerify(signature: Signature): Promise<string> {
  let verified = Sign.verify(signature)
  return verified && verified.toString('utf8')
}

// @NOTE these methods are not exported, intended for private usage
async function cryptoEncrypt(message: string) {
  let cipherText = cryptoBox.encrypt(message, "utf8");
  console.log('CT', cipherText, typeof cipherText)
  return cipherText
}

async function cryptoDecrypt(cipherText: string) {
  let plainText = cryptoBox.decrypt(cipherText);
  return plainText
}


const authApi: ThinAuthServerApi = {
  // auth
  approveAuth,
  rejectAuth,
  revokeAuth,
  requestAuth,
  refreshIdWarrant,

  // sodium exported methods
  // @NOTE not secure, this is for prototyping conveinence
  crypto_sign_keypair,
  cryptoSign,
  cryptoVerify,
}

export default authApi

// @flow

import { getRemote } from "./getRemote"
import Mailgun from "mailgun-js"
import createSequelize, { Sequelize } from "../../db"
import type { Keypair, SessionType, Signature, ThinAuthServerApi } from "@rt2zz/thin-auth-interface"
import uuidV4 from "uuid/v4"
import jwt from "jsonwebtoken"
import { api as sodium, Box, Sign } from 'sodium'
import { enforceValidTenant } from './tenantCache'
import { AUTH_KEY } from "../../constants"

let mailgun = Mailgun({ apiKey: process.env.MAILGUN_API_KEY, domain: "mail.root-two.com" })
const JWT_SECRET = "3278ghskmnx//l382jzDS"
const CRYPTOBOX_PUB_KEY = process.env.CRYPTOBOX_PUB_KEY || ''
const CRYPTOBOX_SECRET_KEY = process.env.CRYPTOBOX_SECRET_KEY || ''
const cryptoBox = new Box(JSON.parse(CRYPTOBOX_PUB_KEY), JSON.parse(CRYPTOBOX_SECRET_KEY))

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
  console.log('1')
  let existingSession = await Session.findOne({ where: { id: this.sessionId }})
  console.log('existing', existingSession)
  if (!existingSession) await Session.create(session)
  console.log('2')

  let cipher = await cryptoEncrypt(session.id)
  const link = `${tenant.authVerifyUrl}?cipher=${serializeCipher(cipher)}`
  var data = {
    from: "Admin <admin@mail.root-two.com>",
    to: email,
    subject: `Welcome to ${tenant.name}`,
    text: `Please verify your account: ${link}`
  }

  mailgun.messages().send(data, function(err, body) {
    console.log(err, body)
  })
  console.log('final')
}

async function approveAuth(serialSessionCipher: string): Promise<void> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Alias, Session } = createSequelize(tenant)

  let sessionCipher = JSON.parse(serialSessionCipher)
  let sessionId = await cryptoDecrypt(sessionCipher)
  let session = await Session.findById(sessionId)
  // @TODO figure out expiration, payload
  await session.update({ verifiedAt: new Date(), expiredAt: null }, { where: { id: session.id } })
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
type Cipher = {
  nonce: Buffer,
  cipherText: Buffer,
}

// @TODO make the result much more compact
function serializeCipher (cipher: Cipher): string {
  return `${cipher.nonce.toString('hex')}::${cipher.cipherText.toString('hex')}`
}

function deserializeCipher (serialCipher: string): Cipher {
  let parts = serialCipher.split('::')
  return {
    nonce: new Buffer(parts[0]),
    cipherText: new Buffer(parts[1]),
  }
}

async function cryptoEncrypt(message: string): Promise<Cipher> {
  let cipherText = cryptoBox.encrypt(message, "hex");
  return cipherText
}

async function cryptoDecrypt(cipherText: string): Promise<string> {
  let plainText = cryptoBox.decrypt(cipherText);
  console.log('decrypt', plainText)
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

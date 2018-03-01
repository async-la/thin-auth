// @flow

import crypto from 'crypto'
import { getRemote } from "./getRemote"
import Mailgun from "mailgun-js"
import createSequelize, { Sequelize } from "../../db"
import type { TenantType  } from '../../db'
import type { AuthReq, Keypair, SessionType, Signature, ThinAuthServerApi } from "@rt2zz/thin-auth-interface"
import { CREDENTIAL_TYPE_EMAIL, CREDENTIAL_TYPE_SMS } from "@rt2zz/thin-auth-interface"

import uuidV4 from "uuid/v4"
import jwt from "jsonwebtoken"
import twilio from 'twilio'
import { api as sodium, Box, Key, Sign } from 'sodium'
import { enforceValidTenant } from './tenantCache'
import { AUTH_KEY } from "../../constants"

const JWT_SECRET = "3278ghskmnx//l382jzDS"
const CRYPTO_ALGO = 'aes-256-ctr'

async function requestAuth(req: AuthReq): Promise<void> {
  let { type, credential } = req
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Alias, Session } = createSequelize(tenant)

  let existingAlias = await Alias.findOne({ where: { credential, type } })
  let alias = existingAlias
  if (!alias) {
    alias = {
      credential,
      type,
      userId: uuidV4()
    }
    // @TODO confirm this throws if fails
    await Alias.create(alias)
  }

  let session = {
    id: this.sessionId,
    userId: alias.userId,
  }
  let existingSession = await Session.findOne({ where: { id: this.sessionId, expiredAt: { $eq: null } }})
  if (!existingSession) await Session.create(session)

  let cipher = encrypt(session.id)
  const link = `${tenant.authVerifyUrl}?cipher=${cipher}`
  sendLoginLink(tenant, req, link)
}

async function sendLoginLink(tenant: TenantType, req: AuthReq, link: string) {
  console.log(req)
  switch(req.type){
    case 'email':
      const { mailgunConfig } = tenant
      if (!mailgunConfig)
        throw new Error(`no mailgun config found for tenant ${tenant.name}`)
      const mailgun = Mailgun({ apiKey: mailgunConfig.apiKey, domain: mailgunConfig.domain })
      const data = {
        from: mailgunConfig.from,
        to: req.credential,
        subject: mailgunConfig.subject,
        text: `Please verify your account: ${link}`
      }

      mailgun.messages().send(data, function(err, body) {
        console.log(err, body)
      })
      return
    case 'sms':
      // @TODO cache client?
      const { twilioConfig } = tenant
      if (!twilioConfig)
        throw new Error(`no twilio config found for tenant ${tenant.name}`)
      try {
        let twilioClient = twilio(twilioConfig.sid, twilioConfig.authToken)
        const message = await twilioClient.messages.create({
          body: link,
          to: req.credential,
          from: twilioConfig.fromNumber,
        })
        console.log(`## Sent Twilio SMS to ${req.credential}:`, message)
        return
      } catch (err) {
        console.error(err)
        throw err
      }
    default:
      throw new Error(`invalid credential type ${req.type}`)
  }
}

async function approveAuth(cipher: string): Promise<void> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Alias, Session } = createSequelize(tenant)

  let sessionId = decrypt(cipher)
  let session = await Session.findOne({ where: { id: sessionId, expiredAt: { $eq: null }}})

  // Non-existing or expired session
  if (!session) throw new Error("Session does not exist or is expired")

  // @TODO figure out expiration, payload
  if (session.verifiedAt === null) {
    await session.update({ verifiedAt: new Date() })
  }

  var idWarrant = createIdWarrant(session)

  try {
    let remote = await getRemote(AUTH_KEY, session.id)
    remote.onAuthApprove({ idWarrant })
  } catch (err) {
    // @NOTE noop if no remote found
    console.log("getRemote err", err)
  }
}

async function rejectAuth(cipher: string): Promise<void> {
  let tenantApiKey = this.authentication
  let tenant = await enforceValidTenant(tenantApiKey)
  const { Session } = createSequelize(tenant)

  let sessionId = decrypt(cipher)
  let session = await Session.destroy({ where: { id: sessionId }})
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

async function cryptoSign(message: Buffer, publicKey: Buffer, secretKey: Buffer): Promise<Signature> {
  let keySign = new Key.Sign(publicKey, secretKey)
  let a = new Sign(keySign)
  return a.sign(message)
}

async function cryptoVerify(signature: Signature): Promise<string> {
  let verified = Sign.verify(signature)
  return verified && verified.toString('utf8')
}

// @NOTE commented out for now - using plain nodejs crypto for the time being
// @NOTE these methods are not exported, intended for private usage
// type Cipher = {
//   nonce: Buffer,
//   cipherText: Buffer,
// }
// const CRYPTOBOX_PUB_KEY = process.env.CRYPTOBOX_PUB_KEY || ''
// const CRYPTOBOX_SECRET_KEY = process.env.CRYPTOBOX_SECRET_KEY || ''
// const cryptoBox = new Box(JSON.parse(CRYPTOBOX_PUB_KEY), JSON.parse(CRYPTOBOX_SECRET_KEY))
// @TODO make the result much more compact
// function serializeCipher (cipher: Cipher): string {
//   console.log('SERIAL', cipher)
//   return `${cipher.nonce.toString('hex')}::${cipher.cipherText.toString('hex')}`
// }

// function deserializeCipher (serialCipher: string): Cipher {
//   let parts = serialCipher.split('::')
//   return {
//     nonce: new Buffer(parts[0], 'hex'),
//     cipherText: new Buffer(parts[1], 'hex'),
//   }
// }

// async function cryptoEncrypt(message: string): Promise<Cipher> {
//   let cipherText = cryptoBox.encrypt(message);
//   return cipherText
// }

// async function cryptoDecrypt(cipher: Cipher): Promise<string> {
//   console.log('dc', cipher)
//   let plainText = cryptoBox.decrypt(cipher);
//   console.log('decrypt', plainText)
//   return plainText
// }

function encrypt(text: string): string{
  var cipher = crypto.createCipher(CRYPTO_ALGO,JWT_SECRET)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

function decrypt(text: string): string{
  var decipher = crypto.createDecipher(CRYPTO_ALGO,JWT_SECRET)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
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

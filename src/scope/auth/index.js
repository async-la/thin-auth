// @flow

import type { ThinAuthServerApi } from "../../types"

import { getRemote } from "./getRemote"
import Mailgun from "mailgun-js"
import { Alias, Session, Sequelize } from "../../db"
import type { SessionType } from "../types"
import uuidV4 from "uuid/v4"
import jwt from "jsonwebtoken"
import { AUTH_KEY } from "../../constants"

let mailgun = Mailgun({ apiKey: process.env.MAILGUN_API_KEY, domain: "mail.root-two.com" })
const JWT_SECRET = "hiho"

async function requestAuth(email: string): Promise<void> {
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
  console.log("C", session)
  if (existingAlias) await Session.destroy({ where: { userId: existingAlias.userId } })
  await Session.create(session)

  const link = `http://localhost:3009/verify?token=${session.id}`
  var data = {
    from: "Admin <admin@mail.root-two.com>",
    to: email,
    subject: "Welcome to Async",
    text: `Please verify your account: ${link}`
  }

  mailgun.messages().send(data, function(err, body) {
    console.log(err, body)
  })
}

async function approveAuth(sessionId: string): Promise<void> {
  // find does redis lookup of connection
  // @TODO create refreshToken, accessToken
  let session = await Session.findById(sessionId)
  console.log("has session? ", session)
  // @TODO figure out expiration, payload
  await session.update({ verifiedAt: new Date() }, { where: { id: session.id } })
  var accessToken = createAccessToken(session)
  try {
    let remote = await getRemote(AUTH_KEY, session.connectionId)
    console.log("remote?", remote, session.connectionId)
    remote.onAuthApprove({ accessToken })
  } catch (err) {
    // @NOTE noop if no remote found
    console.log("getRemote err", err)
  }
}

async function rejectAuth(sessionId: string): Promise<void> {
  let session = delete Session.findById(sessionId)
}

async function revokeAuth(connectionId: string): Promise<void> {
  await Session.update({ expiredAt: new Date() }, { where: { connectionId } })
}

async function refreshAccessToken(connectionId: string): Promise<string> {
  console.log("find", connectionId)
  let session = await Session.findOne({ where: { connectionId, expiredAt: null } })
  console.log("session", session)
  if (!session) throw new Error("Session Does not Exist")
  let accessToken = createAccessToken(session)
  return accessToken
}

function createAccessToken(session: Session): string {
  if (!session.verifiedAt) throw new Error("Session is Not Verified")
  return jwt.sign({ userId: session.userId }, JWT_SECRET)
}

const authApi: AuthServerApi = {
  // auth
  approveAuth,
  rejectAuth,
  revokeAuth,
  requestAuth,
  refreshAccessToken
}

export default authApi

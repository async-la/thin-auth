// @flow

import crypto from "crypto";
import { getRemote } from "./getRemote";
import Mailgun from "mailgun-js";
import createSequelize, { Sequelize } from "../../db";
import type { TenantType } from "../../db";
import type {
  AuthReq,
  SessionType,
  ThinAuthServerApi
} from "@rt2zz/thin-auth-interface";
import {
  CREDENTIAL_TYPE_EMAIL,
  CREDENTIAL_TYPE_SMS,
  CREDENTIAL_TYPE_DEV
} from "@rt2zz/thin-auth-interface";

import uuidV4 from "uuid/v4";
import jwt from "jsonwebtoken";
import twilio from "twilio";
import { enforceValidTenant } from "./tenantCache";
import { AUTH_KEY } from "../../constants";
import { cryptoSign, cryptoVerify, cryptoCreateKeypair } from "../crypto";

const JWT_SECRET = "3278ghskmnx//l382jzDS";
const CRYPTO_ALGO = "aes-256-ctr";

async function requestAuth(req: AuthReq): Promise<void> {
  let { type, credential } = req;
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  if (!tenant.config.channelWhitelist.includes(type))
    throw new Error(`tenant does not support the requested channel ${type}`);
  const { Alias, Session } = createSequelize(tenant);

  let existingAlias = await Alias.findOne({ where: { credential, type } });
  let alias = existingAlias;
  if (!alias) {
    alias = {
      credential,
      type,
      userId: uuidV4()
    };
    // @TODO confirm this throws if fails
    await Alias.create(alias);
  }

  let session = {
    id: this.sessionId,
    userId: alias.userId,
    expiresAt: null,
    verifiedAt: null
  };
  let existingSession = await Session.findOne({ where: { id: session.id } });
  // @TODO 1 uncomment line below, do not allow reuse of expired session, also remove expiresAt and verifiedAt from session above
  // if (existingSession && existingSession.expiresAt < new Date()) throw new Error('requestAuth: sessionId is already expired')
  if (!existingSession) await Session.create(session);
  else
    // @TODO 2 when fixing @TODO 1, remove this else
    await Session.update(session, { where: { id: session.id } });

  sendLoginLink(tenant, req, session);
}

async function sendLoginLink(
  tenant: TenantType,
  req: AuthReq,
  session: Object
): Promise<void> {
  let cipher = encrypt(session.id);
  const link = `${tenant.authVerifyUrl}?cipher=${cipher}`;
  switch (req.type) {
    case CREDENTIAL_TYPE_EMAIL:
      const { mailgunConfig } = tenant;
      if (!mailgunConfig)
        throw new Error(`no mailgun config found for tenant ${tenant.name}`);
      const mailgun = Mailgun({
        apiKey: mailgunConfig.apiKey,
        domain: mailgunConfig.domain
      });
      const data = {
        from: mailgunConfig.from,
        to: req.credential,
        subject: mailgunConfig.subject,
        text: `Please verify your account: ${link}`,
        "o:testmode": mailgunConfig.flags && mailgunConfig.flags["o:testmode"]
      };

      mailgun.messages().send(data, function(err, body) {
        console.log(err, body);
      });
      return;
    case CREDENTIAL_TYPE_SMS:
      // @TODO cache client?
      const { twilioConfig } = tenant;
      if (!twilioConfig)
        throw new Error(`no twilio config found for tenant ${tenant.name}`);
      try {
        let twilioClient = twilio(twilioConfig.sid, twilioConfig.authToken);
        const message = await twilioClient.messages.create({
          body: link,
          to: req.credential,
          from: twilioConfig.fromNumber
        });
        console.log(`## Sent Twilio SMS to ${req.credential}:`, message);
        return;
      } catch (err) {
        console.error(err);
        throw err;
      }
    case CREDENTIAL_TYPE_DEV:
      let remote = await getRemote(AUTH_KEY, session.id);
      remote.onDevRequest && remote.onDevRequest(cipher);
    default:
      throw new Error(`invalid credential type ${req.type}`);
  }
}

async function approveAuth(cipher: string): Promise<void> {
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  const { Alias, Session } = createSequelize(tenant);

  let sessionId = decrypt(cipher);
  let session = await Session.findOne({
    where: {
      id: this.sessionId,
      [Sequelize.Op.or]: [
        { expiresAt: { [Sequelize.Op.lt]: new Date() } },
        { expiresAt: null }
      ]
    }
  });
  // Non-existing or expired session
  if (!session)
    throw new Error("approveAuth: Session does not exist or is expired");

  // @TODO figure out expiration, payload
  if (session.verifiedAt === null) {
    await session.update({ verifiedAt: new Date() });
  } else {
    console.log("## session is already verified, NOOP");
    // @TODO does this deserve a special return code?
    return;
  }

  var idWarrant = createIdWarrant(session);

  try {
    let remote = await getRemote(AUTH_KEY, session.id);
    remote.onAuthApprove && remote.onAuthApprove({ idWarrant });
  } catch (err) {
    // @NOTE noop if no remote found
    console.log("getRemote err", err);
  }
}

async function rejectAuth(cipher: string): Promise<void> {
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  const { Session } = createSequelize(tenant);

  let sessionId = decrypt(cipher);
  // @TODO do we need to track reject vs revoke vs plain expires?
  await Session.update({ expiresAt: new Date() }, { where: { id: sessionId } });
  // @TODO notify requesting client?
}

async function revokeAuth(sessionId: string): Promise<void> {
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  const { Session } = createSequelize(tenant);

  await Session.update({ expiresAt: new Date() }, { where: { id: sessionId } });
}

async function refreshIdWarrant(sessionId: string): Promise<string> {
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  const { Session } = createSequelize(tenant);

  let session = await Session.findOne({ where: { id: sessionId } });
  if (!session || (session.expiresAt && session.expiresAt < new Date()))
    throw new Error("refreshIdWarrant: Session does not exist or is expired");
  let idWarrant = createIdWarrant(session);
  return idWarrant;
}

function createIdWarrant(session: SessionType): string {
  if (!session.verifiedAt) throw new Error("Session is Not Verified");
  return jwt.sign({ userId: session.userId }, JWT_SECRET);
}

function encrypt(text: string): string {
  var cipher = crypto.createCipher(CRYPTO_ALGO, JWT_SECRET);
  var crypted = cipher.update(text, "utf8", "hex");
  crypted += cipher.final("hex");
  return crypted;
}

function decrypt(text: string): string {
  var decipher = crypto.createDecipher(CRYPTO_ALGO, JWT_SECRET);
  var dec = decipher.update(text, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

const authApi: ThinAuthServerApi = {
  // auth
  approveAuth,
  rejectAuth,
  revokeAuth,
  requestAuth,
  refreshIdWarrant,

  // @NOTE ideally these methods are implemented client side, but we also expose these on the server for compatability reasons.
  cryptoCreateKeypair,
  cryptoSign,
  cryptoVerify
};

export default authApi;

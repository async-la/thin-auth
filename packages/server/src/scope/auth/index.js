// @flow

import crypto from "crypto";
import { getRemote } from "./getRemote";
import Mailgun from "mailgun-js";
import createSequelize, { Sequelize } from "../../db";
import type { TenantType } from "../../db";
import type {
  AliasType,
  AuthReq,
  CredentialType,
  Operation,
  SessionType,
  ThinAuthServerApi
} from "@rt2zz/thin-auth-interface";
import {
  CREDENTIAL_TYPE_EMAIL,
  CREDENTIAL_TYPE_SMS,
  CREDENTIAL_TYPE_DEV,
  OP_VERIFY,
  OP_ALIAS_ADD,
  OP_ALIAS_UPDATE,
  OP_ALIAS_REMOVE
} from "@rt2zz/thin-auth-interface";

import uuidV4 from "uuid/v4";
import jwt from "jsonwebtoken";
import twilio from "twilio";
import { enforceValidTenant } from "./tenantCache";
import { cryptoSign, cryptoVerify, cryptoCreateKeypair } from "../crypto";
import { SessionInactive, SessionNotLatent } from "./errors";
const JWT_SECRET = "3278ghskmnx//l382jzDS";
const CRYPTO_ALGO = "aes-256-ctr";

type CredentialData = [string, CredentialType];
type CipherPayload = [string, Operation, CredentialData, ?CredentialData];
type SessionRecord = SessionType & {
  verifiedAt: Date,
  expiresAt: Date
};
async function enforceActiveSession(
  Session: any,
  sessionId: string
): Promise<SessionType> {
  let session = await Session.findOne({ where: { id: sessionId } });
  let now = new Date();
  if (
    !session ||
    !session.verifiedAt ||
    (session.expiresAt !== null && session.expiresAt < now)
  ) {
    throw new SessionInactive({
      hasSession: !!session,
      sessionData: session && {
        verifiedAt: session.verifiedAt,
        expiresAt: session.expiresAt
      }
    });
  }
  return session;
}

// same as above except does not require verifiedAt
async function enforceLatentSession(
  Session: any,
  sessionId: string
): Promise<SessionRecord> {
  let session = await Session.findOne({ where: { id: sessionId } });
  let now = new Date();
  if (!session || (session.expiresAt !== null && session.expiresAt < now)) {
    throw new SessionNotLatent({
      hasSession: !!session,
      sessionData: session && {
        verifiedAt: session.verifiedAt,
        expiresAt: session.expiresAt
      }
    });
  }
  return session;
}

async function requestAuth(req: AuthReq): Promise<void> {
  let { type, credential } = req;
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  if (!tenant.config.channelWhitelist.includes(type))
    throw new Error(`tenant does not support the requested channel ${type}`);
  const { Alias, Session } = createSequelize(tenant);

  let existingAlias = await Alias.findOne({
    where: { credential, type, deletedAt: null }
  });
  let alias = existingAlias;
  if (!alias) {
    alias = {
      credential,
      type,
      userId: uuidV4()
    };
  }

  let session = {
    id: this.sessionId,
    userId: alias.userId,
    expiresAt: null,
    verifiedAt: null
  };
  let existingSession = await Session.findOne({ where: { id: session.id } });
  if (existingSession) {
    if (existingSession.expiresAt && existingSession.expiresAt < new Date())
      throw new Error("requestAuth: sessionId is already expired");
    if (existingSession.verifiedAt)
      throw new Error("requestAuth: sessionId is already verified");
  } else await Session.create(session);

  await sendLoginLink(tenant, session.id, OP_VERIFY, alias);
}

async function updateAlias(newReq: AuthReq, oldReq: AuthReq): Promise<void> {
  let { type, credential } = newReq;
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  if (!tenant.config.channelWhitelist.includes(type))
    throw new Error(`tenant does not support the requested channel ${type}`);
  const { Session } = createSequelize(tenant);
  await enforceActiveSession(Session, this.sessionId);

  await sendLoginLink(tenant, this.sessionId, OP_ALIAS_UPDATE, newReq, oldReq);
}

async function addAlias(req: AuthReq): Promise<void> {
  let { type, credential } = req;
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  if (!tenant.config.channelWhitelist.includes(type))
    throw new Error(`tenant does not support the requested channel ${type}`);
  const { Session } = createSequelize(tenant);
  await enforceActiveSession(Session, this.sessionId);

  await sendLoginLink(tenant, this.sessionId, OP_ALIAS_ADD, req);
}

async function removeAlias(req: AuthReq): Promise<void> {
  let { type, credential } = req;
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  if (!tenant.config.channelWhitelist.includes(type))
    throw new Error(`tenant does not support the requested channel ${type}`);
  const { Alias, Session } = createSequelize(tenant);
  let session = await enforceActiveSession(Session, this.sessionId);
  Alias.update(
    { deletedAt: Sequelize.fn("NOW") },
    {
      where: {
        type,
        credential,
        userId: session.userId
      }
    }
  );
}

async function sendLoginLink(
  tenant: TenantType,
  sessionId: string,
  operation: Operation,
  createAlias: AuthReq,
  deleteAlias?: AuthReq
): Promise<void> {
  let cipherPayload: CipherPayload = [
    sessionId,
    operation,
    [createAlias.credential, createAlias.type],
    undefined
  ];
  if (deleteAlias)
    cipherPayload[3] = [deleteAlias.credential, deleteAlias.type];
  let cipher = encryptCipher(cipherPayload);
  const link = `${tenant.authVerifyUrl}?op=${operation}&cipher=${cipher}`;
  switch (createAlias.type) {
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
        to: createAlias.credential,
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
          to: createAlias.credential,
          from: twilioConfig.fromNumber
        });
        console.log(
          `## Sent Twilio SMS to ${createAlias.credential}:`,
          message
        );
        return;
      } catch (err) {
        console.error(err);
        throw err;
      }
    case CREDENTIAL_TYPE_DEV:
      let remote = await getRemote(sessionId);
      remote.onDevRequest && remote.onDevRequest(cipher, operation);
      return;
    default:
      throw new Error(`invalid credential type ${createAlias.type}`);
  }
}

async function approveAuth(cipher: string): Promise<void> {
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  const { Alias, Session } = createSequelize(tenant);

  let [sessionId, operation, createData, deleteData] = decryptCipher(cipher);
  let session = await enforceLatentSession(Session, sessionId);

  // where the values are [?UpdateSession, ?CreateAlias, ?DeleteAlias]
  let operations = [null, null, null];

  if (operation === OP_ALIAS_UPDATE) {
    if (session.verifiedAt < new Date() && session.verifiedAt !== null)
      throw new Error(
        "approveAuth: OP_UPDATE_ALIAS requires an active session"
      );
    if (!deleteData || deleteData.length !== 2)
      throw new Error(
        "approveAuth: OP_UPDATE_ALIAS requires a2 with credential and type "
      );
    let where = {
      credential: deleteData[0],
      type: deleteData[1],
      userId: session.userId,
      deletedAt: null
    };
    let oldAlias = await Alias.findOne({
      where
    });
    if (!oldAlias)
      throw new Error(
        "approveAuth: OP_UPDATE_ALIAS old alias could not be found"
      );
    operations[2] = Alias.update({ deletedAt: Sequelize.fn("NOW") }, { where });
  }

  let newAlias = {
    credential: createData[0],
    type: createData[1],
    userId: session.userId
  };
  // @NOTE this is wasteful to do an extra fetch but the unique index does not work with date field deletedAt
  let existingAlias = await Alias.findOne({
    where: {
      credential: createData[0],
      type: createData[1],
      deletedAt: null
    }
  });

  if (!existingAlias) operations[1] = Alias.create(newAlias);

  // set verifiedAt if session is not yet verified, otherwise noop
  if (session.verifiedAt === null)
    operations[0] = Session.update(
      { verifiedAt: new Date() },
      { where: { id: sessionId } }
    );

  let [sessionResult, newAliasResult, oldAliasResult] = await Promise.all(
    operations
  );
  if (session.verifiedAt === null) {
    let idWarrant = createIdWarrant(session);
    try {
      let remote = await getRemote(session.id);
      remote.onAuthApprove && remote.onAuthApprove(idWarrant);
    } catch (err) {
      // @NOTE noop if no remote found
      console.log("remote not found", err);
    }
  }
}

async function rejectAuth(cipher: string): Promise<void> {
  let tenantApiKey = this.authentication;
  let tenant = await enforceValidTenant(tenantApiKey);
  const { Session } = createSequelize(tenant);

  let [sessionId] = decryptCipher(cipher);
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

  let session = await enforceActiveSession(Session, this.sessionId);
  let idWarrant = createIdWarrant(session);
  return idWarrant;
}

function createIdWarrant(session: SessionType): string {
  return jwt.sign({ userId: session.userId }, JWT_SECRET);
}

function encryptCipher(data: CipherPayload): string {
  var cipher = crypto.createCipher(CRYPTO_ALGO, JWT_SECRET);
  var crypted = cipher.update(JSON.stringify(data), "utf8", "hex");
  crypted += cipher.final("hex");
  return crypted;
}

function decryptCipher(text: string): CipherPayload {
  var decipher = crypto.createDecipher(CRYPTO_ALGO, JWT_SECRET);
  var dec = decipher.update(text, "hex", "utf8");
  dec += decipher.final("utf8");
  return JSON.parse(dec);
}

const authApi: ThinAuthServerApi = {
  // auth
  approveAuth,
  rejectAuth,
  revokeAuth,
  requestAuth,
  refreshIdWarrant,

  // alias
  addAlias,
  updateAlias,
  removeAlias,

  // @NOTE ideally these methods are implemented client side, but we also expose these on the server for compatability reasons.
  cryptoCreateKeypair,
  cryptoSign,
  cryptoVerify
};

export default authApi;

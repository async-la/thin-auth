// @flow
import {
  CREDENTIAL_TYPE_DEV,
  CREDENTIAL_TYPE_EMAIL,
  CREDENTIAL_TYPE_PASSWORD,
  CREDENTIAL_TYPE_SMS,
  CREDENTIAL_TYPE_SPEAKEASY,
  OP_ALIAS_ADD,
  OP_ALIAS_UPDATE,
  OP_ALIAS_REMOVE,
  OP_VERIFY,
} from "./constants"
export * from "./constants"
export * from "./errors"

type ConnectionId = string
export type Keypair = {
  secretKey: string,
  publicKey: string,
}
export type Signature = {
  sign: string,
  publicKey: string,
}
export type IdPayload = {
  userId: string,
  publicKey: ?string,
  iat: number,
}
export type MetaPayload = {
  userId: string,
  mode: number,
  alias: Array<AliasType>,
}

export type Mode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
/*
 confirm, read, write
 */

type AuthReqEmail = { type: typeof CREDENTIAL_TYPE_EMAIL, credential: string, mode?: Mode }
type AuthReqSms = { type: typeof CREDENTIAL_TYPE_SMS, credential: string, mode?: Mode }
type AuthReqDev = { type: typeof CREDENTIAL_TYPE_DEV, credential: string, mode?: Mode }
type AuthReqPassword = {
  type: typeof CREDENTIAL_TYPE_PASSWORD,
  credential: string,
  secret: string,
  mode?: Mode,
}
type AuthReqSpeakeasy = {
  type: typeof CREDENTIAL_TYPE_SPEAKEASY,
  credential: string,
  secret: string,
  mode?: Mode,
}

export type AuthReq = AuthReqEmail | AuthReqSms | AuthReqDev | AuthReqPassword | AuthReqSpeakeasy

export type CredentialType =
  | typeof CREDENTIAL_TYPE_DEV
  | typeof CREDENTIAL_TYPE_EMAIL
  | typeof CREDENTIAL_TYPE_SMS
  | typeof CREDENTIAL_TYPE_PASSWORD

export type Operation =
  | typeof OP_ALIAS_UPDATE
  | typeof OP_ALIAS_ADD
  | typeof OP_ALIAS_REMOVE
  | typeof OP_VERIFY
export type Warrants = [string, string]

export type ThinAuthServerApi = {|
  approveAuth: ConnectionId => Promise<void>,
  rejectAuth: ConnectionId => Promise<void>,
  revokeAuth: ConnectionId => Promise<void>,
  requestAuth: AuthReq => Promise<void>,
  refreshAuth: string => Promise<Warrants>,

  addAlias: AuthReq => Promise<void>,
  removeAlias: AuthReq => Promise<void>,
  updateAlias: (AuthReq, AuthReq) => Promise<void>,

  cryptoCreateKeypair: () => Promise<Keypair>,
  cryptoSign: (message: string, keypair: Keypair) => Promise<Signature>,
  cryptoVerify: (signature: Signature) => Promise<string>,
|}

export type ThinAuthClientApi = {|
  onAuth?: Warrants => void | Promise<void>,
  onDevRequest?: (cipher: string, operation: Operation) => Promise<void>,
|}

export type OpType = {
  id: string,
  sessionId: string,
  op: Operation,
  addAlias?: AuthReq,
  removeAlias?: AuthReq,
}

export type SessionType = {
  id: string,
  userId: string,
  mode: number,
  publicKey: string,
  verifiedAt: string,
  expiresAt: string,
}

export type TenantType = {
  id: string,
  name: string,
  key: string,
  authVerifyUrl: string,
}

export type AliasType = {
  credential: string,
  type: CredentialType,
  userId: string,
  mode: number,
  verifiedAt: string,
}

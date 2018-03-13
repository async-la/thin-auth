// @flow
import {
  CREDENTIAL_TYPE_DEV,
  CREDENTIAL_TYPE_EMAIL,
  CREDENTIAL_TYPE_SMS,
  OP_ALIAS_ADD,
  OP_ALIAS_UPDATE,
  OP_VERIFY
} from "./constants";
export * from "./constants";

type ConnectionId = string;
export type Keypair = {
  secretKey: string,
  publicKey: string
};
export type Signature = {
  sign: string,
  publicKey: string
};

export type CredentialType =
  | typeof CREDENTIAL_TYPE_DEV
  | typeof CREDENTIAL_TYPE_EMAIL
  | typeof CREDENTIAL_TYPE_SMS;
export type AuthReq = { type: CredentialType, credential: string };
export type Operation =
  | typeof OP_ALIAS_UPDATE
  | typeof OP_ALIAS_ADD
  | typeof OP_VERIFY;

export type ThinAuthServerApi = {|
  approveAuth: ConnectionId => Promise<void>,
  rejectAuth: ConnectionId => Promise<void>,
  revokeAuth: ConnectionId => Promise<void>,
  requestAuth: AuthReq => Promise<void>,
  refreshIdWarrant: string => Promise<string>,

  addAlias: AuthReq => Promise<void>,
  updateAlias: (AuthReq, AuthReq) => Promise<void>,

  cryptoCreateKeypair: () => Promise<Keypair>,
  cryptoSign: (message: string, keypair: Keypair) => Promise<Signature>,
  cryptoVerify: (signature: Signature) => Promise<string>
|};

export type ThinAuthClientApi = {|
  onAuthApprove?: ({ idWarrant: string }) => Promise<void>,
  onDevRequest?: (cipher: string, operation: Operation) => Promise<void>
|};

export type SessionType = {
  id: string,
  userId: string,
  verifiedAt: string,
  expiresAt: string
};

export type TenantType = {
  id: string,
  name: string,
  key: string,
  authVerifyUrl: string
};

export type AliasType = {
  credential: string,
  type: CredentialType,
  userId: string
};

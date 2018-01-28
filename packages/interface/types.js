// @flow

type ConnectionId = string
export type Keypair = {
  secretKey: Buffer,
  publicKey: Buffer,
}
export type Signature = {
  sign: Buffer,
  publicKey: Buffer,
}

export type ThinAuthServerApi = {|
  approveAuth: ConnectionId => Promise<void>,
  rejectAuth: ConnectionId => Promise<void>,
  revokeAuth: ConnectionId => Promise<void>,
  requestAuth: string => Promise<void>,
  refreshIdWarrant: string => Promise<string>,

  crypto_sign_keypair: () => Promise<Keypair>,
  cryptoSign: (message: Buffer, secretKey: Buffer) => Promise<Signature>,
  cryptoVerify: (signature: Signature) => Promise<string>,
|}

export type ThinAuthClientApi = {|
  onAuthApprove: ({ idWarrant: string }) => Promise<void>
|}

export type SessionType = {
  id: string,
  userId: string,
  connectionId: string
}

export type TenantType = {
  id: string,
  name: string,
  key: string,
  authVerifyUrl: string,
}
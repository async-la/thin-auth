// @flow

type ConnectionId = string

export type ThinAuthServerApi = {|
  approveAuth: ConnectionId => Promise<void>,
  rejectAuth: ConnectionId => Promise<void>,
  revokeAuth: ConnectionId => Promise<void>,
  requestAuth: string => Promise<void>,
  refreshAccessToken: string => Promise<string>
|}

export type ThinAuthClientApi = {|
  onAuthApprove: ({ accessToken: string }) => Promise<void>
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
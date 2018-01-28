// @flow

import _ from "lodash"
import type { ThinAuthClientApi, ThinAuthServerApi } from "@rt2zz/thin-auth-interface"
import websocket from "websocket-stream"
import edonode, { type Remote } from "edonode"
import { createAtom, type AtomCache } from "atom-cache"

const KEY_PREFIX = 'thin-auth-client'
let sessionIdInit = () => Math.random().toString(32)

type AuthClientConfig = {
  apiKey: string,
  endpoint: string,
  onAuthApprove: ({ idWarrant: string }) => Promise<void>,
  storage: any,
}

type AuthClient = {
  authRemote: () => Promise<ThinAuthServerApi>,
  authReset: () => Promise<void>,
  refreshIdWarrant: () => Promise<string>,
}
function createAuthClient ({
  apiKey,
  endpoint,
  onAuthApprove,
  storage,
}: AuthClientConfig): AuthClient {
  let createAuthStream = () => websocket(endpoint)
  let authClient: ThinAuthClientApi = {
    onAuthApprove
  }

  const sessionIdAtom = createAtom({ key: `${KEY_PREFIX}:session-id`, storage, init: sessionIdInit })
  const authRemote: Remote<ThinAuthServerApi> = edonode(createAuthStream, authClient, {
    autoReconnect: true,
    key: "auth",
    sessionId: sessionIdAtom.get
  })
  authRemote.authenticate(apiKey)

  // @TODO make keypair generation optional, or build js lib into the FE
  const keypairAtom = createAtom({
    key: `${KEY_PREFIX}:keypair`,
    storage,
    serialize: s => JSON.stringify(s),
    deserialize: s => {
      let p = JSON.parse(s)
      Object.keys(p).forEach(k => {
        p[k] = new Uint8Array(p[k].data)
      })
      return p
    },
    initAsync: async () => {
      let api = await authRemote()
      // @TODO how to deal with this failing?
      let keypair = await api.crypto_sign_keypair()
      return keypair
    }
  })

  const authReset = async () => {
    let api = await authRemote()
    let sessionId = await sessionIdAtom.get()
    await api.revokeAuth(sessionId)
    sessionIdAtom.reset()
    keypairAtom.reset()
  }

  const refreshIdWarrant = async () => {
    let api = await authRemote()
    let sessionId = await sessionIdAtom.get()
    return api.refreshIdWarrant(sessionId)
  }

  let promisedAuthRemote = async () => {
    let a = await keypairAtom.get()
    console.log({ a })
    return authRemote()
  }
  return { authRemote: promisedAuthRemote, authReset, refreshIdWarrant }
}

export default createAuthClient
// @flow

import _ from "lodash"
import type { ThinAuthClientApi, ThinAuthServerApi } from "@rt2zz/thin-auth-interface"
import websocket from "websocket-stream"
import edonode, { type Remote, SIGN_TYPE_NONCE } from "edonode"
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
  const cryptoRemote: Remote<ThinAuthServerApi> = edonode(createAuthStream, authClient, {
    autoReconnect: true,
    key: "crypto",
    sessionId: sessionIdAtom.get
  })
  authRemote.auth(apiKey)
  authRemote.sign(async (nonce) => {
    // @TODO because we need authRemote in order to conduct signing either need a way to explicitly declare unsigned calls *or* separate auth into two backends
    let [api, keypair] = await Promise.all([await cryptoRemote(), keypairAtom.get()])
    let signedNonce = await api.cryptoSign(nonce, keypair.secretKey)
    console.log({ signedNonce})
    return signedNonce
  }, { type: SIGN_TYPE_NONCE })

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
      let api = await cryptoRemote()
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
    await keypairAtom.get()
    return authRemote()
  }
  return { authRemote: promisedAuthRemote, authReset, refreshIdWarrant }
}

export default createAuthClient
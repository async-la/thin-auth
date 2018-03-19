// @flow

import _ from "lodash"
import { ERR_SESSION_INACTIVE } from "@rt2zz/thin-auth-interface"
import type {
  AuthReq,
  IdPayload,
  ThinAuthClientApi,
  ThinAuthServerApi,
} from "@rt2zz/thin-auth-interface"
import websocket from "websocket-stream"
import edonode, { type Remote, SIGN_TYPE_NONCE } from "edonode"
import { createAtom, type AtomCache } from "atom-cache"
import base64 from "base-64"

export {
  CREDENTIAL_TYPE_DEV,
  CREDENTIAL_TYPE_EMAIL,
  CREDENTIAL_TYPE_SMS,
} from "@rt2zz/thin-auth-interface"
export type { CredentialType, Keypair, Signature } from "@rt2zz/thin-auth-interface"

const EARLY_WARRANT_EXPIRE_INTERVAL = 2000
const KEY_PREFIX = "thin-auth-client"
let sessionIdInit = () => Math.random().toString(32)

type AuthClientConfig = {
  apiKey: string,
  endpoint: string,
  debug?: boolean,
  // @NOTE removed for now, will readd if useful
  // onAuthApprove: ({ idWarrant: string }) => Promise<void>,
  onDevRequest?: (cipher: string) => Promise<void>,
  storage: any,
  sign?: boolean,
  timeout?: number,
}

export function decodeIdWarrant(idWarrant: string): IdPayload {
  // return nothing if we are missing IdWarrant or refreshToken
  const parts = idWarrant.split(".")
  let raw = base64.decode(parts[1])
  let decodedToken = JSON.parse(raw)
  return decodedToken
}

type IdWarrantListener = (newIdWarrant: ?string, oldIdWarrant: ?string) => void | Promise<void>
type Unsubscribe = () => boolean
type AuthClient = {
  addAlias: AuthReq => Promise<void>,
  approveAuth: string => Promise<void>,
  authRemote: () => Promise<ThinAuthServerApi>,
  authReset: () => Promise<[any, any, any]>,
  getIdWarrant: () => Promise<?string>,
  onIdWarrant: IdWarrantListener => Unsubscribe,
  rejectAuth: string => Promise<void>,
  removeAlias: AuthReq => Promise<void>,
  requestAuth: AuthReq => Promise<void>,
  updateAlias: (newAlias: AuthReq, oldAlias: AuthReq) => Promise<void>,
  logState: () => Promise<void>,
}
function createAuthClient({
  apiKey,
  endpoint,
  debug,
  onDevRequest,
  sign,
  storage,
  timeout = 500,
}: AuthClientConfig): AuthClient {
  let createAuthStream = () => websocket(endpoint)

  let _last: ?string = null
  let _listeners = new Set()
  const updateIdWarrant = (idWarrant: ?string) => {
    if (idWarrant !== _last) _listeners.forEach(fn => fn(idWarrant, _last))
    // @NOTE _last is updated lazily in _getIdWarrant
  }

  let authClient: ThinAuthClientApi = {
    // @TODO update server to not nest idWarrant in an object
    onAuthApprove: updateIdWarrant,
    onDevRequest,
  }

  let _keypairAtom = null
  const sessionIdAtom = createAtom({
    key: `${KEY_PREFIX}:session-id`,
    storage,
    init: sessionIdInit,
  })
  const idWarrantAtom = createAtom({
    key: `${KEY_PREFIX}:id-warrant`,
    storage,
    stringify: true, // we have to stringify because it is sometimes null
    init: function(): ?string {
      return null
    },
  })
  const authRemote: Remote<ThinAuthServerApi> = edonode(createAuthStream, authClient, {
    autoReconnect: true,
    debug,
    name: "thin-auth",
    sessionId: sessionIdAtom.get,
    timeout,
  })
  authRemote.auth(apiKey)

  // @NOTE in the future we will allow keypair creation and signing to be done locally with cryptoRemote as an opt in fallback
  if (sign) {
    const cryptoRemote: Remote<ThinAuthServerApi> = edonode(createAuthStream, authClient, {
      autoReconnect: true,
      name: "thin-auth-crypto",
      timeout,
      debug,
    })

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
      init: async () => {
        let api = await cryptoRemote()
        // @TODO how to deal with this failing?
        let keypair = await api.cryptoCreateKeypair()
        return keypair
      },
    })
    _keypairAtom = keypairAtom

    authRemote.sign(
      async nonce => {
        // @TODO because we need authRemote in order to conduct signing either need a way to explicitly declare unsigned calls *or* separate auth into two backends
        let [api, keypair] = await Promise.all([
          await cryptoRemote(),
          keypairAtom && keypairAtom.get(),
        ])
        let signedNonce = await api.cryptoSign(nonce, keypair)
        return signedNonce
      },
      { type: SIGN_TYPE_NONCE }
    )
  }

  const authReset = async () => {
    let api: ThinAuthServerApi = await authRemote()
    let sessionId = await sessionIdAtom.get()
    await api.revokeAuth(sessionId)
    let promises = Promise.all([
      sessionIdAtom.reset(),
      idWarrantAtom.reset(),
      _keypairAtom && _keypairAtom.reset(),
    ])
    updateIdWarrant(null)
    _last = null
    return promises
  }

  const approveAuth = async (cipher: string) => {
    let api: ThinAuthServerApi = await authRemote()
    return await api.approveAuth(cipher)
  }

  const rejectAuth = async (cipher: string) => {
    let api: ThinAuthServerApi = await authRemote()
    return await api.rejectAuth(cipher)
  }

  const requestAuth = async (req: AuthReq) => {
    let api: ThinAuthServerApi = await authRemote()
    return await api.requestAuth(req)
  }

  const updateAlias = async (createReq: AuthReq, removeReq: AuthReq) => {
    let api: ThinAuthServerApi = await authRemote()
    return await api.updateAlias(createReq, removeReq)
  }

  const addAlias = async (req: AuthReq) => {
    let api: ThinAuthServerApi = await authRemote()
    return await api.addAlias(req)
  }

  const removeAlias = async (req: AuthReq) => {
    let api: ThinAuthServerApi = await authRemote()
    return await api.removeAlias(req)
  }

  let pendingWarrantPromise
  async function _getIdWarrant(): Promise<?string> {
    if (pendingWarrantPromise) return pendingWarrantPromise

    // get the current idWarrant and return if still valid
    let idWarrant = await idWarrantAtom.get()

    _last = idWarrant // make sure _last is always the latest cached value
    if (idWarrant) {
      let decodedWarrant = decodeIdWarrant(idWarrant)
      // else return IdWarrant if still valid
      if (decodedWarrant.iat * 1000 < Date.now() - EARLY_WARRANT_EXPIRE_INTERVAL) {
        return idWarrant
      }
    }

    // else refresh and return pending promise
    let [api: ThinAuthServerApi, sessionId] = await Promise.all([authRemote(), sessionIdAtom.get()])
    pendingWarrantPromise = api.refreshIdWarrant(sessionId)
    try {
      idWarrant = await pendingWarrantPromise
      // @TODO should we await this set?
      idWarrantAtom.set(idWarrant)
      pendingWarrantPromise = null
      return idWarrant
    } catch (err) {
      pendingWarrantPromise = null
      // @TODO what follow up is necessary in cases other than ERR_SESSION_INACTIVE?
      if (debug) console.log("thin-auth-client: getIdWarrant err", err)
      if (err.code === ERR_SESSION_INACTIVE) {
        idWarrantAtom.reset()
        return null
      } else {
        return idWarrant
      }
    }
  }

  async function getIdWarrant(): Promise<?string> {
    let idWarrant = await _getIdWarrant()
    updateIdWarrant(idWarrant)
    return idWarrant
  }

  const onIdWarrant = listener => {
    _listeners.add(listener)
    // always dispatch listener once with latest idWarrant
    _getIdWarrant().then(idWarrant => listener(idWarrant, _last))
    return () => _listeners.delete(listener)
  }

  // @NOTE for debugging
  const logState = async () => {
    console.log("sessionIdAtom", await sessionIdAtom.get())
    console.log("keypairAtom", _keypairAtom && (await _keypairAtom.get()))
  }

  return {
    addAlias,
    approveAuth,
    authRemote,
    authReset,
    getIdWarrant,
    onIdWarrant,
    rejectAuth,
    removeAlias,
    requestAuth,
    updateAlias,
    logState,
  }
}

export default createAuthClient

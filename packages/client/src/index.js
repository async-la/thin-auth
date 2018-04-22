// @flow

import _ from "lodash"
import { ERR_SESSION_INACTIVE, MODE_READ_WRITE } from "@rt2zz/thin-auth-interface"
import type {
  AuthReq,
  IdPayload,
  MetaPayload,
  Operation,
  ThinAuthClientApi,
  ThinAuthServerApi,
  Warrants,
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
export type { Operation, CredentialType, Keypair, Signature } from "@rt2zz/thin-auth-interface"

const EARLY_WARRANT_EXPIRE_INTERVAL = 2000
const KEY_PREFIX = "thin-auth-client"
let sessionIdInit = () => Math.random().toString(32)

type AuthClientConfig = {|
  apiKey: string,
  endpoint: string,
  debug?: boolean,
  storage: any,
  sign?: boolean,
  timeout?: number,

  // @NOTE intended for dev use only
  onDevRequest?: (cipher: string, op: Operation) => Promise<void>,
|}

function decodeWarrant(warrant: string): any {
  // return nothing if we are missing IdWarrant or refreshToken
  const parts = warrant.split(".")
  let raw = base64.decode(parts[1])
  let decodedToken = JSON.parse(raw)
  return decodedToken
}

export function decodeIdWarrant(idWarrant: string): IdPayload {
  return decodeWarrant(idWarrant)
}

export function decodeMetaWarrant(metaWarrant: string): MetaPayload {
  return decodeWarrant(metaWarrant)
}

type WarrantListener = (newWarrants: ?Warrants, oldWarrants: ?Warrants) => void | Promise<void>
type Unsubscribe = () => boolean
type AuthClient = {|
  addAlias: AuthReq => Promise<void>,
  approveAuth: string => Promise<void>,
  authRemote: () => Promise<ThinAuthServerApi>,
  authReset: () => Promise<[any, any, any]>,
  authSync: WarrantListener => Unsubscribe,
  getIdWarrant: () => Promise<?string>,
  getWarrants: () => Promise<?Warrants>,
  rejectAuth: string => Promise<void>,
  removeAlias: AuthReq => Promise<void>,
  requestAuth: AuthReq => Promise<void>,
  updateAlias: (newAlias: AuthReq, oldAlias: AuthReq) => Promise<void>,
  getUserState: () => Promise<Object>,
  setUserState: Object => Promise<void>,
  logState: () => Promise<void>,
|}
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

  let _last: ?Warrants = null
  let _listeners = new Set()
  const updateWarrantListeners = (warrants: ?Warrants) => {
    if (warrants !== _last) _listeners.forEach(fn => fn(warrants, _last))
    _last = warrants
  }

  const defaultOnDevRequest = cipher => approveAuth(cipher)
  let authClient: ThinAuthClientApi = {
    // @TODO update server to not nest idWarrant in an object
    onAuth: updateWarrantListeners,
    onDevRequest: onDevRequest || defaultOnDevRequest,
  }

  let _keypairAtom = null
  const sessionIdAtom = createAtom({
    key: `${KEY_PREFIX}:session-id`,
    storage,
    init: sessionIdInit,
  })
  const warrantsAtom = createAtom({
    key: `${KEY_PREFIX}:warrants`,
    storage,
    stringify: true, // we have to stringify because it is sometimes null
    init: function(): ?Warrants {
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
    updateWarrantListeners(null)
    let promises = Promise.all([
      sessionIdAtom.reset(),
      warrantsAtom.reset(),
      _keypairAtom && _keypairAtom.reset(),
    ])
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
    if (req.mode === undefined) req.mode = MODE_READ_WRITE
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

  let pendingWarrantsPromise
  async function _getWarrants(): Promise<?Warrants> {
    if (pendingWarrantsPromise) return pendingWarrantsPromise

    // get the current idWarrant and return if still valid
    let warrants = await warrantsAtom.get()

    if (warrants) {
      let decodedIdWarrant = decodeIdWarrant(warrants[0])
      // else return IdWarrant if still valid
      if (decodedIdWarrant.iat * 1000 < Date.now() - EARLY_WARRANT_EXPIRE_INTERVAL) {
        return warrants
      }
    }

    // else refresh and return pending promise
    let [api: ThinAuthServerApi, sessionId] = await Promise.all([authRemote(), sessionIdAtom.get()])
    pendingWarrantsPromise = api.refreshAuth(sessionId)
    try {
      warrants = await pendingWarrantsPromise
      // @TODO should we await this set?
      warrantsAtom.set(warrants)
      pendingWarrantsPromise = null
      return warrants
    } catch (err) {
      pendingWarrantsPromise = null
      // @TODO what follow up is necessary in cases other than ERR_SESSION_INACTIVE?
      if (debug) console.log("thin-auth-client: getIdWarrant err", err)
      if (err.code === ERR_SESSION_INACTIVE) {
        warrantsAtom.reset()
        return null
      } else {
        return warrants
      }
    }
  }

  async function getIdWarrant(): Promise<?string> {
    let warrants = await getWarrants()
    return warrants && warrants[0]
  }

  async function getWarrants(): Promise<?Warrants> {
    let warrants = await _getWarrants()
    updateWarrantListeners(warrants)
    return warrants
  }

  const authSync = listener => {
    _listeners.add(listener)
    // always dispatch listener once with latest idWarrant
    _getWarrants().then(w => listener(w, _last))
    return () => _listeners.delete(listener)
  }

  const setUserState = async (state: Object) => {
    let [idWarrant, api]: [?string, ThinAuthServerApi] = await Promise.all([
      getIdWarrant(),
      authRemote(),
    ])
    if (!idWarrant) throw new Error("thin-auth: setUserState fail, cannot set without a idWarrant")
    return api.setUserState(idWarrant, state)
  }

  const getUserState = async () => {
    let [idWarrant, api]: [?string, ThinAuthServerApi] = await Promise.all([
      getIdWarrant(),
      authRemote(),
    ])
    if (!idWarrant) throw new Error("thin-auth: setUserState fail, cannot set without a idWarrant")
    return api.getUserState(idWarrant)
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
    authSync,
    getIdWarrant,
    getWarrants,
    rejectAuth,
    removeAlias,
    requestAuth,
    updateAlias,
    logState,
  }
}

export default createAuthClient

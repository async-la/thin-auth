// @flow

import _ from "lodash";
import type {
  AuthReq,
  ThinAuthClientApi,
  ThinAuthServerApi
} from "@rt2zz/thin-auth-interface";
import websocket from "websocket-stream";
import edonode, { type Remote, SIGN_TYPE_NONCE } from "edonode";
import { createAtom, type AtomCache } from "atom-cache";
import base64 from "base-64";

export {
  CREDENTIAL_TYPE_DEV,
  CREDENTIAL_TYPE_EMAIL,
  CREDENTIAL_TYPE_SMS
} from "@rt2zz/thin-auth-interface";
export type {
  CredentialType,
  IdPayload,
  Keypair,
  Signature
} from "@rt2zz/thin-auth-interface";

const EARLY_WARRANT_EXPIRE_INTERVAL = 2000;
const KEY_PREFIX = "thin-auth-client";
let sessionIdInit = () => Math.random().toString(32);

type AuthClientConfig = {
  apiKey: string,
  endpoint: string,
  debug?: boolean,
  onAuthApprove: ({ idWarrant: string }) => Promise<void>,
  onDevRequest?: (cipher: string) => Promise<void>,
  storage: any,
  sign?: boolean,
  timeout?: number
};

export function decodeIdWarrant(idWarrant: string): IdPayload {
  // return nothing if we are missing IdWarrant or refreshToken
  const parts = idWarrant.split(".");
  let raw = base64.decode(parts[1]);
  let decodedToken = JSON.parse(raw);
  return decodedToken;
}

type IdWarrantListener = (newIdWarrant: ?string, oldIdWarrant: ?string) => void;
type Unsubscribe = () => boolean;
type AuthClient = {
  addAlias: AuthReq => Promise<void>,
  approveAuth: string => Promise<void>,
  authRemote: () => Promise<ThinAuthServerApi>,
  authReset: () => Promise<void>,
  getIdWarrant: () => Promise<?string>,
  onIdWarrant: IdWarrantListener => Unsubscribe,
  rejectAuth: string => Promise<void>,
  removeAlias: AuthReq => Promise<void>,
  requestAuth: AuthReq => Promise<void>,
  updateAlias: (newAlias: AuthReq, oldAlias: AuthReq) => Promise<void>,
  logState: () => Promise<void>
};
function createAuthClient({
  apiKey,
  endpoint,
  debug,
  onAuthApprove,
  onDevRequest,
  sign,
  storage,
  timeout = 500
}: AuthClientConfig): AuthClient {
  let createAuthStream = () => websocket(endpoint);
  let authClient: ThinAuthClientApi = {
    onAuthApprove,
    onDevRequest
  };

  let _keypairAtom = null;
  const sessionIdAtom = createAtom({
    key: `${KEY_PREFIX}:session-id`,
    storage,
    init: sessionIdInit
  });
  const idWarrantAtom = createAtom({
    key: `${KEY_PREFIX}:id-warrant`,
    storage,
    stringify: true, // we have to stringify because it is sometimes null
    init: function(): ?string {
      return null;
    }
  });
  const authRemote: Remote<ThinAuthServerApi> = edonode(
    createAuthStream,
    authClient,
    {
      autoReconnect: true,
      debug,
      name: "thin-auth",
      sessionId: sessionIdAtom.get,
      timeout
    }
  );
  authRemote.auth(apiKey);

  // @NOTE in the future we will allow keypair creation and signing to be done locally with cryptoRemote as an opt in fallback
  if (sign) {
    const cryptoRemote: Remote<ThinAuthServerApi> = edonode(
      createAuthStream,
      authClient,
      {
        autoReconnect: true,
        name: "thin-auth-crypto",
        timeout,
        debug
      }
    );

    const keypairAtom = createAtom({
      key: `${KEY_PREFIX}:keypair`,
      storage,
      serialize: s => JSON.stringify(s),
      deserialize: s => {
        let p = JSON.parse(s);
        Object.keys(p).forEach(k => {
          p[k] = new Uint8Array(p[k].data);
        });
        return p;
      },
      init: async () => {
        let api = await cryptoRemote();
        // @TODO how to deal with this failing?
        let keypair = await api.cryptoCreateKeypair();
        return keypair;
      }
    });
    _keypairAtom = keypairAtom;

    authRemote.sign(
      async nonce => {
        // @TODO because we need authRemote in order to conduct signing either need a way to explicitly declare unsigned calls *or* separate auth into two backends
        let [api, keypair] = await Promise.all([
          await cryptoRemote(),
          keypairAtom && keypairAtom.get()
        ]);
        let signedNonce = await api.cryptoSign(nonce, keypair);
        return signedNonce;
      },
      { type: SIGN_TYPE_NONCE }
    );
  }

  const authReset = async () => {
    let api: ThinAuthServerApi = await authRemote();
    let sessionId = await sessionIdAtom.get();
    await api.revokeAuth(sessionId);
    return Promise.all([
      sessionIdAtom.reset(),
      idWarrantAtom.reset(),
      _keypairAtom && _keypairAtom.reset()
    ]);
  };

  const approveAuth = async (cipher: string) => {
    let api: ThinAuthServerApi = await authRemote();
    return await api.approveAuth(cipher);
  };

  const rejectAuth = async (cipher: string) => {
    let api: ThinAuthServerApi = await authRemote();
    return await api.rejectAuth(cipher);
  };

  const requestAuth = async (req: AuthReq) => {
    let api: ThinAuthServerApi = await authRemote();
    return await api.requestAuth(req);
  };

  const updateAlias = async (createReq: AuthReq, removeReq: AuthReq) => {
    let api: ThinAuthServerApi = await authRemote();
    return await api.updateAlias(createReq, removeReq);
  };

  const addAlias = async (req: AuthReq) => {
    let api: ThinAuthServerApi = await authRemote();
    return await api.addAlias(req);
  };

  const removeAlias = async (req: AuthReq) => {
    let api: ThinAuthServerApi = await authRemote();
    return await api.removeAlias(req);
  };

  let pendingWarrantPromise;
  let _listeners = new Set();
  async function _getIdWarrant(): Promise<?string> {
    if (pendingWarrantPromise) return pendingWarrantPromise;

    // get the current idWarrant and return if still valid
    let idWarrant = await idWarrantAtom.get();
    if (idWarrant) {
      let decodedWarrant = decodeIdWarrant(idWarrant);
      // else return IdWarrant if still valid
      if (
        decodedWarrant.iat * 1000 <
        Date.now() - EARLY_WARRANT_EXPIRE_INTERVAL
      ) {
        return idWarrant;
      }
    }

    // else refresh and return pending promise
    let [api: ThinAuthServerApi, sessionId] = await Promise.all([
      authRemote(),
      sessionIdAtom.get()
    ]);
    pendingWarrantPromise = api.refreshIdWarrant(sessionId);
    try {
      let idWarrant = await pendingWarrantPromise;
      // @TODO should we await this set?
      idWarrantAtom.set(idWarrant);
      pendingWarrantPromise = null;
      return idWarrant;
    } catch (err) {
      // @TODO under what cases will this fail? We may need to establish err cases. For now we just reset idWarrant.
      if (debug) console.log("thin-auth-client: getIdWarrant err", err);
      idWarrantAtom.reset();
      return;
    }
  }

  let _last = null;
  async function getIdWarrant(): Promise<?string> {
    let idWarrant = await _getIdWarrant();
    if (idWarrant !== _last) _listeners.forEach(fn => fn(idWarrant, _last));
    _last = idWarrant;
    return idWarrant;
  }

  const onIdWarrant = listener => {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  };

  // @NOTE for debugging
  const logState = async () => {
    console.log("sessionIdAtom", await sessionIdAtom.get());
    console.log("keypairAtom", _keypairAtom && (await _keypairAtom.get()));
  };

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
    logState
  };
}

export default createAuthClient;

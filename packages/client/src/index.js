// @flow

import _ from "lodash";
import type {
  ThinAuthClientApi,
  ThinAuthServerApi
} from "@rt2zz/thin-auth-interface";
import websocket from "websocket-stream";
import edonode, { type Remote, SIGN_TYPE_NONCE } from "edonode";
import { createAtom, type AtomCache } from "atom-cache";

export {
  CREDENTIAL_TYPE_DEV,
  CREDENTIAL_TYPE_EMAIL,
  CREDENTIAL_TYPE_SMS
} from "@rt2zz/thin-auth-interface";
export type {
  CredentialType,
  Keypair,
  Signature
} from "@rt2zz/thin-auth-interface";

const KEY_PREFIX = "thin-auth-client";
let sessionIdInit = () => Math.random().toString(32);

type AuthClientConfig = {
  apiKey: string,
  endpoint: string,
  onAuthApprove: ({ idWarrant: string }) => Promise<void>,
  onDevRequest?: (cipher: string) => Promise<void>,
  storage: any,
  sign?: boolean,
  timeout?: number
};

type AuthClient = {
  approveAuth: string => Promise<void>,
  authRemote: () => Promise<ThinAuthServerApi>,
  authReset: () => Promise<void>,
  refreshIdWarrant: () => Promise<string>,
  rejectAuth: string => Promise<void>,
  requestAuth: (string, string) => Promise<void>,
  logState: () => Promise<void>
};
function createAuthClient({
  apiKey,
  endpoint,
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
  const authRemote: Remote<ThinAuthServerApi> = edonode(
    createAuthStream,
    authClient,
    {
      autoReconnect: true,
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
        timeout
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
      initAsync: async () => {
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
    sessionIdAtom.reset();
    _keypairAtom && _keypairAtom.reset();
  };

  const refreshIdWarrant = async () => {
    let api: ThinAuthServerApi = await authRemote();
    let sessionId = await sessionIdAtom.get();
    return api.refreshIdWarrant(sessionId);
  };

  const requestAuth = async (credential: string, type: string) => {
    let api: ThinAuthServerApi = await authRemote();
    return await api.requestAuth({ credential, type });
  };

  const approveAuth = async (cipher: string) => {
    let api: ThinAuthServerApi = await authRemote();
    return await api.approveAuth(cipher);
  };

  const rejectAuth = async (cipher: string) => {
    let api: ThinAuthServerApi = await authRemote();
    return await api.rejectAuth(cipher);
  };

  // @NOTE debugging only, remove in future
  const logState = async () => {
    console.log("sessionIdAtom", await sessionIdAtom.get());
    console.log("keypairAtom", _keypairAtom && (await _keypairAtom.get()));
  };

  return {
    approveAuth,
    authRemote,
    authReset,
    refreshIdWarrant,
    rejectAuth,
    requestAuth,
    logState
  };
}

export default createAuthClient;

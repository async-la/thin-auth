// @flow

import websocket from "websocket-stream"
import edonode from "edonode"

import authApi from "./scope/auth"
import type { Signature } from "@rt2zz/thin-auth-interface"

import { AUTH_KEY } from "./constants"

// server setups
const authApp = require("http").createServer((req, res) => res.end("Thin Auth noop"))

authApp.listen(process.env.PORT || 3005)

websocket.createServer(
  {
    perMessageDeflate: false,
    server: authApp
  },
  authHandle
)

function verify (nonce: string, signature: Signature) {
  let verifiedNonce = authApi.cryptoVerify(signature)
  if (nonce !== verifiedNonce) throw new Error('nonce verification failed')
}

async function authHandle(ws, request) {
  let remote = await edonode(ws, authApi, { key: AUTH_KEY, debug: true, verify })
}

// @flow

import websocket from "websocket-stream"
import edonode from "edonode"

import authApi from "./scope/auth"
import logger from "./utils/logger"
import packageJson from "../package.json"
import type { Signature } from "@rt2zz/thin-auth-interface"

// server setups
const authApp = require("http").createServer((req, res) =>
  res.end(`ThinAuth v${packageJson.version}`)
)

authApp.listen(process.env.PORT || 3005)

websocket.createServer(
  {
    perMessageDeflate: false,
    server: authApp,
  },
  authHandle
)

async function verify(nonce: string, signature: Signature) {
  let verifiedNonce = await authApi.cryptoVerify(signature)
  if (nonce !== verifiedNonce) throw new Error("nonce verification failed")
}

const onStreamEvents = {
  onClose: e => logger.info("Edonode Socket Close", e),
  onError: e => logger.info("Edonode Socket Error", e),
}
async function authHandle(ws, request) {
  let remote = await edonode(ws, authApi, { debug: true, onStreamEvents, verify })
}

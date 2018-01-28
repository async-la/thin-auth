// @flow

import websocket from "websocket-stream"
import edonode from "edonode"

import authApi from "./scope/auth"

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

async function authHandle(ws, request) {
  let remote = await edonode(ws, authApi, { key: AUTH_KEY, debug: true })
}

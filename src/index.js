// @flow

import websocket from "websocket-stream"
import edonode from "edonode"

import authApi from "./scope/auth"

import { AUTH_KEY } from "./constants"

// server setups
const authApp = require("http").createServer((req, res) => res.end("authApp noop"))

authApp.listen(3005)

websocket.createServer(
  {
    perMessageDeflate: false,
    server: authApp
  },
  authHandle
)

async function authHandle(ws, request) {
  console.log("authHandle", request.url)
  let remote = await edonode(ws, authApi, { key: AUTH_KEY, debug: true })
}

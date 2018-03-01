// @flow
import websocket from "websocket-stream"
import edonode, { type Remote } from "edonode"
import config from "../config"
import localForage from "localforage"

import createAuthClient from "@rt2zz/thin-auth-client"

let onAuthApprove = async ({ idWarrant }) => {
  // @NOOP
}

const { authReset, authRemote, refreshIdWarrant } = createAuthClient({
  // @NOTE this may pose issues in the future, but works as a short-term way to have multi-tenant support without additional backend infrastructure
  // path in this case would be `portal.auth.asy.nc/${API_KEY}/verify?cipher=${cipher}`
  apiKey: window.location.pathname.split('/')[1],
  endpoint: config.authApi,
  onAuthApprove,
  storage: localForage
})

export { authReset, authRemote, refreshIdWarrant }

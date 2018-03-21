// @flow
import test from "ava"
import { setupClient } from "./_helpers"
import type { ThinAuthServerApi } from "../../server/node_modules/@rt2zz/thin-auth-interface"

test.beforeEach(t => {
  t.context.client = setupClient({
    onDevRequest: c => {
      t.context.cipher = c
    },
  })
})

test("request auth fails if channel type is not whitelisted", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await t.throws(api.requestAuth({ type: "not a channel", credential: "dev-credential", mode: 3 }))
})

test("request auth fails if session is verified", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await api.approveAuth(t.context.cipher)
  await t.throws(api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 }))
})

test("request auth fails if session is expired", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await api.rejectAuth(t.context.cipher)
  await t.throws(api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 }))
})

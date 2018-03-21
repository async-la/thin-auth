// @flow
import test from "ava"
import { setupClient, purge } from "./_helpers"
import type { ThinAuthServerApi } from "../../server/node_modules/@rt2zz/thin-auth-interface"

test.beforeEach(t => {
  t.context.client = setupClient({
    onDevRequest: c => {
      t.context.cipher = c
    },
  })
})

test("refresh id warrant when not verified", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await t.throws(refreshIdWarrant())
})

test("refresh id warrant when verified", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await api.approveAuth(t.context.cipher)
  await t.notThrows(refreshIdWarrant())
})

test("refresh id warrant when rejected", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await api.rejectAuth(t.context.cipher)
  await t.throws(refreshIdWarrant())
})

test("refresh id when reset", async t => {
  const { authReset, authRemote, refreshIdWarrant } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await api.approveAuth(t.context.cipher)
  await authReset()
  await t.throws(refreshIdWarrant())
})

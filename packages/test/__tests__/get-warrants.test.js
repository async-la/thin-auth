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

test("getWarrants when not verified", async t => {
  const { authRemote, getWarrants } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await t.is(await getWarrants(), null)
})

test("getWarrants when verified", async t => {
  const { authRemote, getWarrants } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await api.approveAuth(t.context.cipher)
  let warrants = await getWarrants()
  await t.is(warrants.length, 2)
})

test("getWarrants when rejected", async t => {
  const { authRemote, getWarrants } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await api.rejectAuth(t.context.cipher)
  await t.is(await getWarrants(), null)
})

test("getWarrants reset", async t => {
  const { authReset, authRemote, getWarrants } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await api.approveAuth(t.context.cipher)
  await authReset()
  await t.is(await getWarrants(), null)
})

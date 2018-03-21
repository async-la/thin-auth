// @flow
import test from "ava"
import { setupClient } from "./_helpers"
import type { ThinAuthServerApi } from "../../interface"

test.beforeEach(t => {
  t.context.client = setupClient({
    onDevRequest: c => {
      t.context.cipher = c
    },
  })
})

test("reverify cipher after auth reset", async t => {
  const { authReset, authRemote, refreshIdWarrant } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  await authReset()
  await t.throws(api.approveAuth(t.context.cipher))
})

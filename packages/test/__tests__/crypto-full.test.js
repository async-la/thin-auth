// @flow
import test from "ava"
import { setupClient } from "./_helpers"

test.beforeEach(t => {
  t.context.client = setupClient({
    onDevRequest: c => {
      console.log("%%%%%% ondV")
      t.context.cipher = c
    },
    sign: true,
  })
})

test("basic signing works", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client
  const api = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  t.true(!!t.context.cipher)
})

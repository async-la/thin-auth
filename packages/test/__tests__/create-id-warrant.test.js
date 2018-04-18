// @flow
import test from "ava"
import { setupClient } from "./_helpers"

test("has user id in warrant", async t => {
  let cipher
  const onAuthApprove = async ({ idWarrant }) => {
    const parts = idWarrant.split(".")
    let raw = new Buffer(parts[1], "base64").toString("utf8")
    let decodedToken = JSON.parse(raw)
    t.truthy(decodedToken.userId)
  }
  const { authReset, authRemote } = setupClient({
    onAuthApprove,
    onDevRequest: c => (cipher = c),
  })
  const api = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  return t.notThrows(api.approveAuth(cipher || "cipher missing"))
})

test.skip("has public key in warrant", async t => {
  t.plan(1)
  let cipher
  const onAuthApprove = async ({ idWarrant }) => {
    const parts = idWarrant.split(".")
    let raw = new Buffer(parts[1], "base64").toString("utf8")
    let decodedToken = JSON.parse(raw)
    t.truthy(decodedToken.publicKey)
  }
  const { authReset, authRemote } = setupClient({
    onAuthApprove,
    onDevRequest: c => (cipher = c),
  })
  const api = await authRemote()
  await api.requestAuth({ type: "dev", credential: "dev-credential", mode: 3 })
  return t.notThrows(api.approveAuth(cipher || "cipher missing"))
})

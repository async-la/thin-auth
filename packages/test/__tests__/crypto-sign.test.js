// @flow
import test from "ava"
import { setupClient } from "./_helpers"

test.beforeEach(t => {
  t.context = setupClient()
})

test("crypto sign with keypair", async t => {
  const { authReset, authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  const kp = await api.cryptoCreateKeypair()
  const message = "the message with correct secret key"
  const signedMessage = await api.cryptoSign(Buffer.from(message, "utf8"), kp)
  const verifiedMessage = await api.cryptoVerify(signedMessage)
  t.is(verifiedMessage, message)
})

test.skip("crypto sign with wrong public key", async t => {
  const { authReset, authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  const kp1 = await api.cryptoCreateKeypair()
  const kp2 = await api.cryptoCreateKeypair()
  const message = "the message with wrong public key"
  const signedMessage = await api.cryptoSign(Buffer.from(message, "utf8"), kp1)
  const verifiedMessage = await api.cryptoVerify(signedMessage, kp2.publicKey)
  t.not(verifiedMessage, message)
})

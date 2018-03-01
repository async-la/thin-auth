// @flow
import test from 'ava'
import { setupClient } from './_helpers'

const sessionId = 1
const sessionIdCipher = '6e'

const random = Math.random

test.beforeEach(t => {
  // $FlowFixMe
  Math.random = () => sessionId
  t.context = setupClient()
})

test.after.always(t => {
  // $FlowFixMe
  Math.random = random
})

test('crypto sign with keypair', async t => {
  const { authReset, authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  const kp = await api.crypto_sign_keypair()
  const message = 'the message with correct secret key'
  const signedMessage = await api.cryptoSign(Buffer.from(message, 'utf8'), kp)
  const verifiedMessage = await api.cryptoVerify(signedMessage)
  t.is(verifiedMessage, message)
})

test.skip('crypto sign with wrong keypair', async t => {
  const { authReset, authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  const kp1 = await api.crypto_sign_keypair()
  const kp2 = await api.crypto_sign_keypair()
  const message = 'the message with wrong public key'
  const signedMessage = await api.cryptoSign(Buffer.from(message, 'utf8'), kp1)
  const verifiedMessage = await api.cryptoVerify(signedMessage, kp2.publicKey)
  t.not(verifiedMessage, message)
})

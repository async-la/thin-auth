// @flow
import test from 'ava'
import localStorage from 'mock-local-storage'
import { AsyncStorage } from 'AsyncStorage'

import createAuthClient from '../client'

// Stub session id generation
// $FlowFixMe
Math.random = () => 1
const sessionIdCipher = '6e'

function setup() {
  const client = createAuthClient({
    endpoint: 'wss://api.auth.asy.nc',
    apiKey: 'test',
    onAuthApprove: async () => console.log('!! Auth Approved'),
    storage: AsyncStorage,
  })
  return client
}

test('refresh id warrant when not verified', async t => {
  const { refreshIdWarrant } = setup()
  await t.throws(refreshIdWarrant())
})

test('refresh id warrant when verified', async t => {
  const { authRemote, refreshIdWarrant } = setup()
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'carlo.cajucom+test@gmail.com' })
  await api.approveAuth(sessionIdCipher)
  await t.notThrows(refreshIdWarrant())
})

test('refresh id warrant when rejected', async t => {
  const { authRemote, refreshIdWarrant } = setup()
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'carlo.cajucom+test@gmail.com' })
  await api.rejectAuth(sessionIdCipher)
  await t.throws(refreshIdWarrant())
})

test('refresh id when reset', async t => {
  const { authReset, authRemote, refreshIdWarrant } = setup()
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'carlo.cajucom+test@gmail.com' })
  await api.approveAuth('6e')
  // @TODO: switch to auth reset, AsyncStorage does not have `removeItem` (carlo)
  await authReset()
  //await api.revokeAuth('1')
  await t.throws(refreshIdWarrant())
})

test('crypto sign with secret key', async t => {
  const { authReset, authRemote, refreshIdWarrant } = setup()
  const api = await authRemote()
  const kp = await api.crypto_sign_keypair()
  const message = 'the message with correct secret key'
  const signedMessage = await api.cryptoSign(Buffer.from(message, 'ascii'), kp.secretKey)
  const verifiedMessage = await api.cryptoVerify(signedMessage)
  t.is(verifiedMessage, message)
})

test('crypto sign with wrong secret key', async t => {
  const { authReset, authRemote, refreshIdWarrant } = setup()
  const api = await authRemote()
  const message = 'the message with wrong secret key'
  const signedMessage = await api.cryptoSign(Buffer.from(message, 'ascii'), Buffer.from('badKey', 'ascii'))
  const verifiedMessage = await api.cryptoVerify(signedMessage)
  t.not(verifiedMessage, message)
})

// @flow
import test from 'ava'
import { setupClient } from './_helpers'

const sessionId = 1
const sessionIdCipher = '6e'

const random = Math.random

test.beforeEach(t => {
  // Mock session id creation
  // $FlowFixMe
  Math.random = () => sessionId
  t.context = setupClient()
})

test.after.always(t => {
  // $FlowFixMe
  Math.random = random
})

test('refresh id warrant when not verified', async t => {
  const { refreshIdWarrant } = t.context
  await t.throws(refreshIdWarrant())
})

test('refresh id warrant when verified', async t => {
  const { authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'carlo.cajucom+test@gmail.com' })
  await api.approveAuth(sessionIdCipher)
  await t.notThrows(refreshIdWarrant())
})

test('refresh id warrant when rejected', async t => {
  const { authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'carlo.cajucom+test@gmail.com' })
  await api.rejectAuth(sessionIdCipher)
  await t.throws(refreshIdWarrant())
})

test.skip('refresh id when reset', async t => {
  const { authReset, authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'carlo.cajucom+test@gmail.com' })
  await api.approveAuth('6e')
  // @TODO: switch to auth reset once mocked AsyncStorage has `removeItem` (carlo)
  //await authReset()
  await api.revokeAuth('1')
  await t.throws(refreshIdWarrant())
})

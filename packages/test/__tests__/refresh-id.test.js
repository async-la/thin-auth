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
  const { authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  await api.rejectAuth(sessionIdCipher)
  await t.throws(refreshIdWarrant())
})

test('refresh id warrant when verified', async t => {
  const { authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'test@test.test' })
  await api.approveAuth(sessionIdCipher)
  await t.notThrows(refreshIdWarrant())
})

test('refresh id warrant when rejected', async t => {
  const { authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'test@test.test' })
  await api.rejectAuth(sessionIdCipher)
  await t.throws(refreshIdWarrant())
})

test.skip('refresh id when reset', async t => {
  const { authReset, authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'test@test.test' })
  await api.approveAuth('6e')
  await authReset()
  await t.throws(refreshIdWarrant())
})

// @flow
import test from 'ava'
import { setupClient } from './_helpers'

const sessionId = 0
const sessionIdCipher = '6f'

const random = Math.random

test.beforeEach(t => {
  // Mock session id creation
  // $FlowFixMe
  Math.random = () => sessionId
  t.context = setupClient()
})

test.afterEach.always(t => {
  // $FlowFixMe
  Math.random = random
})

test('reverify cipher after revoking auth', async t => {
  // @TODO: Expects session to be expired. Create a new test db that cleans up after instead (carlo)
  const { authReset, authRemote, refreshIdWarrant } = t.context
  const api = await authRemote()
  await authReset()
  await t.throws(api.approveAuth(sessionIdCipher))
})

// @flow
import test from 'ava'
import localStorage from 'mock-local-storage'

import createAuthClient from '../client'

test('createAuthClient', async t => {
  const { authReset, authRemote, refreshIdWarrant } = createAuthClient({
    endpoint: 'wss://api.auth.asy.nc',
    apiKey: 'test',
    onAuthApprove: async () => console.log('approved'),
    storage: localStorage,
  })
  console.log(authRemote)
  const api = await authRemote()
  console.log(api)
  await api.requestAuth({ type: 'email', credential: 'carlo.cajucom+test@gmail.com' })
  t.pass()
})

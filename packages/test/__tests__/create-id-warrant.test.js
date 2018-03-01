// @flow
import test from 'ava'
import { setupClient } from './_helpers'

const sessionId = 1
const sessionIdCipher = '6e'

const random = Math.random

test.beforeEach(t => {
  // $FlowFixMe
  Math.random = () => sessionId
})

test.after.always(t => {
  // $FlowFixMe
  Math.random = random
})

test('has user id in warrant', async t => {
  t.plan(1)
  const onAuthApprove = async ({ idWarrant }) => {
    const parts = idWarrant.split(".")
    let raw = new Buffer(parts[1], 'base64').toString('utf8')
    let decodedToken = JSON.parse(raw)
    t.truthy(decodedToken.userId)
  }
  const { authReset, authRemote, refreshIdWarrant } = setupClient({ onAuthApprove })
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'carlo.cajucom+test@gmail.com' })
  await api.approveAuth('6e')
})

test.skip('has public key in warrant', async t => {
  t.plan(1)
  const onAuthApprove = async ({ idWarrant }) => {
    const parts = idWarrant.split(".")
    let raw = new Buffer(parts[1], 'base64').toString('utf8')
    let decodedToken = JSON.parse(raw)
    t.truthy(decodedToken.publicKey)
  }
  const { authReset, authRemote, refreshIdWarrant } = setupClient(onAuthApprove)
  const api = await authRemote()
  await api.requestAuth({ type: 'email', credential: 'carlo.cajucom+test@gmail.com' })
  await api.approveAuth('6e')
})

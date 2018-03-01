// @flow
import localStorage from 'mock-local-storage'
import { AsyncStorage } from 'AsyncStorage'

import createAuthClient from '../../client'

export function setupClient() {
  const client = createAuthClient({
    endpoint: 'ws://localhost:3005',
    apiKey: 'soniuf39j3fsxxxe-dev',
    onAuthApprove: async () => console.log('!! Auth Approved'),
    storage: AsyncStorage,
  })
  return client
}

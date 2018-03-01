import localStorage from 'mock-local-storage'
import { AsyncStorage } from 'AsyncStorage'

import createAuthClient from '../../client'

const defaultOnAuthApprove = async () => {}

export function setupClient({ onAuthApprove } = {}) {
  const client = createAuthClient({
    endpoint: 'ws://localhost:3005',
    apiKey: 'soniuf39j3fsxxxe-dev',
    onAuthApprove: onAuthApprove || defaultOnAuthApprove,
    storage: AsyncStorage,
  })
  return client
}

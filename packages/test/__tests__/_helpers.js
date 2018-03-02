import createAuthClient from '../../client'

const defaultOnAuthApprove = async () => {}

export function setupClient({ onAuthApprove } = {}) {
  const client = createAuthClient({
    endpoint: 'ws://localhost:3005',
    apiKey: 'test-key',
    onAuthApprove: onAuthApprove || defaultOnAuthApprove,
  })
  return client
}

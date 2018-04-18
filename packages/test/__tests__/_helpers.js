// @flow
import createAuthClient from "../../client"
import { enforceValidTenant } from "../../server/src/scope/auth/tenantCache"
import createSequelize from "../../server/src/db"
import { createMemoryStorage } from "storage-memory"

const API_KEY = "test-key"
export function setupClient({
  onDevRequest,
  sign,
}: { onDevRequest?: Function, sign?: boolean } = {}) {
  const client = createAuthClient({
    endpoint: "ws://localhost:3005",
    apiKey: API_KEY,
    onDevRequest,
    sign,
    timeout: 5000,
    storage: createMemoryStorage(),
  })
  return client
}

export function sleep(t: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, t))
}

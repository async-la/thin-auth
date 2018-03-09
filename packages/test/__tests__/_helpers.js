import createAuthClient from "../../client";
import { enforceValidTenant } from "../../server/src/scope/auth/tenantCache";
import createSequelize from "../../server/src/db";

const defaultOnAuthApprove = async () => {};

const API_KEY = "test-key";
export function setupClient({ onAuthApprove, onDevRequest } = {}) {
  const client = createAuthClient({
    endpoint: "ws://localhost:3005",
    apiKey: API_KEY,
    onAuthApprove: onAuthApprove || defaultOnAuthApprove,
    onDevRequest,
    timeout: 5000
  });
  return client;
}

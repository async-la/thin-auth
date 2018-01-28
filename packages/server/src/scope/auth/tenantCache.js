// @flow

import { Tenant } from '../../db'

const TEN_MINUTES = 1000 * 60 * 10
let cache = new Map()
export async function enforceValidTenant (apiKey: string): Object {
  let tenant = cache.get(apiKey)
  if (tenant) {
    if (tenant.retrievedAt < Date.now() - TEN_MINUTES) cache.delete(apiKey)
    else return tenant
  }
  // if we did not early return with a valid tenant, fetch the tenant now
  tenant = await Tenant.findOne({ where: { key: apiKey} })
  if (!tenant) throw new Error('##TENANT NOT FOUND')
  else cache.set(apiKey, tenant)
  return tenant
}

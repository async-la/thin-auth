// @flow

import type { ThinAuthClientApi } from "../../types"
import { getLocalRemote } from "edonode"

export async function getRemote(key: string, connectionId: string): Promise<ThinAuthClientApi> {
  let remote = getLocalRemote(key, connectionId)
  if (!remote) throw new Error("no remote found!")
  return remote
}

// export async function getRemoteByUserId(userId: string): Promise<AuthClientApi> {
//   // @TODO construct a edonode peering / peer discovery, and invoke peer call that way
//   let edonodeId = await getedonodeForUser(userId)
//   let clientProxy = {
//     onAuthApproved: async (...args) => {
//       let peer = await edonodePeers[edonodeId]()
//       return await peer['onAuthApproved'](...args)
//     }
//   }
// }

// @flow

import type { ThinAuthClientApi } from "@rt2zz/thin-auth-interface"
import { getLocalRemote } from "edonode"

export async function getRemote(sessionId: string): Promise<ThinAuthClientApi> {
  let remote = getLocalRemote(sessionId)
  if (!remote) throw { message: "##remote not found" }
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

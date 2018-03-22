// @flow
import test from "ava"
import { setupClient, sleep } from "./_helpers"
import {
  OP_ALIAS_ADD,
  OP_ALIAS_UPDATE,
  OP_ALIAS_REMOVE,
  type ThinAuthServerApi,
} from "../../interface"
import { decodeIdWarrant } from "../../client/src"

function setup(t) {
  t.context.client = setupClient({
    onDevRequest: (c, op) => {
      t.context.cipher = c
      t.context.cipherOp = op
    },
  })
  t.context.client.authSync(async warrants => {
    let [idWarrant, metaWarrant] = warrants || []
    if (!idWarrant) {
      t.context.userId = null
      return
    }
    let decodedToken = decodeIdWarrant(idWarrant)
    t.context.userId = decodedToken.userId
  })
}

test.beforeEach(t => {
  setup(t)
})

test("addAlias", async t => {
  const { authRemote } = t.context.client
  const api: ThinAuthServerApi = await authRemote()
  const credential = "dev-credential"
  await api.requestAuth({ type: "dev", credential, mode: 3 })
  await api.approveAuth(t.context.cipher)
  let firstUserId = t.context.userId
  t.truthy(firstUserId)
  delete t.context.userId // clear userId to avoid any confusion with the next one

  let newCredential = `dev-credential-add-${Math.random().toString(32)}`
  await api.addAlias({ type: "dev", credential: newCredential, mode: 3 })
  t.is(t.context.cipherOp, OP_ALIAS_ADD)
  await api.approveAuth(t.context.cipher)

  // setup new client
  setup(t)

  let newApi = await t.context.client.authRemote()
  await newApi.requestAuth({ type: "dev", credential: newCredential, mode: 3 })
  await api.approveAuth(t.context.cipher)
  t.is(firstUserId, t.context.userId)
})

test("removeAlias", async t => {
  const { authRemote } = t.context.client

  const api: ThinAuthServerApi = await authRemote()
  let credential = `dev-credential-remove-${Math.random().toString(32)}`
  await api.requestAuth({ type: "dev", credential, mode: 3 })
  await api.approveAuth(t.context.cipher)
  let firstUserId = t.context.userId
  t.truthy(firstUserId)
  delete t.context.userId // clear userId to avoid any confusion with the next one

  await api.removeAlias({ type: "dev", credential })

  await api.updateAlias({ type: "dev", credential, mode: 3 }, { type: "dev", credential })
  // cannot update an alias that no longer belongs to the user
  await t.throws(api.approveAuth(t.context.cipher))
})

test("updateAlias", async t => {
  const { authRemote } = t.context.client
  const api1: ThinAuthServerApi = await authRemote()

  let credential = `dev-credential-pre-update-${Math.random().toString(32)}`
  await api1.requestAuth({ type: "dev", credential, mode: 3 })
  await api1.approveAuth(t.context.cipher)
  let firstUserId = t.context.userId
  t.truthy(firstUserId)

  let newCredential = `dev-credential-post-update-${Math.random().toString(32)}`
  await api1.updateAlias(
    { type: "dev", credential: newCredential, mode: 3 },
    { type: "dev", credential }
  )
  await api1.approveAuth(t.context.cipher)
  t.is(t.context.cipherOp, OP_ALIAS_UPDATE)

  // setup new client, confirm new alias login results in same userId
  setup(t)
  let api2: ThinAuthServerApi = await t.context.client.authRemote()
  await api2.requestAuth({ type: "dev", credential: newCredential, mode: 3 })
  await api2.approveAuth(t.context.cipher)
  t.is(firstUserId, t.context.userId)

  // setup new client, confirm old alias login results in new userId
  setup(t)
  let api3: ThinAuthServerApi = await t.context.client.authRemote()
  await api3.requestAuth({ type: "dev", credential, mode: 3 })

  await api3.approveAuth(t.context.cipher)

  t.not(firstUserId, t.context.userId)
})

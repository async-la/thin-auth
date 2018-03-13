// @flow
import test from "ava";
import { setupClient } from "./_helpers";
import { OP_ALIAS_ADD, OP_ALIAS_UPDATE } from "../../interface";

function setup(t) {
  t.context.client = setupClient({
    onDevRequest: (c, op) => {
      t.context.cipher = c;
      t.context.cipherOp = op;
    },
    onAuthApprove: async ({ idWarrant }) => {
      const parts = idWarrant.split(".");
      let raw = new Buffer(parts[1], "base64").toString("utf8");
      let decodedToken = JSON.parse(raw);
      t.context.userId = decodedToken.userId;
    }
  });
}

test.beforeEach(t => {
  setup(t);
});

test("addAlias", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client;
  const api = await authRemote();
  await api.requestAuth({ type: "dev", credential: "dev-credential" });
  await api.approveAuth(t.context.cipher);
  let firstUserId = t.context.userId;
  t.truthy(firstUserId);
  delete t.context.userId; // clear userId to avoid any confusion with the next one

  let newCredential = `dev-credential-add-${Math.random().toString(32)}`;
  await api.addAlias({ type: "dev", credential: newCredential });
  t.is(t.context.cipherOp, OP_ALIAS_ADD);
  await api.approveAuth(t.context.cipher);

  // setup new client
  setup(t);

  let newApi = await t.context.client.authRemote();
  await newApi.requestAuth({ type: "dev", credential: newCredential });
  await newApi.approveAuth(t.context.cipher);
  t.is(firstUserId, t.context.userId);
});

test("updateAlias", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client;
  const api1 = await authRemote();

  let credential = `dev-credential-pre-update-${Math.random().toString(32)}`;
  await api1.requestAuth({ type: "dev", credential });
  await api1.approveAuth(t.context.cipher);
  let firstUserId = t.context.userId;
  t.truthy(firstUserId);

  let newCredential = `dev-credential-post-update-${Math.random().toString(
    32
  )}`;
  await api1.updateAlias(
    { type: "dev", credential: newCredential },
    { type: "dev", credential }
  );
  t.is(t.context.cipherOp, OP_ALIAS_UPDATE);
  await api1.approveAuth(t.context.cipher);

  // setup new client, confirm new alias login results in same userId
  setup(t);
  let api2 = await t.context.client.authRemote();
  await api2.requestAuth({ type: "dev", credential: newCredential });
  await api2.approveAuth(t.context.cipher);
  t.is(firstUserId, t.context.userId);

  // setup new client, confirm old alias login results in new userId
  setup(t);
  let api3 = await t.context.client.authRemote();
  await api3.requestAuth({ type: "dev", credential });
  await api3.approveAuth(t.context.cipher);
  t.not(firstUserId, t.context.userId);
});

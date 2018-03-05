// @flow
import test from "ava";
import { setupClient, purge } from "./_helpers";

test.beforeEach(t => {
  t.context.client = setupClient({
    onDevRequest: c => {
      t.context.cipher = c;
    }
  });
});

test("refresh id warrant when not verified", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client;
  const api = await authRemote();
  await api.requestAuth({ type: "dev", credential: "dev-credential" });
  await t.throws(refreshIdWarrant());
});

test("refresh id warrant when verified", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client;
  const api = await authRemote();
  await api.requestAuth({ type: "dev", credential: "dev-credential" });
  await api.approveAuth(t.context.cipher);
  await t.notThrows(refreshIdWarrant());
});

test("refresh id warrant when rejected", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client;
  const api = await authRemote();
  await api.requestAuth({ type: "dev", credential: "dev-credential" });
  await api.rejectAuth(t.context.cipher);
  await t.throws(refreshIdWarrant());
});

test.skip("refresh id when reset", async t => {
  const { authReset, authRemote, refreshIdWarrant } = t.context.client;
  const api = await authRemote();
  await api.requestAuth({ type: "dev", credential: "dev-credential" });
  await api.approveAuth(t.context.cipher);
  await authReset();
  await t.throws(refreshIdWarrant());
});

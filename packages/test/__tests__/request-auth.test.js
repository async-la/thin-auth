// @flow
import test from "ava";
import { setupClient } from "./_helpers";

test.beforeEach(t => {
  t.context.client = setupClient({
    onDevRequest: c => {
      t.context.cipher = c;
    }
  });
});

test("request auth fails if channel type is not whitelisted", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client;
  const api = await authRemote();
  await t.throws(
    api.requestAuth({ type: "not a channel", credential: "dev-credential" })
  );
});

test("request auth fails if session is verified", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client;
  const api = await authRemote();
  await api.requestAuth({ type: "dev", credential: "dev-credential" });
  await api.approveAuth(t.context.cipher);
  await t.throws(
    api.requestAuth({ type: "dev", credential: "dev-credential" })
  );
});

test("request auth fails if session is expired", async t => {
  const { authRemote, refreshIdWarrant } = t.context.client;
  const api = await authRemote();
  await api.requestAuth({ type: "dev", credential: "dev-credential" });
  await api.rejectAuth(t.context.cipher);
  await t.throws(
    api.requestAuth({ type: "dev", credential: "dev-credential" })
  );
});

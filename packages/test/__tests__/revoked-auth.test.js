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

test("reverify cipher after auth reset", async t => {
  const { authReset, authRemote, refreshIdWarrant } = t.context.client;
  const api = await authRemote();
  await api.requestAuth({ type: "dev", credential: "dev-credential" });
  await authReset();
  await t.throws(api.approveAuth(t.context.cipher));
});

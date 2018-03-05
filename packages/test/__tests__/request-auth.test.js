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
    api.requestAuth({ type: "foo", credential: "test@test.test" })
  );
});

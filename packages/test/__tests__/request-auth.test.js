// @flow
import test from "ava";
import { setupClient } from "./_helpers";

const sessionId = 1;
const sessionIdCipher = "6e";

const random = Math.random;

test.beforeEach(t => {
  // Mock session id creation
  // $FlowFixMe
  Math.random = () => sessionId;
  t.context = setupClient();
});

test.after.always(t => {
  // $FlowFixMe
  Math.random = random;
});

test("request auth fails if channel type is not whitelisted", async t => {
  const { authRemote, refreshIdWarrant } = t.context;
  const api = await authRemote();
  await t.throws(
    api.requestAuth({ type: "foo", credential: "test@test.test" })
  );
});

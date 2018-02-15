// @flow
import test from 'ava';

import createAuthClient from '../client'

test('foo', t => {
  t.pass();
});

test('bar', async t => {
  const bar = Promise.resolve('bar');

  t.is(await bar, 'bar');
});
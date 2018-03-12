// @flow
import { api as sodium, Box, Key, Sign } from "sodium";

import type { Keypair, Signature } from "@rt2zz/thin-auth-interface";
import MsgPack from "msgpack5";

let msgpack = MsgPack();

// @NOTE these are exposed in the scope/auth api
export async function cryptoCreateKeypair(): Promise<Keypair> {
  var keypair = sodium.crypto_sign_keypair();
  return msgpack.encode(keypair);
}

export async function cryptoSign(m: string, kp: Keypair): Promise<Signature> {
  let keypair = msgpack.decode(kp);
  let message = new Buffer(m);
  let signed = sodium.crypto_sign(message, keypair.secretKey);
  return msgpack.encode({ m: signed, pk: keypair.publicKey });
}

export async function cryptoVerify(sig: Signature): Promise<string> {
  let signature = msgpack.decode(sig);
  let verified = sodium.crypto_sign_open(signature.m, signature.pk);
  return verified && verified.toString("utf8");
}

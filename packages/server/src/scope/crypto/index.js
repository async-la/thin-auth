// @flow
import { api as sodium, Box, Key, Sign } from 'sodium'

import type { Keypair, Signature } from "@rt2zz/thin-auth-interface"

// @NOTE these are exposed in the scope/auth api
export async function cryptoCreateKeypair(): Promise<Keypair> {
    var sender = new Key.Sign()
    return sender
  }
  
 export async function cryptoSign(message: Buffer, kp: Keypair): Promise<Signature> {
    let a = new Sign(kp)
    return a.sign(message)
  }
  
export  async function cryptoVerify(signature: Signature): Promise<string> {
    let verified = Sign.verify(signature)
    return verified && verified.toString('utf8')
  }
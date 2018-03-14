// @flow

import {
  ERR_SESSION_INACTIVE,
  ERR_SESSION_NOT_LATENT
} from "@rt2zz/thin-auth-interface";

type ErrorProperties = {
  code: string,
  message: string,
  meta: any
};

class ApiError extends Error {
  code: string;
  meta: any;
  constructor({ code, message, meta }: ErrorProperties) {
    super(message);
    this.code = code;
    this.meta = meta;
    Error.captureStackTrace(this, ApiError);
  }
}

export class SessionInactive extends ApiError {
  constructor(meta: any) {
    super({
      code: ERR_SESSION_INACTIVE,
      message: "Session is not active.",
      meta
    });
  }
}

export class SessionNotLatent extends ApiError {
  constructor(meta: any) {
    super({
      code: ERR_SESSION_NOT_LATENT,
      message: "Session is not latent.",
      meta
    });
  }
}

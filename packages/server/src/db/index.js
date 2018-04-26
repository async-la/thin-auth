// @flow

import Sequelize from "sequelize"
import type { CredentialType } from "@rt2zz/thin-auth-interface"

const defaultConfig = {
  freezeTableName: true,
}

function createSequelize(tenant: TenantType) {
  let tenantId = tenant.id
  const sequelize = new Sequelize({
    dialect: "mysql",
    host: process.env.DATABASE_HOST,
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,

    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  })

  let aliasTable = `${tenantId}:alias`
  let opTable = `${tenantId}:op`
  let sessionTable = `${tenantId}:session`
  let stateTable = `${tenantId}:state`

  const Alias = sequelize.define(
    aliasTable,
    {
      credential: {
        type: Sequelize.STRING(256),
        allowNull: false,
      },
      secret: {
        type: Sequelize.STRING(1024),
      },
      type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      userId: {
        type: Sequelize.STRING(256),
        allowNull: false,
      },
      mode: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      verifiedAt: {
        type: Sequelize.DATE,
      },
      deletedAt: {
        type: Sequelize.DATE,
      },
    },
    { freezeTableName: true, timestamps: false }
  )
  // @NOTE sequelize automatically adds id when there is no primary key
  Alias.removeAttribute("id")

  const Op = sequelize.define(
    opTable,
    {
      id: {
        type: Sequelize.STRING(256),
        primaryKey: true,
      },
      sessionId: {
        type: Sequelize.STRING(256),
        allowNull: false,
      },
      operation: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      addAlias: {
        type: Sequelize.JSON,
      },
      removeAlias: {
        type: Sequelize.JSON,
      },
    },
    defaultConfig
  )

  const Session = sequelize.define(
    sessionTable,
    {
      id: {
        type: Sequelize.STRING(256),
        primaryKey: true,
      },
      userId: {
        type: Sequelize.STRING(256),
        allowNull: false,
      },
      mode: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      publicKey: {
        type: Sequelize.STRING(1024),
      },
      verifiedAt: {
        type: Sequelize.DATE,
      },
      expiresAt: {
        type: Sequelize.DATE,
      },
    },
    defaultConfig
  )

  const State = sequelize.define(
    stateTable,
    {
      key: {
        type: Sequelize.STRING(256),
        primaryKey: true,
      },
      state: {
        type: Sequelize.JSON,
      },
    },
    { freezeTableName: true, timestamps: false }
  )

  return { Alias, Op, Session, State, aliasTable, sessionTable, sequelize }
}

const rootSequelize = new Sequelize({
  dialect: "mysql",
  host: process.env.DATABASE_HOST,
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,

  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
})

export const Tenant = rootSequelize.define(
  "tenant",
  {
    id: {
      type: Sequelize.STRING,
      primaryKey: true,
    },
    name: {
      type: Sequelize.STRING,
    },
    key: {
      type: Sequelize.STRING,
    },
    authVerifyUrl: {
      type: Sequelize.STRING,
    },
    config: {
      type: Sequelize.JSON,
    },
    twilioConfig: {
      type: Sequelize.JSON,
    },
    mailgunConfig: {
      type: Sequelize.JSON,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
)

export type TenantType = {
  id: string,
  name: string,
  key: string,
  authVerifyUrl: string,
  config: {
    channelWhitelist: Array<CredentialType>,
  },
  mailgunConfig: ?{
    apiKey: string,
    domain: string,
    from: string,
    subject: string,
    flags?: Object,
  },
  twilioConfig: ?{
    fromNumber: string,
    sid: string,
    authToken: string,
  },
}

// rootSequelize.sync({ force: true })
let sequelizeMap: Map<string, Object> = new Map()

export default function(tenant: TenantType): Object {
  let cached = sequelizeMap.get(tenant.id)
  if (cached) return cached
  else {
    let payload = createSequelize(tenant)
    sequelizeMap.set(tenant.id, payload)
    return payload
  }
}

export { Sequelize }

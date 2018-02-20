// @flow

import Sequelize from "sequelize"

const defaultConfig = {
  freezeTableName: true
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
      idle: 10000
    }
  })

  const Alias = sequelize.define(
    `${tenantId}:alias`,
    {
      credential: {
        type: Sequelize.STRING,
        primaryKey: true
      },
      type: {
        type: Sequelize.STRING,
      },
      userId: {
        type: Sequelize.STRING
      }
    },
    { freezeTableName: true, timestamps: false }
  )

  const Session = sequelize.define(
    `${tenantId}:session`,
    {
      id: {
        type: Sequelize.STRING,
        primaryKey: true
      },
      userId: {
        type: Sequelize.STRING
      },
      verifiedAt: {
        type: Sequelize.DATE
      },
      expiredAt: {
        type: Sequelize.DATE
      }
    },
    defaultConfig
  )

  return { Alias, Session, sequelize}
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
    idle: 10000
  }
})

export const Tenant = rootSequelize.define(
  "tenant",
  {
    id: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    name: {
      type: Sequelize.STRING
    },
    key: {
      type: Sequelize.STRING
    },
    authVerifyUrl: {
      type: Sequelize.STRING
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
  mailgunConfig: ?{
    apiKey: string,
    domain: string,
    from: string,
    subject: string,
  },
  twilioConfig: ?{
    fromNumber: string,
    sid: string,
    authToken: string,
  },
}

// rootSequelize.sync({ force: true })
let sequelizeMap: Map<string, Object> = new Map()

export default function (tenant: TenantType): Object {
  let cached = sequelizeMap.get(tenant.id)
  if (cached) return cached
  else {
    let payload = createSequelize(tenant)
    sequelizeMap.set(tenant.id, payload)
    return payload
  }
}

export { Sequelize }

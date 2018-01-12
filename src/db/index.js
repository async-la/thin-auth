// @flow

import Sequelize from "sequelize"

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

const defaultConfig = {
  freezeTableName: true
}

const Alias = sequelize.define(
  "alias",
  {
    email: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    userId: {
      type: Sequelize.STRING
    }
  },
  { freezeTableName: true, timestamps: false }
)

const Session = sequelize.define(
  "session",
  {
    id: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    userId: {
      type: Sequelize.STRING
    },
    connectionId: {
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

// sequelize.sync({ force: true })

export default sequelize
export { Alias, Session, Sequelize }

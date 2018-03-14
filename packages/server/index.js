const packageConfig = require("./package.json")

// Babel, config from package.json + ignore non-@justgolift node_modules
const babelConfig = Object.assign({}, packageConfig.babel, {
  ignore: /node_modules\/(?!(edonode|@rt2zz)\/.*)/,
})

require("babel-register")(babelConfig)

require("dotenv").config()

require("./src")

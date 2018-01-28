let execSync = require("child_process").execSync
let packages = require("./packages")

// npm install
packages.install.forEach(name => {
  console.log("install", name)
  execSync(`npm i`, { stdio: [0, 1, 2], cwd: `packages/${name}` })
})

// npm link common
execSync(`npm link`, { cwd: `packages/interface`, stdio: [0, 1, 2] })
packages.interface.forEach(name => {
  console.log("link interface to ", name)
  execSync(`npm link @rt2zz/thin-auth-interface`, { cwd: `packages/${name}`, stdio: [0, 1, 2] })
})

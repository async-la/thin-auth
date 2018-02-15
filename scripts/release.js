let execSync = require("child_process").execSync

execSync(`npm version patch`, { stdio: [0, 1, 2] })
let v = require('../package.json').version
execSync(`npm version ${v}`, { cwd: 'packages/interface', stdio: [0, 1, 2] })
execSync(`npm version ${v}`, { cwd: 'packages/client', stdio: [0, 1, 2] })

execSync(`npm publish`, { cwd: 'packages/interface', stdio: [0, 1, 2] })
execSync(`npm i @rt2zz/thin-auth-interface@${v}`, { cwd: 'packages/client', stdio: [0, 1, 2] })
execSync(`npm publish`, { cwd: 'packages/client', stdio: [0, 1, 2] })

execSync(`git commit -am '(release): v${v}'`, { stdio: [0, 1, 2] })
execSync(`git push origin`, { stdio: [0, 1, 2] })
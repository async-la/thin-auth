let execSync = require("child_process").execSync;
let packages = require("./packages");

packages.bumpEdonode.forEach(name => {
  execSync(`npm i edonode@latest`, {
    stdio: [0, 1, 2],
    cwd: `packages/${name}`
  });
});

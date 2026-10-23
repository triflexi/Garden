const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');

for (const [event, expected] of [['exit', 7], ['signal', 1], ['error', 1], ['shutdown', 0]]) {
  test(`dev supervisor handles ${event} and stops both children`, () => {
    const script = pathToFileURL(resolve(__dirname, '../../scripts/dev.mjs')).href;
    const result = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const { EventEmitter } = require('node:events');
      const cp = require('node:child_process');
      const children = [];
      let kills = 0;
      // Never read the user's .env or launch actual development servers.
      process.loadEnvFile = () => {};
      cp.spawn = (command, args, options) => {
        assert.equal(command, process.execPath);
        assert.equal(options.env.PUBLIC_ORIGIN, 'http://localhost:5173');
        const child = new EventEmitter();
        child.kill = () => { kills++; child.emit('exit', 0, 'SIGTERM'); };
        children.push(child);
        return child;
      };
      require('node:module').syncBuiltinESMExports();
      import(${JSON.stringify(script)}).then(() => {
        assert.equal(children.length, 2);
        const event = ${JSON.stringify(event)};
        if (event === 'exit') children[0].emit('exit', 7, null);
        if (event === 'signal') children[0].emit('exit', null, 'SIGKILL');
        if (event === 'error') children[0].emit('error', Error('spawn failed'));
        if (event === 'shutdown') process.emit('SIGINT');
        assert.equal(kills, 2);
      }).catch(error => { console.error(error); process.exitCode = 99; });
    `], { encoding: 'utf8', env: { ...process.env, DEV_PUBLIC_ORIGIN: 'http://localhost:5173' } });
    assert.equal(result.status, expected, result.stderr);
  });
}

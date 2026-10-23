import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const env = {
  ...process.env,
  PUBLIC_ORIGIN: process.env.DEV_PUBLIC_ORIGIN ?? 'http://localhost:5173',
};
const api = spawn(process.execPath, ['--watch', '-r', 'ts-node/register', 'src/main.ts'], {
  cwd: resolve(root, 'apps/api'),
  env,
  stdio: 'inherit',
});
const web = spawn(
  process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--strictPort'],
  { cwd: resolve(root, 'apps/web'), env, stdio: 'inherit' },
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill();
  web.kill();
  process.exitCode = code;
}
for (const child of [api, web]) {
  child.on('error', (error) => {
    console.error(error);
    stop(1);
  });
  child.on('exit', (code, signal) => stop(code ?? (signal ? 1 : 0)));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

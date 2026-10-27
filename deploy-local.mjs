import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const targets = {
  phase1: ['resilience-travel-assistant/', 3000, '/'],
  integrated: ['A部分/app/', 3100, '/journey'],
  'phase2-baseline': ['第二阶段信息/', 3200, '/'],
};
const [target = 'integrated', portArg] = process.argv.slice(2);
if (!Object.hasOwn(targets, target)) {
  console.error('Usage: node deploy-local.mjs [phase1|integrated|phase2-baseline] [port]');
  process.exit(1);
}
const [folder, defaultPort, page] = targets[target];
const port = Number(portArg ?? defaultPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('Invalid port.'); process.exit(1); }
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) { console.error('Please install Node.js 22.12+ or 24.'); process.exit(1); }
process.chdir(fileURLToPath(new URL(folder, import.meta.url)));
console.log(`Project: ${target}. After startup, open localhost:${port}${page}`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const args of [['ci'], ['run', 'build'], ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)]]) {
  const result = spawnSync(npm, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

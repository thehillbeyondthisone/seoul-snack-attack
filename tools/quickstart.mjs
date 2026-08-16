// One-click local launcher. It owns only Vite's fixed development port, so a
// stale game session never forces Vite to silently jump to another URL.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const PORT = 5173;
const VITE = resolve('node_modules/vite/bin/vite.js');

function command(name, args) {
  return spawnSync(name, args, { encoding: 'utf8', windowsHide: true });
}

function listenersOnPort(port) {
  if (process.platform === 'win32') {
    const result = command('netstat.exe', ['-ano', '-p', 'tcp']);
    if (result.error) throw result.error;
    const pids = new Set();
    for (const line of result.stdout.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5 || parts[0].toUpperCase() !== 'TCP') continue;
      if (parts[3].toUpperCase() !== 'LISTENING') continue;
      if (!parts[1].endsWith(`:${port}`)) continue;
      pids.add(parts[4]);
    }
    return [...pids];
  }

  const result = command('lsof', ['-ti', `tcp:${port}`]);
  if (result.error || result.status !== 0) return [];
  return result.stdout.trim().split(/\s+/).filter(Boolean);
}

function clearPort(port) {
  const pids = listenersOnPort(port).filter((pid) => pid !== String(process.pid) && pid !== '4');
  for (const pid of pids) {
    console.log(`Stopping existing process ${pid} on port ${port}...`);
    const result = process.platform === 'win32'
      ? command('taskkill.exe', ['/PID', pid, '/T', '/F'])
      : command('kill', ['-TERM', pid]);
    if (result.error || result.status !== 0) {
      throw new Error(`Could not free port ${port} (process ${pid}).`);
    }
  }
}

function installIfNeeded() {
  if (existsSync(VITE)) return;
  console.log('Installing game dependencies...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['install'], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

try {
  clearPort(PORT);
  installIfNeeded();
  console.log(`Starting Seoul Delivery on all local network interfaces at port ${PORT}...`);
  console.log(`This computer: http://127.0.0.1:${PORT}/`);
  for (const address of lanAddresses()) {
    console.log(`Other LAN devices: http://${address}:${PORT}/`);
  }
  const vite = spawn(process.execPath, [VITE, '--host', '0.0.0.0', '--open'], {
    stdio: 'inherit',
    windowsHide: false,
  });
  const stop = (signal) => vite.kill(signal);
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  vite.on('exit', (code) => process.exit(code ?? 0));
} catch (error) {
  console.error(`Quick Start failed: ${error.message}`);
  process.exit(1);
}

// One-click local launcher. It owns only Vite's fixed development port, so a
// stale game session never forces Vite to silently jump to another URL.
//
// PORT HANDLING
// "Something is on port 5273" is three different situations that want three
// different responses, and treating them alike is what makes a launcher feel
// broken:
//
//   1. A healthy Vite dev server is already running — usually a second terminal
//      or an earlier double-click. Killing it and starting another costs a
//      cold city rebuild for no reason, so we reuse it and just open a browser.
//   2. A wedged Vite dev server. This one is nasty because the socket is still
//      LISTENING and still ACCEPTS connections — it simply never answers, and
//      half-closed sockets pile up in FIN_WAIT_2 behind it. It looks alive to
//      anything that only checks whether the port is bound, and it looks alive
//      to the OS, but every request from localhost AND from the LAN hangs. This
//      is the case the old code could not see: it killed by port occupancy
//      alone and then raced the OS to rebind.
//   3. Some other program owns the port. Killing that is not ours to do, so we
//      stop and say whose it is.
//
// So: probe first, classify, and only then decide. And after killing anything,
// WAIT for the OS to actually release the socket instead of assuming taskkill
// returning 0 means the port is free — it does not.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { request } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = 5273;
const VITE = resolve('node_modules/vite/bin/vite.js');

/** How long a request may hang before we call the server wedged rather than slow. */
const PROBE_TIMEOUT_MS = 2500;
/** How long to wait for the OS to release a socket after the owner is killed. */
const PORT_RELEASE_TIMEOUT_MS = 10000;
/** How long a freshly spawned Vite gets to answer its first request. */
const SERVER_READY_TIMEOUT_MS = 90000;
const POLL_INTERVAL_MS = 250;

export const LAUNCH_PROFILES = Object.freeze({
  expanse: '/?world=expanse&intro=off',
  'expanse-review': '/?world=expanse&overview=1&intro=off&time=day&rain=off&stats=1',
  'expanse-mobile': '/?world=expanse&gfx=mobile&intro=off&props=off&stats=1',
  classic: '/?world=proc&intro=off',
  // Not a world: the M1/M2 city plan, regenerated on launch. The rebuild is
  // reviewed as a drawing before any of it is extruded.
  plan: '/_work/expanse-city-plan.html',
});

export function resolveLaunchProfile(argv = process.argv.slice(2)) {
  const value = argv.find((arg) => arg.startsWith('--launch='))?.slice('--launch='.length) || 'expanse';
  return {
    id: Object.hasOwn(LAUNCH_PROFILES, value) ? value : 'expanse',
    path: LAUNCH_PROFILES[value] || LAUNCH_PROFILES.expanse,
  };
}

// `--restart` forces a fresh server even when a healthy one is already up.
const forceRestart = process.argv.includes('--restart');
const launch = resolveLaunchProfile();

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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
    // PID 0 is the idle process and 4 is the Windows kernel; neither is ours to
    // kill, and both show up on rows we do not care about.
    return [...pids].filter((pid) => pid !== '0' && pid !== '4' && pid !== String(process.pid));
  }

  const result = command('lsof', ['-ti', `tcp:${port}`]);
  if (result.error || result.status !== 0) return [];
  return result.stdout.trim().split(/\s+/)
    .filter(Boolean)
    .filter((pid) => pid !== String(process.pid));
}

function describeProcess(pid) {
  if (process.platform === 'win32') {
    const result = command('tasklist.exe', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV']);
    const name = result.stdout?.split(',')[0]?.replace(/"/g, '').trim();
    return name && name !== 'INFO:' ? `${name} (PID ${pid})` : `PID ${pid}`;
  }
  const result = command('ps', ['-p', pid, '-o', 'comm=']);
  const name = result.stdout?.trim();
  return name ? `${name} (PID ${pid})` : `PID ${pid}`;
}

/**
 * One HTTP request against the port, with the three outcomes that matter.
 *
 * @returns {Promise<{ state: 'closed'|'hung'|'http', status?: number, text?: string }>}
 *   closed — nothing accepted the connection (the port is genuinely free)
 *   hung   — the connection was accepted but no response arrived in time
 *   http   — a real HTTP response, with its status code and (drained) body text
 */
export function probe(port, path, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((done) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      done(value);
    };

    const req = request(
      { host: '127.0.0.1', port, path, method: 'GET', timeout: timeoutMs },
      (res) => {
        // Drain the body — an undrained socket keeps the process alive — and
        // keep a bounded copy so the classifier can tell our game's server
        // from another Vite dev server answering on the same port.
        let text = '';
        res.on('data', (chunk) => {
          if (text.length < 65536) text += chunk;
        });
        res.on('end', () => finish({ state: 'http', status: res.statusCode, text }));
        res.resume();
      }
    );

    req.on('timeout', () => {
      req.destroy();
      // A timeout only means "wedged" if we got far enough to be talking to
      // something. Never connecting at all is reported through the error path.
      finish({ state: 'hung' });
    });
    req.on('error', (error) => {
      const code = error.code === undefined ? '' : error.code;
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') finish({ state: 'closed' });
      // A reset mid-conversation is a server that is failing, not an absent one.
      else finish({ state: 'hung' });
    });
    req.end();
  });
}

/**
 * Classify whatever currently owns the port.
 * @returns {Promise<'free'|'ours'|'vite'|'wedged'|'foreign'>}
 */
export async function inspectPort(port) {
  const root = await probe(port, '/');
  if (root.state === 'closed') return 'free';
  if (root.state === 'hung') return 'wedged';

  // It answered. Only a Vite dev server serves its own client shim, which is
  // what separates "a game dev server" from "somebody's unrelated server on
  // 5273". The page title then separates THIS game from the sibling fork —
  // two Vite servers cannot share the port, and reusing the wrong one would
  // open the other game in the browser.
  const client = await probe(port, '/@vite/client');
  if (client.state === 'http' && client.status === 200) {
    return String(root.text).includes('Seoul Snack Attack') ? 'ours' : 'vite';
  }
  if (client.state === 'hung') return 'wedged';
  return 'foreign';
}

/** Kill the port's owners, then wait for the OS to actually release the socket. */
async function clearPort(port) {
  const pids = listenersOnPort(port);
  for (const pid of pids) {
    console.log(`Stopping ${describeProcess(pid)} on port ${port}...`);
    const result = process.platform === 'win32'
      ? command('taskkill.exe', ['/PID', pid, '/T', '/F'])
      : command('kill', ['-TERM', pid]);
    if (result.error || result.status !== 0) {
      const detail = (result.stderr || result.error?.message || '').trim();
      throw new Error(
        `Could not stop the process holding port ${port} (${describeProcess(pid)}).` +
        (detail ? `\n  ${detail}` : '') +
        `\n  Close it yourself, then run Quick Start again.`
      );
    }
  }

  // taskkill returning 0 means the kill was DELIVERED, not that the socket is
  // gone. Rebinding too early is how a launcher "fails to start" immediately
  // after successfully clearing the port.
  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (listenersOnPort(port).length === 0) return;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Port ${port} is still held ${PORT_RELEASE_TIMEOUT_MS / 1000}s after stopping its owner.\n` +
    `  Something is restarting it, or Windows has not released the socket.\n` +
    `  Wait a moment and run Quick Start again.`
  );
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

function printUrls(port, path = '/') {
  console.log(`This computer: http://127.0.0.1:${port}${path}`);
  const lan = lanAddresses();
  if (lan.length === 0) {
    console.log('No LAN address found — other devices will not be able to connect.');
  }
  for (const address of lan) {
    console.log(`Other LAN devices: http://${address}:${port}${path}`);
  }
}

/** The plan is a build artefact, so regenerate it rather than serve a stale one. */
function buildPlanIfRequested() {
  if (launch.id !== 'plan') return;
  console.log('Regenerating the Expanse city plan...');
  const result = spawnSync(process.execPath, [resolve('tools/expanse-plan.mjs')], {
    stdio: 'inherit', windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error('the city plan generator failed - see its output above.');
  }
}

function openBrowser(url) {
  // Avoid `cmd /c start`: launch-profile URLs contain `&`, which cmd treats as
  // a command separator unless its quoting survives two independent parsers.
  if (process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

/** Poll until the freshly spawned server answers, so we never claim a URL that 404s. */
async function waitForServer(port, child) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false; // it died; the exit handler reports why
    const result = await probe(port, '/', 1500);
    if (result.state === 'http') return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function main() {
  const state = await inspectPort(PORT);

  if (state === 'foreign') {
    const owner = listenersOnPort(PORT).map(describeProcess).join(', ') || 'an unknown process';
    throw new Error(
      `Port ${PORT} is being used by ${owner}, which is not a Seoul Delivery dev server.\n` +
      `  Quick Start will not close another program's server.\n` +
      `  Close it yourself, then run Quick Start again.`
    );
  }

  if (state === 'vite') {
    const owner = listenersOnPort(PORT).map(describeProcess).join(', ') || 'a dev server';
    throw new Error(
      `Port ${PORT} is held by ${owner}, which is a Vite dev server but not this game ` +
      `(probably the Seoul Delivery parent project).\n` +
      `  Quick Start will not close it. Stop that server, then run Quick Start again.`
    );
  }

  if (state === 'ours' && !forceRestart) {
    buildPlanIfRequested();
    console.log(`A Seoul Snack Attack dev server is already running on port ${PORT} — reusing it.`);
    console.log('(Run "Quick Start" with --restart to force a fresh server.)');
    printUrls(PORT, launch.path);
    openBrowser(`http://127.0.0.1:${PORT}${launch.path}`);
    process.exit(0);
  }

  if (state === 'wedged') {
    // The case that looks like a network or firewall fault but is not: the
    // socket is bound and accepting, so localhost and LAN both hang identically.
    console.log(`The dev server on port ${PORT} is accepting connections but not responding.`);
    console.log('Restarting it...');
  }

  if (state !== 'free') await clearPort(PORT);

  installIfNeeded();
  buildPlanIfRequested();
  console.log(`Starting Seoul Snack Attack (${launch.id}) on all local network interfaces at port ${PORT}...`);
  const vite = spawn(process.execPath, [VITE, '--host', '0.0.0.0', '--open', launch.path], {
    stdio: 'inherit',
    windowsHide: false,
  });
  const stop = (signal) => vite.kill(signal);
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  vite.on('exit', (code) => {
    // strictPort is deliberate (see vite.config.js) — Vite fails loudly rather
    // than drifting to another port. Translate that into something actionable.
    if (code) console.error(`\nVite exited with code ${code}. If it reported port ${PORT} in use, run Quick Start again.`);
    process.exit(code ?? 0);
  });

  if (await waitForServer(PORT, vite)) {
    console.log('Ready.');
    printUrls(PORT, launch.path);
  } else if (vite.exitCode === null) {
    console.error(`The server did not respond within ${SERVER_READY_TIMEOUT_MS / 1000}s — leaving it running so you can read its output above.`);
  }
}

// Only launch when run directly. Importing this file (tools/bench/quickstart-check.mjs)
// must be able to reach the port classifier without starting a dev server.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`Quick Start failed: ${error.message}`);
    process.exit(1);
  }
}

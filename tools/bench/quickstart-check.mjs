// Quick Start's port classifier.
//
// The launcher's whole job is telling apart the three ways port 5173 can be
// occupied, and the expensive one to get wrong is `wedged`: a dev server whose
// socket is still LISTENING and still ACCEPTS connections but never answers.
// That state is indistinguishable from a healthy server to anything that only
// checks whether the port is bound, and it takes down localhost and LAN access
// identically — which reads as a network fault rather than a dead process.
//
// Each case here binds a real socket and speaks real HTTP, because the bug this
// guards against lives in the difference between "bound" and "responding".
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { inspectPort, probe } from '../quickstart.mjs';

const listen = (server) => new Promise((ready) => {
  server.listen(0, '127.0.0.1', () => ready(server.address().port));
});
const close = (server) => new Promise((done) => server.close(done));

let failures = 0;
function check(label, actual, expected) {
  try {
    assert.equal(actual, expected);
    console.log(`PASS  ${label} — ${actual}`);
  } catch {
    failures++;
    console.log(`FAIL  ${label} — expected ${expected}, got ${actual}`);
  }
}

// ---- free: nothing is listening -------------------------------------------
// Bind a port, then release it, so we are testing a port that is genuinely
// closed rather than one that merely happens to be unused today.
const scratch = createServer();
const freePort = await listen(scratch);
await close(scratch);
check('closed port classifies as free', await inspectPort(freePort), 'free');

// ---- vite: answers / and serves its own client shim ------------------------
const viteish = createServer((req, res) => {
  if (req.url === '/@vite/client') { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end('export {}'); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><title>Seoul Delivery</title>');
});
const vitePort = await listen(viteish);
check('vite dev server classifies as vite', await inspectPort(vitePort), 'vite');
await close(viteish);

// ---- foreign: answers, but is not a Vite dev server ------------------------
// Must never be killed — it belongs to some other program.
const foreign = createServer((req, res) => {
  if (req.url === '/@vite/client') { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200); res.end('some other app');
});
const foreignPort = await listen(foreign);
check('unrelated HTTP server classifies as foreign', await inspectPort(foreignPort), 'foreign');
await close(foreign);

// ---- wedged: accepts the connection, then never replies --------------------
// The exact failure this launcher exists to recover from. Sockets are accepted
// and held open with no response, which is what makes the port look alive.
const held = [];
const wedged = createSocketServer((socket) => { held.push(socket); /* never write, never end */ });
const wedgedPort = await listen(wedged);
check('accepting-but-silent server classifies as wedged', await inspectPort(wedgedPort), 'wedged');
check('probe reports hung for the same port', (await probe(wedgedPort, '/', 800)).state, 'hung');
for (const socket of held) socket.destroy();
await close(wedged);

// ---- probe timeouts must not outlive their budget --------------------------
// A launcher that takes 30s to notice a dead server is its own problem.
const slow = createSocketServer((socket) => { held.push(socket); });
const slowPort = await listen(slow);
const startedAt = Date.now();
await probe(slowPort, '/', 500);
const elapsed = Date.now() - startedAt;
check('probe honours its timeout', elapsed < 2000, true);
console.log(`      (hung probe returned in ${elapsed} ms)`);
slow.close();

if (failures) {
  console.error(`\n${failures} quickstart check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');

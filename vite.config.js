import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  // three-mesh-bvh creates its worker with a URL relative to its own module.
  // Vite's dev dependency prebundle relocates that module without relocating
  // the worker, so the URL 404s and city boot fails. Serving the package as
  // source keeps dev and production on the same worker path semantics.
  optimizeDeps: { exclude: ['three-mesh-bvh'] },
  // Bind explicitly and refuse to drift.
  //
  // Two failure modes cost us a debugging session, both of which look exactly
  // like "the game won't load":
  //   1. Vite's default host resolves to ::1 (IPv6 loopback) ONLY on this
  //      machine, so a browser that resolves `localhost` to 127.0.0.1 gets
  //      connection refused while curl and other IPv6-first tools work fine.
  //      `host: true` binds both stacks.
  //   2. Without strictPort, an occupied port makes Vite silently serve on the
  //      next one up. You then open the port you expected and get somebody
  //      else's server (there is a stray process on 4173 on this box) or
  //      nothing at all. Failing loudly is much easier to diagnose.
  server: {
    host: true,
    // 5273, not the parent project's 5173: this fork lives beside Seoul
    // Delivery (and other Vite apps) on the same machine, and a shared fixed
    // port means the two Quick Starts fight over one socket.
    port: 5273,
    strictPort: true,
    // Build inputs, build OUTPUT, and visual-QA captures are not source
    // modules. Watching the 70–95 MB GLBs on Windows can throw EBUSY and kill
    // the dev server while an asset rebuild is replacing one of them.
    //
    // dist/ is the same hazard from the other end. `npm run build` empties and
    // rewrites that whole directory — hundreds of files, including every asset
    // copied out of public/ — in one burst, directly inside the folder this
    // watcher is monitoring. Running a build while the dev server is up has
    // wedged it: the watcher jams, takes the event loop with it, and the
    // process ends up still holding port 5273 and still accepting connections
    // while answering nothing. That looks like a network or firewall fault
    // rather than a dead server, and it breaks localhost and LAN identically.
    // Nothing is lost by ignoring it — dev serves from source, never from dist.
    watch: {
      ignored: ['**/_source-assets/**', '**/_staging/**', '**/_work/**', '**/dist/**'],
    },
  },
  preview: { host: true, port: 4273, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: {
        main: path.resolve(root, 'index.html'),
        bible: path.resolve(root, 'color-bible.html'),
      },
    },
  },
});

import { defineConfig } from 'vite';

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
    port: 5173,
    strictPort: true,
    // Build inputs and visual-QA captures are not source modules. Watching the
    // 70–95 MB GLBs on Windows can throw EBUSY and kill the dev server while
    // an asset rebuild is replacing one of them.
    watch: { ignored: ['**/_source-assets/**', '**/_staging/**', '**/_work/**'] },
  },
  preview: { host: true, port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
});

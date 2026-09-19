# Blender world studio

Blender 5.2.1 LTS and Blender MCP 1.9.1 were verified together on 2026-09-13.
The MCP server and bundled add-on use protocol 5. Dependencies are pinned in
`requirements-lock.txt` and installed only in `_work/blender-mcp/venv`.

## Use it

Open **Blender World Studio.cmd** in the project root to show the studio.
The launcher reuses this project's running instance or starts a new one. It
does not stop another Blender process or replace an unrelated open scene.

Codex's project configuration registers `seoul_blender`. Restart Codex after
first registration so newly configured tools can load. The stdio entry point
automatically starts the studio if needed, with its window hidden until you
open the visible launcher. Leave the studio open while using the tools.

The editable workspace is
`_source-assets/world/hero-building/world-studio.blend`. It has eight named
collections, metric units, a neutral review light and six camera positions.
The initial empty studio now contains the user's selected Patchwork Pocha
building. See `tools/blender/PATCHWORK-POCHA.md` for review links, build commands
and measured results. Art acceptance of the implemented pilot is still pending.

Save work in Blender and keep accepted edits in reproducible recipes and named
checkpoints. Reopening the launcher loads the saved studio; unsaved work cannot
survive closing Blender. `_source-assets` is ignored by Git, so preserve its
checkpoints in backups. The existing `npm run blender -- <id>` recipe pipeline
continues to work independently with factory startup and background rendering.

## Connection

- Blender endpoint: `127.0.0.1:9877`, dedicated to this project.
- MCP transport: stdio, started with the environment's Python and `server.py`.
- Exposed Codex tools: add-on status, scene information, object information,
  viewport screenshots and Python editing.
- Telemetry is disabled in the server environment and add-on preference.
- Optional external asset/generation integrations are off.
- Add-on registration and preferences belong to this studio process. Normal
  Blender preferences and installed add-ons are not changed.
- The launcher uses a process-only PowerShell execution-policy option to run
  this local script; it does not change the machine/user policy.

The source is [ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp).
The installed 1.9.1 bundled add-on matched upstream commit
`5f8ddaf6e987c4aa0c3467fcc548838b28f64477` (SHA-256
`f43469c8518c7021e0060e32cfe52e3beb126b0f62fbae7293106642a3ebda89`).
Live editing runs Python inside Blender. Use this endpoint for this project's
authorized scene work. Long final renders are better run by the existing
background recipe pipeline than inside a time-limited live tool call.

## Verify or restore

From the project root:

```powershell
# Connection, inspection, reversible edit and viewport image
& '_work/blender-mcp/venv/Scripts/python.exe' tools/blender/mcp/check.py

# Also import an existing asset, export/re-import GLB, save .blend and render PNG
& '_work/blender-mcp/venv/Scripts/python.exe' tools/blender/mcp/check.py --render

# Reinstall the pinned Python environment if _work was removed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/blender/mcp/setup.ps1
```

The render check uses the existing dashboard hippo in a disposable scene. It
does not change the game's assets or the saved building workspace. It writes
`tools/blender/previews/blender-mcp-connection.png`, while the report, viewport
image, test `.blend` and round-trip GLB are in `_work/blender-mcp/check/`.
This proves tool/render/export connectivity, not pilot art quality or textured
material parity with Three.js. Those remain explicit pilot acceptance checks.

Startup logs and `ready.json` are in `_work/blender-mcp/`. If port 9877 belongs
to another process, the launcher reports it without killing that process.
Close and reopen this project's studio after changing its bootstrap script.
If the project moves, update the absolute paths in `.codex/config.toml`.

## Integration details worth preserving

The upstream add-on requires a GUI event loop; `blender --background` cannot
serve it. Suppress upstream autostart during registration, then start the
dedicated endpoint after disabling telemetry. Setting an unregistered scene ID
property alone does not suppress its default port.

The stdio wrapper routes launcher output directly to stderr. Capturing it into
a subprocess pipe can wait indefinitely for a handle inherited by the detached
Blender process. Never print launcher messages to MCP protocol stdout.

Configuration follows [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

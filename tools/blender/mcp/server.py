"""Codex stdio entry point; start the project studio before serving MCP."""
import os
import logging
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
os.environ["DISABLE_TELEMETRY"] = "true"
os.environ["BLENDER_HOST"] = "127.0.0.1"
os.environ["BLENDER_PORT"] = "9877"
# Point the upstream read-only add-on version check at the bundled add-on.
os.environ["BLENDERMCP_ADDONS_DIR"] = str(
    ROOT / "_work/blender-mcp/venv/Lib/site-packages/blender_mcp/bundled"
)
started = subprocess.run(
    ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "tools/blender/mcp/launch.ps1")],
    cwd=ROOT, stdout=sys.stderr, stderr=sys.stderr, timeout=55,
    creationflags=subprocess.CREATE_NO_WINDOW,
)
if started.returncode:
    raise SystemExit(started.returncode)

from blender_mcp.server import main
logging.getLogger("BlenderMCPServer").setLevel(logging.WARNING)
logging.getLogger("mcp.server.lowlevel.server").setLevel(logging.WARNING)
main()

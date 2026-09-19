"""Exercise the real MCP protocol; --render adds a disposable asset round-trip."""
import argparse
import asyncio
import base64
import json
import os
from pathlib import Path
import struct
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "_work/blender-mcp/check"
PREVIEW = ROOT / "tools/blender/previews/blender-mcp-connection.png"


def result_text(result):
    text = "\n".join(item.text for item in result.content if item.type == "text")
    if result.isError or text.startswith(("Error", "Rejected")):
        raise RuntimeError(text)
    return text


async def check(render):
    OUT.mkdir(parents=True, exist_ok=True)
    params = StdioServerParameters(
        command=sys.executable, args=[str(ROOT / "tools/blender/mcp/server.py")],
        cwd=str(ROOT), env={**os.environ, "DISABLE_TELEMETRY": "true"},
    )
    report = {"checks": []}
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as client:
            init = await client.initialize()
            report["server"] = init.serverInfo.model_dump()
            tools = {tool.name for tool in (await client.list_tools()).tools}
            required = {"get_addon_status", "get_scene_info", "get_object_info", "execute_blender_code", "get_viewport_screenshot"}
            assert required <= tools, required - tools
            report["checks"].append("MCP initialize and required tools")
            status = json.loads(result_text(await client.call_tool("get_addon_status", {})))
            report["addon"] = status
            assert status["telemetry_consent"] is False, status
            report["checks"].append("live add-on and telemetry disabled")
            report["scene"] = json.loads(result_text(await client.call_tool("get_scene_info", {"user_prompt": "Verify the project Blender setup"})))
            report["checks"].append("live scene inspection")
            # Reversible property edit proves bpy execution, without touching art.
            mutation = "import bpy\ns = bpy.context.scene\ns['seoul_mcp_probe'] = 42\nassert s['seoul_mcp_probe'] == 42\ndel s['seoul_mcp_probe']\nprint('EDIT_OK')"
            assert "EDIT_OK" in result_text(await client.call_tool("execute_blender_code", {"code": mutation}))
            report["checks"].append("edit and read-back through MCP")
            if render:
                for file in (OUT / "roundtrip.glb", OUT / "connection-check.blend", PREVIEW):
                    # Remove only prior test outputs, so old files cannot pass.
                    file.unlink(missing_ok=True)
                code = (ROOT / "tools/blender/mcp/render_check.py").read_text(encoding="utf-8")
                code = "PROJECT_ROOT = " + repr(str(ROOT)) + "\n" + code
                assert "ROUNDTRIP_OK" in result_text(await client.call_tool("execute_blender_code", {"code": code}))
                assert PREVIEW.stat().st_size > 2048
                assert (OUT / "connection-check.blend").stat().st_size > 10000
                data = (OUT / "roundtrip.glb").read_bytes()
                magic, version, length = struct.unpack_from("<4sII", data)
                assert magic == b"glTF" and version == 2 and length == len(data)
                chunk_length, chunk_kind = struct.unpack_from("<II", data, 12)
                assert chunk_kind == 0x4E4F534A
                gltf = json.loads(data[20:20 + chunk_length])
                assert gltf.get("meshes") and gltf.get("materials")
                assert not gltf.get("cameras")
                assert "KHR_lights_punctual" not in gltf.get("extensions", {})
                assert "GLB_REIMPORT_OK" in result_text(await client.call_tool("execute_blender_code", {"code": (
                    "import bpy\n"
                    "before = set(bpy.data.objects)\n"
                    f"bpy.ops.import_scene.gltf(filepath={str(OUT / 'roundtrip.glb')!r})\n"
                    "imported = set(bpy.data.objects) - before\n"
                    "assert any(o.type == 'MESH' for o in imported)\n"
                    "for o in imported: bpy.data.objects.remove(o, do_unlink=True)\n"
                    "print('GLB_REIMPORT_OK')"
                )}))
                report["checks"].extend(["fresh PNG render", "editable .blend save", "GLB export, structure validation and re-import"])
                report["preview"] = str(PREVIEW)
            screenshot = await client.call_tool("get_viewport_screenshot", {"max_size": 800})
            if screenshot.isError:
                raise RuntimeError(str(screenshot))
            images = [item for item in screenshot.content if item.type == "image"]
            assert images, "No viewport image returned by MCP"
            (OUT / "viewport.png").write_bytes(base64.b64decode(images[0].data))
            report["checks"].append("viewport image returned through MCP")
    report["passed"] = True
    report_path = OUT / ("report.json" if render else "connection-report.json")
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"passed": True, "checks": report["checks"], "report": str(report_path)}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args()
    asyncio.run(check(args.render))

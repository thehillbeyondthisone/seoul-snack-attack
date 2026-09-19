"""Start the project-only Blender studio and its MCP add-on in a GUI process.

The launcher supplies an isolated Blender preferences directory. Nothing is
installed into the user's normal Blender profile. This is not a -b script:
the upstream add-on executes commands through Blender's GUI event loop.
"""
import importlib.util
import json
import os
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
STATE = ROOT / "_work" / "blender-mcp"
SCENE_FILE = ROOT / "_source-assets" / "world" / "hero-building" / "world-studio.blend"
ADDON = STATE / "venv" / "Lib" / "site-packages" / "blender_mcp" / "bundled" / "addon.py"


def create_studio():
    scene = bpy.context.scene
    scene.name = "Seoul Building Studio"
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for name in ("Architecture", "Shop", "Interior", "Street", "Props", "Reference", "Lighting", "Cameras"):
        scene.collection.children.link(bpy.data.collections.new(name))
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.18, 0.20, 0.24, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.4
    # These are framing aids for a provisional 12 x 10 m building, not an
    # approved footprint, lighting design, or substitute for in-game cameras.
    cameras = {
        "01 Corner": ((23, -29, 17), (0, 0, 6), 48),
        "02 Front": ((0, -31, 8), (0, 0, 7), 48),
        "03 Side": ((29, 0, 8), (0, 0, 7), 48),
        "04 Walking": ((9, -15, 1.72), (0, 0, 3.0), 30),
        "05 Truck": ((11, -22, 4.5), (0, 0, 4.5), 35),
        "06 Storefront": ((4, -12, 2.0), (0, -4.8, 2.0), 40),
    }
    for name, (position, target, lens) in cameras.items():
        data = bpy.data.cameras.new(name)
        data.lens = lens
        obj = bpy.data.objects.new(name, data)
        bpy.data.collections["Cameras"].objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = bpy.data.objects["01 Corner"]
    guide = bpy.data.objects.new("Building origin - metres", None)
    guide.empty_display_type = "PLAIN_AXES"
    guide.empty_display_size = 2
    bpy.data.collections["Reference"].objects.link(guide)
    light = bpy.data.lights.new("Neutral review sun", "SUN")
    light.energy = 2
    obj = bpy.data.objects.new(light.name, light)
    bpy.data.collections["Lighting"].objects.link(obj)
    obj.rotation_euler = (0.45, -0.4, -0.6)
    note = bpy.data.texts.new("START HERE")
    note.write("SEOUL BUILDING STUDIO\n\nRead WORLD-BUILDING-PILOT.md in the project root.\n"
               "This is an empty authoring workspace, not an approved design.\n"
               "Keep modeling changes in versioned recipes. Save named iterations.\n"
               "Final quality is reviewed in Three.js at walking and truck height.\n"
               "The six cameras are provisional framing aids.\n")
    SCENE_FILE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SCENE_FILE))


if SCENE_FILE.exists():
    bpy.ops.wm.open_mainfile(filepath=str(SCENE_FILE))
else:
    create_studio()

# Register the upstream UI without allowing its default-port autostart.
# A raw scene ID property is insufficient: RNA registration resets its value.
spec = importlib.util.spec_from_file_location("seoul_blender_mcp", ADDON)
addon = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = addon
spec.loader.exec_module(addon)
original_start = addon.BlenderMCPServer.start
addon.BlenderMCPServer.start = lambda self: None
try:
    addon.register()
finally:
    addon.BlenderMCPServer.start = original_start
bpy.context.scene.blendermcp_auto_start_server = False
prefs = bpy.context.preferences.addons.new()
prefs.module = spec.name
prefs.preferences.telemetry_consent = False
addon.sync_edit_capture_handlers()
for feature in ("polyhaven", "hyper3d", "sketchfab", "polypizza", "hunyuan3d"):
    setattr(bpy.context.scene, "blendermcp_use_" + feature, False)
port = int(os.environ.get("BLENDER_PORT", "9877"))
bpy.context.scene.blendermcp_port = port
server = addon.BlenderMCPServer(host="127.0.0.1", port=port)
bpy.types.blendermcp_server = server
server.start()
bpy.context.scene.blendermcp_server_running = server.running
if not server.running:
    raise RuntimeError("The project Blender MCP server did not start")
(STATE / "ready.json").write_text(json.dumps({
    "pid": os.getpid(), "root": str(ROOT), "port": port,
    "blender": bpy.app.version_string, "scene": str(SCENE_FILE),
    "addon_protocol": addon.ADDON_PROTOCOL_VERSION, "telemetry": False,
}, indent=2), encoding="utf-8")
print("SEOUL_BLENDER_MCP_READY", flush=True)

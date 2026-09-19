"""Run via MCP in a disposable scene; exercise the existing hippo asset."""
import bpy
from pathlib import Path
import sys

root = Path(PROJECT_ROOT)
sys.path.insert(0, str(root / "tools/blender"))
from lib import render_preview

previous_scene = bpy.context.window.scene
previous_objects = set(bpy.data.objects)
check_scene = bpy.data.scenes.new("MCP Render Check - disposable")
bpy.context.window.scene = check_scene
try:
    bpy.ops.import_scene.gltf(filepath=str(root / "public/assets/vehicles/dash-hippo.glb"))
    meshes = [o for o in check_scene.objects if o.type == "MESH"]
    assert meshes, "Existing hippo did not import"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.export_scene.gltf(
        filepath=str(root / "_work/blender-mcp/check/roundtrip.glb"),
        export_format="GLB", use_selection=True, export_cameras=False, export_lights=False,
    )
    render_preview(
        root / "tools/blender/previews/blender-mcp-connection.png",
        camera_loc=(0.40, -0.55, 0.32), look_at=(0, 0, 0.10),
        res=512, lens=48,
    )
    bpy.ops.wm.save_as_mainfile(
        filepath=str(root / "_work/blender-mcp/check/connection-check.blend"), copy=True,
    )
    print("ROUNDTRIP_OK")
finally:
    bpy.context.window.scene = previous_scene
    for obj in set(bpy.data.objects) - previous_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(check_scene)

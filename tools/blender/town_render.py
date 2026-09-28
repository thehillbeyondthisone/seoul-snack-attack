# Render 밤내 Bamnae's landform from the OBJ that tools/town-export.mjs writes.
#
# Not a recipe in catalog.mjs: those build a GLB asset the game ships, with a
# triangle budget and a size gate. This builds nothing — it imports geometry
# the game already generates and takes pictures of it, so the person deciding
# whether the valley is right can see the valley.
#
#   node tools/blender/town-render.mjs
#
# Sun, not the snack studio's three-point area rig. A 720 m subject under a
# 4 W key at 25 cm is a black rectangle.
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))


def parse():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    obj = None
    out = None
    i = 0
    while i < len(argv):
        if argv[i] == "--obj" and i + 1 < len(argv):
            obj = Path(argv[i + 1])
            i += 2
        elif argv[i] == "--out" and i + 1 < len(argv):
            out = Path(argv[i + 1])
            i += 2
        else:
            i += 1
    if not obj or not out:
        raise SystemExit("town_render requires --obj <town.obj> --out <dir>")
    return obj, out


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects,
                  bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for item in list(block):
            block.remove(item)


def import_obj(path: Path):
    # Blender 4.x/5.x dropped the legacy importer's name; try both.
    try:
        bpy.ops.wm.obj_import(filepath=str(path), forward_axis="NEGATIVE_Y", up_axis="Z")
    except AttributeError:
        bpy.ops.import_scene.obj(filepath=str(path), axis_forward="-Y", axis_up="Z")
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def tune_materials():
    """The OBJ carries flat diffuse colours; give water some specular so it
    reads as water and leave everything else matte, because a glossy hillside
    hides its own shape."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if not bsdf:
            continue
        if mat.name.startswith("water"):
            for key in ("Roughness",):
                if key in bsdf.inputs:
                    bsdf.inputs[key].default_value = 0.08
            for key in ("Transmission Weight", "Transmission"):
                if key in bsdf.inputs:
                    bsdf.inputs[key].default_value = 0.35
                    break
        else:
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = 0.94
            if "Specular IOR Level" in bsdf.inputs:
                bsdf.inputs["Specular IOR Level"].default_value = 0.12
            elif "Specular" in bsdf.inputs:
                bsdf.inputs["Specular"].default_value = 0.12


def sky(strength=0.55):
    world = bpy.data.worlds.new("town_sky")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.30, 0.42, 0.58, 1.0)
        bg.inputs[1].default_value = strength
    bpy.context.scene.world = world


def sun(angle_deg=38.0, rotation_deg=-52.0, energy=4.2):
    """Low western sun. A high sun flattens a 100 m ridge into a green sheet;
    the whole point of these pictures is the shape, so the light has to rake."""
    data = bpy.data.lights.new("sun", "SUN")
    data.energy = energy
    data.angle = math.radians(1.5)
    data.color = (1.0, 0.94, 0.85)
    obj = bpy.data.objects.new("sun", data)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = (math.radians(90 - angle_deg), 0.0, math.radians(rotation_deg))
    return obj


def shot(out: Path, name, loc, look, lens=40, res=(1280, 800)):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new(f"cam_{name}")
    cam_data.lens = lens
    cam_data.clip_start = 0.5
    cam_data.clip_end = 6000
    cam = bpy.data.objects.new(f"cam_{name}", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except Exception as err:
        print("colour-management skip:", err)

    path = out / f"town-{name}.png"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"rendered {path}")
    return path


def main():
    obj_path, out_dir = parse()
    out_dir.mkdir(parents=True, exist_ok=True)
    reset()

    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    print("engine", scene.render.engine)

    meshes = import_obj(obj_path)
    print(f"imported {len(meshes)} objects")
    tune_materials()
    sky()
    sun()

    # Game (x, y, z) maps to Blender (x, z, y), so Blender's Y is the game's
    # Z and north is NEGATIVE Y. Getting that backwards put the "valley" camera
    # behind the mountain looking over it, and pointed "main street" at the
    # paddies.
    def cam(x, z, y):
        return (x, z, y)

    # From the south-west, so the mountain is the backdrop and not the subject.
    shot(out_dir, "valley", cam(-540, 500, 290), cam(-20, -70, 20), lens=34)
    # From behind the mountain, looking down the terraces into the town.
    shot(out_dir, "ridge", cam(60, -520, 330), cam(0, -30, 10), lens=38)
    # The enclosure test: stand on 중앙로 and look at the hillside.
    shot(out_dir, "main-street", cam(-10, -20, 4.6), cam(-20, -190, 44), lens=32)
    # Straight down over the whole world, margin included.
    shot(out_dir, "overhead", cam(0, -30, 900), cam(0, -30, 6), lens=26)


main()

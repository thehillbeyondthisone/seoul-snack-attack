# Shared headless helpers for Seoul Snack Attack Blender recipes.
# Import from a recipe after putting tools/blender on sys.path.
#
# Conventions (also in README.md):
#   metres, origin at ground-centre, +Z up in Blender / +Y up in the GLB
#   Principled BSDF only — the Khronos exporter drops mystery nodes
#   colour-bible hexes, never a fourth system colour
#   --factory-startup so a local add-on cannot change the mesh

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

# HUD + neon from src/world/data/color-bible.js — keep in step by hand.
# A fourth hue is allowed only as a local snack colour, never a system colour.
BIBLE = {
    "ink": 0xFFF2E0,
    "money": 0xFFD873,
    "nav": 0x3FD2E6,
    "alarm": 0xFF4D26,
    "panel": 0x120B08,
    "key": 0xD8A25E,
    "background": 0x0A0603,
    "orange": 0xFF9A3D,
    "lime": 0x5FD068,
    "warm_white": 0xFFEDD0,
    "magenta": 0xFF85B5,
    # POCHA local vehicle paint, sampled from the exterior atlas (sRGB).
    "pocha_orange": 0xE3A000,
    "pocha_green": 0x83B716,
    "pocha_trim": 0x3D3D3D,
}


def hex_rgba(hex_int, alpha=1.0):
    r = ((hex_int >> 16) & 0xFF) / 255.0
    g = ((hex_int >> 8) & 0xFF) / 255.0
    b = (hex_int & 0xFF) / 255.0
    return (r, g, b, alpha)


def parse_argv():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    out = None
    preview = None
    i = 0
    while i < len(argv):
        if argv[i] == "--out" and i + 1 < len(argv):
            out = argv[i + 1]
            i += 2
        elif argv[i] == "--preview" and i + 1 < len(argv):
            preview = argv[i + 1]
            i += 2
        else:
            i += 1
    if not out:
        raise SystemExit("recipe requires --out <path.glb> after blender's --")
    if not preview:
        raise SystemExit("recipe requires --preview <path.png> after blender's --")
    return Path(out), Path(preview)


def reset_scene():
    # Empty the startup file without reloading (keeps the built-in glTF exporter).
    if bpy.ops.object.mode_set.poll():
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for block in list(coll):
            coll.remove(block)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = 24


def _set_input(bsdf, names, value):
    for name in names:
        sock = bsdf.inputs.get(name)
        if sock is not None:
            sock.default_value = value
            return True
    return False


def principled(
    name,
    hex_int,
    roughness=0.5,
    metallic=0.0,
    specular=0.5,
    alpha=1.0,
    emission_hex=None,
    emission_strength=1.0,
    srgb=False,
):
    """Principled BSDF only — the Khronos exporter drops mystery nodes.

    `emission_hex` rides out as glTF `emissiveFactor` (plus
    KHR_materials_emissive_strength above 1.0). A night interior is lit by its
    own screens and lamps, so this is the difference between a readable cab and
    a black box; food recipes never pass it.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    color = hex_rgba(hex_int, 1.0)
    # Opt in for sampled sRGB paint. Preserve older recipes' authored values.
    if srgb:
        color = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
                      for c in color[:3]) + (1.0,)
    _set_input(bsdf, ("Base Color",), color)
    _set_input(bsdf, ("Roughness",), roughness)
    _set_input(bsdf, ("Metallic",), metallic)
    _set_input(bsdf, ("Specular IOR Level", "Specular"), specular)
    if emission_hex is not None:
        # 5.2 splits colour and strength; older builds carried one "Emission".
        _set_input(bsdf, ("Emission Color", "Emission"), hex_rgba(emission_hex, 1.0))
        _set_input(bsdf, ("Emission Strength",), emission_strength)
    if alpha < 1.0:
        _set_input(bsdf, ("Alpha",), alpha)
        mat.blend_method = "BLEND"
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def shade_smooth(obj, angle_deg=40.0):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
    except Exception:
        bpy.ops.object.shade_smooth()
    obj.select_set(False)


def _active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if bpy.ops.object.mode_set.poll():
        bpy.ops.object.mode_set(mode="OBJECT")


def cylinder(name, radius, depth, verts=20, location=(0, 0, 0), rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
        enter_editmode=False,
        align="WORLD",
    )
    obj = bpy.context.active_object
    obj.name = name
    shade_smooth(obj)
    return obj


def cube(name, size=1.0, location=(0, 0, 0), scale=None):
    bpy.ops.mesh.primitive_cube_add(
        size=size,
        location=location,
        enter_editmode=False,
        align="WORLD",
    )
    obj = bpy.context.active_object
    obj.name = name
    if scale is not None:
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    shade_smooth(obj, angle_deg=20.0)
    return obj


def cone(name, radius1, radius2, depth, verts=20, location=(0, 0, 0), fill="NGON"):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        end_fill_type=fill,
        location=location,
        enter_editmode=False,
        align="WORLD",
    )
    obj = bpy.context.active_object
    obj.name = name
    shade_smooth(obj)
    return obj


def uv_sphere(name, radius, segments=16, rings=8, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=radius,
        location=location,
        enter_editmode=False,
        align="WORLD",
    )
    obj = bpy.context.active_object
    obj.name = name
    shade_smooth(obj)
    return obj


def torus(name, major, minor, location=(0, 0, 0), major_seg=20, minor_seg=8):
    bpy.ops.mesh.primitive_torus_add(
        align="WORLD",
        location=location,
        major_radius=major,
        minor_radius=minor,
        major_segments=major_seg,
        minor_segments=minor_seg,
    )
    obj = bpy.context.active_object
    obj.name = name
    shade_smooth(obj)
    return obj


def apply_modifiers(obj):
    _active(obj)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def solidify(obj, thickness, offset=1.0):
    mod = obj.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = offset
    apply_modifiers(obj)


def join(name, objects):
    objects = [o for o in objects if o is not None]
    if not objects:
        raise RuntimeError(f"join {name}: no objects")
    if len(objects) == 1:
        objects[0].name = name
        return objects[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def origin_to_ground_center(obj):
    """World origin at the bbox centre in XZ and the bbox floor in Z (Blender Z-up)."""
    _active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    min_c = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    max_c = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    center = (min_c + max_c) * 0.5
    target = Vector((center.x, center.y, min_c.z))
    bpy.context.scene.cursor.location = target
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    obj.location = (0.0, 0.0, 0.0)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    obj.data.name = obj.name


def bake_transform(obj):
    """Push an object's location/rotation/scale into its vertices, leaving the
    origin at (0, 0, 0)."""
    _active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.name = obj.name


def ground_center_group(objects, keep_transform=()):
    """Ground-centre a SET of objects without joining them.

    `origin_to_ground_center` is for a snack: one object, one origin. An
    interior ships several nodes because some of them move — a steering wheel
    that cannot turn is a prop, not a cockpit.

    Objects named in `keep_transform` keep their own origin and rotation as a
    glTF node transform, so the runtime can drive them about the right axis
    (`wheel.rotateZ(...)` rather than some baked diagonal). Every other object
    is baked to world space with its origin at (0, 0, 0). The whole set is then
    shifted so its combined bbox is centred in XY with its floor on Z=0.
    """
    objects = [o for o in objects if o is not None]
    if not objects:
        raise RuntimeError("ground_center_group: no objects")
    keep = set(keep_transform)
    missing = keep - {o.name for o in objects}
    if missing:
        raise RuntimeError(f"ground_center_group: keep_transform names not in set: {sorted(missing)}")

    for obj in objects:
        if obj.name not in keep:
            bake_transform(obj)
    bpy.context.view_layer.update()

    corners = []
    for obj in objects:
        corners.extend(obj.matrix_world @ Vector(c) for c in obj.bound_box)
    min_c = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    max_c = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    delta = Vector((-(min_c.x + max_c.x) * 0.5, -(min_c.y + max_c.y) * 0.5, -min_c.z))

    for obj in objects:
        if obj.name in keep:
            # Node translation only — origin and rotation survive for the runtime.
            obj.location = obj.location + delta
            # The exporter names primitives from the mesh datablock, and join()
            # renames only the object: without this the wheel ships as "Torus".
            obj.data.name = obj.name
        else:
            _active(obj)
            obj.location = delta
            bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
            obj.data.name = obj.name
    bpy.context.view_layer.update()
    return delta


def export_glb(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        check_existing=False,
        export_format="GLB",
        export_copyright="Seoul Snack Attack — original procedural model",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_draco_mesh_compression_enable=False,
        use_selection=False,
        use_visible=True,
        use_renderable=True,
    )
    print(f"wrote {path} ({path.stat().st_size} bytes)")


def _pick_engine():
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = engine
            return engine
        except TypeError:
            continue
    return scene.render.engine


def render_preview(
    path: Path,
    look_at=(0.0, 0.0, 0.06),
    camera_loc=(0.22, -0.28, 0.18),
    lens=50,
    lights=None,
    world_strength=0.35,
    res=640,
    clip_start=0.01,
):
    """EEVEE still. Defaults are the 12 cm snack studio.

    `lights` replaces the three-point rig with `(name, loc, energy, size, hex)`
    tuples. A subject an order of magnitude larger than a snack needs its own
    rig — 4 W at 25 cm is a lit dumpling and an unlit cab — and a camera sitting
    *inside* its subject needs `clip_start` under the nearest surface.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    engine = _pick_engine()
    print(f"preview engine {engine}")

    cam_data = bpy.data.cameras.new("preview_cam")
    cam_data.lens = lens
    cam_data.clip_start = clip_start
    cam = bpy.data.objects.new("preview_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = camera_loc
    direction = Vector(look_at) - Vector(camera_loc)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    def add_light(name, loc, energy, size, hex_int):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.size = size
        data.color = hex_rgba(hex_int)[:3]
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        direction = Vector(look_at) - Vector(loc)
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        return obj

    # Energy is for a ~12 cm snack. A character-scale 40 W area light
    # blows bible hexes to white — that was pass 1's first lesson.
    for spec in lights or (
        ("key", (0.25, -0.20, 0.35), 4.0, 0.18, BIBLE["key"]),
        ("fill", (-0.22, -0.10, 0.18), 1.4, 0.28, BIBLE["warm_white"]),
        ("rim", (0.05, 0.30, 0.22), 2.2, 0.16, BIBLE["nav"]),
    ):
        add_light(*spec)

    world = bpy.data.worlds.new("preview_world")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = hex_rgba(BIBLE["background"])
        bg.inputs[1].default_value = world_strength
    scene.world = world

    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    # Standard, not AgX/Filmic: we want the bible hex back, not a graded still.
    try:
        scene.display_settings.display_device = "sRGB"
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        scene.view_settings.exposure = 0.0
        scene.view_settings.gamma = 1.0
    except Exception as err:
        print("colour-management skip:", err)
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print(f"preview {path}")

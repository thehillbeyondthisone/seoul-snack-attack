# Street hotteok — three stuffed pancakes in a paper tray.
# Caramelised top uses the bible's local hotteok orange; dough stays cream.
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import (  # noqa: E402
    BIBLE,
    assign,
    cylinder,
    export_glb,
    join,
    origin_to_ground_center,
    parse_argv,
    principled,
    render_preview,
    reset_scene,
    uv_sphere,
)


def pancake(index, x, y, z, yaw, dough, sugar, seed):
    # Flattened sphere reads as a stuffed pancake better than a cylinder.
    body = uv_sphere(f"hotteok_{index}", radius=0.038, segments=18, rings=10, location=(x, y, z))
    body.scale = (1.0, 1.0, 0.28)
    bpy_apply(body)
    assign(body, dough)

    top = cylinder(
        f"sugar_{index}",
        radius=0.032,
        depth=0.0035,
        verts=18,
        location=(x, y, z + 0.009),
        rotation=(0.04, 0.02, yaw),
    )
    assign(top, sugar)

    # One gold-brown drip of filling at the rim so it isn't a hockey puck.
    drip = uv_sphere(f"filling_{index}", radius=0.007, segments=10, rings=6, location=(x + 0.028, y + 0.006, z + 0.002))
    drip.scale = (1.3, 0.8, 0.45)
    bpy_apply(drip)
    assign(drip, seed)
    return [body, top, drip]


def bpy_apply(obj):
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def build():
    dough = principled("hotteok_dough", 0xE6C88A, roughness=0.62, specular=0.25)
    sugar = principled("hotteok_sugar", BIBLE["orange"], roughness=0.38, specular=0.45)
    filling = principled("hotteok_filling", 0xC47A28, roughness=0.42, specular=0.4)
    tray = principled("paper_tray", BIBLE["ink"], roughness=0.78, specular=0.15)
    grease = principled("tray_grease", 0xD9C39A, roughness=0.55, specular=0.3)

    plate = cylinder("tray", radius=0.072, depth=0.008, verts=24, location=(0, 0, 0.004))
    assign(plate, tray)
    well = cylinder("tray_well", radius=0.062, depth=0.002, verts=24, location=(0, 0, 0.0075))
    assign(well, grease)

    a = pancake(0, -0.018, 0.012, 0.022, 0.3, dough, sugar, filling)
    b = pancake(1, 0.020, 0.008, 0.030, -0.5, dough, sugar, filling)
    c = pancake(2, 0.000, -0.018, 0.038, 0.9, dough, sugar, filling)

    root = join("hotteok", [plate, well, *a, *b, *c])
    origin_to_ground_center(root)
    return root


def main():
    out, preview = parse_argv()
    reset_scene()
    build()
    export_glb(out)
    render_preview(preview, look_at=(0.0, 0.0, 0.04), camera_loc=(0.22, -0.24, 0.16))


if __name__ == "__main__":
    main()

# Soondae 모둠 — blood sausage on a steel plate, stuffing visible on the coins.
# Dark casing is the tell; do not make this another pink luncheon loaf.
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import (  # noqa: E402
    BIBLE,
    assign,
    cube,
    cylinder,
    export_glb,
    join,
    origin_to_ground_center,
    parse_argv,
    principled,
    render_preview,
    reset_scene,
)


def sausage(name, x, y, yaw, casing):
    # Lie on the plate: rotate X 90 so the cylinder runs along Y, then yaw.
    link = cylinder(
        name,
        radius=0.013,
        depth=0.072,
        verts=14,
        location=(x, y, 0.016),
        rotation=(math.pi / 2, 0.0, yaw),
    )
    assign(link, casing)
    return link


def coin(name, x, y, z, casing, stuffing):
    rind = cylinder(f"{name}_rind", radius=0.014, depth=0.008, verts=14, location=(x, y, z))
    assign(rind, casing)
    fill = cylinder(f"{name}_fill", radius=0.0085, depth=0.009, verts=10, location=(x, y, z + 0.001))
    assign(fill, stuffing)
    return [rind, fill]


def build():
    plate_mat = principled("platter_steel", 0x8A8478, roughness=0.32, metallic=0.55, specular=0.6)
    casing = principled("soondae_casing", 0x1A1210, roughness=0.48, specular=0.35)
    stuffing = principled("soondae_stuffing", 0xD4C4A4, roughness=0.55, specular=0.25)
    radish = principled("danmuji", 0xF0E08A, roughness=0.5, specular=0.2)
    leaf = principled("perilla", BIBLE["lime"], roughness=0.58, specular=0.2)

    plate = cylinder("platter", radius=0.078, depth=0.007, verts=24, location=(0, 0, 0.0035))
    assign(plate, plate_mat)

    links = [
        sausage("link_0", -0.022, 0.012, 0.35, casing),
        sausage("link_1", 0.018, 0.008, -0.55, casing),
        sausage("link_2", 0.002, -0.022, 1.15, casing),
    ]

    coins = []
    coins += coin("coin_0", -0.038, -0.028, 0.012, casing, stuffing)
    coins += coin("coin_1", 0.040, -0.018, 0.012, casing, stuffing)
    coins += coin("coin_2", 0.032, 0.032, 0.012, casing, stuffing)

    pickle = cube("danmuji", size=0.018, location=(-0.008, 0.042, 0.014), scale=(1.6, 0.55, 0.45))
    assign(pickle, radish)

    perilla = cube("perilla", size=0.028, location=(0.048, 0.008, 0.011), scale=(1.1, 0.7, 0.12))
    assign(perilla, leaf)

    root = join("soondae_platter", [plate, *links, *coins, pickle, perilla])
    origin_to_ground_center(root)
    return root


def main():
    out, preview = parse_argv()
    reset_scene()
    build()
    export_glb(out)
    render_preview(preview, look_at=(0.0, 0.0, 0.03), camera_loc=(0.20, -0.24, 0.16))


if __name__ == "__main__":
    main()

# Tteokbokki in a street-stall paper cup.
# Real-ish size (~11 cm tall). Runtime food-display still normalises largest
# dimension to 1 m, so silhouette matters more than millimetres.
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import (  # noqa: E402
    BIBLE,
    assign,
    cone,
    cylinder,
    export_glb,
    join,
    origin_to_ground_center,
    parse_argv,
    principled,
    render_preview,
    reset_scene,
    solidify,
    torus,
)

rng = random.Random(18)


def build():
    paper = principled("cup_paper", BIBLE["ink"], roughness=0.72, specular=0.2)
    rim_mat = principled("cup_rim", 0xE8D4B8, roughness=0.55, specular=0.25)
    sauce = principled("gochujang_sauce", BIBLE["alarm"], roughness=0.28, specular=0.7)
    tteok = principled("rice_cake", 0xF3E6C8, roughness=0.45, specular=0.35)
    fish = principled("eomuk", BIBLE["orange"], roughness=0.5, specular=0.3)
    onion = principled("scallion", BIBLE["lime"], roughness=0.55, specular=0.25)

    # Open shell (no caps) so the sauce is the floor you see looking in —
    # pass 1's filled cone exported a paper lid over the gochujang.
    cup = cone("cup_body", radius1=0.034, radius2=0.048, depth=0.095, verts=24, location=(0, 0, 0.0475), fill="NOTHING")
    solidify(cup, thickness=0.0024, offset=1.0)
    assign(cup, paper)

    bottom = cylinder("cup_bottom", radius=0.033, depth=0.003, verts=24, location=(0, 0, 0.0015))
    assign(bottom, paper)

    rim = torus("cup_rim", major=0.048, minor=0.0022, location=(0, 0, 0.095), major_seg=24, minor_seg=8)
    assign(rim, rim_mat)

    sauce_fill = cylinder("sauce", radius=0.043, depth=0.016, verts=24, location=(0, 0, 0.072))
    assign(sauce_fill, sauce)

    cakes = []
    for i in range(6):
        ang = (i / 6) * math.tau + rng.uniform(-0.08, 0.08)
        rad = 0.016 + (0.008 if i % 2 else 0.0)
        x = math.cos(ang) * rad
        y = math.sin(ang) * rad
        tilt = (rng.uniform(-0.22, 0.22), rng.uniform(-0.22, 0.22), rng.uniform(0, math.tau))
        stick = cylinder(
            f"tteok_{i}",
            radius=0.009,
            depth=0.042,
            verts=12,
            location=(x, y, 0.090),
            rotation=tilt,
        )
        assign(stick, tteok)
        cakes.append(stick)

    cakes_join = join("tteok", cakes)

    fish_cake = cylinder(
        "eomuk_slice",
        radius=0.016,
        depth=0.004,
        verts=12,
        location=(0.012, -0.01, 0.090),
        rotation=(0.9, 0.15, 0.4),
    )
    assign(fish_cake, fish)

    onions = []
    for i in range(5):
        ang = rng.uniform(0, math.tau)
        rad = rng.uniform(0.008, 0.028)
        blade = cylinder(
            f"onion_{i}",
            radius=0.0016,
            depth=0.018,
            verts=6,
            location=(math.cos(ang) * rad, math.sin(ang) * rad, 0.095),
            rotation=(rng.uniform(0.4, 1.2), rng.uniform(-0.4, 0.4), ang),
        )
        assign(blade, onion)
        onions.append(blade)
    onion_join = join("scallion", onions)

    root = join("tteokbokki_cup", [cup, bottom, rim, sauce_fill, cakes_join, fish_cake, onion_join])
    origin_to_ground_center(root)
    return root


def main():
    out, preview = parse_argv()
    reset_scene()
    build()
    export_glb(out)
    render_preview(preview, look_at=(0.0, 0.0, 0.05), camera_loc=(0.16, -0.20, 0.18))


if __name__ == "__main__":
    main()

# Convenience-store banana milk — the round yellow bottle, not a gable carton.
# Body is bible money-gold so it reads as the HUD cash colour in the world.
from __future__ import annotations

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
    torus,
)


def build():
    body_mat = principled("banana_body", BIBLE["money"], roughness=0.38, specular=0.45)
    cap_mat = principled("banana_cap", BIBLE["orange"], roughness=0.42, specular=0.35)
    band_mat = principled("banana_band", BIBLE["magenta"], roughness=0.48, specular=0.3)
    neck_mat = principled("banana_neck", 0xF3E6C8, roughness=0.4, specular=0.35)

    # ~11 cm bottle. Slight taper so it isn't a can.
    body = cone("body", radius1=0.023, radius2=0.028, depth=0.082, verts=24, location=(0, 0, 0.041), fill="NGON")
    assign(body, body_mat)

    band = torus("band", major=0.0265, minor=0.0055, location=(0, 0, 0.048), major_seg=24, minor_seg=8)
    assign(band, band_mat)

    neck = cylinder("neck", radius=0.012, depth=0.016, verts=16, location=(0, 0, 0.090))
    assign(neck, neck_mat)

    cap = cylinder("cap", radius=0.0155, depth=0.012, verts=16, location=(0, 0, 0.103))
    assign(cap, cap_mat)

    root = join("banana_milk", [body, band, neck, cap])
    origin_to_ground_center(root)
    return root


def main():
    out, preview = parse_argv()
    reset_scene()
    build()
    export_glb(out)
    render_preview(preview, look_at=(0.0, 0.0, 0.055), camera_loc=(0.16, -0.20, 0.14))


if __name__ == "__main__":
    main()

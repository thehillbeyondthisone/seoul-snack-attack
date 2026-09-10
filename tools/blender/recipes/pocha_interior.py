# Pocha truck interior — the first-person cab the player sits in.
#
# WHY THIS IS NOT MODELLED INSIDE pocha.glb
# The shipped exterior is a normalised Quaternius sushi truck: meshopt-packed,
# asymmetric about its own centreline (hubs sit at +0.79 / -1.29), and its bbox
# is dominated by the roof sign and the awning. Carving a cockpit to match that
# mesh's window openings would bind us to a third-party silhouette we do not
# control. This is the ordinary game solution instead: a bespoke interior shell
# the camera lives inside, proportioned from the exterior's real numbers
# (2.95 m wheelbase, 2.09 m front track, 3.19 m over the awning) so it reads as
# the same vehicle from the driver's seat.
#
# AXES. Blender Z-up; the exporter writes Y-up, mapping Blender (x, y, z) to
# glTF (x, z, -y). The vehicle contract is +Z forward and +X left
# (pocha.json `leftAxis: "+x"`), so here:
#     +X = left / driver's side   -Y = forward / windscreen   +Z = up
# Korea drives on the right, so the wheel is on the left and the serving hatch
# faces the kerb on -X. That matches the reference frames.
#
# ORIGIN. `ground_center_group` centres the set in XY and puts the floor-pan
# underside on Z=0, so in the GLB: y=0 is the pan underside, the standing floor
# is 0.05 m up, and the driver's eye is at (+0.55, 1.24, -0.42) in glTF terms.
#
# NODES. Unlike a snack, this does not join to one object. `steering_wheel`,
# `needle_speed` and `needle_fuel` ship as their own nodes with their own
# pivots, because a cockpit whose instruments cannot move is a diorama.
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import (  # noqa: E402
    BIBLE,
    assign,
    bake_transform,
    cube,
    cylinder,
    export_glb,
    ground_center_group,
    join,
    parse_argv,
    principled,
    render_preview,
    reset_scene,
    torus,
    uv_sphere,
)

import bpy  # noqa: E402

# ---------------------------------------------------------------- dimensions
HALF_W = 1.05          # inner half-width; 2.10 m across, inside a 2.2 m body
FRONT = -1.75          # windscreen plane
REAR = 1.55            # rear bulkhead
CEIL = 1.90            # galley standing height
PAN = 0.05             # floor-pan thickness; the standing floor is z = PAN
SKIN = 0.05            # wall thickness
DRIVER_X = 0.55        # left seat centre
PASS_X = -0.55
EYE = (DRIVER_X, -0.42, 1.24)   # seated eye point, for the preview and the game

# Openings, as (u0, u1, v0, v1) in each wall's own plane.
WINDSCREEN = (-0.95, 0.95, 0.99, 1.72)
DOOR_WINDOW = (-1.50, -0.62, 1.02, 1.66)
SERVING_HATCH = (-0.10, 1.00, 0.98, 1.62)
REAR_WINDOW = (-0.45, 0.45, 1.15, 1.60)


def rect_cells(u0, u1, v0, v1, holes):
    """Slice a rectangle around its holes and return the solid cells.

    Booleans are the obvious way to punch a window and the wrong way to do it
    headless — they need manifold input and they renumber everything. Cutting
    the panel on the holes' own edges gives the same silhouette out of plain
    boxes, and every cell stays a clean six-sided primitive.
    """
    us = sorted({u0, u1} | {h[0] for h in holes} | {h[1] for h in holes})
    vs = sorted({v0, v1} | {h[2] for h in holes} | {h[3] for h in holes})
    us = [u for u in us if u0 - 1e-6 <= u <= u1 + 1e-6]
    vs = [v for v in vs if v0 - 1e-6 <= v <= v1 + 1e-6]
    cells = []
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            if us[i + 1] - us[i] < 1e-4 or vs[j + 1] - vs[j] < 1e-4:
                continue
            cu = (us[i] + us[i + 1]) * 0.5
            cv = (vs[j] + vs[j + 1]) * 0.5
            if any(h[0] < cu < h[1] and h[2] < cv < h[3] for h in holes):
                continue
            cells.append((us[i], us[i + 1], vs[j], vs[j + 1]))
    return cells


def box(name, x0, x1, y0, y1, z0, z1, mat):
    obj = cube(
        name,
        size=1.0,
        location=((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5),
        scale=(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)),
    )
    assign(obj, mat)
    return obj


def wall(name, axis, at, thick, u0, u1, v0, v1, holes, mat):
    """A panel in the X, Y or Z plane, minus its holes. (u, v) are the two
    in-plane axes in XYZ order, so a wall at X uses (y, z)."""
    parts = []
    for i, (a0, a1, b0, b1) in enumerate(rect_cells(u0, u1, v0, v1, holes)):
        tag = f"{name}_{i}"
        if axis == "x":
            parts.append(box(tag, at, at + thick, a0, a1, b0, b1, mat))
        elif axis == "y":
            parts.append(box(tag, a0, a1, at, at + thick, b0, b1, mat))
        else:
            parts.append(box(tag, a0, a1, b0, b1, at, at + thick, mat))
    return parts


# The dial stack, front to back: needle, face, bezel. Getting that order wrong
# is invisible in the file and total on screen — pass 1 put the face *behind* a
# solid bezel, so every dial rendered as a blank chrome disc with the needle
# sealed inside it. Each layer now sits proud of the one behind.
GAUGE_Y = -1.262          # bezel centre; its front cap lands at GAUGE_Y + 0.0175
FACE_Y = GAUGE_Y + 0.021  # face centre, 8 mm deep, so it stands out of the bezel
NEEDLE_Y = GAUGE_Y + 0.0275


def gauge(name, x, z, radius, face_mat, bezel_mat):
    """A dial facing the driver: cylinder axis along Y, hooded by the binnacle."""
    bezel = cylinder(
        f"{name}_bezel", radius=radius, depth=0.035, verts=16,
        location=(x, GAUGE_Y, z), rotation=(math.pi / 2, 0, 0),
    )
    assign(bezel, bezel_mat)
    face = cylinder(
        f"{name}_face", radius=radius * 0.86, depth=0.008, verts=16,
        location=(x, FACE_Y, z), rotation=(math.pi / 2, 0, 0),
    )
    assign(face, face_mat)
    return [bezel, face]


def needle(name, x, z, length, mat, angle_deg):
    """A separate node so the runtime can sweep it.

    Built pointing up from the origin and baked there first: a box() is centred
    on its own origin, and a needle that pivots about its middle pokes out the
    back of the dial. After baking, the origin is the root, the node's Y
    rotation is the reading, and the dial face is the XZ plane it sweeps in.
    """
    obj = box(name, -0.006, 0.006, -0.004, 0.004, 0.0, length, mat)
    bake_transform(obj)
    obj.rotation_euler = (0.0, math.radians(angle_deg), 0.0)
    obj.location = (x, NEEDLE_Y, z)
    return obj


def build():
    # ---- materials. Bible hexes for anything the HUD also speaks; local hues
    # for upholstery and steel, which the bible has no opinion about.
    shell = principled("cab_shell", 0xC0762F, roughness=0.62, specular=0.35)
    dash = principled("cab_dash", BIBLE["key"], roughness=0.58, specular=0.3)
    trim = principled("cab_trim", 0x2B2724, roughness=0.55, specular=0.3)
    rubber = principled("cab_rubber", 0x14120F, roughness=0.88, specular=0.2)
    seat_mat = principled("seat_fabric", 0x6E6659, roughness=0.88, specular=0.15)
    steel = principled("galley_steel", 0x9E9A90, roughness=0.34, metallic=0.40, specular=0.6)
    chrome = principled("cab_chrome", 0xBFC2C4, roughness=0.22, metallic=0.85, specular=0.7)
    face_mat = principled(
        "gauge_face", 0x22201D, roughness=0.42, specular=0.35,
        emission_hex=BIBLE["money"], emission_strength=0.35,
    )
    needle_mat = principled(
        "gauge_needle", BIBLE["alarm"], roughness=0.5,
        emission_hex=BIBLE["alarm"], emission_strength=1.0,
    )
    screen = principled(
        "dash_screen", 0x0B2B31, roughness=0.18,
        emission_hex=BIBLE["nav"], emission_strength=1.5,
    )
    dome = principled(
        "dome_lamp", BIBLE["warm_white"], roughness=0.4,
        emission_hex=BIBLE["warm_white"], emission_strength=1.3,
    )
    neon = principled(
        "galley_neon", BIBLE["magenta"], roughness=0.4,
        emission_hex=BIBLE["magenta"], emission_strength=1.2,
    )
    cooker_mat = principled("rice_cooker", 0xEFE9DF, roughness=0.35, specular=0.5)
    wood = principled("prep_board", 0xB58A52, roughness=0.72, specular=0.2)
    nori = principled("gimbap_nori", 0x1C231B, roughness=0.55, specular=0.25)
    rice_mat = principled("gimbap_rice", 0xF3EEE1, roughness=0.62, specular=0.2)
    jar_mats = [
        principled("spice_gochu", BIBLE["alarm"], roughness=0.4, specular=0.45),
        principled("spice_sesame", 0xE3CE9A, roughness=0.45, specular=0.4),
        principled("spice_doenjang", 0x8A6636, roughness=0.5, specular=0.35),
    ]
    loom_mats = [
        principled("loom_a", BIBLE["alarm"], roughness=0.6),
        principled("loom_b", BIBLE["money"], roughness=0.6),
        principled("loom_c", BIBLE["nav"], roughness=0.6),
        principled("loom_d", BIBLE["lime"], roughness=0.6),
    ]

    parts = []

    # ---- shell ------------------------------------------------------------
    parts.append(box("floor_pan", -HALF_W, HALF_W, FRONT, REAR, 0.0, PAN, trim))
    parts.append(box("ceiling", -HALF_W, HALF_W, FRONT + 0.05, REAR, CEIL, CEIL + SKIN, shell))
    # Left wall carries the driver's window; right wall carries the passenger
    # window and, further back, the serving hatch onto the kerb.
    parts += wall("wall_left", "x", HALF_W, SKIN, FRONT, REAR, 0.0, CEIL, [DOOR_WINDOW], shell)
    parts += wall(
        "wall_right", "x", -HALF_W - SKIN, SKIN, FRONT, REAR, 0.0, CEIL,
        [DOOR_WINDOW, SERVING_HATCH], shell,
    )
    parts += wall("wall_front", "y", FRONT - SKIN, SKIN, -HALF_W, HALF_W, 0.0, CEIL, [WINDSCREEN], shell)
    parts += wall("wall_rear", "y", REAR, SKIN, -HALF_W, HALF_W, 0.0, CEIL, [REAR_WINDOW], shell)

    # A-pillars and a header rail give the windscreen an edge to read against.
    for side, x in (("l", HALF_W - 0.06), ("r", -HALF_W)):
        parts.append(box(f"pillar_{side}", x, x + 0.06, FRONT - 0.05, FRONT + 0.07, 1.02, CEIL, trim))
    parts.append(box("header_rail", -HALF_W, HALF_W, FRONT - 0.02, FRONT + 0.10, 1.72, CEIL, trim))

    # ---- dashboard --------------------------------------------------------
    parts.append(box("dash_body", -HALF_W, HALF_W, -1.64, -1.30, 0.60, 0.95, dash))
    parts.append(box("dash_top", -HALF_W, HALF_W, -1.72, -1.28, 0.95, 0.99, dash))
    parts.append(box("dash_kick", -HALF_W, HALF_W, -1.72, -1.60, PAN, 0.60, trim))
    # Binnacle. This was a solid box on the first pass and it swallowed all
    # three dials whole — the lidded-cup lesson wearing a different hat. It is
    # a hood: roof, two cheeks and a back plate, open toward the driver.
    parts.append(box("binnacle_roof", 0.28, 0.88, -1.32, -1.17, 1.090, 1.135, trim))
    parts.append(box("binnacle_cheek_l", 0.82, 0.88, -1.32, -1.17, 0.88, 1.090, trim))
    parts.append(box("binnacle_cheek_r", 0.28, 0.34, -1.32, -1.17, 0.88, 1.090, trim))
    parts.append(box("binnacle_pod", 0.28, 0.88, -1.32, -1.28, 0.88, 1.090, dash))

    parts += gauge("gauge_speed", DRIVER_X + 0.03, 1.000, 0.076, face_mat, chrome)
    parts += gauge("gauge_fuel", DRIVER_X + 0.21, 0.980, 0.046, face_mat, chrome)
    parts += gauge("gauge_temp", DRIVER_X - 0.15, 0.980, 0.046, face_mat, chrome)
    # Temperature is never driven, so its needle joins the static mesh rather
    # than costing a node the runtime would only ever leave alone.
    parts.append(needle("needle_temp", DRIVER_X - 0.15, 0.980, 0.038, needle_mat, -22.0))

    # The centre screen is the truck's own little terminal — the 리셋 / 서비스 중
    # panel in the reference. Emissive cyan so it reads at night.
    parts.append(box("screen_bezel", -0.24, 0.06, -1.30, -1.24, 0.62, 0.90, trim))
    parts.append(box("screen_glass", -0.21, 0.03, -1.242, -1.232, 0.65, 0.87, screen))
    for i, z0 in enumerate((0.70, 0.745)):
        parts.append(box(f"screen_line_{i}", -0.18, -0.02, -1.233, -1.228, z0, z0 + 0.018, dash))

    for i, (x0, x1) in enumerate(((-0.62, -0.40), (0.10, 0.32))):
        parts.append(box(f"vent_{i}", x0, x1, -1.30, -1.26, 0.76, 0.90, trim))
    parts.append(box("glovebox", -HALF_W + 0.06, -0.30, -1.30, -1.265, 0.62, 0.86, dash))

    # ---- steering ---------------------------------------------------------
    column = cylinder(
        "steering_column", radius=0.030, depth=0.34, verts=12,
        location=(DRIVER_X, -1.15, 0.80), rotation=(math.radians(35), 0, 0),
    )
    assign(column, trim)
    parts.append(column)

    rim = torus("wheel_rim", major=0.185, minor=0.018, major_seg=20, minor_seg=8)
    assign(rim, rubber)
    hub = cylinder("wheel_hub", radius=0.052, depth=0.046, verts=14)
    assign(hub, trim)
    spokes = []
    for i, ang in enumerate((math.radians(200), math.radians(340), math.radians(90))):
        spoke = cube(
            f"wheel_spoke_{i}", size=1.0,
            location=(math.cos(ang) * 0.085, math.sin(ang) * 0.085, 0.0),
            scale=(0.175, 0.026, 0.016),
        )
        spoke.rotation_euler = (0.0, 0.0, ang)
        bpy.context.view_layer.objects.active = spoke
        spoke.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        spoke.select_set(False)
        assign(spoke, trim)
        spokes.append(spoke)
    wheel = join("steering_wheel", [rim, hub, *spokes])
    # Built flat at the origin, then laid back onto the column and carried to
    # the hub. 55 deg about X leaves the rim facing back and down at the driver.
    wheel.rotation_euler = (math.radians(55), 0.0, 0.0)
    # Parts were built centred on the origin, so after the join the object's
    # origin already IS the hub — the runtime spins this node about its local Z.
    wheel.location = (DRIVER_X, -1.00, 0.930)

    # ---- seats ------------------------------------------------------------
    for tag, x in (("driver", DRIVER_X), ("pass", PASS_X)):
        parts.append(box(f"seat_{tag}_base", x - 0.25, x + 0.25, -0.86, -0.36, 0.30, 0.45, seat_mat))
        parts.append(box(f"seat_{tag}_pedestal", x - 0.18, x + 0.18, -0.80, -0.42, PAN, 0.30, trim))
        parts.append(box(f"seat_{tag}_back", x - 0.25, x + 0.25, -0.36, -0.24, 0.42, 1.06, seat_mat))
        parts.append(box(f"seat_{tag}_head", x - 0.15, x + 0.15, -0.35, -0.25, 1.06, 1.24, seat_mat))

    # ---- controls on the floor -------------------------------------------
    lever = cylinder(
        "gear_lever", radius=0.017, depth=0.34, verts=10,
        location=(0.02, -0.72, 0.34), rotation=(math.radians(16), 0, 0),
    )
    assign(lever, chrome)
    parts.append(lever)
    knob = uv_sphere("gear_knob", radius=0.042, segments=12, rings=6, location=(0.02, -0.77, 0.50))
    assign(knob, trim)
    parts.append(knob)
    brake = cylinder(
        "handbrake", radius=0.014, depth=0.26, verts=8,
        location=(0.20, -0.62, 0.30), rotation=(math.radians(58), 0, 0),
    )
    assign(brake, chrome)
    parts.append(brake)
    for i, (x0, x1) in enumerate(((DRIVER_X - 0.16, DRIVER_X - 0.04), (DRIVER_X + 0.02, DRIVER_X + 0.14))):
        parts.append(box(f"pedal_{i}", x0, x1, -1.52, -1.40, PAN, PAN + 0.055, rubber))

    # ---- door cards, visors, mirror --------------------------------------
    for side, x0, x1 in (("l", HALF_W - 0.05, HALF_W), ("r", -HALF_W, -HALF_W + 0.05)):
        parts.append(box(f"door_card_{side}", x0, x1, -1.50, -0.62, 0.40, 1.02, dash))
        parts.append(box(f"armrest_{side}", x0 - 0.07 if side == "l" else x0, x1 if side == "l" else x1 + 0.07,
                         -1.20, -0.86, 0.72, 0.80, trim))
    for side, x0, x1 in (("l", 0.24, 0.92), ("r", -0.92, -0.24)):
        parts.append(box(f"visor_{side}", x0, x1, FRONT + 0.08, FRONT + 0.30, 1.66, 1.70, dash))
    parts.append(box("mirror", -0.12, 0.12, FRONT + 0.10, FRONT + 0.16, 1.60, 1.72, trim))

    # ---- lighting fixtures (geometry; the game lights it for real) --------
    parts.append(box("dome_housing", -0.28, 0.28, -0.92, -0.56, CEIL - 0.09, CEIL, trim))
    parts.append(box("dome_lens", -0.24, 0.24, -0.88, -0.60, CEIL - 0.10, CEIL - 0.085, dome))
    parts.append(box("neon_housing", -0.98, -0.30, 0.34, 1.06, CEIL - 0.08, CEIL, trim))
    parts.append(box("neon_tube", -0.94, -0.34, 0.38, 1.02, CEIL - 0.09, CEIL - 0.078, neon))

    # Wire loom along the ceiling seam — the reference's one piece of clutter
    # that says "this is a working van", for four cylinders.
    for i, mat in enumerate(loom_mats):
        run = cylinder(
            f"loom_{i}", radius=0.011, depth=1.30, verts=6,
            location=(HALF_W - 0.10 - i * 0.024, -0.55, CEIL - 0.055 - (i % 2) * 0.02),
            rotation=(math.pi / 2, 0, 0),
        )
        assign(run, mat)
        parts.append(run)

    # ---- galley -----------------------------------------------------------
    parts.append(box("counter_top", -HALF_W, -0.52, -0.05, 1.50, 0.86, 0.92, steel))
    parts.append(box("counter_front", -0.56, -0.52, -0.05, 1.50, PAN, 0.86, steel))
    parts.append(box("counter_kick", -HALF_W, -0.52, -0.05, 0.00, PAN, 0.86, trim))
    # Sink: a basin sunk below the counter line, with a lip you can see over.
    parts.append(box("sink_basin", -0.98, -0.62, 0.44, 0.80, 0.70, 0.87, steel))
    parts.append(box("sink_well", -0.95, -0.65, 0.47, 0.77, 0.70, 0.86, trim))
    tap = cylinder("sink_tap", radius=0.013, depth=0.22, verts=8, location=(-0.98, 0.84, 1.02))
    assign(tap, chrome)
    parts.append(tap)

    cooker_body = cylinder("cooker_body", radius=0.125, depth=0.20, verts=16, location=(-0.82, 0.06, 1.02))
    assign(cooker_body, cooker_mat)
    cooker_lid = cylinder("cooker_lid", radius=0.128, depth=0.045, verts=16, location=(-0.82, 0.06, 1.135))
    assign(cooker_lid, trim)
    parts += [cooker_body, cooker_lid]

    parts.append(box("prep_board", -1.00, -0.60, 1.02, 1.36, 0.92, 0.955, wood))
    for i in range(5):
        y = 1.07 + i * 0.06
        roll = cylinder(
            f"gimbap_{i}", radius=0.026, depth=0.085, verts=12,
            location=(-0.80, y, 0.981), rotation=(0, math.pi / 2, 0),
        )
        assign(roll, nori)
        parts.append(roll)
        core = cylinder(
            f"gimbap_rice_{i}", radius=0.015, depth=0.088, verts=10,
            location=(-0.80, y, 0.981), rotation=(0, math.pi / 2, 0),
        )
        assign(core, rice_mat)
        parts.append(core)

    # Spice shelf on the hatch wall, above the counter.
    parts.append(box("spice_shelf", -HALF_W, -0.84, 0.30, 1.30, 1.24, 1.28, wood))
    for i in range(6):
        jar = cylinder(
            f"spice_jar_{i}", radius=0.030, depth=0.105, verts=10,
            location=(-0.95, 0.40 + i * 0.15, 1.333),
        )
        assign(jar, jar_mats[i % len(jar_mats)])
        parts.append(jar)

    parts.append(box("overhead_cabinet", -HALF_W, -0.66, 0.10, 1.40, 1.64, CEIL - 0.06, shell))
    # The hatch counter the customer's food actually lands on.
    parts.append(box("hatch_ledge", -HALF_W - 0.16, -HALF_W, -0.10, 1.00, 0.92, 0.98, steel))

    needles = [
        needle("needle_speed", DRIVER_X + 0.03, 1.000, 0.064, needle_mat, -38.0),
        needle("needle_fuel", DRIVER_X + 0.21, 0.980, 0.038, needle_mat, 26.0),
    ]

    # Everything static collapses to one node before grounding; the three
    # movers stay separate and keep their own origins.
    static_root = join("pocha_interior", parts)
    movers = ["steering_wheel", "needle_speed", "needle_fuel"]
    return ground_center_group([static_root, wheel, *needles], keep_transform=movers)


def clear_studio():
    """render_preview builds a fresh camera and rig each call. Two views means
    calling it twice, so drop the first set or the second render is lit twice."""
    for name in ("preview_cam", "key", "fill", "rim"):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)


# A cab is ~20x a dumpling, but the answer is not a bigger key: pass 1 lit it
# from outside at 900 W and rendered a cream box with no orange left in it.
# A cabin is lit from inside, by the fixtures it carries — so these sit where
# the dome lamp and the neon tube actually are, with street spill through the
# windscreen doing the modelling. Energies are for a 2 m room, not a courtyard.
CABIN_LIGHTS = (
    ("key", (0.0, -0.74, 1.76), 13.0, 0.45, BIBLE["warm_white"]),   # dome lamp
    ("fill", (-0.64, 0.70, 1.76), 5.0, 0.60, BIBLE["magenta"]),     # galley neon
    ("rim", (0.30, -3.30, 1.55), 70.0, 2.2, BIBLE["nav"]),          # street spill
)


def city_backdrop():
    """Dim emissive walls standing in for the city outside.

    Created only after `export_glb`, so it is never part of the GLB. Its job is
    to prove the openings are openings: with a black world every window renders
    as a flat panel and the cab looks sealed.
    """
    glow = principled(
        "backdrop_city", 0x1A120B, roughness=1.0,
        emission_hex=0x6E4A24, emission_strength=0.55,
    )
    for name, loc, rot, size in (
        ("backdrop_front", (0.0, -11.0, 3.0), (math.pi / 2, 0, 0), (26.0, 1.0, 15.0)),
        ("backdrop_kerb", (-11.0, 1.0, 3.0), (0, math.pi / 2, 0), (1.0, 26.0, 15.0)),
        ("backdrop_rear", (0.0, 12.0, 3.0), (math.pi / 2, 0, 0), (26.0, 1.0, 15.0)),
        ("backdrop_road", (0.0, -6.0, -1.0), (0, 0, 0), (26.0, 26.0, 1.0)),
    ):
        panel = cube(name, size=1.0, location=loc, scale=size)
        panel.rotation_euler = rot
        assign(panel, glow)


def shifted(point, delta):
    """Camera points are written in the authoring frame; grounding moves the
    model under them, so carry them by the same delta."""
    return (point[0] + delta[0], point[1] + delta[1], point[2] + delta[2])


# Three angles, because "make the whole interior" is not answerable by one
# frame. The first is the deliverable — it is literally the player's view.
VIEWS = (
    ("", (DRIVER_X, EYE[1] + 0.06, EYE[2] + 0.02), (0.02, -2.60, 1.00), 18),
    ("-cabin", (0.80, 1.15, 1.62), (0.05, -1.20, 0.86), 17),
    ("-galley", (0.45, -0.55, 1.34), (-0.95, 0.75, 0.95), 22),
    ("-cluster", (0.62, -0.66, 1.22), (0.52, -1.32, 1.00), 38),
)


def main():
    out, preview = parse_argv()
    reset_scene()
    delta = build()
    export_glb(out)
    city_backdrop()

    for suffix, cam, look, lens in VIEWS:
        clear_studio()
        path = preview if not suffix else preview.with_name(f"{preview.stem}{suffix}{preview.suffix}")
        render_preview(
            path,
            look_at=shifted(look, delta),
            camera_loc=shifted(cam, delta),
            lens=lens,
            lights=[(n, shifted(loc, delta), e, sz, col) for n, loc, e, sz, col in CABIN_LIGHTS],
            world_strength=0.38,
            res=768,
            clip_start=0.02,
        )


if __name__ == "__main__":
    main()

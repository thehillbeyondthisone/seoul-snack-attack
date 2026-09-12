"""Strawberry-pink, yawning hippo dashboard souvenir. Metres, +Y rear, Z up.

The oversized open head is a separate casting with its origin at the spring.
Reference: the user's pink roadside hippo with white mouth and lower tusks.
"""
import sys
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import (BIBLE, reset_scene, principled, assign, uv_sphere, cylinder, cone,
                 torus, join, bake_transform, export_glb, render_preview, parse_argv)
import bpy
from mathutils import Vector, Matrix


def build_hippo():
    pink = principled('hippo_pink_enamel', BIBLE['magenta'], roughness=0.38, srgb=True)
    mouth = principled('hippo_ivory_mouth', 0xE7E6EF, roughness=0.48)
    tongue = principled('hippo_tongue', 0xD58DB7, roughness=0.52)
    dark = principled('hippo_black_eyes', 0x111420, roughness=0.18)
    nostril = principled('hippo_nostrils', 0x865286, roughness=0.5)
    tooth = principled('hippo_tusks', 0xFFF4E4, roughness=0.27)
    base = principled('hippo_base_green', BIBLE['pocha_green'], roughness=0.38, srgb=True)
    metal = principled('hippo_spring', 0xADA5A0, roughness=0.24, metallic=0.8)

    def ball(name, loc, scale, mat, parent=None):
        ob = uv_sphere(name, 1, segments=20, rings=12, location=loc)
        ob.scale = scale
        assign(ob, mat)
        if parent: ob.matrix_world = parent @ Matrix.LocRotScale(Vector(loc), None, Vector(scale))
        return ob

    body = []
    stand = cylinder('souvenir_plinth', .071, .009, verts=40, location=(0, .015, .0045))
    stand.scale.y = 1.52
    assign(stand, base)
    body.append(stand)
    body.append(ball('barrel_body', (0, .038, .064), (.043, .078, .043), pink))
    for x in [-.025, .025]:
        for y in [-.004, .084]:
            body.append(ball('stubby_leg', (x, y, .028), (.018, .021, .023), pink))
            body.append(ball('broad_foot', (x, y-.005, .017), (.020, .023, .009), pink))
            for toe in [-1,0,1]:
                body.append(ball('toe', (x+toe*.007, y-.023, .017), (.003, .004, .003), mouth))
    body.append(ball('tail', (0,.113,.071), (.006,.020,.005),pink))
    pivot = Vector((0,-.030,.076))
    # Visible wound-metal spring; the lower end is fixed to the torso.
    curve = bpy.data.curves.new('spring_coil', 'CURVE')
    curve.dimensions='3D'; curve.bevel_depth=.0013; curve.bevel_resolution=2
    spline=curve.splines.new('POLY'); spline.points.add(95)
    for i,p in enumerate(spline.points):
        a=i/95*math.tau*4
        p.co=(.011*math.cos(a), -.028+.011*math.sin(a), .067+i/95*.022, 1)
    ob=bpy.data.objects.new('spring',curve); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active=ob; ob.select_set(True)
    bpy.ops.object.convert(target='MESH'); ob.select_set(False); assign(ob,metal); body.append(ob)

    head=[]
    head.append(ball('neck', (0,-.032,.092), (.035,.033,.032),pink))
    head.append(ball('lower_jaw', (0,-.073,.084), (.041,.047,.017),pink))
    head.append(ball('lower_mouth', (0,-.077,.097), (.035,.039,.006),mouth))
    head.append(ball('tongue', (0,-.069,.100), (.027,.028,.004),tongue))
    head.append(ball('throat', (0,-.044,.115), (.028,.011,.022),mouth))
    # Upper muzzle pitches back 55 degrees: an actual empty gape between jaws.
    hinge=Matrix.Translation((0,-.038,.118)) @ Matrix.Rotation(math.radians(-55),4,'X')
    head.append(ball('upper_muzzle', (0,-.023,.004), (.037,.048,.022),pink,hinge))
    head.append(ball('broad_nose', (0,-.058,.004), (.041,.023,.022),pink,hinge))
    head.append(ball('palate', (0,-.032,-.015), (.032,.042,.006),mouth,hinge))
    for s in [-1,1]:
        head.append(ball('nostril', (s*.016,-.061,.024),(.006,.007,.003),nostril,hinge))
        head.append(ball('ear', (s*.032,-.017,.127),(.009,.006,.015),pink))
        head.append(ball('ear_inner', (s*.033,-.022,.128),(.005,.002,.009),tongue))
        head.append(ball('brow', (s*.032,-.037,.129),(.012,.014,.012),pink))
        head.append(ball('eye_white', (s*.039,-.043,.132),(.008,.008,.008),mouth))
        head.append(ball('eye_black', (s*.044,-.047,.134),(.005,.005,.005),dark))
        head.append(ball('eye_glint', (s*.046,-.051,.137),(.0017,.0017,.0017),tooth))
        tusk=cone('lower_tusk', .0055,.0012,.033,verts=14,location=(s*.025,-.099,.113))
        tusk.rotation_euler=(math.radians(12),s*-.13,0)
        assign(tusk,tooth); head.append(tusk)
    root=join('hippo_body',body); bake_transform(root)
    moving=join('hippo_head',head); bake_transform(moving)
    moving.data.transform(Matrix.Translation(-pivot)); moving.location=pivot
    moving.data.name='hippo_head'
    bpy.context.view_layer.update()
    return [root,moving]


def main():
    out,preview=parse_argv(); reset_scene(); build_hippo(); export_glb(out)
    render_preview(preview, camera_loc=(.30,-.38,.23),look_at=(0,-.005,.090),
                   lens=52,res=960,world_strength=.45,
                   lights=[('key',(.12,-.22,.35),1.4,.25,0xFFEBDD),
                           ('fill',(-.25,-.05,.18),.8,.22,0xC6E6FF),
                           ('rim',(.04,.20,.28),1.0,.20,0xFFD9F4)])

if __name__=='__main__': main()

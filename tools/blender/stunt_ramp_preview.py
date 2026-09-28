"""Render the code-authored plaza slab at its game dimensions for model review."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = roughness
    return mat

bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0.31))
ramp = bpy.context.object
ramp.name = 'stunt_plaza_ramp'
ramp.dimensions = (3.4, 4.2, 0.34)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
ramp.rotation_euler[0] = -0.14
ramp.data.materials.append(material('ramp orange', (0.69, 0.34, 0.09), 0.8))

bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.01))
bpy.context.object.data.materials.append(material('plaza paving', (0.17, 0.22, 0.26), 0.88))

world = bpy.context.scene.world
world.color = (0.12, 0.15, 0.2)
bpy.ops.object.light_add(type='AREA', location=(-3, -4, 7))
bpy.context.object.data.energy = 850
bpy.context.object.data.shape = 'DISK'
bpy.context.object.data.size = 6
bpy.ops.object.camera_add(location=(6.8, -8, 5.2))
camera = bpy.context.object
direction = Vector((0, 0, 0.25)) - camera.location
camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = camera
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x = 800
scene.render.resolution_y = 600
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(Path(__file__).parent / 'previews' / 'stunt-plaza-ramp.png')
bpy.ops.render.render(write_still=True)

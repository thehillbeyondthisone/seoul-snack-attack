"""Open the exported kit together in a new Blender scene, preserving the studio.

Run through the project MCP endpoint after rebuilding assets. This scene is a
visual comparison workspace; gameplay collision and lighting remain in Three.js.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[3]
# Older recipe checkpoints used an AO-only settings group. Blender 5.2's glTF
# importer expects these additional neutral extension sockets on the same group.
# Extend the interface without changing any existing material links or values.
settings = bpy.data.node_groups.get('glTF Material Output')
if settings:
    names = {item.name for item in settings.interface.items_tree}
    for name, value in [('Thickness',0),('Dispersion',0),('Iridescence Factor',0),
                        ('Iridescence Thickness Minimum',100)]:
        if name not in names:
            socket = settings.interface.new_socket(name, in_out='INPUT', socket_type='NodeSocketFloat')
            socket.default_value = value
scene = bpy.data.scenes.new('Snack Street - coherent kit')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.world = bpy.data.worlds.new('Kit review world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.32,.37,.46,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .7
order = [('service-workshop',9),('patchwork-pocha',12),('ochre-walkup',7),
         ('moon-hotteok',6),('cloud-dumpling',8),('blue-office',10)]
for side in (-1,1):
    x = -31
    for asset_id, width in (order if side < 0 else reversed(order)):
        before = set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(root / f'public/assets/world/{asset_id}.glb'))
        imported = set(scene.objects)-before
        parent = bpy.data.objects.new(f'{asset_id} / lot {side}', None)
        scene.collection.objects.link(parent)
        for obj in imported:
            if obj.parent not in imported:
                obj.parent = parent
            if obj.name.replace('_',' ').startswith('Street '):
                obj.hide_render = True
                obj.hide_set(True)
        parent.location = (x+width/2, -side*13.4, 0)
        parent.rotation_euler.z = 0 if side < 0 else math.pi
        x += width+1

def slab(name, location, scale, color):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj=bpy.context.object;obj.name=name;obj.scale=scale
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);obj.data.materials.append(mat)

slab('Shared road',(0,0,.025),(90,12,.05),(.16,.17,.18))
for y in (-7.2,7.2):
    slab('Shared pavement',(0,y,.15),(90,2.4,.25),(.38,.38,.34))
sun=bpy.data.lights.new('Kit daylight','SUN');sun.energy=2;sun.angle=.15
obj=bpy.data.objects.new(sun.name,sun);scene.collection.objects.link(obj)
obj.rotation_euler=(math.radians(25),math.radians(-30),math.radians(-25))
camera=bpy.data.cameras.new('Street comparison');obj=bpy.data.objects.new(camera.name,camera)
scene.collection.objects.link(obj);obj.location=(-58,-2,18)
obj.rotation_euler=(Vector((3,0,5))-obj.location).to_track_quat('-Z','Y').to_euler()
camera.lens=24;scene.camera=obj
scene.view_settings.view_transform='AgX'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(root/'_source-assets/world/hero-building/coherent-kit-studio.blend'))
print(f'Coherent kit ready: {len(scene.objects)} scene objects; original scenes preserved.')

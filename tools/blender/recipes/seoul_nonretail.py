"""Shared authoring for the first non-retail Seoul building-kit variants."""
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import patchwork_pocha as k

FRONT_PANELS, OPENINGS = [], []


def _panel(left, right, bottom, top, mat):
    FRONT_PANELS.append((left, right, bottom, top, mat))


def _emit_front():
    # Use the pilot's segmented masonry contract: no wall hidden behind glass.
    for left, right, bottom, top, mat in FRONT_PANELS:
        us = sorted({left, right} | {q for x,z,w,h in OPENINGS for q in (x-w/2,x+w/2) if left < q < right})
        zs = sorted({bottom, top} | {q for x,z,w,h in OPENINGS for q in (z-h/2,z+h/2) if bottom < q < top})
        for a,b in zip(us,us[1:]):
            for c,d in zip(zs,zs[1:]):
                x,z = (a+b)/2,(c+d)/2
                if any(abs(x-u)<w/2-.00001 and abs(z-v)<h/2-.00001 for u,v,w,h in OPENINGS):
                    continue
                k.box('Front masonry', (x,-4.87,z), (b-a,.26,d-c), mat, collision=True)


def _services(width, height, wall_mat):
    # Shared period/detail scale: coping, rainwater pipe, repaired render and
    # brackets. Keep them on the facade so the pavement remains clear.
    x = width/2-.38
    k.rod((x,-5.16,.5),(x,-5.16,height+.45),.065,'iron',segments=10)
    for z in k.np.arange(1.1,height,2.9):
        k.box('Pipe collar',(x,-5.17,float(z)),(.19,.20,.065),'iron')
    for y in (-4.9,4.9):
        k.box('Parapet coping',(0,y,height+.98),(width+.13,.44,.12),'stone')
    # Narrow irregular plaster repair along an end pier, outside the windows.
    for i in range(int(height/.38)):
        z=.45+i*.38
        w=.18+k.RNG.random()*.10
        k.box('Pier repair',(-width/2+.16,-5.013,z),(w,.025,.39),'plaster')
    k.box('Service cabinet',(-width/2+.65,-5.17,.91),(.42,.26,.65),'enamel','Props')
    for i in range(4):
        k.box('Cabinet vent',(-width/2+.65,-5.31,.77+i*.08),(.27,.012,.012),'iron','Props')
    # Roof-mounted condenser with a readable grille, shared with workshop use.
    k.box('Roof condenser',(width/2-1.1,2.9,height+.78),(1.4,.85,.72),'enamel','Props')
    for z in k.np.arange(height+.53,height+1.05,.09):
        k.box('Condenser grille',(width/2-1.1,2.46,float(z)),(1.19,.035,.025),'iron','Props')


def _street(width):
    k.box('Street', (0, 0, .025), (max(24, width + 16), 24, .05), 'asphalt', 'Street', True)
    k.box('Pavement', (0, 0, .15), (width + 1.6, 13.5, .25), 'stone', 'Street', True)
    for x in k.np.arange(-width / 2 - .7, width / 2 + .8, .55):
        k.box('Paver joint', (float(x), -5.9, .278), (.009, 1.7, .005), 'iron', 'Street')


def _shell(width, storeys, floor_h, wall_mat, roof='flat'):
    height = storeys * floor_h
    k.box('Floor', (0, 0, .30), (width, 10, .05), 'ivory', 'Architecture', True)
    for x in (-width / 2 + .13, width / 2 - .13):
        k.box('Party wall', (x, 0, height / 2 + .30), (.26, 9.48, height+.16), wall_mat, collision=True)
    k.box('Rear wall', (0, 4.87, height / 2 + .30), (width, .26, height+.16), wall_mat, collision=True)
    for i in range(1, storeys + 1):
        z = .38 + i * floor_h
        # Slab edges must not be coplanar with the outside of the party wall.
        # Keep the slab inside and give the outer belt a real projecting profile.
        k.box('Floor plate', (0, 0, z), (width-.52, 9.48, .16), 'plaster', collision=True)
        for y in (-5.03,5.03):
            k.box('Floor edge moulding', (0,y,z), (width+.14,.18,.16), 'plaster')
        for x in (-width/2-.025,width/2+.025):
            k.box('Floor edge return', (x,0,z), (.12,10.06,.16), 'plaster')
    if roof == 'flat':
        for x in (-width / 2 + .13, width / 2 - .13):
            k.box('Roof parapet', (x, 0, height + .66), (.26, 9.48, .56), wall_mat, collision=True)
        for y in (-4.87, 4.87):
            k.box('Roof parapet', (0, y, height + .66), (width, .26, .56), wall_mat, collision=True)
    return height


def _front_wall(width, bottom, top, mat):
    _panel(-width/2,width/2,bottom,top,mat)


def _entry_wall(width, door_x, door_w, top, mat):
    left = -width / 2
    right = width / 2
    a = door_x - door_w / 2
    b = door_x + door_w / 2
    if a > left:
        _panel(left,a,.60,top,mat)
    if right > b:
        _panel(b,right,.60,top,mat)
    _panel(a,b,2.75,top,mat)


def _window(x, z, w, h, frame, balcony=False, mullions=1):
    OPENINGS.append((x,z,w,h))
    k.window('front',x,z,w,h,balcony=balcony,frame=frame,mullions=mullions)


def _open_door(x, width, frame, label):
    k.box(label + ' vestibule back', (x, -2.95, 1.53), (width - .14, .12, 2.38), 'room-wall', 'Interiors')
    for xx in (x-width/2,x+width/2):
        k.box(label + ' vestibule side', (xx,-3.95,1.53),(.10,1.9,2.38),'plaster','Interiors')
    k.box(label + ' ceiling lamp',(x,-3.9,2.7),(.34,.24,.06),'bulb','Interiors')
    for xx in (x - width / 2, x + width / 2):
        k.box(label + ' jamb', (xx, -5.04, 1.56), (.10, .22, 2.56), frame, 'Architecture')
    k.box(label + ' lintel', (x, -5.04, 2.84), (width + .10, .22, .12), frame, 'Architecture')


def _finish(out, preview, asset_id, name, storeys, footprint, entry, cameras, uses):
    _emit_front()
    k.emit_meshes()
    k.bake_occlusion()
    k.finish(out, preview, asset_id=asset_id, metadata={
        'name': name,
        'storeys': storeys,
        'footprint': footprint,
        'cameras': cameras,
        'entry': {'center': [entry, .325, 5.0], 'clearWidth': 1.45, 'clearHeight': 2.55},
        'wallProbe': [-footprint[0] / 2 + .14, 1.5, 7],
        'uses': uses,
        'placement': {'frontNormal': [0, 0, 1], 'partyWalls': ['left', 'right'], 'groundY': .325},
    })


def build_walkup(out, preview):
    asset_id = 'ochre-walkup'
    k.TEX = k.ROOT / '_source-assets/world/hero-building/ochre-walkup-textures'
    k.TEXTURE_SCALE = .5
    k.AO_SIZE = 1024
    k.init_materials()
    k.surface('ochre-render', (181, 139, 79), 'plaster', .90, mottle=.006, relief=.00012)
    k.surface('sage-tile', (70, 103, 88), 'jade', .52)
    k.paint('navy-door', 0x29434c, .55, .08)
    width, floor_h, storeys = 7, 3.18, 4
    _street(width)
    height = _shell(width, storeys, floor_h, 'ochre-render')
    _services(width,height,'ochre-render')
    _entry_wall(width, -.95, 1.55, 3.50, 'sage-tile')
    _open_door(-.95, 1.55, 'navy-door', 'Apartment entry')
    # Ground floor is recognisably domestic: paired frosted windows, mailboxes,
    # a weather canopy and bicycle bay rather than merchandise glazing.
    for x in (1.05, 2.45):
        _window(x, 1.75, 1.02, 1.42, 'navy-door', mullions=0)
    k.box('Entry canopy', (-.95, -5.48, 3.00), (2.15, 1.05, .14), 'navy-door', 'Architecture')
    for row in range(3):
        for col in range(2):
            k.box('Mailbox', (-2.78 + col * .27, -5.12, 1.25 + row * .25), (.22, .06, .18), 'enamel', 'Props')
    for floor in range(1, storeys):
        bottom = .38 + floor * floor_h
        _front_wall(width, bottom, bottom + floor_h, 'ochre-render')
        z = bottom + 1.55
        for i, x in enumerate((-2.1, 1.35)):
            _window(x, z, 2.25 if i == 0 else 2.45, 1.72, 'navy-door', balcony=(floor + i) % 2 == 0)
    # Offset stair crown and laundry give a domestic roof silhouette.
    k.box('Stair crown', (-1.75, 1.65, height + 1.35), (2.45, 3.0, 2.0), 'sage-tile', collision=True)
    for x in (-2.8, 2.4):
        k.rod((x, -.8, height + .25), (x, -.8, height + 1.75), .035, 'iron')
    k.rod((-2.8, -.8, height + 1.62), (2.4, -.8, height + 1.62), .018, 'iron')
    for i in range(5):
        k.box('Roof laundry', (-2.2 + i * 1.05, -.8, height + 1.20), (.66, .025, .72), 'canvas' if i % 2 else 'jade-paint', 'Props')
    for x in (-2.7, 2.7):
        k.pot(x, -5.35, .28, .75)
    k.light((-.95, -5.55, 2.65), 80, 'entry')
    for x, z in ((-2.1, 5.1), (1.35, 8.3), (-2.1, 11.5)):
        k.light((x, -4.4, z), 48, 'upper')
    cameras = {
        'corner': {'position': [18, 14, 27], 'target': [0, 6.4, 0]},
        'front': {'position': [0, 7, 27], 'target': [0, 6.4, 0]},
        'side': {'position': [23, 10, -12], 'target': [0, 6, 0]},
        'walking': {'position': [6, 1.72, 12], 'target': [-.8, 2.0, 4.4]},
        'truck': {'position': [10, 4.5, 21], 'target': [0, 4.5, 1]},
        'storefront': {'position': [2, 2.2, 11], 'target': [-.5, 1.8, 4.2]},
    }
    _finish(out, preview, asset_id, 'Ochre Walk-up', storeys, [width, 10], -.95, cameras, ['apartments'])


def build_office(out, preview):
    asset_id = 'blue-office'
    k.TEX = k.ROOT / '_source-assets/world/hero-building/blue-office-textures'
    k.TEXTURE_SCALE = .5
    k.AO_SIZE = 1024
    k.init_materials()
    k.surface('blue-concrete', (91, 113, 126), 'plaster', .88, mottle=.006, relief=.00012)
    k.paint('bronze-frame', 0x9b7046, .42, .45)
    k.paint('navy-panel', 0x263a46, .46, .15)
    width, floor_h, storeys = 10, 3.05, 5
    _street(width)
    height = _shell(width, storeys, floor_h, 'blue-concrete')
    _services(width,height,'blue-concrete')
    _entry_wall(width, 0, 2.25, 3.55, 'navy-panel')
    _open_door(0, 2.25, 'bronze-frame', 'Office lobby')
    # Deep pilasters, a double-height vestibule and regular curtain-wall bands
    # make the use legible without retail canopies or projecting shop signs.
    for x in (-4.55, 4.55):
        k.box('Office pilaster', (x, -5.08, height / 2), (.22, .36, height - .35), 'blue-concrete', 'Architecture')
    for x in (-3.35, 3.35):
        _window(x, 1.78, 3.0, 1.55, 'bronze-frame', mullions=2)
    for floor in range(1, storeys):
        bottom = .38 + floor * floor_h
        _front_wall(width, bottom, bottom + floor_h, 'blue-concrete')
        z = bottom + 1.48
        for x in (-3.1, 0, 3.1):
            _window(x, z, 2.45, 1.66, 'bronze-frame', mullions=1)
        k.box('Office belt', (0, -5.22, bottom + .22), (9.25, .22, .20), 'navy-panel', 'Architecture')
    k.box('Lift overrun', (2.65, 1.45, height + 1.35), (3.6, 3.2, 2.0), 'navy-panel', collision=True)
    # Open rooftop frame is a commercial silhouette, not a food-shop sign.
    for x in (-3.1, 3.1):
        k.rod((x, 2.8, height + .25), (x, 2.8, height + 2.8), .055, 'bronze-frame')
    k.rod((-3.1, 2.8, height + 2.65), (3.1, 2.8, height + 2.65), .045, 'bronze-frame')
    k.box('Reception desk', (0, -.8, .88), (3.2, .75, 1.0), 'wood', 'Interiors', True)
    for x in (-1.5, 1.5):
        k.light((x, -3.2, 2.8), 90, 'lobby')
    for x, z in ((-3.25, 4.9), (0, 7.9), (3.25, 11.0), (0, 14.1)):
        k.light((x, -4.35, z), 45, 'upper')
    cameras = {
        'corner': {'position': [22, 17, 31], 'target': [0, 7.7, 0]},
        'front': {'position': [0, 9, 32], 'target': [0, 7.7, 0]},
        'side': {'position': [28, 12, -15], 'target': [0, 7, 0]},
        'walking': {'position': [7, 1.72, 13], 'target': [0, 2.2, 4.3]},
        'truck': {'position': [12, 4.5, 23], 'target': [0, 5.5, 1]},
        'storefront': {'position': [3, 2.3, 12], 'target': [0, 2.0, 4.0]},
    }
    _finish(out, preview, asset_id, 'Blue Ledger Offices', storeys, [width, 10], 0, cameras, ['offices', 'ground-floor lobby'])


def build_workshop(out, preview):
    asset_id = 'service-workshop'
    k.TEX = k.ROOT / '_source-assets/world/hero-building/service-workshop-textures'
    k.TEXTURE_SCALE = .5
    k.AO_SIZE = 1024
    k.init_materials()
    k.surface('charcoal-brick', (91, 75, 66), 'brick', .92)
    k.surface('cream-render', (205, 188, 151), 'plaster', .90, mottle=.006, relief=.00012)
    k.paint('mustard', 0xc08a2f, .62, .05)
    k.paint('shutter', 0x66716f, .48, .62)
    width, floor_h, storeys = 9, 3.35, 2
    _street(width)
    height = _shell(width, storeys, floor_h, 'charcoal-brick')
    _services(width,height,'charcoal-brick')
    _entry_wall(width, -3.35, 1.35, 3.60, 'cream-render')
    _open_door(-3.35, 1.35, 'mustard', 'Workshop entry')
    # A closed corrugated loading shutter occupies the broad bay. This is a
    # service building with a pedestrian entry, not another customer shopfront.
    k.box('Loading bay reveal', (.65, -5.01, 1.84), (6.05, .20, 2.82), 'iron', 'Architecture')
    k.box('Roller shutter', (.65, -5.15, 1.84), (5.72, .10, 2.58), 'shutter', 'Architecture', True)
    for z in k.np.arange(.68, 3.10, .16):
        k.box('Shutter rib', (.65, -5.22, float(z)), (5.72, .055, .035), 'mustard' if int(z * 10) % 11 == 0 else 'iron', 'Props')
    k.box('Loading bumper', (.65, -5.36, .48), (5.95, .50, .24), 'iron', 'Architecture')
    _front_wall(width, 3.73, height + .38, 'charcoal-brick')
    for x in (-2.75, 0, 2.75):
        _window(x, 5.12, 1.95, 1.22, 'mustard', mullions=2)
    # Asymmetric saw-tooth clerestory distinguishes the low industrial roof.
    for x0, x1, peak in ((-4.45, -1.5, 7.85), (-1.5, 1.5, 7.35), (1.5, 4.45, 7.85)):
        k.face([(x0, -5.0, peak), (x1, -5.0, height + .35), (x1, 5.0, height + .35), (x0, 5.0, peak)], 'shutter', 'Architecture')
        k.face([(x0,-5.0,height+.35),(x1,-5.0,height+.35),(x0,-5.0,peak)],'charcoal-brick')
    k.box('Workshop bench', (1.0, .4, .82), (5.0, .85, .9), 'wood', 'Interiors', True)
    for x in (-1.1, .2, 1.5, 2.8):
        k.rod((x, .2, 1.30), (x, .2, 1.62), .11, 'stainless', 'Interiors', 10)
    k.box('Security lamp hood', (-3.35, -5.48, 3.0), (.56, .80, .18), 'mustard', 'Props')
    k.light((-3.35, -5.42, 2.72), 85, 'entry')
    k.light((0, -4.35, 5.15), 55, 'upper')
    for x in (-3.8, 3.8):
        k.pot(x, -5.4, .28, .62)
    cameras = {
        'corner': {'position': [20, 11, 27], 'target': [0, 4.0, 0]},
        'front': {'position': [0, 5.5, 26], 'target': [0, 3.8, 0]},
        'side': {'position': [25, 8, -12], 'target': [0, 3.8, 0]},
        'walking': {'position': [7, 1.72, 12], 'target': [-2.7, 2.0, 4.3]},
        'truck': {'position': [11, 4.5, 21], 'target': [0, 3.5, 1]},
        'storefront': {'position': [3, 2.2, 11], 'target': [0, 1.8, 4.2]},
    }
    _finish(out, preview, asset_id, 'Eulji Service Workshop', storeys, [width, 10], -3.35, cameras, ['repair workshop', 'storage'])

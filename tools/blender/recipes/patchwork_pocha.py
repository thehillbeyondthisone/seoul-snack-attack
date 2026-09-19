"""Patchwork Pocha: original four-storey pilot, metres, Blender Z-up.

Rebuild with npm run blender -- patchwork-pocha. Texture maps are deterministic
surface functions sampled to PNG, with metre UVs and glTF Principled materials.
The selected concept is tools/art/hero-building/round-01/a-patchwork-pocha-v2.png.
"""
from pathlib import Path
import sys, math, json, random, struct, zlib, os
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/blender'))
from lib import reset_scene, principled, parse_argv

RNG = random.Random(73127)
PARTS, MATS, COLLS = {}, {}, {}
LIGHTS = []
COLLISION = []
COLLISION_MESHES = []
TEX = ROOT / '_source-assets/world/hero-building/patchwork-textures'
TEXTURE_SCALE = 1
AO_SIZE = 2048

def png(path, arr):
    arr = np.uint8(np.clip(arr, 0, 1) * 255)
    h, w = arr.shape[:2]
    def chunk(tag, data):
        return struct.pack('!I', len(data)) + tag + data + struct.pack('!I', zlib.crc32(tag + data) & 0xffffffff)
    raw = b''.join(b'\0' + row.tobytes() for row in arr[::-1])
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', w,h,8,2,0,0,0)) + chunk(b'IDAT',zlib.compress(raw,6)) + chunk(b'IEND',b''))

def surface(name, color, kind, rough=.75, metallic=0, size=2, mottle=.035, relief=.0012):
    n = int((1024 if kind in ('brick','jade','ivory') else 512) * TEXTURE_SCALE)
    rnd = np.random.default_rng(sum(map(ord,name)))
    yy, xx = np.mgrid[:n,:n] / n
    noise = rnd.random((n,n)) - .5
    broad = np.sin(xx*math.tau*3 + np.cos(yy*math.tau*2)) * np.sin(yy*math.tau*4)
    h = noise * .0006 + broad*.0003
    base = np.broadcast_to(np.array(color)/255, (n,n,3)).copy()
    variation = noise*.06 + broad*mottle
    r = rough + noise*.06 + broad*.03
    if kind in ('brick','jade','ivory'):
        nx, ny = (6,18) if kind == 'brick' else (10,10)
        row = np.floor(yy*ny).astype(int)
        off = (row%2)*.5 if kind == 'brick' else 0
        u, v = (xx*nx + off)%1, (yy*ny)%1
        edge = np.minimum(np.minimum(u,1-u)/nx, np.minimum(v,1-v)/ny)*size
        grout = edge < (.005 if kind=='brick' else .003)
        cell = np.floor(xx*nx+off).astype(int)%nx
        lookup = rnd.random((ny,nx))-.5
        variation += lookup[row,cell] * (.26 if kind=='brick' else .085)
        bevel = np.clip((edge-.004)/.006,0,1)
        h += bevel * (.008 if kind=='brick' else .003)
        base += variation[...,None]
        base[grout] = np.array([.43,.40,.34]) if kind=='brick' else [.40,.42,.36]
        r[grout] = .94
        if kind=='brick':
            chips = (noise > .485) & (edge < .018)
            base[chips] *= .72
    elif kind=='wood':
        grain=np.sin(xx*math.tau*75+np.sin(yy*math.tau*2)*2)
        base += (grain*.035+variation)[...,None]
        h += grain*.0008
    elif kind=='asphalt':
        base += (noise*.045 + broad*.004)[...,None]
        h = noise*.0003
        r = .76 + broad*.035 + noise*.08
    else:
        base += variation[...,None]
        h += broad*relief
    dx=(np.roll(h,-1,1)-np.roll(h,1,1))/(2*size/n)
    dy=(np.roll(h,-1,0)-np.roll(h,1,0))/(2*size/n)
    normal=np.stack((-dx,-dy,np.ones_like(h)),axis=-1)
    normal /= np.linalg.norm(normal,axis=-1,keepdims=True)
    rgb_path=TEX / f'{name}-color.png'; norm_path=TEX / f'{name}-normal.png'; orm_path=TEX / f'{name}-orm.png'
    png(rgb_path,base); png(norm_path,normal*.5+.5)
    png(orm_path,np.stack((np.ones_like(r),r,np.full_like(r,metallic)),axis=-1))
    mat=principled(name,0xffffff,roughness=1,metallic=1,srgb=True)
    nt=mat.node_tree; b=nt.nodes.get('Principled BSDF')
    def image_node(path, noncolor=False):
        im=bpy.data.images.load(str(path)); im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB'
        node=nt.nodes.new('ShaderNodeTexImage');node.image=im;node.extension='REPEAT';return node
    col=image_node(rgb_path); nt.links.new(col.outputs['Color'],b.inputs['Base Color'])
    nm=image_node(norm_path,True); normalnode=nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(nm.outputs['Color'],normalnode.inputs['Color']);nt.links.new(normalnode.outputs['Normal'],b.inputs['Normal'])
    orm=image_node(orm_path,True);sep=nt.nodes.new('ShaderNodeSeparateColor');nt.links.new(orm.outputs['Color'],sep.inputs[0])
    nt.links.new(sep.outputs['Green'],b.inputs['Roughness']);nt.links.new(sep.outputs['Blue'],b.inputs['Metallic'])
    mat['uv_metres']=size; MATS[name]=mat
    return name

def paint(name,hexval,rough=.6,metal=0,emit=None,power=0):
    mat=principled(name,hexval,roughness=rough,metallic=metal,srgb=True,emission_hex=emit,emission_strength=power)
    mat['uv_metres']=1;MATS[name]=mat;return name

def face(verts, mat, coll='Architecture', smooth=False, uv=None):
    key=(coll,mat); part=PARTS.setdefault(key, {'v':[],'f':[],'uv':[],'smooth':[]})
    start=len(part['v']); part['v'].extend(verts);part['f'].append(tuple(range(start,start+len(verts))))
    if uv is None:
        norm=(Vector(verts[1])-Vector(verts[0])).cross(Vector(verts[2])-Vector(verts[0]))
        axis=max(range(3),key=lambda i:abs(norm[i])); ij=(0,1) if axis==2 else (0,2) if axis==1 else (1,2)
        size=MATS[mat].get('uv_metres',1)
        uv=[(v[ij[0]]/size,v[ij[1]]/size) for v in verts]
    part['uv'].append(uv);part['smooth'].append(smooth)

def box(name,p,s,mat,coll='Architecture',collision=False):
    x,y,z=p;a,b,c=(q/2 for q in s)
    v=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),(x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for f in [(3,2,1,0),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]:face([v[i] for i in f],mat,coll)
    if collision:COLLISION.append({'name':name,'center':[x,z,-y],'size':[s[0],s[2],s[1]]})

def rod(a,b,r,mat,coll='Props',segments=12,r2=None):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized();tmp=Vector((0,0,1)) if abs(axis.z)<.9 else Vector((0,1,0))
    u=axis.cross(tmp).normalized();v=axis.cross(u).normalized();r2=r if r2 is None else r2
    ring1=[a+r*(u*math.cos(i*math.tau/segments)+v*math.sin(i*math.tau/segments)) for i in range(segments)]
    ring2=[b+r2*(u*math.cos(i*math.tau/segments)+v*math.sin(i*math.tau/segments)) for i in range(segments)]
    face([tuple(p) for p in reversed(ring1)],mat,coll);face([tuple(p) for p in ring2],mat,coll)
    for i in range(segments):
        j=(i+1)%segments;face([tuple(ring1[i]),tuple(ring1[j]),tuple(ring2[j]),tuple(ring2[i])],mat,coll,True)

def orb(p,s,mat,coll='Props',seg=16,rings=8):
    for j in range(rings):
        for i in range(seg):
            verts=[]
            for a,b in [(i,j),(i+1,j),(i+1,j+1),(i,j+1)]:
                t=a/seg*math.tau;f=-math.pi/2+b/rings*math.pi
                verts.append((p[0]+s[0]*math.cos(f)*math.cos(t),p[1]+s[1]*math.cos(f)*math.sin(t),p[2]+s[2]*math.sin(f)))
            face(verts,mat,coll,True)

def pot(x,y,z,scale=1):
    rod((x,y,z),(x,y,z+.38*scale),.16*scale,'terracotta',r2=.23*scale)
    rod((x,y,z+.35*scale),(x,y,z+.40*scale),.24*scale,'terracotta')
    rod((x,y,z+.398*scale),(x,y,z+.41*scale),.21*scale,'soil')
    for k in range(7):
        a=RNG.random()*math.tau;r=RNG.uniform(.15,.34)*scale;h=RNG.uniform(.6,1.1)*scale
        end=(x+math.cos(a)*r,y+math.sin(a)*r,z+h)
        rod((x,y,z+.4*scale),end,.009*scale,'leaf-dark',segments=5)
        orb(end,(.15*scale,.065*scale,.10*scale),'leaf' if k%2 else 'leaf-dark',seg=6,rings=4)

def text_label(body,p,size,mat,rotation=(math.pi/2,0,0),name='Sign lettering'):
    d=bpy.data.curves.new(name,'FONT');d.body=body;d.font=FONT;d.size=size;d.align_x='CENTER';d.align_y='CENTER';d.extrude=.008;d.bevel_depth=.003;d.bevel_resolution=1;d.resolution_u=4
    o=bpy.data.objects.new(name,d);COLLS['Signage'].objects.link(o);o.location=p;o.rotation_euler=rotation;d.materials.append(MATS[mat])
    return o

def light(p,power=140,role='shop',color=0xffc17b):
    LIGHTS.append({'position':[p[0],p[2],-p[1]],'intensity':power/12,'range':7,'color':color,'role':role})
    d=bpy.data.lights.new('Warm '+role,'POINT');d.energy=power;d.shadow_soft_size=.48;d.color=(1,.59,.27)
    o=bpy.data.objects.new(d.name,d);COLLS['Lighting'].objects.link(o);o.location=p

def window(side,u,z,w=2.2,h=1.75,balcony=False,idx=0,frame=None,mullions=1):
    # Local u spans a facade, local d points outward. Windows are openings in
    # segmented walls, with deep reveals and furnished room pockets behind.
    def xyz(a,d,b):
        return (a,-5-d,b) if side=='front' else (6+d,a,b) if side=='side' else (a,5+d,b) if side=='rear' else (-6-d,a,b)
    def bx(a,d,b,ww,dd,hh,m,coll='Windows'):
        ss=(ww,dd,hh) if side in ('front','rear') else (dd,ww,hh)
        box('Window part',xyz(a,d,b),ss,m,coll)
    frame=frame or ('wood' if idx%3 else 'jade-paint')
    for a in [u-w/2-.09,u+w/2+.09]:bx(a,.015,z,.16,.34,h+.28,'plaster')
    for b in [z-h/2-.10,z+h/2+.10]:bx(u,.04,b,w+.38,.4,.18,'plaster')
    for a in [u-w/2+.06,u+w/2-.06]+[u-w/2+w*i/(mullions+1) for i in range(1,mullions+1)]:bx(a,-.045,z,.065,.13,h,frame)
    for b in [z-h/2+.055,z+h/2-.055]:bx(u,-.045,b,w,.13,.075,frame)
    bx(u,-.07,z,w-.12,.018,h-.12,'glass','Glass')
    bx(u,.12,z-h/2-.14,w+.48,.55,.13,'stone')
    bx(u,-1.15,z,w+.16,.12,h+.1,'room-wall','Interiors')
    bx(u,-.64,z-h/2,w,.99,.06,'wood','Interiors')
    # Curtains, shelf and lit bulb have real depth behind the glass.
    for a in [u-w*.40,u+w*.40]:
        for k in range(4):bx(a+k*.042,-.20-abs(math.sin(k))*0.028,z,.044,.045,h-.08,'curtain','Interiors')
    bx(u,-.94,z-.33,w*.8,.3,.065,'wood','Interiors')
    for k in range(4):
        pp=xyz(u-.55+k*.32,-.89,z-.20)
        rod((pp[0],pp[1],pp[2]-.08),(pp[0],pp[1],pp[2]+.17),.065,'jar','Interiors',8)
    pp=xyz(u+.25,-.63,z+.55);orb(pp,(.12,.12,.15),'bulb','Interiors',10,6)
    if balcony:
        bx(u,.46,z-h/2-.24,w+.55,1.15,.18,'jade-paint')
        for a in np.linspace(u-w/2-.18,u+w/2+.18,11):
            rod(xyz(a,.98,z-h/2-.16),xyz(a,.98,z-.13),.022,'jade-paint','Windows',8)
        rod(xyz(u-w/2-.23,.98,z-.10),xyz(u+w/2+.23,.98,z-.10),.035,'jade-paint','Windows')
        for a in [u-w/2-.23,u+w/2+.23]:rod(xyz(a,.02,z-.10),xyz(a,.98,z-.10),.028,'jade-paint','Windows')
        for a in [u-w*.31,u+w*.31]:
            p=xyz(a,.60,z-h/2-.10);pot(*p,scale=.65)

def facade(side,extent,windows):
    # Partition only at opening edges, so the shell has real holes with no
    # hidden box behind the glazing. Every remaining rectangle is collision.
    us=sorted(set([-extent,extent]+[q for u,z,w,h in windows for q in (u-w/2,u+w/2)]))
    zs=sorted(set([3.7,13]+[q for u,z,w,h in windows for q in (z-h/2,z+h/2)]))
    for u0,u1 in zip(us,us[1:]):
        for z0,z1 in zip(zs,zs[1:]):
            um,zm=(u0+u1)/2,(z0+z1)/2
            if any(abs(um-u)<w/2-.0001 and abs(zm-z)<h/2-.0001 for u,z,w,h in windows):continue
            p=(um,-4.85,zm) if side=='front' else (5.85,um,zm) if side=='side' else (um,4.85,zm) if side=='rear' else (-5.85,um,zm)
            s=(u1-u0,.3,z1-z0) if side in ('front','rear') else (.3,u1-u0,z1-z0)
            box('Masonry '+side,p,s,'brick',collision=True)

def init_materials():
    global FONT
    reset_scene();TEX.mkdir(parents=True,exist_ok=True)
    for name in ['Architecture','Windows','Shop','Interiors','Props','Street','Signage','Glass','Lighting','Cameras']:
        coll=bpy.data.collections.new('Pocha / '+name);bpy.context.scene.collection.children.link(coll);COLLS[name]=coll
    FONT=bpy.data.fonts.load('C:/Windows/Fonts/malgunbd.ttf')
    surface('brick',(143,79,54),'brick',.86)
    surface('jade',(51,88,78),'jade',.33)
    surface('ivory',(214,196,153),'ivory',.46)
    surface('plaster',(192,179,150),'plaster',.89)
    surface('wood',(107,77,48),'wood',.6)
    surface('stone',(136,137,125),'concrete',.82)
    surface('asphalt',(56,59,60),'asphalt',.63,size=3)
    for args in [('jade-paint',0x48675a,.58,.12),('oxblood',0x853e35,.83,0),('canvas',0xd2b992,.92,0),('iron',0x343a37,.54,.75),('copper',0x80513b,.5,.7),('stainless',0xa7aaa2,.31,.86),('enamel',0xf0d9ac,.39,.1),('ink',0x6c2b21,.7,0),('orange',0xd95118,.30,.03),('terracotta',0x94583b,.88,0),('soil',0x382d24,1,0),('leaf',0x65804a,.88,0),('leaf-dark',0x354d33,.92,0),('jar',0x603828,.32,.1),('curtain',0xb6a384,1,0),('black',0x1d201b,.7,0)]:paint(*args)
    paint('room-wall',0x9a7851,.88,emit=0x5c361a,power=.17)
    paint('bulb',0xffd9a0,.25,emit=0xffad4e,power=2.2)
    paint('glass',0x9fae9c,.13,metal=.15)
    bs=MATS['glass'].node_tree.nodes.get('Principled BSDF');bs.inputs['Alpha'].default_value=.12
    MATS['glass'].surface_render_method='DITHERED';MATS['glass'].use_transparency_overlap=False

def build():
    init_materials()
    # Ground, open shop shell and upper floors.
    box('Road',(0,0,.025),(34,30,.05),'asphalt','Street',True)
    box('Sidewalk',(0,0,.15),(16,14,.25),'stone','Street',True)
    box('Shop floor',(0,0,.34),(12,10,.16),'ivory','Shop',True)
    box('Shop back',(0,4.85,1.98),(12,.3,3.3),'plaster','Shop',True)
    box('Shop left',(-5.85,0,1.98),(.3,10,3.3),'plaster','Shop',True)
    for z in [3.64,6.74,9.84,12.94]:box('Floor slab',(0,0,z),(12,10,.18),'plaster',collision=True)
    fw=[(u,z,w,1.8) for z in [5.16,8.26,11.36] for u,w in [(-2.8,3.8),(3.0,2.35)]]
    sw=[(u,z,2.25,1.8) for z in [5.16,8.26,11.36] for u in [-2.35,2.0]]
    rw=[(u,z,1.4,1.5) for z in [5.16,8.26,11.36] for u in [-3,2.3]]
    for side,extent,wins in [('front',6,fw),('side',5,sw),('rear',6,rw),('left',5,sw)]:
        facade(side,extent,wins)
        for i,(u,z,w,h) in enumerate(wins):window(side,u,z,w,h,balcony=(side=='front' and u<0 and z>6) or (side=='side' and u>0 and z>9),idx=i)
    # The first upper-level enclosed jade bay, supported under the projection.
    box('Bay base',(-2.8,-5.49,4.12),(4.4,1.1,.32),'jade-paint','Windows')
    box('Bay roof',(-2.8,-5.49,6.23),(4.5,1.2,.18),'jade-paint','Windows')
    for x in np.linspace(-4.85,-.75,6):box('Bay mullion',(x,-6.02,5.18),(.085,.12,1.98),'jade-paint','Windows')
    box('Bay glass',(-2.8,-5.99,5.18),(4.14,.02,1.94),'glass','Glass')
    for x in [-4.8,-.8]:
        box('Bay side',(x,-5.48,5.18),(.1,1.1,1.98),'jade-paint','Windows')
        rod((x,-5.95,4),(x,-5.03,3.68),.07,'iron','Windows')
    for x in [-4.2,-3.1,-1.8]:pot(x,-5.7,4.3,.6)
    # Patch repairs are local, beside openings, with chipped irregular edges.
    # One connected ragged repair, rather than a ladder of floating patches.
    patch_z=[4.0+i*.37 for i in range(25)]
    outer=[(5.70,-5.018,z) for z in patch_z]
    inner=[(4.84+RNG.uniform(-.16,.12),-5.018,z) for z in patch_z]
    for i in range(len(patch_z)-1):face([inner[i],outer[i],outer[i+1],inner[i+1]],'plaster')
    for z in [5.05,7.44,10.65,12.35]:
        box('Brick showing through repair',(5.17,-5.044,z),(.22,.028,.11),'brick')
    for z in [3.7,6.8,9.9,13.0]:
        box('Side lintel band',(6.02,0,z),(.10,10,.07),'stone')
    # Corrugated rain hoods on the mismatched upper front windows.
    for u,z,w in [(3,8.26,2.35),(3,11.36,2.35),(-2.8,11.36,3.8)]:
        for x in np.arange(u-w/2-.2,u+w/2+.2,.13):
            rod((float(x),-5.03,z+1.13),(float(x),-5.54,z+.97),.037,'jade-paint','Windows',6)
        for x in [u-w/2,u+w/2]:rod((x,-5.03,z+.72),(x,-5.48,z+.96),.022,'iron','Windows')
    # Short service conduit with physical clips joins the bay to the riser.
    for a,b in [((-5.3,-5.08,3.94),(-5.3,-5.08,7.1)),((-5.3,-5.08,7.1),(-5.1,-5.08,7.3)),((-5.1,-5.08,7.3),(-5.1,-5.08,12.9))]:rod(a,b,.028,'copper')
    for z in [4.5,6,8,9.5,11,12.5]:box('Conduit clip',(-5.25 if z<7 else -5.05,-5.10,z),(.15,.035,.035),'iron','Props')
    # Storefront openings, jade plinth, cream piers and wood frames.
    for x in [-5.85,-1.6,1.05,5.85]:
        box('Shop pier',(x,-4.94,1.99),(.30,.38,3.24),'ivory','Shop',True)
        box('Jade pier base',(x,-5.02,.84),(.34,.44,1.0),'jade','Shop')
    for lo,hi in [(-5.68,-1.76),(1.21,5.68)]:
        cx=(lo+hi)/2;w=hi-lo
        box('Shop plinth',(cx,-4.92,.76),(w,.24,.7),'jade','Shop',True)
        for z in [1.13,3.02]:box('Shop sill',(cx,-5.05,z),(w,.16,.08),'wood','Shop')
        for x in np.linspace(lo,hi,4):box('Shop mullion',(x,-5.05,2.07),(.065,.15,1.92),'wood','Shop')
        box('Shop glass',(cx,-5,2.07),(w,.018,1.81),'glass','Glass')
    # 2.35m open shop entrance; no glass or collision across the opening.
    box('Entrance header',(-.27,-4.99,3.1),(2.34,.25,.23),'wood','Shop',True)
    # A shallow threshold ramp gives the full player capsule continuous access.
    ramp=[(-1.43,-5.80,.278),(.89,-5.80,.278),(.89,-4.90,.424),(-1.43,-4.90,.424)]
    face(ramp,'stone','Shop')
    COLLISION_MESHES.append({'name':'Shop threshold ramp','positions':[[x,z,-y] for x,y,z in ramp],'indices':[0,1,2,0,2,3]})
    for x in [-1.57,1.04]:box('Door jamb',(x,-5.03,1.77),(.075,.18,2.65),'wood','Shop')
    # Side has a display window and separate upper-floor entrance.
    for y in [-4.86,-.8,1.75,4.84]:box('Side pier',(5.86,y,1.99),(.38,.32,3.24),'ivory','Shop',True)
    box('Side shop plinth',(5.95,-2.85,.76),(.26,3.75,.7),'jade','Shop',True)
    box('Side shop glass',(6,-2.85,2.07),(.018,3.75,1.81),'glass','Glass')
    for y in [-4.68,-3.4,-2.1,-.96]:box('Side mullion',(6.04,y,2.07),(.16,.065,1.92),'wood','Shop')
    box('Side shop top',(6,-2.85,3.08),(.2,3.8,.24),'wood','Shop')
    box('Stairwell wall',(5.85,2.45,1.99),(.3,4.7,3.3),'plaster','Shop',True)
    box('Upper entrance',(6.04,2.15,1.68),(.15,1.16,2.3),'jade-paint','Shop')
    box('Door glass',(6.13,2.15,2.02),(.016,.65,.96),'glass','Glass')
    rod((6.15,1.79,1.25),(6.15,1.79,1.52),.023,'stainless','Shop')
    for k in range(3):box('Upper entry step',(6.25+k*.23,2.15,.18+(3-k)*.1),(.48,1.55,(3-k)*.2),'stone','Shop',True)
    # Fabric strips follow a softly bowed profile; hanging scallops at the edge.
    for i in range(26):
        x0=-6+i*12/26;x1=x0+12/26;mat='oxblood' if i%2==0 else 'canvas'
        ys=[-5.14,-5.48,-5.91,-6.34,-6.68];zs=[3.72,3.66,3.51,3.32,3.19]
        for j in range(4):face([(x0,ys[j],zs[j]),(x0,ys[j+1],zs[j+1]),(x1,ys[j+1],zs[j+1]),(x1,ys[j],zs[j])],mat,'Shop')
        # Both faces ensure the fabric is visible from the doorway.
        for j in range(4):face([(x1,ys[j],zs[j]),(x1,ys[j+1],zs[j+1]),(x0,ys[j+1],zs[j+1]),(x0,ys[j],zs[j])],mat,'Shop')
        for j in range(5):
            a=x0+(x1-x0)*j/5;b=x0+(x1-x0)*(j+1)/5
            za=2.99-.055*math.sin(j/5*math.pi);zb=2.99-.055*math.sin((j+1)/5*math.pi)
            face([(a,-6.68,3.20),(a,-6.68,za),(b,-6.68,zb),(b,-6.68,3.20)],mat,'Shop')
    rod((-6,-6.65,3.19),(6,-6.65,3.19),.035,'iron','Shop')
    for x in [-5.7,0,5.7]:rod((x,-5.05,2.8),(x,-6.65,3.14),.032,'iron','Shop')
    # Large enamel fascia with actual extruded Hangul.
    box('Fascia frame',(1.2,-5.29,4.17),(5.05,.24,1.10),'copper','Signage')
    box('Fascia face',(1.2,-5.43,4.17),(4.88,.06,.94),'enamel','Signage')
    text_label('밤참 분식',(1.2,-5.48,4.18),.77,'ink')
    for x in [-1.06,3.45]:
        for z in [3.82,4.51]:orb((x,-5.49,z),(.025,.018,.025),'iron','Signage',8,4)
    # Side blade sign + menu board; letters are authored, not AI texture text.
    box('Menu frame',(1.85,-5.22,2.13),(.99,.12,1.4),'wood','Signage')
    box('Menu ivory',(1.85,-5.30,2.13),(.87,.02,1.28),'enamel','Signage')
    text_label('떡볶이',(1.85,-5.325,2.5),.25,'ink')
    text_label('따끈한 한 그릇',(1.85,-5.325,1.80),.112,'ink')
    for x in [1.65,1.85,2.05]:orb((x,-5.35,2.1),(.09,.018,.045),'orange','Signage',10,4)
    box('Side blade bracket',(6.35,-4.1,4.27),(.7,.09,.09),'iron','Signage')
    box('Side blade',(6.77,-4.1,3.92),(.16,.85,1.25),'enamel','Signage')
    text_label('분식',(6.865,-4.1,3.97),.31,'ink',rotation=(math.pi/2,0,math.pi/2))
    # Sleepy tteok on a fork, sturdy diagonal stem and four visible tines.
    rod((3.48,-5.28,4.62),(3.08,-5.57,5.36),.09,'stainless','Signage')
    box('Fork shoulder',(2.98,-5.58,5.30),(.86,.15,.18),'stainless','Signage')
    for x in [2.67,2.88,3.09,3.30]:rod((x,-5.57,5.30),(x-.14,-5.57,5.81),.055,'stainless','Signage')
    orb((2.71,-5.63,5.92),(1.07,.35,.40),'orange','Signage',28,12)
    # Curved sleepy eyelids and a small smile on the outward face.
    for cx in [2.30,2.92]:
        points=[(cx+(i-3)*.044,-5.967,5.97-.045*math.cos((i-3)/3*math.pi/2)) for i in range(7)]
        for a,b in zip(points,points[1:]):rod(a,b,.018,'black','Signage',6)
    for i in range(5):
        a=(2.60+i*.03,-5.983,5.83-.038*math.sin(i/5*math.pi));b=(2.63+i*.03,-5.983,5.83-.038*math.sin((i+1)/5*math.pi));rod(a,b,.012,'black','Signage',6)
    rod((3.55,-5.0,5.84),(3.30,-5.56,5.84),.045,'iron','Signage')
    # Interior: L counter, steel cooking line, stools, shelving, dishes.
    box('Kitchen divider',(0,1.42,1.36),(10.7,.17,2.0),'ivory','Interiors',True)
    box('Counter base',(-1,-2.2,.93),(7,.66,1.08),'jade-paint','Interiors',True)
    box('Counter top',(-1,-2.2,1.51),(7.2,.85,.12),'wood','Interiors')
    box('Kitchen steel bench',(-1,.5,1.02),(7.5,.85,1.2),'stainless','Interiors')
    for x in [-3.8,-2.3,-.8,.7,2.1]:
        rod((x,-3.20,.39),(x,-3.20,1.08),.06,'iron','Interiors')
        rod((x,-3.20,1.06),(x,-3.20,1.17),.27,'oxblood','Interiors',20)
        for a in [0,math.tau/3,math.tau*2/3]:rod((x,-3.20,.68),(x+.24*math.cos(a),-3.20+.24*math.sin(a),.43),.025,'iron','Interiors')
    for i,x in enumerate([-3.8,-2.5,-1.2,.1,1.4]):
        rod((x,.5,1.62),(x,.5,1.95),.25,'stainless','Interiors',20)
        rod((x,.5,1.96),(x,.5,2.0),.265,'stainless','Interiors',20)
        rod((x,.5,2.0),(x,.5,2.055),.05,'black','Interiors',10)
        for dx in [-.32,.32]:rod((x+dx-.08,.5,1.8),(x+dx+.08,.5,1.8),.035,'iron','Interiors')
    for z in [1.25,1.85,2.47]:
        box('Back shelf',(-1,1.2,z),(8,.4,.065),'wood','Interiors')
        for i in range(14):
            x=-4.6+i*.53
            rod((x,1.13,z+.035),(x,1.13,z+.24),.092,'jar' if i%3 else 'enamel','Interiors',10)
    for x in [-3.2,.0,2.7]:
        rod((x,-2.2,1.58),(x,-2.2,1.64),.20,'enamel','Interiors',18)
        for k in range(5):orb((x+RNG.uniform(-.12,.12),-2.2+RNG.uniform(-.10,.10),1.66),(.095,.036,.028),'orange','Interiors',8,4)
    box('Kitchen hood',(-1,.54,2.92),(7.7,1.15,.40),'stainless','Interiors')
    # Grouped lanterns and three shop pools; warm lamps are explicit metadata.
    for x in [-5.2,-3.5,-1.8,0,1.8,3.6,5.3]:
        rod((x,-6.2,3.23),(x,-6.2,2.94),.013,'iron','Shop')
        orb((x,-6.2,2.87),(.105,.105,.17),'bulb','Shop',12,8)
        for zz in [2.74,2.85,2.98]:rod((x,-6.2,zz-.008),(x,-6.2,zz+.008),.109,'canvas','Shop',12)
    for x in [-3.8,.2,3.8]:
        orb((x,-2.8,3.1),(.22,.22,.08),'iron','Interiors')
        orb((x,-2.8,3.02),(.13,.13,.09),'bulb','Interiors')
        light((x,-3.0,2.8),180)
    for x in [-.6,1.25,3.1]:
        rod((x,-5.15,4.78),(x,-5.66,4.87),.025,'iron','Signage')
        orb((x,-5.67,4.84),(.15,.15,.06),'iron','Signage')
        orb((x,-5.67,4.79),(.11,.11,.022),'bulb','Signage')
    light((1.2,-5.9,4.7),100,'fascia')
    for z in [5.4,8.5,11.6]:light((-.8,-3.6,z),95,'upper')
    # Rooftop parapet, coping, corrugated shed, water tank and service lines.
    for y in [-4.88,4.88]:
        box('Parapet',(0,y,13.3),(12,.25,.62),'brick',collision=True)
        box('Coping',(0,y,13.64),(12.16,.39,.13),'stone')
    for x in [-5.88,5.88]:
        box('Parapet',(x,0,13.3),(.25,10,.62),'brick',collision=True)
        box('Coping',(x,0,13.64),(.39,10.1,.13),'stone')
    box('Roof deck',(0,0,13.05),(11.5,9.5,.06),'stone')
    box('Utility shed',(-2.9,1.5,13.85),(3.3,2.6,1.6),'jade-paint')
    for x in np.arange(-4.7,-1.1,.14):
        box('Corrugated shed roof',(float(x),1.5,14.73),(.072,3.0,.055),'iron')
        box('Corrugated shed facade',(float(x),.17,13.85),(.028,.065,1.62),'iron')
    box('Shed door',(-2.4,.10,13.8),(.76,.08,1.35),'wood')
    rod((.2,1.5,13.1),(.2,1.5,14.82),.81,'jade-paint',segments=32)
    for z in [13.23,13.65,14.1,14.60,14.82]:rod((.2,1.5,z),( .2,1.5,z+.045),.835,'iron',segments=32)
    rod((.2,1.5,14.82),(.2,1.5,14.9),.84,'jade-paint',segments=32,r2=.45)
    for x,y in [(2,-2),(2.7,-2.1),(3.4,-2),(3,0)]:
        orb((x,y,13.44),(.25,.25,.35),'jar',seg=16,rings=10);rod((x,y,13.7),(x,y,13.74),.25,'jar')
    for x,y in [(-4,-3),(4,3),(3.5,-3.4)]:pot(x,y,13.08,.9)
    rod((4.4,2,13.1),(4.4,2,16.0),.025,'iron')
    rod((3.4,2,15.68),(5.2,2,15.68),.018,'iron')
    for x in [3.5,3.85,4.2,4.55,4.9]:rod((x,1.62,15.68),(x,2.38,15.68),.012,'iron',segments=6)
    # Copper downpipe, AC units with modeled fans/grilles and visible supports.
    rod((5.54,-5.15,.45),(5.54,-5.15,13.54),.067,'copper')
    for z in np.arange(1,13,1.5):rod((5.54,-5.15,z),(5.54,-5.15,z+.035),.09,'iron')
    for z in [4.55,7.65,10.75]:
        box('AC housing',(6.28,-.70,z),(.53,1.02,.69),'plaster','Props')
        rod((6.56,-.83,z),(6.59,-.83,z),.25,'iron',segments=24)
        for a in range(8):
            t=a*math.tau/8;rod((6.61,-.83,z),(6.61,-.83+.22*math.cos(t),z+.22*math.sin(t)),.012,'stainless',segments=6)
        for yy in [-1.05,-.3]:rod((6.06,yy,z-.44),(6.48,yy,z-.44),.035,'iron')
        for k in range(7):box('AC vent',(6.569,-.35,z-.22+k*.063),(.013,.14,.018),'iron','Props')
    # Street kit with paving joints, drain, tactile paving, bollards and pots.
    for x in np.arange(-8,8,.65):box('Paver joint',(float(x),-6,.279),(.012,2,.006),'iron','Street')
    for y in [-5.6,-6.3,-6.94]:box('Paver joint',(0,y,.279),(16,.012,.006),'iron','Street')
    for y in np.arange(-7,7,.65):box('Side paver joint',(7,float(y),.279),(2,.012,.006),'iron','Street')
    for x in [6.7,7.3,7.97]:box('Side paver joint',(x,0,.279),(.012,14,.006),'iron','Street')
    for x in np.arange(-7.7,8,.7):box('Curb',(float(x),-7,.20),(.68,.23,.28),'stone','Street')
    for y in np.arange(-6.7,7,.7):box('Side curb',(8,float(y),.20),(.23,.68,.28),'stone','Street')
    for x,y in [(-6.8,-6.7),(4.8,-6.7),(7.65,-5.5),(7.65,4.8)]:
        rod((x,y,.28),(x,y,1.19),.077,'iron','Street');rod((x,y,.90),(x,y,1.00),.081,'enamel','Street')
    box('Drain surround',(6.4,-7.38,.061),(1.32,.38,.035),'iron','Street')
    for x in np.arange(5.82,7.01,.085):box('Drain bars',(float(x),-7.38,.085),(.025,.34,.025),'stainless','Street')
    for x in np.arange(-1.1,.5,.12):box('Tactile guidance',(float(x),-6.55,.297),(.042,.7,.025),'enamel','Street')
    for x,y,s in [(-5.5,-5.65,1),(-6.5,-5.4,.8),(5.4,-5.7,.75),(6.7,3.8,1.05),(6.5,4.8,.65)]:pot(x,y,.28,s)
    # Finished mesh groups give a bounded material draw count, not one draw
    # per brick, leaf, window or utensil. Recipes retain semantic functions.
    emit_meshes()

def emit_meshes():
    for (coll,mat),part in PARTS.items():
        mesh=bpy.data.meshes.new(coll+' '+mat);mesh.from_pydata(part['v'],[],part['f']);mesh.update()
        uv=mesh.uv_layers.new(name='UVMap')
        for poly,coords,smooth in zip(mesh.polygons,part['uv'],part['smooth']):
            poly.use_smooth=smooth
            for li,co in zip(poly.loop_indices,coords):uv.data[li].uv=co
        obj=bpy.data.objects.new(mesh.name,mesh);COLLS[coll].objects.link(obj);mesh.materials.append(MATS[mat])
        if coll in ('Architecture','Windows','Shop') and mat!='glass':
            mod=obj.modifiers.new('Small authored edge profiles','BEVEL');mod.width=.014;mod.segments=2;mod.limit_method='ANGLE'
            mod=obj.modifiers.new('Face normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=40
    for mat in MATS.values():mat.use_backface_culling=True
    MATS['glass'].use_backface_culling=False

def bake_occlusion():
    """One unique UV2 atlas supplies local contact shadows in Three.js.

    Keep UVMap (metre tiling) as the render UV, and explicitly bind the AO
    texture to the second set. The material output group is the glTF contract.
    """
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
    scene.cycles.use_denoising=False
    bpy.ops.object.select_all(action='DESELECT')
    objects=[o for o in scene.objects if o.type in ('MESH','FONT') and not any(m and m.name=='glass' for m in o.data.materials)]
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.convert(target='MESH')
    objects=list(bpy.context.selected_objects)
    for o in objects:
        if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
        o.data.uv_layers.new(name='OcclusionUV');o.data.uv_layers.active_index=1
        o.data.uv_layers['UVMap'].active_render=True
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    # The recipe batches faces directly. Weld their shared corners before
    # unwrapping, or a curved prop becomes hundreds of subpixel AO islands.
    bpy.ops.mesh.remove_doubles(threshold=.00001)
    bpy.ops.uv.smart_project(angle_limit=math.radians(70),island_margin=.001,area_weight=.3)
    bpy.ops.object.mode_set(mode='OBJECT')
    im=bpy.data.images.new('Building contact occlusion',width=AO_SIZE,height=AO_SIZE,alpha=False)
    im.colorspace_settings.name='Non-Color';im.generated_color=(1,1,1,1)
    touched=[]
    for mat in MATS.values():
        if mat.name=='glass':continue
        nt=mat.node_tree;out=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL');old=out.inputs['Surface'].links[0].from_socket
        uv=nt.nodes.new('ShaderNodeUVMap');uv.uv_map='OcclusionUV'
        image=nt.nodes.new('ShaderNodeTexImage');image.image=im;nt.links.new(uv.outputs[0],image.inputs['Vector']);nt.nodes.active=image
        ao=nt.nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.85;ao.samples=16
        emit=nt.nodes.new('ShaderNodeEmission');nt.links.new(ao.outputs['AO'],emit.inputs['Color']);nt.links.new(emit.outputs[0],out.inputs['Surface'])
        touched.append((mat,out,old,ao,emit,image))
    print('Baking unique contact occlusion atlas',flush=True)
    # White gutters remain neutral under minification instead of bleeding black.
    bpy.ops.object.bake(type='EMIT',margin=8,use_clear=False)
    im.filepath_raw=str(TEX/'patchwork-occlusion.png');im.file_format='PNG';im.save()
    output_group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    output_group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    for mat,out,old,ao,emit,image in touched:
        nt=mat.node_tree;nt.links.new(old,out.inputs['Surface']);nt.nodes.remove(ao);nt.nodes.remove(emit)
        group=nt.nodes.new('ShaderNodeGroup');group.node_tree=output_group;nt.links.new(image.outputs['Color'],group.inputs['Occlusion'])
    for o in objects:o.data.uv_layers.active_index=0;o.data.uv_layers['UVMap'].active_render=True


def finish(out,preview,asset_id='patchwork-pocha',metadata=None):
    scene=bpy.context.scene
    # Separate authoritative collision and light data use the runtime Y-up frame.
    payload={'id':'patchwork-pocha','storeys':4,'footprint':[12,10], 'lights':LIGHTS,'collision':COLLISION,'collisionMeshes':COLLISION_MESHES,
             'entry':{'center':[-.27,.42,5.0],'clearWidth':2.35,'clearHeight':2.56},
             'cameras':{'corner':{'position':[23,16,28],'target':[0,6.7,0]},'front':{'position':[0,8,32],'target':[0,7,0]},'side':{'position':[28,8,0],'target':[0,7,0]},'walking':{'position':[9,1.72,14],'target':[1,2.0,5]},'truck':{'position':[12,4.5,22],'target':[0,5,0]},'storefront':{'position':[4,2.3,12],'target':[0,1.8,3]}}}
    if metadata:payload.update(metadata)
    payload['id']=asset_id
    data_path=ROOT/f'public/assets/world/{asset_id}.json';data_path.parent.mkdir(parents=True,exist_ok=True);data_path.write_text(json.dumps(payload,indent=2),encoding='utf-8')
    out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_yup=True,export_lights=False,export_cameras=False,export_animations=False,export_extras=True,export_materials='EXPORT')
    # Preview is a real 3D render, separate from the selected concept.
    scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
    try:
        prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
        for d in prefs.devices:d.use=d.type=='OPTIX'
        scene.cycles.device='GPU'
    except Exception:pass
    # Useful when the interactive game or other art applications occupy VRAM.
    if os.environ.get('BLENDER_PREVIEW_DEVICE') == 'CPU':
        scene.cycles.device='CPU'
    world=scene.world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.29,.34,.46,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.65
    for name,p,energy,size,color in [('Dusk softbox',(-9,-13,20),2100,12,(1,.78,.56)),('Sky fill',(13,-1,16),1400,10,(.58,.72,1))]:
        d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color
        o=bpy.data.objects.new(name,d);COLLS['Lighting'].objects.link(o);o.location=p;o.rotation_euler=(Vector((0,0,6))-o.location).to_track_quat('-Z','Y').to_euler()
    for name,data in payload['cameras'].items():
        d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);COLLS['Cameras'].objects.link(o)
        x,y,z=data['position'];o.location=(x,-z,y);x,y,z=data['target'];o.rotation_euler=(Vector((x,-z,y))-o.location).to_track_quat('-Z','Y').to_euler();d.lens=45;d.clip_end=200
        if name=='corner':scene.camera=o
    scene.view_settings.view_transform='AgX';scene.render.resolution_x=1440;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(preview)
    preview.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
    bpy.ops.render.render(write_still=True)
    print(json.dumps({'out':str(out),'preview':str(preview),'lights':len(LIGHTS),'colliders':len(COLLISION),'groups':len(PARTS)}))

if __name__=='__main__':
    out,preview=parse_argv();build();bake_occlusion();finish(out,preview)

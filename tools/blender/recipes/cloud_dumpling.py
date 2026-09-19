"""Five-storey mixed-use infill: dumplings, repair studio and apartments."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import patchwork_pocha as k
from patchwork_pocha import box,rod,orb,face,pot,text_label,light
ID='cloud-dumpling'

def dumpling(x,y,z,s=1,coll='Props'):
    orb((x,y,z),(.33*s,.22*s,.22*s),'canvas',coll,16,8)
    for i in range(7):
        a=-.24+i*.08
        rod((x+a*s,y-.04*s,z+.15*s),(x+a*.8*s,y+.04*s,z+.22*s),.018*s,'enamel',coll,6)

def build():
    k.TEX=k.ROOT/'_source-assets/world/hero-building/cloud-dumpling-textures'
    k.TEXTURE_SCALE=.5;k.AO_SIZE=1024;k.init_materials()
    # Quiet painted upper storeys balance the brick base and neighbouring facades.
    k.paint('warm-plaster',0xc4baa0,.88)
    box('Review road',(0,0,.025),(26,26,.05),'asphalt','Street',True)
    box('Pavement',(0,0,.15),(9.6,13.5,.25),'stone','Street',True)
    box('Shop floor',(0,0,.30),(8,10,.05),'ivory','Shop',True)
    for x in [-3.87,3.87]:box('Party wall',(x,0,8.40),(.26,10,16.24),'warm-plaster',collision=True)
    box('Rear wall',(0,4.87,8.40),(8,.26,16.24),'brick',collision=True)
    for z in [3.58,6.78,9.98,13.18,16.38]:box('Floor plate',(0,0,z),(8,10,.16),'wood',collision=True)
    windows=[(-1.9,5.18,2.8,1.95),(1.9,5.18,2.4,1.95)]
    windows += [(x,z,2.05,1.8) for z in [8.38,11.58,14.78] for x in [-1.95,1.95]]
    us=sorted(set([-4,4]+[a for x,z,w,h in windows for a in [x-w/2,x+w/2]]))
    zs=sorted(set([3.68,6.78,9.98,13.18,16.50]+[a for x,z,w,h in windows for a in [z-h/2,z+h/2]]))
    for a,b in zip(us,us[1:]):
        for c,d in zip(zs,zs[1:]):
            x,z=(a+b)/2,(c+d)/2
            if any(abs(x-u)<w/2-.0001 and abs(z-v)<h/2-.0001 for u,v,w,h in windows):continue
            mat='brick' if z<6.78 or x>3.15 else 'warm-plaster'
            box('Front masonry',(x,-4.86,z),(b-a,.28,d-c),mat,collision=True)
    for i,(x,z,w,h) in enumerate(windows):k.window('front',x,z,w,h,balcony=i in [2,5],idx=i)
    for z in [6.79,9.99,13.19,16.50]:box('Front stringcourse',(0,-5.04,z),(8.1,.18,.14),'stone')
    # Two separate ground-floor bays; the left opening is the real shop entrance.
    for x in [-3.86,-1.15,3.86]:box('Shop pier',(x,-4.95,1.86),(.24,.34,3.15),'jade','Shop',True)
    box('Shop header',(0,-4.97,3.25),(8,.35,.5),'jade','Shop',True)
    box('Display plinth',(1.35,-4.93,.68),(4.75,.3,.70),'jade','Shop',True)
    box('Display glass',(1.35,-5.02,1.98),(4.70,.018,1.90),'glass','Glass')
    for x in [-1.02,1.35,3.72]:box('Display mullion',(x,-5.06,1.98),(.065,.14,1.94),'wood','Shop')
    box('Display sill',(1.35,-5.08,1.01),(4.9,.48,.12),'wood','Shop')
    for x in [-3.73,-1.28]:box('Entry frame',(x,-5.05,1.64),(.08,.14,2.60),'wood','Shop')
    box('Entry transom',(-2.5,-5.01,2.90),(2.36,.03,.22),'glass','Glass')
    ramp=[(-3.68,-5.65,.278),(-1.32,-5.65,.278),(-1.32,-4.84,.328),(-3.68,-4.84,.328)]
    face(ramp,'stone','Shop');k.COLLISION_MESHES.append({'name':'Entry ramp','positions':[[x,z,-y] for x,y,z in ramp],'indices':[0,1,2,0,2,3]})
    # Short oxblood canopy, scalloped valance and illuminated dimensional Hangul.
    face([(-4.10,-5.02,3.19),(-4.10,-6.10,2.91),(4.1,-6.10,2.91),(4.1,-5.02,3.19)],'oxblood','Shop')
    face([(4.1,-5.02,3.19),(4.1,-6.10,2.91),(-4.10,-6.10,2.91),(-4.10,-5.02,3.19)],'oxblood','Shop')
    for i in range(20):
        x=-4.10+i*.41;face([(x,-6.1,2.92),(x,-6.1,2.71),(x+.205,-6.1,2.66),(x+.41,-6.1,2.71),(x+.41,-6.1,2.92)],'oxblood','Shop')
    for x in [-3.8,0,3.8]:rod((x,-5.05,2.55),(x,-6.08,2.91),.03,'iron','Shop')
    box('Sign backing',(0,-5.21,3.55),(7.65,.20,.72),'wood','Signage')
    box('Sign enamel',(0,-5.325,3.55),(7.42,.04,.59),'enamel','Signage')
    text_label('구름 만두',(0,-5.36,3.55),.57,'ink')
    text_label('손수 빚는 만두',(2.55,-5.36,3.53),.18,'ink')
    box('Studio plaque',(-1.85,-5.19,6.53),(3.1,.12,.37),'jade-paint','Signage')
    text_label('구름 수선실',(-1.85,-5.28,6.53),.24,'enamel')
    # Side-hung original dumpling sign; front-facing folds read from the street.
    rod((3.45,-5.0,5.50),(3.45,-6.05,5.50),.044,'iron','Signage')
    dumpling(3.45,-6.08,5.18,1.75,'Signage')
    for x in [3.23,3.65]:orb((x,-6.445,5.17),(.023,.013,.027),'ink','Signage',8,4)
    # Shop interior: bamboo steamers, prep counter, shelves, stools and menu.
    box('Kitchen back',(0,.70,1.72),(7.6,.16,2.8),'ivory','Interiors',True)
    box('Prep base',(.6,-1.20,.76),(4.8,.9,.86),'jade-paint','Interiors',True)
    box('Prep surface',(.6,-1.20,1.23),(5,.98,.12),'stainless','Interiors')
    for x in [-1.15,.35,1.85]:
        for z in [1.39,1.62]:
            rod((x,-1.24,z-.09),(x,-1.24,z+.09),.43,'wood','Interiors',24)
            rod((x,-1.24,z+.09),(x,-1.24,z+.12),.455,'canvas','Interiors',24)
        for dx in [-.17,.17]:dumpling(x+dx,-1.24,1.87,.6,'Interiors')
    for z in [1.45,2.20,2.70]:
        box('Kitchen shelf',(.25,.43,z),(6.5,.42,.065),'wood','Interiors')
        for i in range(12):rod((-2.6+i*.50,.4,z+.04),(-2.6+i*.50,.4,z+.28),.09,'jar' if i%2 else 'enamel','Interiors',10)
    box('Front serving table',(1.45,-4.24,.82),(4.2,.62,.90),'wood','Interiors',True)
    for x in [.15,1.35,2.55]:
        rod((x,-4.23,1.28),(x,-4.23,1.46),.36,'wood','Interiors',24)
        dumpling(x,-4.23,1.58,.8,'Interiors')
    for y in [-2.6,-3.6]:
        rod((3.0,y,.34),(3.0,y,.86),.04,'iron','Interiors')
        rod((3.0,y,.87),(3.0,y,.98),.23,'oxblood','Interiors',16)
    box('Menu',(-1.45,-3.5,2.00),(.54,.08,.9),'wood','Signage')
    text_label('찐만두',(-1.45,-3.55,2.20),.14,'enamel')
    text_label('군만두',(-1.45,-3.55,1.93),.14,'enamel')
    for x in [-2.2,.2,2.4]:
        orb((x,-3.1,3.05),(.14,.14,.09),'iron','Interiors')
        orb((x,-3.1,3.0),(.08,.08,.06),'bulb','Interiors')
    light((-1.7,-3.1,2.8),125);light((2.0,-3.1,2.8),145)
    light((0,-5.85,3.95),75,'fascia')
    for x,z in [(-1.8,5.4),(1.8,8.6),(-1.8,11.8),(1.8,15.0)]:light((x,-4.10,z),55,'upper')
    for x in [-2.6,2.6]:
        rod((x,-5.05,4.03),(x,-5.7,4.02),.025,'iron','Signage');orb((x,-5.7,3.99),(.14,.12,.07),'iron','Signage')
    # Roof terrace and setback stair headhouse; giant steamer is a water-tank enclosure.
    for x in [-3.87,3.87]:box('Roof parapet',(x,0,16.78),(.26,10,.64),'brick',collision=True)
    for y in [-4.87,4.87]:box('Roof parapet',(0,y,16.78),(8,.26,.64),'brick',collision=True)
    box('Stair headhouse',(-1.90,2.50,17.37),(3.0,3.7,1.9),'plaster',collision=True)
    box('Headhouse cap',(-1.90,2.50,18.37),(3.30,4,.16),'jade-paint')
    box('Roof door',(-1.9,.61,17.2),(.94,.06,1.54),'jade-paint')
    for x in [.9,2.8]:
        for y in [1.7,3.6]:rod((x,y,16.5),(x,y,17.25),.065,'iron')
    for z in [17.35,17.75,18.15]:
        rod((1.85,2.65,z-.17),(1.85,2.65,z+.17),1.20,'wood',segments=32)
        rod((1.85,2.65,z+.16),(1.85,2.65,z+.20),1.24,'copper',segments=32)
    orb((1.85,2.65,18.35),(1.27,1.27,.24),'canvas',seg=32,rings=8)
    rod((1.85,2.65,18.55),(1.85,2.65,18.74),.12,'iron')
    for x in [-2.9,2.6]:rod((x,-1.8,16.5),(x,-1.8,18.02),.035,'iron')
    rod((-2.9,-1.8,17.93),(2.6,-1.8,17.93),.015,'iron')
    for i in range(6):
        x=-2.5+i*.8;box('Roof laundry',(x,-1.80,17.48),(.54,.025,.86),'canvas' if i%2 else 'jade-paint')
    for x in [-3.1,3.1]:pot(x,-3.1,16.5,.9)
    rod((3.63,-5.14,.4),(3.63,-5.14,16.9),.055,'copper')
    for z in [2,5,8,11,14,16]:rod((3.63,-5.14,z),(3.63,-5.14,z+.05),.071,'iron')
    box('Rear service door',(2.7,5.03,1.48),(1.1,.1,2.3),'jade-paint')
    for x in [-3.2,0,3.2]:box('Rear repair',(x,5.015,8.3),(1.0,.02,2.1),'plaster')
    for x in k.np.arange(-4.7,4.8,.55):box('Paver joint',(float(x),-5.9,.278),(.009,1.7,.005),'iron','Street')
    for y in [-5.45,-6.02,-6.58]:box('Paver joint',(0,y,.279),(9.6,.009,.005),'iron','Street')
    for x in k.np.arange(-4.5,4.8,.58):box('Kerb',(float(x),-6.75,.16),(.56,.18,.24),'stone','Street')
    box('Drain',(3.4,-7,.065),(1,.3,.025),'iron','Street')
    for x in k.np.arange(2.95,3.9,.085):box('Grate',(float(x),-7,.084),(.023,.28,.02),'stainless','Street')
    for x in [-4.25,4.25]:pot(x,-5.15,.28,.8)
    k.emit_meshes()

if __name__=='__main__':
    out,preview=k.parse_argv();build();k.bake_occlusion()
    cams={
      'corner':{'position':[23,18,34],'target':[0,9,0]},
      'front':{'position':[0,10,36],'target':[0,9,0]},
      'side':{'position':[30,15,-19],'target':[0,9,0]},
      'walking':{'position':[7,1.72,13],'target':[0,3,4.3]},
      'truck':{'position':[11,4.5,23],'target':[0,6,1]},
      'storefront':{'position':[3,2.3,13],'target':[0,2.0,3.6]}}
    k.finish(out,preview,asset_id=ID,metadata={'name':'Cloud Dumpling House','storeys':5,'footprint':[8,10],'cameras':cams,'entry':{'center':[-2.5,.325,5.0],'clearWidth':2.36,'clearHeight':2.55},'wallProbe':[-3.86,1.5,7],'uses':['dumpling shop','repair studio','apartments'],'placement':{'frontNormal':[0,0,1],'partyWalls':['left','right'],'groundY':.325}})

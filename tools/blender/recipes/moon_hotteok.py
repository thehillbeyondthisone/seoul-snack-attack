"""Narrow Moon Hotteok shop. Reuses the accepted Patchwork kit and export lane."""
import sys, math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import patchwork_pocha as k
from patchwork_pocha import box,rod,orb,face,pot,text_label,light

ID='moon-hotteok'

def build():
    k.TEX=k.ROOT/'_source-assets/world/hero-building/moon-hotteok-textures'
    k.TEXTURE_SCALE=.5;k.AO_SIZE=1024
    k.init_materials()
    for node in k.MATS['plaster'].node_tree.nodes:
        if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.08
    k.paint('toasted',0xbe8739,.7)
    # A narrow, three-storey infill frontage with blank party walls.
    box('Street',(0,0,.025),(24,24,.05),'asphalt','Street',True)
    box('Pavement',(0,0,.15),(7.6,13.5,.25),'stone','Street',True)
    box('Shop floor',(0,0,.30),(6,10,.05),'ivory','Shop',True)
    for x in [-2.87,2.87]:box('Party wall',(x,0,5.06),(.26,10,9.56),'plaster',collision=True)
    box('Rear wall',(0,4.87,5.06),(6,.26,9.56),'brick',collision=True)
    for z in [3.58,6.68,9.78]:box('Floor plate',(0,0,z),(6,10,.16),'wood',collision=True)
    # Genuine window openings partition the two front upper floors.
    openings=[(0,5.13,4.1,1.8),(-1.34,8.23,1.46,1.8),(1.34,8.23,1.46,1.8)]
    us=sorted(set([-3,3]+[a for u,z,w,h in openings for a in [u-w/2,u+w/2]]))
    zs=sorted(set([3.68,9.86]+[a for u,z,w,h in openings for a in [z-h/2,z+h/2]]))
    for a,b in zip(us,us[1:]):
        for c,d in zip(zs,zs[1:]):
            u,z=(a+b)/2,(c+d)/2
            if any(abs(u-x)<w/2-.0001 and abs(z-y)<h/2-.0001 for x,y,w,h in openings):continue
            box('Front masonry',(u,-4.86,z),(b-a,.28,d-c),'brick',collision=True)
    for i,(u,z,w,h) in enumerate(openings):k.window('front',u,z,w,h,balcony=i==0,idx=i)
    # Top windows sit under a deep, green folded-metal roof, unlike Pocha's flat roof.
    for x0,x1 in [(-3.18,0),(0,3.18)]:
        za=10.04 if x0 else 10.76;zb=10.04 if x1 else 10.76
        face([(x0,-5.38,za),(x1,-5.38,zb),(x1,5.30,zb),(x0,5.30,za)],'jade-paint')
        for y in k.np.arange(-5.35,5.31,.20):rod((x0,float(y),za+.015),(x1,float(y),zb+.015),.019,'iron','Architecture',6)
    face([(-3,-4.86,9.85),(3,-4.86,9.85),(0,-4.86,10.69)],'brick')
    face([(3,4.88,9.85),(-3,4.88,9.85),(0,4.88,10.69)],'brick')
    # Original round pancake clock/sign under the gable.
    rod((0,-5.05,9.90),(0,-5.19,9.90),.40,'toasted','Signage',32)
    rod((0,-5.21,9.90),(0,-5.23,10.17),.018,'ink','Signage',6)
    rod((0,-5.21,9.90),(.18,-5.23,9.82),.018,'ink','Signage',6)
    # Left entry and right serving window. Slender ivory posts surround jade tiles.
    for x in [-2.86,-.53,2.86]:box('Shop pier',(x,-4.95,1.86),(.23,.32,3.15),'ivory','Shop',True)
    box('Serving plinth',(1.18,-4.93,.73),(3.18,.26,.80),'jade','Shop',True)
    box('Serving counter',(1.18,-5.20,1.17),(3.38,.7,.12),'wood','Shop')
    box('Shop header',(0,-4.94,3.30),(6,.32,.52),'jade-paint','Shop',True)
    for x in [-2.75,-.66]:box('Entry frame',(x,-5.04,1.71),(.075,.12,2.70),'wood','Shop')
    box('Entry transom',(-1.7,-5.01,2.89),(2.02,.06,.26),'glass','Glass')
    for x in [-.42,1.16,2.75]:box('Serving frame',(x,-5.03,2.08),(.055,.13,1.82),'wood','Shop')
    box('Serving glass',(1.16,-5.01,2.08),(3.1,.015,1.78),'glass','Glass')
    ramp=[(-2.74,-5.6,.278),(-.65,-5.6,.278),(-.65,-4.84,.328),(-2.74,-4.84,.328)]
    face(ramp,'stone','Shop');k.COLLISION_MESHES.append({'name':'Entry ramp','positions':[[x,z,-y] for x,y,z in ramp],'indices':[0,1,2,0,2,3]})
    # A lifting canopy over the serving hatch, held by diagonal struts.
    face([(-.55,-5.06,3.07),(-.55,-6.16,2.79),(2.95,-6.16,2.79),(2.95,-5.06,3.07)],'jade-paint','Shop')
    face([(-.55,-5.06,3.07),(2.95,-5.06,3.07),(2.95,-6.16,2.79),(-.55,-6.16,2.79)],'jade-paint','Shop')
    for x in [-.42,2.76]:rod((x,-5.05,2.27),(x,-6.08,2.79),.022,'copper','Shop')
    box('Canopy lip',(1.2,-6.15,2.74),(3.50,.09,.18),'canvas','Shop')
    # Main fascia and an oversized, sleepy pressed-pancake blade sign.
    box('Sign backing',(0,-6.10,3.48),(5.56,.19,.72),'wood','Signage')
    box('Enamel sign',(0,-6.22,3.48),(5.38,.045,.60),'enamel','Signage')
    text_label('달밤 호떡',(0,-6.26,3.48),.54,'ink')
    for x in [-2.50,2.50]:rod((x,-5.03,3.83),(x,-6.10,3.78),.038,'iron','Signage')
    rod((2.73,-5.0,4.60),(2.73,-6.04,4.60),.045,'iron','Signage')
    orb((2.73,-6.02,4.43),(.56,.14,.53),'toasted','Signage',24,12)
    for x in [2.51,2.92]:
        orb((x,-6.155,4.50),(.025,.012,.03),'ink','Signage',8,4)
    for i in range(8):
        a=math.pi+i/8*math.pi;b=math.pi+(i+1)/8*math.pi
        rod((2.73+.13*math.cos(a),-6.163,4.39+.07*math.sin(a)),(2.73+.13*math.cos(b),-6.163,4.39+.07*math.sin(b)),.012,'ink','Signage',6)
    for x,z in [(2.40,4.29),(2.85,4.14),(2.98,4.66)]:orb((x,-6.16,z),(.05,.008,.025),'wood','Signage',8,4)
    # Narrow open kitchen, griddle with pancakes, seating and product shelves.
    box('Kitchen back',(0,.85,1.73),(5.6,.15,2.8),'ivory','Interiors',True)
    box('Kitchen worktop',(.65,-1.25,1.20),(3.5,.95,.13),'stainless','Interiors')
    box('Kitchen base',(.65,-1.25,.74),(3.3,.8,.82),'jade-paint','Interiors',True)
    box('Griddle',(.75,-1.4,1.29),(1.7,.61,.06),'iron','Interiors')
    for x in [.17,.74,1.32]:
        for y in [-1.58,-1.20]:rod((x,y,1.32),(x,y,1.375),.15,'toasted','Interiors',16)
    for z in [1.3,1.95,2.57]:
        box('Kitchen shelf',(0,.58,z),(4.9,.40,.06),'wood','Interiors')
        for i in range(10):rod((-2.1+i*.46,.53,z+.03),(-2.1+i*.46,.53,z+.26),.085,'jar' if i%2 else 'enamel','Interiors',10)
    box('Dining counter',(2.34,-3.00,.91),(.5,2.55,1.15),'wood','Interiors',True)
    for y in [-2.2,-3.3,-4.2]:
        rod((1.60,y,.34),(1.60,y,.90),.044,'iron','Interiors')
        rod((1.60,y,.91),(1.60,y,1.01),.22,'oxblood','Interiors',16)
        for a in [0,2.094,4.188]:rod((1.60,y,.62),(1.60+.21*math.cos(a),y+.21*math.sin(a),.34),.025,'iron','Interiors',8)
    box('Menu board',(-.9,-4.7,2.1),(.57,.09,.94),'wood','Signage')
    text_label('꿀호떡',(-.9,-4.76,2.30),.16,'enamel')
    text_label('씨앗호떡',(-.9,-4.76,1.98),.13,'enamel')
    for x in [-1.8,.2,2.1]:
        orb((x,-3.20,3.01),(.16,.16,.10),'iron','Interiors')
        orb((x,-3.20,2.96),(.09,.09,.07),'bulb','Interiors')
    light((-.7,-3.2,2.8),135);light((1.6,-3.1,2.8),135)
    light((0,-4.1,5.4),85,'upper');light((0,-4.1,8.5),65,'upper')
    light((0,-6.55,3.96),70,'fascia')
    for x in [-1.7,1.7]:
        rod((x,-5.95,3.95),(x,-6.48,4.0),.022,'iron','Signage');orb((x,-6.49,3.96),(.12,.12,.07),'iron','Signage');orb((x,-6.49,3.92),(.08,.08,.02),'bulb','Signage')
    # Blank side elevations can join neighbouring buildings. Services stay front/rear.
    rod((-2.66,-5.15,.4),(-2.66,-5.15,10.0),.056,'copper')
    for z in [1.2,3.0,4.8,6.6,8.4]:rod((-2.66,-5.15,z),(-2.66,-5.15,z+.04),.071,'iron')
    box('Rear service door',(1.7,5.04,1.45),(1.0,.1,2.25),'jade-paint')
    rod((1.7,3.0,9.9),(1.7,3.0,11.2),.20,'stainless',segments=20)
    orb((1.7,3,11.19),(.35,.35,.13),'copper',seg=20,rings=8)
    for y in [-2,1,3.8]:
        box('Lower side brick course',(2.999,y,1.0),(.015,2.5,1.4),'brick')
        box('Side repair',(-3.009,y,4.2),(.02,.65,1.4),'stone')
    # Pavement joints, clipped kerb at the front path, and a small drain.
    for x in k.np.arange(-3.7,3.8,.55):box('Paver joint',(float(x),-5.9,.278),(.009,1.7,.005),'iron','Street')
    for y in [-5.45,-6.02,-6.58]:box('Paver joint',(0,y,.279),(7.6,.009,.005),'iron','Street')
    for x in k.np.arange(-3.5,3.8,.58):box('Kerb',(float(x),-6.75,.16),(.56,.18,.24),'stone','Street')
    box('Drain',(2.5,-7,.069),(1,.3,.032),'iron','Street')
    for x in k.np.arange(2.04,2.98,.085):box('Drain grate',(float(x),-7,.091),(.024,.28,.022),'stainless','Street')
    for x,y,s in [(-3.25,-5.25,.9),(3.25,-5.35,.75)]:pot(x,y,.28,s)
    # Handcart of flour sacks at the back gives the service elevation a purpose.
    box('Rear cart',(0,5.63,.61),(1.1,.8,.15),'wood','Props')
    for x in [-.39,.36]:orb((x,5.63,.88),(.30,.30,.27),'canvas',seg=12,rings=8)
    k.emit_meshes()

if __name__=='__main__':
    out,preview=k.parse_argv();build();k.bake_occlusion()
    cams={
      'corner':{'position':[16,12,24],'target':[0,5.1,0]},
      'front':{'position':[0,6,24],'target':[0,5.2,0]},
      'side':{'position':[22,9,-10],'target':[0,5,0]},
      'walking':{'position':[6,1.72,12],'target':[0,2.2,4.3]},
      'truck':{'position':[9,4.5,20],'target':[0,4.0,1]},
      'storefront':{'position':[2,2.15,10],'target':[0,1.8,3.6]}}
    k.finish(out,preview,asset_id=ID,metadata={'name':'Moon Hotteok','storeys':3,'footprint':[6,10],'cameras':cams,'entry':{'center':[-1.7,.325,5.0],'clearWidth':2.0,'clearHeight':2.55},'wallProbe':[-2.86,1.5,7]})

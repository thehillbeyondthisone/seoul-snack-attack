import * as THREE from 'three';

export function eligibleForTruckUpgrade(save) {
  return save.deliveries >= 1 && save.truckMakeover !== true;
}

export function createUpgradeToken() {
  const token = new THREE.Group(); token.name = 'night-shift-spray-can';
  const enamel = new THREE.MeshStandardMaterial({color:0xe3a000,metalness:.55,roughness:.26});
  const steel = new THREE.MeshStandardMaterial({color:0xdce6e1,metalness:.85,roughness:.22});
  const dark = new THREE.MeshStandardMaterial({color:0x123a32,roughness:.5});
  function cylinder(radius,height,y,material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,24),material);
    mesh.position.y=y; token.add(mesh); return mesh;
  }
  cylinder(.3,.95,0,enamel); cylinder(.31,.07,-.48,steel); cylinder(.31,.07,.48,steel);
  cylinder(.18,.12,.565,steel); cylinder(.1,.13,.68,dark);
  cylinder(.305,.42,-.02,dark);
  const nozzle = new THREE.Mesh(new THREE.BoxGeometry(.07,.055,.07),dark);
  nozzle.position.set(0,.69,.1); token.add(nozzle);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(.17),enamel);
  star.position.set(0,-.015,.31); token.add(star);
  return token;
}

export class TruckUpgrade {
  constructor(orders) {
    this.orders = orders;
    this.group = new THREE.Group(); this.group.name = 'truck-graphics-collectible';
    this.token = createUpgradeToken(); this.group.add(this.token);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(.9,.045,8,48),
      new THREE.MeshBasicMaterial({color:0x51ffe0}));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = .12; this.group.add(this.ring);
    const c = document.createElement('canvas'); c.width=1024; c.height=192;
    const ctx=c.getContext('2d'); ctx.fillStyle='#123a32'; ctx.fillRect(0,0,1024,192);
    ctx.strokeStyle='#51ffe0';ctx.lineWidth=8;ctx.strokeRect(4,4,1016,184);
    ctx.textAlign='center';ctx.fillStyle='#fff4d6';ctx.font='bold 52px "Malgun Gothic", sans-serif';
    ctx.fillText('트럭 그래픽 · TRUCK GRAPHICS',512,76);
    ctx.font='36px sans-serif';ctx.fillText('NIGHT SHIFT  /  COLLECT TO EQUIP',512,140);
    const map = new THREE.CanvasTexture(c); map.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map,depthWrite:false}));
    label.scale.set(4.5,.844,1);label.position.y=3.4;this.group.add(label);
    this.group.visible=false; orders.scene.add(this.group); this.time=0;
  }
  spawn(rest) {
    if (!eligibleForTruckUpgrade(this.orders.save)) return;
    // Move along the same carriageway, away from the food marker. Project
    // back to the road so curves and narrower legacy streets stay driveable.
    const {city} = this.orders;
    const projection=city.projectToRoad(rest.point);
    const heading=projection?.heading ?? rest.anchor?.heading ?? 0;
    const direction=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
    const candidate=rest.point.clone().addScaledVector(direction,6);
    const road=city.projectToRoad(candidate);
    this.group.position.copy(road?.position || road?.point || candidate);
    const ground=city.findGround?.(this.group.position.x,this.group.position.z);
    this.group.position.y=ground?.point?.y ?? rest.point.y;
    this.group.visible=true;
    this.orders.hud.toast('픽업 옆 스프레이 캔을 모으세요', 'Collect the spray can beside your pickup for new truck graphics');
  }
  update(dt) {
    if (!this.group.visible) return;
    this.time+=dt;this.token.rotation.y=this.time;
    this.token.position.y=1.7+Math.sin(this.time*2.4)*.18;
    const {orders}=this;
    if (orders.save.truckMakeover) {this.group.visible=false;return;}
    const p=orders.player?.activePosition || orders.phys.position;
    const g=this.group.position;
    if (Math.hypot(p.x-g.x,p.z-g.z)>2.1 || Math.abs(p.y-g.y)>3.5) return;
    orders.save.truckMakeover=true; orders._persist(); this.group.visible=false;
    orders.onTruckMakeover?.(true);
    orders.hud.toast('나이트 시프트 그래픽 장착!', 'NIGHT SHIFT collected — truck makeover equipped!', 'win');
    orders.audio?.event('pickup');
  }
  reset() {this.group.visible=false;this.orders.onTruckMakeover?.(false);}
}

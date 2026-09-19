// Small generated textures shared by the underwater set piece. No asset fetches.
import * as THREE from 'three';

export function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function paint(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

// Fade BOTH across and along a shaft. A cylinder with only a vertical fade
// leaves a hard polygon silhouette whenever the camera crosses its wall.
export function shaftTexture() {
  return paint(64, 256, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / (w - 1), v = y / (h - 1);
      const across = Math.pow(Math.sin(u * Math.PI), 3);
      const along = Math.sin(Math.PI * Math.pow(v, 0.45)) * Math.pow(1 - v, 1.6);
      const i = (y * w + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = 255 * across * along;
    }
    ctx.putImageData(image, 0, 0);
  });
}

export function siltTexture() {
  return paint(256, 256, (ctx, w, h) => {
    const rand = seeded(0x51a7);
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const wave = Math.sin(y / h * Math.PI * 8 + Math.sin(x / w * Math.PI * 2) * 2.2);
      const shade = 110 + wave * 6 + rand() * 30;
      const i = (y * w + x) * 4;
      image.data[i] = shade * 0.78; image.data[i + 1] = shade * 0.94;
      image.data[i + 2] = shade; image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  });
}

export function mouthTexture() {
  return paint(256, 256, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(180,223,229,.48)');
    g.addColorStop(.48, 'rgba(109,184,202,.3)');
    g.addColorStop(.83, 'rgba(81,164,188,.56)');
    g.addColorStop(1, 'rgba(40,102,125,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = 'rgba(172,223,229,.22)'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();ctx.arc(c, c, c * (.7 + i * .025), i * .87, i * .87 + .7);ctx.stroke();
    }
  });
}

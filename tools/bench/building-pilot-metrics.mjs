import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {inspectGlb} from '../blender/inspect.mjs';
const assetId=process.argv[2]||'patchwork-pocha';
const out=assetId==='patchwork-pocha'?'_work/patchwork-review':`_work/${assetId}-review`;mkdirSync(out,{recursive:true});
const file=`public/assets/world/${assetId}.glb`,buffer=readFileSync(file),jsonLength=buffer.readUInt32LE(12);
const doc=JSON.parse(buffer.subarray(20,20+jsonLength).toString()),binStart=20+jsonLength+8;
const images=doc.images.map(image=>{
 const view=doc.bufferViews[image.bufferView],bytes=buffer.subarray(binStart+(view.byteOffset||0),binStart+(view.byteOffset||0)+view.byteLength);
 if(bytes.subarray(1,4).toString()!=='PNG')throw new Error('Expected authored PNG: '+image.name);
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 return{name:image.name,width,height,encodedBytes:bytes.length,rgbaMipBytes:Math.ceil(width*height*4*4/3)};
});
const geometry=await inspectGlb(file);
const report={bytes:buffer.length,triangles:geometry.tris,bounds:geometry.bbox,materials:geometry.materials.length,images,textureRgbaMipEstimateBytes:images.reduce((n,i)=>n+i.rgbaMipBytes,0),occlusionMaterials:doc.materials.filter(m=>m.occlusionTexture).length};
const saved=JSON.stringify(report,null,2);writeFileSync(`${out}/asset-metrics.json`,saved);writeFileSync(`tools/blender/reports/${assetId}-asset.json`,saved);
console.log(JSON.stringify({bytes:report.bytes,triangles:report.triangles,materials:report.materials,textures:images.length,textureRgbaMipEstimateMiB:report.textureRgbaMipEstimateBytes/1048576,occlusionMaterials:report.occlusionMaterials}));

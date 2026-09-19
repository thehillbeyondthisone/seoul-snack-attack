import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadBuildingPilot } from './building-pilot.js';
import { BUILDINGS } from './building-catalog.js';
import { Post } from '../core/post.js';
import { createTimeOfDay } from './time-of-day.js';

try {
  document.querySelector('#building').replaceChildren(...[...BUILDINGS,{id:'street-assembly',name:'Snack Street · assembly'}].map(b=>new Option(b.name,b.id)));
  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
  // loadBuildingPilot installs the same bounded shadow rig in this page and play.
  renderer.shadowMap.enabled=false;document.body.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(44,innerWidth/innerHeight,.08,200);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxDistance=65;controls.minDistance=1;controls.maxPolarAngle=Math.PI*.49;
  const city=await loadBuildingPilot(scene,new THREE.LoadingManager(),renderer);
  if(city.metadata.assembly){camera.far=800;camera.updateProjectionMatrix();controls.maxDistance=600;}
  document.querySelector('h1').textContent=city.group.name;
  document.title=city.group.name+' · Building review';
  document.querySelector('#building').value=city.metadata.id;
  document.querySelector('#building').onchange=e=>{const url=new URL(location.href);url.searchParams.set('building',e.target.value);location.href=url.href;};
  document.querySelector('footer a').href=`./?world=pilot&building=${city.metadata.id}&intro=off&time=dusk&rain=off&props=off`;
  const post=new Post(renderer,scene,camera);post.setSize(innerWidth,innerHeight);
  const samples=Math.min(4,renderer.capabilities.maxSamples);
  post.composer.renderTarget1.samples=samples;post.composer.renderTarget2.samples=samples;
  const timeOfDay=createTimeOfDay({scene,renderer,city,post,rain:{},van:{headlights:[],heroFill:{}},initial:'dusk'});
  function view(id){const v=city.metadata.cameras[id];camera.position.fromArray(v.position);controls.target.fromArray(v.target);controls.update();}
  view('corner');city.setWetness(1);
  document.querySelector('#view').onchange=e=>view(e.target.value);
  document.querySelector('#time').onchange=e=>timeOfDay.set(e.target.value);
  document.querySelector('#wet').onchange=e=>city.setWetness(e.target.checked?1:0);
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();post.setSize(innerWidth,innerHeight);});
  window.pilot={scene,camera,renderer,city,post,timeOfDay,controls,view,THREE};
  renderer.setAnimationLoop(()=>{controls.update();city.update(1/60,camera);post.render(1/60);});
  document.querySelector('#status').textContent=city.metadata.assembly?'12 buildings · 12 m road · 2.4 m pavements':`${city.metadata.storeys} storeys · ${city.metadata.footprint.join(' × ')} m building`;window.ready=true;
} catch(error){document.querySelector('#error').textContent=error.message;console.error(error);}

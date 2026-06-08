"use strict";
// ============================================================
//  SCENE SETUP
// ============================================================
function initThree(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1622);
  scene.fog = new THREE.Fog(0x0e1622, 600, 2400);

  camera = new THREE.PerspectiveCamera(48, W()/H(), 0.1, 4000);
  camera.position.set(0,8,-14);

  renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(W(),H());
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  document.getElementById('app').appendChild(renderer.domElement);

  // drag-to-look before the car starts moving
  const dom=renderer.domElement; dom.style.touchAction='none';
  const lookPt=e=>(e.touches&&e.touches[0])||e;
  dom.addEventListener('pointerdown', e=>{ if(!started || ED.open || RWE.open) return; const t=lookPt(e);
    freeLook.on=true; freeLook.drag=true; freeLook.lx=t.clientX; freeLook.ly=t.clientY; });
  window.addEventListener('pointermove', e=>{ if(!freeLook.drag) return; const t=lookPt(e);
    freeLook.az -= (t.clientX-freeLook.lx)*0.006;
    freeLook.el = Math.max(0.12, Math.min(1.35, freeLook.el + (t.clientY-freeLook.ly)*0.005));
    freeLook.lx=t.clientX; freeLook.ly=t.clientY; });
  window.addEventListener('pointerup', ()=>{ freeLook.drag=false; });

  // lights
  const hemi=new THREE.HemisphereLight(0xbcd6ff, 0x32281c, 0.7);
  scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff4e0, 1.15);
  sun.position.set(180,360,120); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  const d=420;
  sun.shadow.camera.left=-d; sun.shadow.camera.right=d;
  sun.shadow.camera.top=d; sun.shadow.camera.bottom=-d;
  sun.shadow.camera.near=1; sun.shadow.camera.far=1400; sun.shadow.bias=-0.0004;
  scene.add(sun);

  buildCar();
  addEventListener('resize', ()=>{
    camera.aspect=W()/H(); camera.updateProjectionMatrix();
    renderer.setSize(W(),H());
  });
}

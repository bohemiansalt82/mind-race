"use strict";
// ============================================================
//  CAMERA
// ============================================================
function cycleCamera(){
  const i=camModes.indexOf(setup.camera);
  setup.camera=camModes[(i+1)%camModes.length];
  syncCamSeg();
}

function computeBounds(){
  if (!track || !track.loop) return null;
  if (track._bounds) return track._bounds;
  let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;
  for (const p of track.loop){
    minX=Math.min(minX,p[0]); maxX=Math.max(maxX,p[0]);
    minZ=Math.min(minZ,p[1]); maxZ=Math.max(maxZ,p[1]);
  }
  const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2;
  const size=Math.max(maxX-minX, maxZ-minZ);
  track._bounds={minX,maxX,minZ,maxZ,cx,cz,size};
  return track._bounds;
}

// single fixed TV camera (driver-stand rostrum) that sees the whole track
function trackPosts(){
  if (!track) return [];
  if (track.camPos) return [track.camPos];
  if (track._posts) return track._posts;
  const b=computeBounds();
  const R=b.size*0.60, Y=b.size*0.085;
  track._posts=[{x:b.cx, y:Y, z:b.cz - R}];
  return track._posts;
}

function updateCamera(dt){
  const cy=Math.cos(car.yaw), sy=Math.sin(car.yaw);
  // free-look: drag-to-orbit around the car (until it starts moving)
  if (freeLook.on){
    const b=computeBounds(); const sz=b?b.size:120, dist=Math.max(40, sz*0.5);
    if (Math.abs(camera.fov-48)>0.01){ camera.fov=48; camera.updateProjectionMatrix(); }
    const ce=Math.cos(freeLook.el);
    camera.position.set(car.x + dist*ce*Math.sin(freeLook.az), car.y + dist*Math.sin(freeLook.el), car.z + dist*ce*Math.cos(freeLook.az));
    camera.lookAt(car.x, car.y+0.6, car.z);
    return;
  }
  if (setup.camera!=='track' && Math.abs(camera.fov-48)>0.01){
    camera.fov=48; camera.updateProjectionMatrix();
  }
  const fov=camera.fov*Math.PI/180;

  // 자동차 시점 — onboard hood cam
  if (setup.camera==='car'){
    const back=-0.2, up=1.6, look=8;
    camera.position.set(car.x - sy*back, car.y+up, car.z - cy*back);
    camera.lookAt(car.x + sy*look, car.y+0.6, car.z + cy*look);
    return;
  }

  const b=computeBounds();
  const SIN45=0.7071;

  // 전체 시점 — static 45° view framing the whole track
  if (setup.camera==='full'){
    const span=(b?b.size:120)*1.3;
    const D=(span/2)/Math.tan(fov/2)*1.05;
    const horiz=D*SIN45, vert=D*SIN45;
    const tx=b?b.cx:0, tz=(b?b.cz:0) - horiz, ty=vert;
    const k=Math.min(1,dt*4);
    camera.position.x += (tx - camera.position.x)*k;
    camera.position.y += (ty - camera.position.y)*k;
    camera.position.z += (tz - camera.position.z)*k;
    camera.lookAt(b?b.cx:0, 0, b?b.cz:0);
    return;
  }

  // 트래킹 시점 — ONE fixed TV camera: stays put, pans to follow, zooms in when far
  const sz=b?b.size:120;
  const p=trackPosts()[0];
  camera.position.set(p.x, p.y*setup.camHeight, p.z);

  if (Math.hypot(camLook.x-car.x, camLook.z-car.z) > sz){
    camLook.x=car.x; camLook.y=car.y+0.6; camLook.z=car.z;
  }
  const kl=Math.min(1,dt*6);
  camLook.x += (car.x - camLook.x)*kl;
  camLook.y += ((car.y+0.6) - camLook.y)*kl;
  camLook.z += (car.z - camLook.z)*kl;

  // zoom: wide angle when near, telephoto when far
  const dist=Math.hypot(p.x-car.x, p.y-car.y, p.z-car.z);
  const nearD=sz*0.30, farD=sz*1.05;
  const t=Math.max(0,Math.min(1,(dist-nearD)/(farD-nearD)));
  const targetFov=50 - t*16;
  camera.fov += (targetFov-camera.fov)*Math.min(1,dt*5);
  camera.updateProjectionMatrix();
  camera.lookAt(camLook.x, camLook.y, camLook.z);
}

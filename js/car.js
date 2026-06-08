"use strict";
// ============================================================
//  CAR MODEL (visual)
// ============================================================
function buildCar(){
  carGroup = new THREE.Group();
  const body = new THREE.Group();
  const main = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.5, 2.6),
    new THREE.MeshStandardMaterial({color:0x2b7fff, metalness:.3, roughness:.45}));
  main.position.y=0.55; main.castShadow=true;
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(1.1,0.45,1.2),
    new THREE.MeshStandardMaterial({color:0x12161c, metalness:.2, roughness:.3}));
  canopy.position.set(0,0.95,-0.1); canopy.castShadow=true;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.08,0.5),
    new THREE.MeshStandardMaterial({color:0x14181f}));
  wing.position.set(0,1.05,-1.25); wing.castShadow=true;
  const wstand1=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.4,0.08),new THREE.MeshStandardMaterial({color:0x14181f}));
  wstand1.position.set(-0.55,0.85,-1.25);
  const wstand2=wstand1.clone(); wstand2.position.x=0.55;
  const nose=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.3,0.6),
    new THREE.MeshStandardMaterial({color:0xffffff, roughness:.4}));
  nose.position.set(0,0.5,1.25); nose.castShadow=true;

  body.add(main, canopy, wing, wstand1, wstand2, nose);
  bodyMesh = body;
  carGroup.add(body);

  const wheelGeo=new THREE.CylinderGeometry(P.wheelRadius,P.wheelRadius,0.42,18);
  const wheelMat=new THREE.MeshStandardMaterial({color:0x101216, roughness:.85});
  const rimMat=new THREE.MeshStandardMaterial({color:0xb8c4d0, metalness:.7, roughness:.3});
  const wx=0.82, wz=1.0;
  const positions=[[-wx,0.34,wz],[wx,0.34,wz],[-wx,0.34,-wz],[wx,0.34,-wz]];
  positions.forEach((pp,i)=>{
    const wgrp=new THREE.Group();
    const tire=new THREE.Mesh(wheelGeo,wheelMat);
    tire.rotation.z=Math.PI/2; tire.castShadow=true;
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,0.44,8),rimMat);
    rim.rotation.z=Math.PI/2;
    wgrp.add(tire,rim);
    wgrp.position.set(pp[0],pp[1],pp[2]);
    wgrp.userData.front = i<2;
    carGroup.add(wgrp); wheelMeshes.push(wgrp);
  });

  const sg=new THREE.CircleGeometry(1.4,24);
  const sm=new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:0.35});
  shadowMesh=new THREE.Mesh(sg,sm); shadowMesh.rotation.x=-Math.PI/2;
  scene.add(shadowMesh);

  scene.add(carGroup);
}

function updateCarVisual(){
  carGroup.position.set(car.x, car.y, car.z);
  carGroup.rotation.set(0, car.yaw, 0);
  bodyMesh.rotation.set(car.pitch, 0, car.roll);
  wheelMeshes.forEach(w=>{
    w.rotation.set(0,0,0);
    if (w.userData.front) w.rotation.y = car.steerVis;
    const tire = w.children[0], rim=w.children[1];
    tire.rotation.x = -car.wheelSpin;
    rim.rotation.x = -car.wheelSpin;
    tire.rotation.z=Math.PI/2; rim.rotation.z=Math.PI/2;
  });
  shadowMesh.position.set(car.x, track? track.heightAt(car.x,car.z)+0.03 : 0.03, car.z);
  const sc = car.airborne ? Math.max(0.5, 1 - (car.y - track.heightAt(car.x,car.z))*0.15) : 1;
  shadowMesh.scale.set(sc,sc,sc);
  shadowMesh.material.opacity = 0.35*sc;
}

"use strict";
// ============================================================
//  MAIN LOOP — fixed timestep physics
// ============================================================
function loop(){
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  if (started){
    accum += dt;
    while (accum >= physDT){ stepPhysics(physDT); accum -= physDT; }
    // free-look returns to the normal view as soon as the car starts moving
    if (freeLook.on && Math.hypot(car.vx,car.vz) > 2){ freeLook.on=false; freeLook.drag=false; }
    updateCarVisual();
    updateCamera(dt);
    updateHUD();
  }
  renderer.render(scene, camera);
}

// ============================================================
//  BOOT
// ============================================================
function boot(){
  clock = new THREE.Clock();
  initThree();
  wireUI();
  wireEditor();
  wireCalibration();
  renderSavedTracks();
  el('loadMsg').textContent='준비 완료 — 트랙을 선택하세요';
  loop();
}
boot();

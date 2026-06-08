"use strict";
// ============================================================
//  HUD UPDATE
// ============================================================
function updateHUD(){
  const kmh = Math.hypot(car.vx,car.vz) / UNIT * 3.6;
  el('spdVal').textContent = Math.round(kmh);
  el('spdScale').textContent = Math.round(kmh*10) + ' km/h scale';
  el('rpmFill').style.width = Math.min(100, car.engineRpm/P.maxRpm*100)+'%';
  el('gearTxt').textContent = 'GEAR ' + car.gear;
  el('surfTxt').textContent = car.surface.toUpperCase();
  el('lapCount').textContent = 'LAP ' + timing.lap;
  el('curTime').textContent = timing.running ? timing.t.toFixed(3) : '0.000';
  el('lastT').textContent = fmt(timing.last);
  el('bestT').textContent = fmt(timing.best);
  // lap-completion flash
  const lf=el('lapFlash');
  if (performance.now() < lapFlash.until){
    lf.style.opacity=1;
    lf.innerHTML='✓ LAP '+lapFlash.lap+'  <b>'+lapFlash.time.toFixed(3)+'s</b>';
  } else lf.style.opacity=0;
  // delta vs best at current sector
  if (timing.best!=null && timing.prevBestSplits && timing.running){
    const si = timing.sectorIdx-1;
    if (si>=0 && timing.curSplits[si]!=null && timing.prevBestSplits[si]!=null){
      lastDelta = timing.curSplits[si]-timing.prevBestSplits[si];
    }
    const dEl=el('deltaT');
    dEl.textContent = (lastDelta>=0?'+':'') + lastDelta.toFixed(3);
    dEl.className = 'val ' + (lastDelta>0?'delta-up':'delta-dn');
  }
}

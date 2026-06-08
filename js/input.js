"use strict";
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'KeyC' || e.code === 'Space') cycleCamera();
});
addEventListener('keyup', e => keys[e.code] = false);

// ---- VRC dongle (Virtual RC USB) calibrated controller ----
const VRC = {
  cal: null,
  match: id => /07c0|virtual rc/i.test(id),
  clamp: (v,lo,hi)=>Math.max(lo,Math.min(hi,v)),
  load(){
    try { const r = localStorage.getItem('vrcCalibration'); this.cal = r ? JSON.parse(r) : null; }
    catch { this.cal = null; }
    return this.cal;
  },
  findPad(){
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && this.match(p.id)) return p;
    return null;
  },
  mapSteer(v, c){
    const a=v-c.center, dr=c.right-c.center, dl=c.left-c.center;
    if (a===0) return 0;
    if (dr!==0 && Math.sign(a)===Math.sign(dr)) return this.clamp(a/dr,0,1);
    if (dl!==0 && Math.sign(a)===Math.sign(dl)) return -this.clamp(a/dl,0,1);
    return 0;
  },
  mapThrottle(v, c){
    const a=v-c.center; if (a===0) return 0;
    const df=c.full-c.center;
    if (c.brake===undefined || c.brake===null) return df===0?0:this.clamp(a/df,-1,1);
    const db=c.brake-c.center;
    if (df!==0 && Math.sign(a)===Math.sign(df)) return this.clamp(a/df,0,1);
    if (db!==0 && Math.sign(a)===Math.sign(db)) return -this.clamp(a/db,0,1);
    return 0;
  }
};
VRC.load();

function gamepad(){
  // Prefer the calibrated VRC dongle when a calibration exists.
  if (VRC.cal){
    const gp = VRC.findPad();
    if (gp){
      let s = VRC.mapSteer(gp.axes[VRC.cal.steerAxis] ?? 0, VRC.cal.steer);
      if (VRC.cal.steerReverse) s = -s;
      const t = VRC.mapThrottle(gp.axes[VRC.cal.throttleAxis] ?? 0, VRC.cal.throttle);
      const dz = v => Math.abs(v) < 0.06 ? 0 : v;
      return {
        steer: dz(s),
        throttle: Math.max(0, t),
        brake: Math.max(0, -t),
        handbrake: gp.buttons[0] && gp.buttons[0].pressed,
        reset: gp.buttons[1] && gp.buttons[1].pressed
      };
    }
  }
  // Fallback: generic gamepad (Xbox-style triggers) on the first pad.
  const gp = navigator.getGamepads && navigator.getGamepads()[0];
  if (!gp) return null;
  const dz = v => Math.abs(v) < 0.12 ? 0 : v;
  return {
    steer: dz(gp.axes[0] || 0),
    throttle: gp.buttons[7] ? gp.buttons[7].value : 0,
    brake: gp.buttons[6] ? gp.buttons[6].value : 0,
    handbrake: gp.buttons[0] && gp.buttons[0].pressed,
    reset: gp.buttons[3] && gp.buttons[3].pressed
  };
}

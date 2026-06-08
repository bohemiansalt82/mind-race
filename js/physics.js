"use strict";
// ============================================================
//  VEHICLE PHYSICS
// ============================================================
function resetCar(){
  if (!track) return;
  const s = track.start;
  car.x = s.x; car.z = s.z; car.yaw = s.yaw;
  car.vx = car.vz = car.yawRate = 0;
  car.roll = car.pitch = car.rollVel = car.pitchVel = 0;
  car.y = 0; car.vy = 0; car.airborne = false;
  car.wheelSpin = 0; car.engineRpm = 0; car.throttleApplied = 0;
  timing.reset();
}

function stepPhysics(dt){
  const gp = gamepad();
  if (gp && gp.reset) resetCar();

  // ---- gather inputs ----
  let throttle = (keys.KeyW||keys.ArrowUp?1:0);
  let brakeIn  = (keys.KeyS||keys.ArrowDown?1:0);
  let steerIn  = (keys.KeyA||keys.ArrowLeft?-1:0) + (keys.KeyD||keys.ArrowRight?1:0);
  let handbrake = (keys.ShiftLeft||keys.ShiftRight)?1:0;
  if (gp){
    throttle = Math.max(throttle, gp.throttle);
    brakeIn  = Math.max(brakeIn, gp.brake);
    if (gp.steer) steerIn = gp.steer;
    handbrake = Math.max(handbrake, gp.handbrake?1:0);
  }
  steerIn = -Math.max(-1, Math.min(1, steerIn));   // flip: corrected steering direction

  // hold the car still while the start countdown is running
  if (raceLock){ throttle=0; brakeIn=0; steerIn=0; handbrake=1; }

  // smooth throttle ramp (launch traction)
  {
    const cur = car.throttleApplied || 0;
    const rampUp = (setup.launchSmooth>0) ? (1.2/setup.launchSmooth) : 999;
    const rate = (throttle > cur) ? rampUp : 999;
    car.throttleApplied = cur + (throttle - cur) * Math.min(1, dt*rate);
  }

  // ---- velocity in car local frame ----
  const cy = Math.cos(car.yaw), sy = Math.sin(car.yaw);
  const vLong =  car.vx * sy + car.vz * cy;   // forward speed (world units/s)
  const vLat  =  car.vx * cy - car.vz * sy;   // lateral (right +)
  const speed = Math.hypot(car.vx, car.vz);
  const vLong_si = vLong / UNIT;              // m/s
  const speed_si = speed / UNIT;              // m/s

  // ---- surface under car ----
  const surf = track.surfaceAt(car.x, car.z);
  car.surface = surf;
  const S = SURFACE[surf];

  // ---- speed-sensitive steering ----
  const steerReduction = 1 - Math.min(0.40, speed_si * 0.035);
  let steerAngle = steerIn * setup.maxSteer * steerReduction;
  car.steerVis += (steerAngle - car.steerVis) * Math.min(1, dt*14);

  // ---- longitudinal weight transfer (axle loads, SI Newtons) ----
  const a_m = P.a/UNIT, b_m = P.b/UNIT, cg_m = P.cgHeight/UNIT;
  const Wtotal = P.mass * 9.81;
  const longAccelEst = car._lastLongAccel || 0;
  let loadF = Wtotal * (b_m/(a_m+b_m)) - P.wtScale * (cg_m/(a_m+b_m)) * P.mass * longAccelEst;
  let loadR = Wtotal * (a_m/(a_m+b_m)) + P.wtScale * (cg_m/(a_m+b_m)) * P.mass * longAccelEst;
  loadF = Math.max(0.5, loadF); loadR = Math.max(0.5, loadR);

  // ---- slip angles ----
  const eps = 0.6;
  const vfx = Math.abs(vLong) + eps;
  const slipF = Math.atan2(vLat + car.yawRate * P.a, vfx) - Math.sign(vLong||1) * car.steerVis;
  const slipR = Math.atan2(vLat - car.yawRate * P.b, vfx);

  // ---- lateral tire forces (linear then saturated by friction circle) ----
  const muF = S.mu;
  const muR = S.mu * setup.rearGrip;
  let FyF = -P.corneringStiffF * slipF * loadF;
  let FyR = -P.corneringStiffR * slipR * loadR;
  const maxF = muF * loadF, maxR = muR * loadR;
  FyF = Math.max(-maxF, Math.min(maxF, FyF));
  FyR = Math.max(-maxR, Math.min(maxR, FyR));

  // ---- longitudinal force (engine / brake) ----
  let driveForce = 0;
  const powered = car.throttleApplied * P.engineForce * setup.power * S.driveMul;
  if (brakeIn > 0 && vLong_si > 0.05){
    driveForce = -P.brakeForce * brakeIn;
  } else if (brakeIn > 0){
    driveForce = -P.reverseForce * brakeIn;
  }
  driveForce += powered;

  // handbrake: lock rear -> kill rear lateral grip, add drag
  if (handbrake){
    FyR *= 0.25;
    driveForce -= Math.sign(vLong) * 5;
  }

  // rolling resistance
  driveForce -= P.rrLong * S.rr * vLong_si;

  // friction circle for rear
  const rearLongShare = (setup.drive==='fwd') ? 0 : (setup.drive==='awd'?0.5:1.0);
  const frontLongShare = 1 - rearLongShare;
  let FxR = driveForce * rearLongShare;
  let FxF = driveForce * frontLongShare;
  const rearCombined = Math.hypot(FxR, FyR);
  if (rearCombined > maxR){
    const sc = maxR / rearCombined;
    FxR *= sc; FyR *= sc;
  }

  // ---- total forces in local frame ----
  const Flong = FxF + FxR;
  const Flat  = FyF * Math.cos(car.steerVis) + FyR;

  // aero drag
  const vx_si = car.vx / UNIT, vz_si = car.vz / UNIT;
  const dragX = -P.drag * vx_si * speed_si;
  const dragZ = -P.drag * vz_si * speed_si;

  // ---- convert local forces to world (Newtons) ----
  let Fx = Flong * sy + Flat * cy + dragX;
  let Fz = Flong * cy - Flat * sy + dragZ;

  // ---- integrate linear: SI accel (m/s²) -> world units/s² via UNIT ----
  const ax = (Fx / P.mass) * UNIT, az = (Fz / P.mass) * UNIT;
  car.vx += ax * dt;
  car.vz += az * dt;

  car._lastLongAccel = Flong / P.mass;

  // ---- yaw torque ----
  const torque = (FyF * Math.cos(car.steerVis)) * a_m - FyR * b_m;
  const yawAcc = torque / P.inertia;
  car.yawRate += yawAcc * dt;
  car.yawRate *= (1 - Math.min(0.5, dt*0.8));

  // low-speed creep kill
  if (speed < 2 && throttle===0 && brakeIn===0){
    car.vx *= 0.85; car.vz *= 0.85; car.yawRate *= 0.7;
  }

  // ---- update pose ----
  car.yaw += car.yawRate * dt;
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // ---- track-edge barrier collision ----
  if (track.collide){
    track.collide(car);
  } else if (track.edgeLimit){
    const np = nearestOnLoop(track.loop, car.x, car.z);
    if (np.d > track.edgeLimit && np.d > 1e-4){
      const ux=(car.x-np.px)/np.d, uz=(car.z-np.pz)/np.d;
      car.x = np.px + ux*track.edgeLimit;
      car.z = np.pz + uz*track.edgeLimit;
      const vOut = car.vx*ux + car.vz*uz;
      if (vOut>0){ car.vx -= ux*vOut*1.3; car.vz -= uz*vOut*1.3; }
      car.yawRate *= 0.85;
    }
  }

  // ---- vertical: jumps / bumps from track height ----
  const groundY = track.heightAt(car.x, car.z);
  if (!car.airborne){
    car.y += (groundY - car.y) * Math.min(1, dt*16);
    const ahead = track.heightAt(car.x + sy*1.2, car.z + cy*1.2);
    const slope = (ahead - groundY);
    if (slope < -0.25 && vLong_si > 3){
      car.airborne = true;
      car.vy = vLong * Math.min(0.6, -slope*0.8);
    }
  } else {
    car.vy -= 98 * dt;          // gravity (9.81 m/s² = 98 world units/s²)
    car.y += car.vy * dt;
    if (car.y <= groundY){
      car.y = groundY; car.vy = 0; car.airborne = false;
      car.vx *= 0.96; car.vz *= 0.96;
    }
  }

  // ---- body roll & pitch (visual, spring-damper) ----
  const stiff = 7 + setup.susStiff*11;
  const damp = 2.6 + setup.susStiff*2.4;
  const targetRoll = -(Flat / P.mass) * 0.012;
  const targetPitch = car._lastLongAccel * 0.007;
  car.rollVel += ((targetRoll - car.roll)*stiff - car.rollVel*damp) * dt;
  car.roll += car.rollVel * dt;
  car.pitchVel += ((targetPitch - car.pitch)*stiff - car.pitchVel*damp) * dt;
  car.pitch += car.pitchVel * dt;

  // ---- engine rpm / gear (cosmetic) ----
  const wheelAngular = vLong / P.wheelRadius;
  car.wheelSpin += wheelAngular * dt;
  const gearRatios = [0, 2.6, 1.8, 1.3, 1.0, 0.82];
  const targetGear = Math.max(1, Math.min(5, Math.floor(Math.abs(vLong_si)/2.5)+1));
  car.gear = targetGear;
  let rpm = Math.abs(vLong_si) * gearRatios[targetGear] * 3600 + throttle*4000;
  if (handbrake && throttle>0) rpm += 8000;
  car.engineRpm += (Math.min(P.maxRpm, rpm) - car.engineRpm) * Math.min(1, dt*8);

  // ---- timing / checkpoints ----
  timing.update(car.x, car.z);
}

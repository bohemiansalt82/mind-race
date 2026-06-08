"use strict";
// ============================================================
//  TIMING / LAP system
// ============================================================
const timing = {
  lap:0, t:0, last:null, best:null, running:false,
  sectorIdx:0, prevBestSplits:null, curSplits:[],
  reset(){
    this.lap=0; this.t=0; this.last=null; this.best=null; this.running=false;
    this.sectorIdx=0; this.curSplits=[]; this.prevBestSplits=null;
  },
  update(x,z){
    if (!track || !track.checkpoints) return;
    if (this.running) this.t += physDT;
    const cps = track.checkpoints;
    const cp = cps[this.sectorIdx];
    if (cp && dist2(x,z,cp.x,cp.z) < cp.r*cp.r){
      this.curSplits.push(this.t);
      this.sectorIdx++;
      if (this.sectorIdx >= cps.length){
        // finished a lap (last cp = finish line)
        if (this.running){
          this.last = this.t;
          if (this.best===null || this.t < this.best){
            this.best = this.t; this.prevBestSplits = this.curSplits.slice();
          }
          this.lap++;
          lapFlash.lap=this.lap; lapFlash.time=this.last;
          lapFlash.until=performance.now()+2800;
        }
        this.running = true;
        this.t = 0; this.sectorIdx = 0; this.curSplits = [];
      }
    }
  }
};

function dist2(x,z,a,b){ const dx=x-a, dz=z-b; return dx*dx+dz*dz; }
function fmt(t){ if(t==null) return '--.---'; return t.toFixed(3); }

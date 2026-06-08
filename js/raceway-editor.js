"use strict";
// ============================================================
//  RACEWAY EDITOR  — draw a catmull-rom loop track
//  User sets: control points (centerline), road width,
//             start/finish position, 조정석 (camera) position
// ============================================================

const RWE = {
  open: false, sel: -1, drag: null,
  line: [], roadW: 18, cam: [0, 145], start: null, startDir: 1
};
let reCanvas, reCtx;

// World viewport ±270 × ±156 (same as studio editor)
const RE_VX = 270, RE_VZ = 156;
function rw2c(x, z){ return [(x+RE_VX)/(2*RE_VX)*reCanvas.width,  (z+RE_VZ)/(2*RE_VZ)*reCanvas.height]; }
function rc2w(cx,cz){ return [cx/reCanvas.width*2*RE_VX - RE_VX,  cz/reCanvas.height*2*RE_VZ - RE_VZ]; }

function rweDefault(){
  RWE.line = [
    [0,-105],[110,-90],[170,0],[110,90],
    [0,105],[-110,90],[-170,0],[-110,-90]
  ];
  RWE.roadW = 18; RWE.cam = [0,145];
  RWE.start = [0,-105]; RWE.startDir = 1;
}

function rweLayout(){
  return JSON.parse(JSON.stringify({
    type:'raceway', line:RWE.line, roadW:RWE.roadW,
    cam:RWE.cam, start:RWE.start, startDir:RWE.startDir
  }));
}

let rweUndoStack = [];
function rwePush(){
  const s = JSON.stringify(rweLayout());
  if (rweUndoStack[rweUndoStack.length-1] !== s){ rweUndoStack.push(s); if(rweUndoStack.length>80) rweUndoStack.shift(); }
}
function rweUndoAction(){
  if (!rweUndoStack.length) return;
  const L = JSON.parse(rweUndoStack.pop());
  RWE.line=L.line; RWE.roadW=L.roadW; RWE.cam=L.cam; RWE.start=L.start; RWE.startDir=L.startDir;
  RWE.sel=-1; RWE.drag=null; rweSyncPanel(); drawRacewayEditor();
}

function openRacewayEditor(layout, name){
  try{
    if(layout){
      RWE.line      = layout.line      ? JSON.parse(JSON.stringify(layout.line)) : [];
      RWE.roadW     = layout.roadW     || 18;
      RWE.cam       = layout.cam       ? [...layout.cam]   : [0,145];
      RWE.start     = layout.start     ? [...layout.start] : null;
      RWE.startDir  = layout.startDir  || 1;
      if(!RWE.line.length || !RWE.start) rweDefault();
    } else {
      rweDefault();
    }
  }catch(e){ rweDefault(); }
  rweUndoStack=[]; RWE.sel=-1; RWE.drag=null; RWE.open=true;
  if(el('reName')) el('reName').value = name||'';
  el('intro').style.display='none';
  el('re').style.display='flex';
  rweSyncPanel(); drawRacewayEditor();
}

function closeRacewayEditor(){
  RWE.open=false; el('re').style.display='none'; el('intro').style.display='flex';
}

function rweSyncPanel(){
  if(el('reRoadW')){ el('reRoadW').value=RWE.roadW; el('reVRoadW').textContent=RWE.roadW+' u'; }
}

// ---- Rendering ----
function drawRacewayEditor(){
  const ctx=reCtx, CW=reCanvas.width, CH=reCanvas.height;
  const sx = CW/(2*RE_VX);   // world-unit → pixel scale

  ctx.fillStyle='#2c4225'; ctx.fillRect(0,0,CW,CH);

  if(RWE.line.length < 2){
    ctx.fillStyle='rgba(255,255,255,.3)'; ctx.font='14px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('흰 점 3개 이상이 필요합니다. 포인트를 추가하세요.', CW/2, CH/2);
    drawRweMarkers(ctx); return;
  }

  const loop = catmullLoop(RWE.line, 14);
  const vn   = vertexNormals(loop);
  const half = RWE.roadW/2;
  const roadPx = RWE.roadW * sx;
  const kerbPx = Math.max(2, 2.4*sx);

  // ---- Road surface (thick centre-line stroke) ----
  ctx.strokeStyle='#2b2f36'; ctx.lineWidth=roadPx; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath();
  loop.forEach((p,i)=>{ const c=rw2c(p[0],p[1]); i?ctx.lineTo(c[0],c[1]):ctx.moveTo(c[0],c[1]); });
  ctx.closePath(); ctx.stroke();

  // ---- Inner kerb (red) ----
  ctx.strokeStyle='#cf3b3b'; ctx.lineWidth=kerbPx; ctx.lineJoin='round';
  ctx.beginPath();
  loop.forEach((p,i)=>{ const nx=vn[i][0],nz=vn[i][1]; const c=rw2c(p[0]-nx*(half-1.1),p[1]-nz*(half-1.1)); i?ctx.lineTo(c[0],c[1]):ctx.moveTo(c[0],c[1]); });
  ctx.closePath(); ctx.stroke();

  // ---- Outer kerb (white) ----
  ctx.strokeStyle='#e8e8e8'; ctx.lineWidth=kerbPx;
  ctx.beginPath();
  loop.forEach((p,i)=>{ const nx=vn[i][0],nz=vn[i][1]; const c=rw2c(p[0]+nx*(half-1.1),p[1]+nz*(half-1.1)); i?ctx.lineTo(c[0],c[1]):ctx.moveTo(c[0],c[1]); });
  ctx.closePath(); ctx.stroke();

  // ---- Control points ----
  RWE.line.forEach((p,i)=>{
    const c=rw2c(p[0],p[1]);
    ctx.fillStyle = i===RWE.sel ? '#4ea6ff' : 'rgba(255,255,255,.85)';
    ctx.strokeStyle='#0c1118'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(c[0],c[1],5,0,Math.PI*2); ctx.fill(); ctx.stroke();
  });

  drawRweMarkers(ctx, loop);

  // ---- Track info ----
  if(el('reInfo')){
    const len = loop.reduce((s,p,i)=>i?s+Math.hypot(p[0]-loop[i-1][0],p[1]-loop[i-1][1]):s,0)/10;
    el('reInfo').textContent=`포인트 ${RWE.line.length}개 · 둘레 약 ${Math.round(len)}m`;
  }
}

function drawRweMarkers(ctx, loop){
  // ---- Start/finish marker ----
  if(RWE.start && loop && loop.length){
    let bi=0,bd=1e18;
    for(let i=0;i<loop.length;i++){const dx=loop[i][0]-RWE.start[0],dz=loop[i][1]-RWE.start[1]; const d=dx*dx+dz*dz; if(d<bd){bd=d;bi=i;}}
    const sp=loop[bi], nx2=loop[(bi+1)%loop.length];
    const ang=Math.atan2(nx2[0]-sp[0], nx2[1]-sp[1]);
    const cc=rw2c(sp[0],sp[1]);
    const roadPx=(RWE.roadW*(reCanvas.width/(2*RE_VX)));
    ctx.save(); ctx.translate(cc[0],cc[1]); ctx.rotate(-ang);
    ctx.fillStyle='#ffffff'; ctx.fillRect(-1.5,-roadPx/2-4,3,roadPx+8);
    ctx.restore();
    // Direction arrow
    const dir=RWE.startDir||1, tx=nx2[0]-sp[0], tz=nx2[1]-sp[1], tl=Math.hypot(tx,tz)||1;
    const p0=rw2c(sp[0],sp[1]), p1=rw2c(sp[0]+dir*tx/tl*26,sp[1]+dir*tz/tl*26);
    ctx.strokeStyle='#ffd13b'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.stroke();
    const aa=Math.atan2(p1[1]-p0[1],p1[0]-p0[0]); ctx.fillStyle='#ffd13b'; ctx.beginPath();
    ctx.moveTo(p1[0],p1[1]);
    ctx.lineTo(p1[0]-9*Math.cos(aa-0.42),p1[1]-9*Math.sin(aa-0.42));
    ctx.lineTo(p1[0]-9*Math.cos(aa+0.42),p1[1]-9*Math.sin(aa+0.42));
    ctx.closePath(); ctx.fill();
    // S dot (draggable, shows actual position before snap)
    const sc=rw2c(RWE.start[0],RWE.start[1]);
    ctx.fillStyle='#ffd13b'; ctx.beginPath(); ctx.arc(sc[0],sc[1],8,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#0c1118'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#0c1118'; ctx.font='bold 10px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('S',sc[0],sc[1]);
  }

  // ---- 조정석 marker ----
  if(RWE.cam){
    const cc=rw2c(RWE.cam[0],RWE.cam[1]);
    let cx=0,cz=0; RWE.line.forEach(p=>{cx+=p[0];cz+=p[1];}); cx/=RWE.line.length||1; cz/=RWE.line.length||1;
    const tc=rw2c(cx,cz);
    ctx.strokeStyle='rgba(52,208,224,.55)'; ctx.lineWidth=1.5; ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.moveTo(cc[0],cc[1]); ctx.lineTo(tc[0],tc[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#34d0e0'; ctx.beginPath(); ctx.arc(cc[0],cc[1],11,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#0c1118'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#0c1118'; ctx.beginPath(); ctx.arc(cc[0],cc[1],4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#34d0e0'; ctx.font='bold 11px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('조정석',cc[0],cc[1]+20);
  }
}

// ---- Wire ----
function wireRacewayEditor(){
  reCanvas=el('reCanvas'); reCtx=reCanvas.getContext('2d');

  const _pt=ev=>{ const r=reCanvas.getBoundingClientRect(); if(!r.width||!r.height)return null;
    const t=(ev.touches&&ev.touches[0])||(ev.changedTouches&&ev.changedTouches[0])||ev;
    return [(t.clientX-r.left)*reCanvas.width/r.width,(t.clientY-r.top)*reCanvas.height/r.height]; };
  const _down=ev=>{ const p=_pt(ev); if(!p)return; if(ev.cancelable)ev.preventDefault(); reDown(p[0],p[1]); };
  const _move=ev=>{ if(!RWE.drag)return; const p=_pt(ev); if(!p)return; if(ev.cancelable)ev.preventDefault(); reMove(p[0],p[1]); };
  const _up=()=>{ RWE.drag=null; };
  reCanvas.addEventListener('mousedown',_down);
  reCanvas.addEventListener('touchstart',_down,{passive:false});
  window.addEventListener('mousemove',_move);
  window.addEventListener('touchmove',_move,{passive:false});
  window.addEventListener('mouseup',_up);
  window.addEventListener('touchend',_up);

  window.addEventListener('keydown',e=>{
    if(!RWE.open)return;
    if(e.target&&e.target.id==='reName')return;
    if(e.code==='Delete'||e.code==='Backspace'){
      e.preventDefault();
      if(RWE.sel>=0&&RWE.line.length>3){ rwePush(); RWE.line.splice(RWE.sel,1); RWE.sel=-1; drawRacewayEditor(); }
    } else if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){ e.preventDefault(); rweUndoAction(); }
  });

  // Toolbar buttons
  el('reBtn').addEventListener('click', ()=>openRacewayEditor());
  el('reClose').addEventListener('click', closeRacewayEditor);
  el('reReset').addEventListener('click', ()=>{ rweDefault(); rweSyncPanel(); drawRacewayEditor(); });

  el('reAdd').addEventListener('click', ()=>{
    rwePush();
    if(RWE.line.length<2){ RWE.line.push([30,0]); RWE.sel=RWE.line.length-1; drawRacewayEditor(); return; }
    // Insert midpoint at the longest gap
    let maxD=0,maxI=0;
    for(let i=0;i<RWE.line.length;i++){const a=RWE.line[i],b=RWE.line[(i+1)%RWE.line.length];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(d>maxD){maxD=d;maxI=i;}}
    const a=RWE.line[maxI],b=RWE.line[(maxI+1)%RWE.line.length];
    RWE.line.splice(maxI+1,0,[Math.round((a[0]+b[0])/2),Math.round((a[1]+b[1])/2)]);
    RWE.sel=maxI+1; drawRacewayEditor();
  });

  el('reDel').addEventListener('click', ()=>{
    if(RWE.sel>=0&&RWE.line.length>3){ rwePush(); RWE.line.splice(RWE.sel,1); RWE.sel=-1; drawRacewayEditor(); }
  });

  el('reDir').addEventListener('click', ()=>{ rwePush(); RWE.startDir=(RWE.startDir===-1)?1:-1; drawRacewayEditor(); });
  el('reUndo').addEventListener('click', rweUndoAction);

  el('reRoadW').addEventListener('mousedown', ()=>rwePush());
  el('reRoadW').addEventListener('input', e=>{
    RWE.roadW=+e.target.value; el('reVRoadW').textContent=e.target.value+' u'; drawRacewayEditor();
  });

  el('reSave').addEventListener('click', async ()=>{
    const tracks=await loadTracksAPI();
    const name=(el('reName').value||'').trim()||('레이스웨이 '+(tracks.length+1));
    el('reName').value=name;
    await saveTrackAPI(name,rweLayout());
    await renderSavedTracks();
    el('reStatus').className='ok'; el('reStatus').textContent='✓ "'+name+'" 저장됨';
  });

  el('rePlay').addEventListener('click', ()=>{
    customLayout=rweLayout();
    try{ localStorage.setItem('rcCustomLayout',JSON.stringify(customLayout)); }catch(e){}
    trackName='raceway-custom'; RWE.open=false; el('re').style.display='none'; startGame();
  });

  // Canvas mouse/touch handlers
  function reDown(cx,cy){
    const w=rc2w(cx,cy); rwePush();
    // Start marker
    if(RWE.start){ const c=rw2c(RWE.start[0],RWE.start[1]); if(Math.hypot(c[0]-cx,c[1]-cy)<11){ RWE.drag={type:'start'}; return; } }
    // Cam marker
    if(RWE.cam){ const c=rw2c(RWE.cam[0],RWE.cam[1]); if(Math.hypot(c[0]-cx,c[1]-cy)<13){ RWE.drag={type:'cam'}; return; } }
    // Control point
    for(let i=0;i<RWE.line.length;i++){
      const c=rw2c(RWE.line[i][0],RWE.line[i][1]);
      if(Math.hypot(c[0]-cx,c[1]-cy)<9){ RWE.sel=i; RWE.drag={type:'pt',i,ox:w[0]-RWE.line[i][0],oz:w[1]-RWE.line[i][1]}; drawRacewayEditor(); return; }
    }
    // Click on line segment → insert point
    { let bi=-1,bd=14;
      for(let i=0;i<RWE.line.length;i++){
        const a=rw2c(RWE.line[i][0],RWE.line[i][1]),b=rw2c(RWE.line[(i+1)%RWE.line.length][0],RWE.line[(i+1)%RWE.line.length][1]);
        const abx=b[0]-a[0],aby=b[1]-a[1],L2=abx*abx+aby*aby||1;
        let t=((cx-a[0])*abx+(cy-a[1])*aby)/L2; t=Math.max(0,Math.min(1,t));
        const d=Math.hypot(cx-(a[0]+abx*t),cy-(a[1]+aby*t));
        if(d<bd){bd=d;bi=i;}
      }
      if(bi>=0){ RWE.line.splice(bi+1,0,[Math.round(w[0]),Math.round(w[1])]); RWE.sel=bi+1; RWE.drag={type:'pt',i:bi+1,ox:0,oz:0}; drawRacewayEditor(); return; }
    }
    RWE.sel=-1; drawRacewayEditor();
  }

  function reMove(cx,cy){
    if(!RWE.drag)return;
    const w=rc2w(cx,cy);
    if(RWE.drag.type==='start')      RWE.start=[Math.round(w[0]),Math.round(w[1])];
    else if(RWE.drag.type==='cam')   RWE.cam=[Math.round(w[0]),Math.round(w[1])];
    else if(RWE.drag.type==='pt')    RWE.line[RWE.drag.i]=[Math.round(w[0]-RWE.drag.ox),Math.round(w[1]-RWE.drag.oz)];
    drawRacewayEditor();
  }
}

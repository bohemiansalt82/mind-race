"use strict";
// ============================================================
//  TRACK EDITOR (2D top-down layout designer)
// ============================================================
const ED = { open:false, sel:-1, selBar:-1, dragLine:-1, drag:null, pad:[], islands:[], barriers:[], line:[],
  bg:{ img:null, src:null, w:410, h:236, op:0.5 } };
const VX=270, VZ=156;
let edCanvas, edCtx;

function edDefault(){
  ED.pad=[[-205,-118],[205,-118],[205,118],[-205,118]];
  ED.sel=-1; ED.selBar=-1; ED.barriers=[];
  ED.islands=[
    {x:-150,z:-22,rx:26,rz:15,rot:12},{x:-148,z:60,rx:20,rz:14,rot:-8},
    {x:-55,z:-40,rx:32,rz:17,rot:-8},{x:-32,z:56,rx:25,rz:14,rot:10},
    {x:58,z:-36,rx:31,rz:17,rot:8},{x:68,z:58,rx:23,rz:14,rot:-10},
    {x:140,z:-20,rx:26,rz:18,rot:0},{x:140,z:66,rx:18,rz:12,rot:0}
  ];
  ED.line=[[-185,-95],[185,-95],[193,0],[185,95],[-185,95],[-193,0]];
  ED.start=[-185,-95];
  ED.startDir=1;
  ED.cam=[0,138];
}

function edLayout(){ return JSON.parse(JSON.stringify({pad:ED.pad,islands:ED.islands,barriers:ED.barriers,line:ED.line,start:ED.start,startDir:ED.startDir,cam:ED.cam})); }

// undo stack
let edUndo=[];
function edPush(){ const s=JSON.stringify(edLayout()); if(edUndo[edUndo.length-1]!==s){ edUndo.push(s); if(edUndo.length>80)edUndo.shift(); } }
function edUndoAction(){ if(!edUndo.length) return; const L=JSON.parse(edUndo.pop());
  ED.pad=L.pad; ED.islands=L.islands; ED.barriers=L.barriers; ED.line=L.line; ED.start=L.start; ED.startDir=L.startDir||1; ED.cam=L.cam; ED.sel=-1; ED.selBar=-1; edSyncSel(); drawEditor(); }

// named track library (localStorage) — declared in ui.js: loadTracks, saveTracks
function w2c(x,z){ return [ (x+VX)/(2*VX)*edCanvas.width, (z+VZ)/(2*VZ)*edCanvas.height ]; }
function c2w(cx,cz){ return [ cx/edCanvas.width*2*VX - VX, cz/edCanvas.height*2*VZ - VZ ]; }

function openEditor(layout, name){
  const loadL = L => { ED.pad = L.pad || (L.hx? [[-L.hx,-L.hz],[L.hx,-L.hz],[L.hx,L.hz],[-L.hx,L.hz]] : [[-205,-118],[205,-118],[205,118],[-205,118]]);
    ED.islands=L.islands; ED.line=L.line; ED.barriers=L.barriers||[];
    ED.start = L.start || (L.line && L.line[0] ? L.line[0].slice() : [-185,-95]);
    ED.startDir = L.startDir || 1;
    ED.cam = L.cam || [0,138];
    ED.cam = [ Math.max(-VX+16, Math.min(VX-16, ED.cam[0])), Math.max(-VZ+16, Math.min(VZ-16, ED.cam[1])) ]; };
  try{
    if(layout){ loadL(JSON.parse(JSON.stringify(layout))); }
    else { const s=localStorage.getItem('rcCustomLayout'); if(s) loadL(JSON.parse(s)); else edDefault(); }
  } catch(e){ edDefault(); }
  if(!ED.islands||!ED.islands.length||!ED.pad||ED.pad.length<3) edDefault();
  edUndo=[];
  if(el('edName')) el('edName').value = name || '';
  ED.bg.img=null;
  try{ const bs=localStorage.getItem('rcEditorBg'); if(bs){ const B=JSON.parse(bs);
    ED.bg.w=B.w; ED.bg.h=B.h; ED.bg.op=B.op; ED.bg.src=B.src||null;
    if(B.src){ const img=new Image();
      img.onload=()=>{ ED.bg.img=img; drawEditor(); };
      img.onerror=()=>{ ED.bg.img=null; ED.bg.src=null; };
      img.src=B.src; } } }
  catch(e){}
  ED.open=true; ED.sel=-1; ED.selBar=-1;
  el('intro').style.display='none'; el('editor').style.display='flex';
  edSyncSel(); edSyncBg(); drawEditor();
}

function closeEditor(){ ED.open=false; el('editor').style.display='none'; el('intro').style.display='flex'; }

function edEllDist(o,x,z){const r=o.rot*Math.PI/180,ca=Math.cos(-r),sa=Math.sin(-r);
  const dx=x-o.x,dz=z-o.z,lx=dx*ca-dz*sa,lz=dx*sa+dz*ca;const rho=Math.hypot(lx/o.rx,lz/o.rz);
  const k=Math.hypot(lx,lz);if(k<1e-6)return -Math.min(o.rx,o.rz);return k*(1-1/rho);}
function edGap(a,b){let m=1e9;for(let t=0;t<48;t++){const th=t/48*Math.PI*2,r=a.rot*Math.PI/180;
  const lx=a.rx*Math.cos(th),lz=a.rz*Math.sin(th);const x=a.x+lx*Math.cos(r)-lz*Math.sin(r),z=a.z+lx*Math.sin(r)+lz*Math.cos(r);
  const d=edEllDist(b,x,z);if(d<m)m=d;}return m;}

// world positions of the resize/rotate handles for an island
function edHandles(o){const r=o.rot*Math.PI/180, c=Math.cos(r), s=Math.sin(r);
  return {
    rx:[o.x + o.rx*c,        o.z + o.rx*s],
    rz:[o.x - o.rz*s,        o.z + o.rz*c],
    rot:[o.x - (o.rz+16)*s,  o.z + (o.rz+16)*c]
  };
}

function drawEditor(){
  const ctx=edCtx,W=edCanvas.width,H=edCanvas.height;
  ctx.fillStyle='#2f4a26'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#24292f'; ctx.beginPath();
  ED.pad.forEach((p,i)=>{const c=w2c(p[0],p[1]); i?ctx.lineTo(c[0],c[1]):ctx.moveTo(c[0],c[1]);}); ctx.closePath(); ctx.fill();
  const sx=W/(2*VX), sz=H/(2*VZ);
  const sm=catmullLoop(ED.line,12);
  ctx.strokeStyle='rgba(255,255,255,.8)'; ctx.lineWidth=2; ctx.setLineDash([8,7]); ctx.beginPath();
  sm.forEach((p,i)=>{const c=w2c(p[0],p[1]); i?ctx.lineTo(c[0],c[1]):ctx.moveTo(c[0],c[1]);}); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  ED.islands.forEach((o,i)=>{const c=w2c(o.x,o.z); ctx.save(); ctx.translate(c[0],c[1]); ctx.rotate(o.rot*Math.PI/180);
    const half=(o.type==='half'), a0=0, a1=half?Math.PI:Math.PI*2;
    ctx.beginPath(); ctx.ellipse(0,0,o.rx*sx,o.rz*sz,0,a0,a1); if(half)ctx.closePath(); ctx.fillStyle='#3c5e2b'; ctx.fill();
    ctx.lineWidth=4; ctx.strokeStyle='#cf3b3b'; ctx.beginPath(); ctx.ellipse(0,0,(o.rx+1)*sx,(o.rz+1)*sz,0,a0,a1); ctx.stroke();
    ctx.lineWidth=2; ctx.strokeStyle='#eee'; ctx.beginPath(); ctx.ellipse(0,0,(o.rx+2.2)*sx,(o.rz+2.2)*sz,0,a0,a1); ctx.stroke();
    if(i===ED.sel){ctx.lineWidth=2;ctx.strokeStyle='#4ea6ff';ctx.setLineDash([5,4]);ctx.beginPath();ctx.ellipse(0,0,(o.rx+5)*sx,(o.rz+5)*sz,0,a0,a1);if(half)ctx.closePath();ctx.stroke();ctx.setLineDash([]);}
    ctx.restore();});
  ED.barriers.forEach((b,i)=>{const a=w2c(b.x1,b.z1), c=w2c(b.x2,b.z2);
    ctx.lineCap='round'; ctx.lineWidth=8; ctx.strokeStyle=(i===ED.selBar)?'#ff7a5c':'#c63a3a';
    ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(c[0],c[1]); ctx.stroke(); ctx.lineCap='butt';
    ctx.fillStyle='#fff'; for(const e of [a,c]){ ctx.fillRect(e[0]-5,e[1]-5,10,10); ctx.lineWidth=1.5; ctx.strokeStyle='#0c1118'; ctx.strokeRect(e[0]-5,e[1]-5,10,10);} });
  ED.pad.forEach(p=>{const c=w2c(p[0],p[1]); ctx.fillStyle='#bcd2ee';
    ctx.fillRect(c[0]-6,c[1]-6,12,12); ctx.lineWidth=1.5; ctx.strokeStyle='#0c1118'; ctx.strokeRect(c[0]-6,c[1]-6,12,12);});
  ED.line.forEach((p,i)=>{const c=w2c(p[0],p[1]); ctx.fillStyle='#9fd6ff';
    ctx.beginPath(); ctx.arc(c[0],c[1],5,0,Math.PI*2); ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle='#0c1118'; ctx.stroke();});
  if(ED.start){
    let bi=0,bd=1e18; for(let i=0;i<sm.length;i++){const dx=sm[i][0]-ED.start[0],dz=sm[i][1]-ED.start[1];const d=dx*dx+dz*dz;if(d<bd){bd=d;bi=i;}}
    const sp=sm[bi], nx=sm[(bi+1)%sm.length], ang=Math.atan2(nx[0]-sp[0], nx[1]-sp[1]);
    const cc=w2c(sp[0],sp[1]);
    ctx.save(); ctx.translate(cc[0],cc[1]); ctx.rotate(-ang);
    ctx.fillStyle='#ffffff'; ctx.fillRect(-1.5,-11,3,22);
    ctx.restore();
    { const dir=(ED.startDir||1), tx=nx[0]-sp[0], tz=nx[1]-sp[1], tl=Math.hypot(tx,tz)||1;
      const p0=w2c(sp[0],sp[1]), p1=w2c(sp[0]+dir*tx/tl*26, sp[1]+dir*tz/tl*26);
      ctx.strokeStyle='#ffd13b'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.stroke();
      const aa=Math.atan2(p1[1]-p0[1],p1[0]-p0[0]); ctx.fillStyle='#ffd13b'; ctx.beginPath(); ctx.moveTo(p1[0],p1[1]);
      ctx.lineTo(p1[0]-9*Math.cos(aa-0.42),p1[1]-9*Math.sin(aa-0.42));
      ctx.lineTo(p1[0]-9*Math.cos(aa+0.42),p1[1]-9*Math.sin(aa+0.42)); ctx.closePath(); ctx.fill(); }
    const sc=w2c(ED.start[0],ED.start[1]); ctx.fillStyle='#ffd13b';
    ctx.beginPath(); ctx.arc(sc[0],sc[1],8,0,Math.PI*2); ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#0c1118'; ctx.stroke();
    ctx.fillStyle='#0c1118'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('S',sc[0],sc[1]);
  }
  if(ED.cam){ const cc=w2c(ED.cam[0],ED.cam[1]);
    let px=0,pz=0; ED.pad.forEach(p=>{px+=p[0];pz+=p[1];}); px/=ED.pad.length; pz/=ED.pad.length;
    const tc=w2c(px,pz);
    ctx.strokeStyle='rgba(52,208,224,.55)'; ctx.lineWidth=1.5; ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.moveTo(cc[0],cc[1]); ctx.lineTo(tc[0],tc[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#34d0e0'; ctx.beginPath(); ctx.arc(cc[0],cc[1],11,0,Math.PI*2); ctx.fill();
    ctx.lineWidth=2; ctx.strokeStyle='#0c1118'; ctx.stroke();
    ctx.fillStyle='#0c1118'; ctx.beginPath(); ctx.arc(cc[0],cc[1],4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#34d0e0'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('조정석',cc[0],cc[1]+20); }
  if(ED.sel>=0 && ED.islands[ED.sel]){
    const o=ED.islands[ED.sel], h=edHandles(o), oc=w2c(o.x,o.z);
    const hw=w2c(h.rx[0],h.rx[1]), hh=w2c(h.rz[0],h.rz[1]), hr=w2c(h.rot[0],h.rot[1]);
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(255,255,255,.5)';
    ctx.beginPath(); ctx.moveTo(oc[0],oc[1]); ctx.lineTo(hr[0],hr[1]); ctx.stroke();
    ctx.fillStyle='#4ea6ff'; ctx.fillRect(hw[0]-6,hw[1]-6,12,12); ctx.strokeStyle='#0c1118'; ctx.strokeRect(hw[0]-6,hw[1]-6,12,12);
    ctx.fillStyle='#46c46a'; ctx.fillRect(hh[0]-6,hh[1]-6,12,12); ctx.strokeRect(hh[0]-6,hh[1]-6,12,12);
    ctx.fillStyle='#ff9a2e'; ctx.beginPath(); ctx.arc(hr[0],hr[1],7,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }
  if(ED.bg.img && ED.bg.img.complete && ED.bg.img.naturalWidth>0){
    try{
      const a=w2c(-ED.bg.w/2,-ED.bg.h/2), b=w2c(ED.bg.w/2,ED.bg.h/2);
      ctx.globalAlpha=ED.bg.op;
      ctx.drawImage(ED.bg.img, a[0],a[1], b[0]-a[0], b[1]-a[1]);
      ctx.globalAlpha=1;
    }catch(e){ ctx.globalAlpha=1; }
  }
  validateEditor();
}

function validateEditor(){
  const isl=ED.islands, road=26, half=13, msgs=[];
  let minGap=1e9; for(let i=0;i<isl.length;i++)for(let j=i+1;j<isl.length;j++){const g=edGap(isl[i],isl[j]);if(g<minGap)minGap=g;}
  if(isl.length>=2 && minGap<road) msgs.push('섬 사이 통로가 좁음('+Math.round(minGap)+'/'+road+')');
  let minB=1e9; for(const o of isl){const reach=Math.max(o.rx,o.rz);
    const signed=(pointInPoly(ED.pad,o.x,o.z)?1:-1)*nearestOnLoop(ED.pad,o.x,o.z).d; const clr=signed-reach; if(clr<minB)minB=clr;}
  if(isl.length && minB<road) msgs.push('섬이 경계에 너무 가까움('+Math.round(minB)+'/'+road+')');
  let minL=1e9; for(let s=0;s<ED.line.length;s++){const A=ED.line[s],B=ED.line[(s+1)%ED.line.length];for(let t=0;t<=16;t++){const x=A[0]+(B[0]-A[0])*t/16,z=A[1]+(B[1]-A[1])*t/16;for(const o of isl){const d=edEllDist(o,x,z);if(d<minL)minL=d;}}}
  if(isl.length && minL<half) msgs.push('레이싱 라인이 섬에 닿음');
  let lob=0; for(const p of ED.line) if(!pointInPoly(ED.pad,p[0],p[1])) lob++;
  if(lob) msgs.push('레이싱 라인이 패드 밖으로 나감');
  const st=el('edStatus');
  if(msgs.length){ st.className='warn'; st.innerHTML='⚠ '+msgs.join('<br>⚠ '); }
  else { st.className='ok'; st.innerHTML='✓ 주행 가능 — 통로·턱·라인 모두 정상'; }
}

function edSyncSel(){ const o=ED.islands[ED.sel];
  if(o){ el('edRx').value=o.rx;el('edRz').value=o.rz;el('edRot').value=o.rot;
    el('vRx').textContent=o.rx;el('vRz').textContent=o.rz;el('vRot').textContent=o.rot+'°'; }
  else { el('vRx').textContent='—';el('vRz').textContent='—';el('vRot').textContent='—'; } }

function edSyncBg(){ el('edBgW').value=ED.bg.w; el('edBgH').value=ED.bg.h; el('edBgOp').value=Math.round(ED.bg.op*100);
  el('vBgW').textContent=ED.bg.w; el('vBgH').textContent=ED.bg.h; el('vBgOp').textContent=Math.round(ED.bg.op*100)+'%'; }

function edBgSave(){ try{ localStorage.setItem('rcEditorBg', JSON.stringify({src:ED.bg.src,w:ED.bg.w,h:ED.bg.h,op:ED.bg.op})); }catch(e){} }

function edDeleteSelected(){
  if(ED.selBar<0 && ED.sel<0) return;
  edPush();
  if(ED.selBar>=0){ ED.barriers.splice(ED.selBar,1); ED.selBar=-1; }
  else if(ED.sel>=0){ ED.islands.splice(ED.sel,1); ED.sel=-1; }
  edSyncSel(); drawEditor();
}

function edMouse(e){ const r=edCanvas.getBoundingClientRect();
  return [ (e.clientX-r.left)*edCanvas.width/r.width, (e.clientY-r.top)*edCanvas.height/r.height ]; }

function wireEditor(){
  edCanvas=el('edCanvas'); edCtx=edCanvas.getContext('2d');
  const _pt=ev=>{ const r=edCanvas.getBoundingClientRect(); if(!r.width||!r.height) return null;
    const t=(ev.touches&&ev.touches[0])||(ev.changedTouches&&ev.changedTouches[0])||ev;
    return [ (t.clientX-r.left)*edCanvas.width/r.width, (t.clientY-r.top)*edCanvas.height/r.height ]; };
  const _down=ev=>{ const p=_pt(ev); if(!p) return; if(ev.cancelable) ev.preventDefault();
    const d=el('edDbg'); if(d) d.textContent='● '+Math.round(p[0])+','+Math.round(p[1]); edCanvasDown(p[0],p[1]); };
  const _move=ev=>{ if(ED.dragLine<0 && !ED.drag) return; const p=_pt(ev); if(!p) return; if(ev.cancelable) ev.preventDefault(); edCanvasMove(p[0],p[1]); };
  const _up=()=>{ ED.dragLine=-1; ED.drag=null; };
  edCanvas.addEventListener('mousedown', _down);
  edCanvas.addEventListener('touchstart', _down, {passive:false});
  window.addEventListener('mousemove', _move);
  window.addEventListener('touchmove', _move, {passive:false});
  window.addEventListener('mouseup', _up);
  window.addEventListener('touchend', _up);
  try{
  el('editBtn').addEventListener('click', ()=>openEditor());
  el('edClose').addEventListener('click', closeEditor);
  el('edReset').addEventListener('click', ()=>{ edDefault(); edSyncSel(); drawEditor(); });
  el('edAdd').addEventListener('click', ()=>{ edPush(); ED.islands.push({x:0,z:0,rx:24,rz:14,rot:0}); ED.sel=ED.islands.length-1; ED.selBar=-1; edSyncSel(); drawEditor(); });
  el('edAddHalf').addEventListener('click', ()=>{ edPush(); ED.islands.push({type:'half',x:0,z:0,rx:28,rz:18,rot:0}); ED.sel=ED.islands.length-1; ED.selBar=-1; edSyncSel(); drawEditor(); });
  el('edBar').addEventListener('click', ()=>{ edPush(); ED.barriers.push({x1:-34,z1:0,x2:34,z2:0}); ED.selBar=ED.barriers.length-1; ED.sel=-1; edSyncSel(); drawEditor(); });
  el('edDel').addEventListener('click', edDeleteSelected);
  window.addEventListener('keydown', e=>{
    if(!ED.open) return;
    if(e.target && e.target.id==='edName') return;
    if(e.code==='Delete' || e.code==='Backspace'){ e.preventDefault(); edDeleteSelected(); }
    else if((e.ctrlKey||e.metaKey) && e.code==='KeyZ'){ e.preventDefault(); edUndoAction(); }
  });
  el('edRx').addEventListener('input',e=>{ if(ED.islands[ED.sel]){ED.islands[ED.sel].rx=+e.target.value;el('vRx').textContent=e.target.value;drawEditor();}});
  el('edRz').addEventListener('input',e=>{ if(ED.islands[ED.sel]){ED.islands[ED.sel].rz=+e.target.value;el('vRz').textContent=e.target.value;drawEditor();}});
  el('edRot').addEventListener('input',e=>{ if(ED.islands[ED.sel]){ED.islands[ED.sel].rot=+e.target.value;el('vRot').textContent=e.target.value+'°';drawEditor();}});
  ['edRx','edRz','edRot'].forEach(id=>el(id).addEventListener('mousedown',()=>{ if(ED.sel>=0) edPush(); }));
  el('edUndo').addEventListener('click', edUndoAction);
  el('edDir').addEventListener('click', ()=>{ edPush(); ED.startDir=(ED.startDir===-1)?1:-1; drawEditor(); });
  el('edSave').addEventListener('click', ()=>{
    const name=(el('edName').value||'').trim() || ('내 트랙 '+(loadTracks().length+1));
    el('edName').value=name;
    const arr=loadTracks(); const idx=arr.findIndex(t=>t.name===name); const entry={name, layout:edLayout()};
    if(idx>=0) arr[idx]=entry; else arr.push(entry); saveTracks(arr);
    try{ localStorage.setItem('rcCustomLayout', JSON.stringify(edLayout())); }catch(e){}
    renderSavedTracks(); el('edStatus').className='ok'; el('edStatus').textContent='✓ "'+name+'" 저장됨 (메인 목록에서 선택 가능)';
  });
  el('edBgFile').addEventListener('change', e=>{ const f=e.target.files&&e.target.files[0]; if(!f) return;
    const rd=new FileReader(); rd.onload=()=>{ const img=new Image(); img.onload=()=>{
      ED.bg.img=img; ED.bg.src=rd.result; ED.bg.h=Math.round(ED.bg.w*img.height/img.width);
      edSyncBg(); edBgSave(); drawEditor(); }; img.src=rd.result; }; rd.readAsDataURL(f); });
  el('edBgW').addEventListener('input',e=>{ ED.bg.w=+e.target.value; el('vBgW').textContent=e.target.value;
    if(ED.bg.img) ED.bg.h=Math.round(ED.bg.w*ED.bg.img.height/ED.bg.img.width), edSyncBg(); edBgSave(); drawEditor();});
  el('edBgH').addEventListener('input',e=>{ ED.bg.h=+e.target.value; el('vBgH').textContent=e.target.value; edBgSave(); drawEditor();});
  el('edBgOp').addEventListener('input',e=>{ ED.bg.op=(+e.target.value)/100; el('vBgOp').textContent=e.target.value+'%'; edBgSave(); drawEditor();});
  el('edBgClear').addEventListener('click', ()=>{ ED.bg.img=null; ED.bg.src=null; edBgSave(); drawEditor(); });
  el('edExport').addEventListener('click', ()=>{ const s=JSON.stringify(edLayout());
    try{ navigator.clipboard.writeText(s); el('edStatus').className='ok'; el('edStatus').textContent='✓ 레이아웃 JSON을 클립보드에 복사했습니다'; }
    catch(e){ window.prompt('레이아웃 JSON (복사하세요):', s); } });
  el('edPlay').addEventListener('click', ()=>{ customLayout=edLayout();
    try{ localStorage.setItem('rcCustomLayout', JSON.stringify(customLayout)); }catch(e){}
    trackName='custom'; ED.open=false; el('editor').style.display='none'; startGame(); });
  } catch(_e){ const d=el('edDbg'); if(d) d.textContent='UI 배선 오류: '+_e.message; }

  function edCanvasDown(cx,cy){ const w=c2w(cx,cy);
    edPush();
    if(ED.start){ const c=w2c(ED.start[0],ED.start[1]); if(Math.hypot(c[0]-cx,c[1]-cy)<11){ ED.drag={type:'start'}; return; } }
    if(ED.cam){ const c=w2c(ED.cam[0],ED.cam[1]); if(Math.hypot(c[0]-cx,c[1]-cy)<11){ ED.drag={type:'cam'}; return; } }
    if(ED.sel>=0 && ED.islands[ED.sel]){ const h=edHandles(ED.islands[ED.sel]);
      for(const t of ['rx','rz','rot']){ const c=w2c(h[t][0],h[t][1]); if(Math.hypot(c[0]-cx,c[1]-cy)<11){ ED.drag={type:t,i:ED.sel}; return; } } }
    for(let i=0;i<ED.pad.length;i++){const c=w2c(ED.pad[i][0],ED.pad[i][1]); if(Math.hypot(c[0]-cx,c[1]-cy)<10){ ED.drag={type:'pad',i}; return; } }
    for(let i=ED.barriers.length-1;i>=0;i--){const b=ED.barriers[i];const a=w2c(b.x1,b.z1),c=w2c(b.x2,b.z2);
      if(Math.hypot(a[0]-cx,a[1]-cy)<9){ED.selBar=i;ED.sel=-1;ED.drag={type:'bar_a',i};edSyncSel();drawEditor();return;}
      if(Math.hypot(c[0]-cx,c[1]-cy)<9){ED.selBar=i;ED.sel=-1;ED.drag={type:'bar_b',i};edSyncSel();drawEditor();return;}}
    for(let i=0;i<ED.line.length;i++){const c=w2c(ED.line[i][0],ED.line[i][1]); if(Math.hypot(c[0]-cx,c[1]-cy)<10){ED.dragLine=i;return;}}
    { let bi=-1,bd=12; for(let i=0;i<ED.line.length;i++){const a=w2c(ED.line[i][0],ED.line[i][1]),b2=w2c(ED.line[(i+1)%ED.line.length][0],ED.line[(i+1)%ED.line.length][1]);
        const abx=b2[0]-a[0],aby=b2[1]-a[1],L2=abx*abx+aby*aby||1; let t=((cx-a[0])*abx+(cy-a[1])*aby)/L2; t=Math.max(0,Math.min(1,t));
        const d=Math.hypot(cx-(a[0]+abx*t),cy-(a[1]+aby*t)); if(d<bd){bd=d;bi=i;} }
      if(bi>=0){ ED.line.splice(bi+1,0,[Math.round(w[0]),Math.round(w[1])]); ED.dragLine=bi+1; drawEditor(); return; } }
    for(let i=ED.islands.length-1;i>=0;i--){const o=ED.islands[i];const rot=o.rot*Math.PI/180,ca=Math.cos(-rot),sa=Math.sin(-rot);
      const dx=w[0]-o.x,dz=w[1]-o.z,lx=dx*ca-dz*sa,lz=dx*sa+dz*ca;
      if(Math.hypot(lx/o.rx,lz/o.rz)<1){ED.sel=i;ED.selBar=-1;ED.drag={type:'move',i,ox:w[0]-o.x,oz:w[1]-o.z};edSyncSel();drawEditor();return;}}
    for(let i=ED.barriers.length-1;i>=0;i--){const b=ED.barriers[i];const a=w2c(b.x1,b.z1),c=w2c(b.x2,b.z2);
      const abx=c[0]-a[0],aby=c[1]-a[1],L2=abx*abx+aby*aby||1;let t=((cx-a[0])*abx+(cy-a[1])*aby)/L2;t=Math.max(0,Math.min(1,t));
      if(Math.hypot(cx-(a[0]+abx*t),cy-(a[1]+aby*t))<8){ED.selBar=i;ED.sel=-1;ED.drag={type:'bar_move',i,ox:w[0],oz:w[1]};edSyncSel();drawEditor();return;}}
    { let bi=-1,bd=10; for(let i=0;i<ED.pad.length;i++){const a=w2c(ED.pad[i][0],ED.pad[i][1]),b2=w2c(ED.pad[(i+1)%ED.pad.length][0],ED.pad[(i+1)%ED.pad.length][1]);
        const abx=b2[0]-a[0],aby=b2[1]-a[1],L2=abx*abx+aby*aby||1; let t=((cx-a[0])*abx+(cy-a[1])*aby)/L2; t=Math.max(0,Math.min(1,t));
        const d=Math.hypot(cx-(a[0]+abx*t),cy-(a[1]+aby*t)); if(d<bd){bd=d;bi=i;} }
      if(bi>=0){ ED.pad.splice(bi+1,0,[Math.round(w[0]),Math.round(w[1])]); ED.drag={type:'pad',i:bi+1}; drawEditor(); return; } }
    ED.sel=-1; ED.selBar=-1; edSyncSel(); drawEditor(); }

  function edCanvasMove(cx,cy){ if(ED.dragLine<0 && !ED.drag) return; const w=c2w(cx,cy);
    if(ED.dragLine>=0){ ED.line[ED.dragLine]=[Math.round(w[0]),Math.round(w[1])]; drawEditor(); return; }
    const ty=ED.drag.type;
    if(ty==='start'){ ED.start=[Math.round(w[0]),Math.round(w[1])]; }
    else if(ty==='cam'){ ED.cam=[Math.round(w[0]),Math.round(w[1])]; }
    else if(ty==='pad'){ ED.pad[ED.drag.i]=[Math.round(w[0]),Math.round(w[1])]; }
    else if(ty==='bar_a'){ const b=ED.barriers[ED.drag.i]; b.x1=Math.round(w[0]); b.z1=Math.round(w[1]); }
    else if(ty==='bar_b'){ const b=ED.barriers[ED.drag.i]; b.x2=Math.round(w[0]); b.z2=Math.round(w[1]); }
    else if(ty==='bar_move'){ const b=ED.barriers[ED.drag.i]; const dx=w[0]-ED.drag.ox,dz=w[1]-ED.drag.oz;
      b.x1=Math.round(b.x1+dx); b.z1=Math.round(b.z1+dz); b.x2=Math.round(b.x2+dx); b.z2=Math.round(b.z2+dz); ED.drag.ox=w[0]; ED.drag.oz=w[1]; }
    else { const o=ED.islands[ED.drag.i], r=o.rot*Math.PI/180, vx=w[0]-o.x, vz=w[1]-o.z;
      if(ty==='move'){ o.x=Math.round(w[0]-ED.drag.ox); o.z=Math.round(w[1]-ED.drag.oz); }
      else if(ty==='rx'){ o.rx=Math.max(6, Math.min(70, Math.round(vx*Math.cos(r)+vz*Math.sin(r)))); }
      else if(ty==='rz'){ o.rz=Math.max(5, Math.min(50, Math.round(-vx*Math.sin(r)+vz*Math.cos(r)))); }
      else if(ty==='rot'){ o.rot=Math.round(Math.atan2(-vx, vz)*180/Math.PI); }
      edSyncSel();
    }
    drawEditor(); }
}

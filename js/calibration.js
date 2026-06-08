"use strict";
// ============================================================
//  CONTROLLER CALIBRATION WIZARD  (receiver-style)
// ============================================================
function wireCalibration(){
  const CSTEPS = [
    {key:'neutral', title:'① 중립',           hint:'스틱/트리거에서 손을 떼고 중립 상태로 두세요.'},
    {key:'full',    title:'② 풀 스로틀 (가속)', hint:'스로틀을 최대 가속까지 당기고 유지하세요.'},
    {key:'brake',   title:'③ 풀 브레이크',      hint:'브레이크를 최대까지 밀고 유지하세요.'},
    {key:'left',    title:'④ 좌 핸들 끝',        hint:'핸들을 왼쪽 끝까지 돌리고 유지하세요.'},
    {key:'right',   title:'⑤ 우 핸들 끝',        hint:'핸들을 오른쪽 끝까지 돌리고 유지하세요.'},
  ];
  let current=0, captures={}, calib=null, open=false;
  const stepsEl=el('cSteps'), liveEl=el('cLive'), statusEl=el('cStatus');

  function updateBadge(){
    const b=el('calibBadge');
    if (VRC.cal){ b.textContent='설정됨'; b.className='badge ok'; }
    else { b.textContent='미설정'; b.className='badge'; }
  }
  updateBadge();

  function buildSteps(){
    stepsEl.innerHTML='';
    CSTEPS.forEach((s,i)=>{
      const div=document.createElement('div');
      div.className='cstep'+(i===current?' active':'')+(captures[s.key]?' done':'');
      const cap=captures[s.key]?`<div class="ccap">기록됨: [${captures[s.key].map(v=>v.toFixed(3)).join(', ')}]</div>`:'';
      div.innerHTML=`<div class="chead"><h4>${s.title}</h4>
        <button data-i="${i}" ${i===current?'':'disabled'}>${captures[s.key]?'다시':'설정 완료'}</button></div>
        <div class="chint">${s.hint}</div>${cap}`;
      stepsEl.appendChild(div);
    });
    stepsEl.querySelectorAll('button[data-i]').forEach(b=>b.onclick=()=>capture(+b.dataset.i));
  }

  function capture(i){
    const pad=VRC.findPad();
    if(!pad){ statusEl.innerHTML='<span class="err">동글이 안 보입니다. 스틱을 한 번 움직여 보세요.</span>'; return; }
    captures[CSTEPS[i].key]=[...pad.axes];
    if(i===current && current<CSTEPS.length-1) current++;
    buildSteps();
    if(Object.keys(captures).length===CSTEPS.length) compute();
  }

  function argmax(a,b,excl){ let bi=-1,bv=-1; for(let i=0;i<a.length;i++){ if(i===excl)continue; const d=Math.abs((a[i]||0)-(b[i]||0)); if(d>bv){bv=d;bi=i;} } return bi; }

  function compute(){
    const {neutral,full,brake,left,right}=captures;
    const steerAxis=argmax(left,right,-1);
    const throttleAxis=argmax(full,brake,steerAxis);
    calib={ steerAxis, throttleAxis, steerReverse: el('cReverse').checked,
      steer:{center:neutral[steerAxis], left:left[steerAxis], right:right[steerAxis]},
      throttle:{center:neutral[throttleAxis], full:full[throttleAxis], brake:brake[throttleAxis]} };
    el('cResult').style.display='block';
    el('cSave').disabled=false;
    statusEl.innerHTML=`<span class="ok">완료!</span> 조향 = axis ${steerAxis}, 스로틀 = axis ${throttleAxis}. 아래에서 확인 후 저장하세요.`;
  }

  function setGauge(name,val){
    el('gv'+name).textContent=val.toFixed(2);
    const pct=((val+1)/2)*100, l=Math.min(50,pct), w=Math.abs(pct-50);
    const f=el('gf'+name); f.style.left=l+'%'; f.style.width=w+'%';
  }

  function render(){
    if(open){
      const pad=VRC.findPad();
      if(pad){
        if(statusEl.textContent.includes('대기 중')) statusEl.innerHTML='<span class="ok">동글 인식됨.</span> 단계별로 진행하세요.';
        liveEl.innerHTML=pad.axes.map((a,i)=>{ const pct=((a+1)/2)*100, l=Math.min(50,pct), w=Math.abs(pct-50);
          return `<div class="crow"><span class="cname">axis ${i}</span><div class="ctrack"><div class="cctr"></div><div class="cfill" style="left:${l}%;width:${w}%"></div></div><span>${a.toFixed(3)}</span></div>`; }).join('');
        if(calib){
          let s=VRC.mapSteer(pad.axes[calib.steerAxis]??0, calib.steer); if(calib.steerReverse) s=-s;
          const t=VRC.mapThrottle(pad.axes[calib.throttleAxis]??0, calib.throttle);
          setGauge('Steer', s); setGauge('Throttle', t);
        }
      }
    }
    requestAnimationFrame(render);
  }

  function reset(msg){
    current=0; captures={}; calib=null;
    el('cReverse').checked=false; el('cResult').style.display='none'; el('cSave').disabled=true;
    statusEl.textContent=msg; buildSteps();
  }

  el('calibBtn').addEventListener('click', ()=>{ reset('동글 인식 대기 중…'); el('calib').style.display='flex'; open=true; });
  el('cClose').addEventListener('click', ()=>{ open=false; el('calib').style.display='none'; });
  el('cRestart').addEventListener('click', ()=>reset('처음부터 — ① 중립부터 다시 진행하세요.'));
  el('cReverse').addEventListener('change', ()=>{ if(calib) calib.steerReverse=el('cReverse').checked; });
  el('cSave').addEventListener('click', async ()=>{
    if(!calib) return;
    calib.steerReverse=el('cReverse').checked;
    await saveCalibrationAPI(calib);
    VRC.cal = calib; updateBadge();
    open=false; el('calib').style.display='none';
  });

  buildSteps();
  requestAnimationFrame(render);
}

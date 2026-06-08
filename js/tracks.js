"use strict";
// ============================================================
//  TRACK DEFINITIONS
// ============================================================
function buildTrack(name){
  if (track && track.group) scene.remove(track.group);
  track = name==='offroad'         ? makeOffroad()
        : name==='raceway'         ? makeRaceway()
        : name==='custom'          ? makeCustom(customLayout)
        : name==='raceway-custom'  ? makeRacewayCustom(customLayout)
        : makeCircuit();
  scene.add(track.group);
  resetCar();
}

// ---- ON-ROAD CIRCUIT (asphalt pad + grass islands) ----
function makeCircuit(){
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700,520),
    new THREE.MeshStandardMaterial({color:0x33502c, roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-0.05; ground.receiveShadow=true; g.add(ground);

  const HX=205, HZ=118;
  const bound=[[-HX,-HZ],[HX,-HZ],[HX,HZ],[-HX,HZ]];
  let cxc=0,czc=0; bound.forEach(p=>{cxc+=p[0];czc+=p[1];}); cxc/=4; czc/=4;
  const pad=fillPolygon(bound, 0x262b30); pad.position.y=0.0; pad.receiveShadow=true; g.add(pad);

  const islands=[
    {x:-150,z:-22,rx:26,rz:15,rot:12}, {x:-148,z:60,rx:20,rz:14,rot:-8},
    {x:-55, z:-40,rx:32,rz:17,rot:-8}, {x:-32, z:56,rx:25,rz:14,rot:10},
    {x:58,  z:-36,rx:31,rz:17,rot:8},  {x:68,  z:58,rx:23,rz:14,rot:-10},
    {x:140, z:-20,rx:26,rz:18,rot:0},  {x:140, z:66,rx:18,rz:12,rot:0}
  ];
  islands.forEach(o=>addGrassIsland(g,o));

  const line=[[-185,-95],[185,-95],[193,0],[185,95],[-185,95],[-193,0]];
  const loop=catmullLoop(line, 16);
  paintDashedLine(g, loop);
  paintStartLine(g, loop[0], loop[1], 24);
  const cps=sampleCheckpoints(loop, 6, 18);
  g.add(wallRibbon(bound, 0, 1, CAR_H*0.5, 0x39424f));

  const startDir=Math.atan2(loop[1][0]-loop[0][0], loop[1][1]-loop[0][1]);
  return {
    group:g, name:'circuit',
    start:{x:loop[0][0], z:loop[0][1], yaw:startDir},
    checkpoints:cps, loop,
    heightAt(){ return 0; },
    surfaceAt(){ return 'asphalt'; },
    collide(car){ studioCollide(car, bound, cxc, czc, islands); }
  };
}

// ---- CUSTOM TRACK built from the editor layout ----
function makeCustom(L){
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900,640),
    new THREE.MeshStandardMaterial({color:0x33502c, roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-0.05; ground.receiveShadow=true; g.add(ground);
  const bound = (L.pad && L.pad.length>=3) ? L.pad.map(p=>p.slice())
              : (L.hx ? [[-L.hx,-L.hz],[L.hx,-L.hz],[L.hx,L.hz],[-L.hx,L.hz]]
                      : [[-205,-118],[205,-118],[205,118],[-205,118]]);
  let cxc=0,czc=0; bound.forEach(p=>{cxc+=p[0];czc+=p[1];}); cxc/=bound.length; czc/=bound.length;
  const pad=fillPolygon(bound, 0x262b30); pad.position.y=0.0; pad.receiveShadow=true; g.add(pad);
  L.islands.forEach(o=>addGrassIsland(g,o));
  const barriers = L.barriers || [];
  barriers.forEach(b=>{
    const dx=b.x2-b.x1, dz=b.z2-b.z1; const len=Math.hypot(dx,dz)||1;
    const wall=new THREE.Mesh(new THREE.BoxGeometry(2.0, CAR_H*0.7, len),
      new THREE.MeshStandardMaterial({color:0xc63a3a, roughness:.7}));
    wall.position.set((b.x1+b.x2)/2, CAR_H*0.35, (b.z1+b.z2)/2);
    wall.rotation.y = Math.atan2(dx, dz);
    wall.castShadow=true; wall.receiveShadow=true; g.add(wall);
  });
  let loop=catmullLoop(L.line, 16);
  if(L.start){ let bi=0,bd=1e18; for(let i=0;i<loop.length;i++){const dx=loop[i][0]-L.start[0],dz=loop[i][1]-L.start[1];const d=dx*dx+dz*dz;if(d<bd){bd=d;bi=i;}}
    loop=loop.slice(bi).concat(loop.slice(0,bi)); }
  if(L.startDir===-1){ loop=[loop[0]].concat(loop.slice(1).reverse()); }
  paintDashedLine(g, loop);
  paintStartLine(g, loop[0], loop[1], 24);
  const cps=sampleCheckpoints(loop, Math.min(8, Math.max(4, L.line.length)), 18);
  g.add(wallRibbon(bound, 0, 1, CAR_H*0.5, 0x39424f));
  const startDir=Math.atan2(loop[1][0]-loop[0][0], loop[1][1]-loop[0][1]);
  let camPos=null;
  if(L.cam){ let mnx=1e9,mxx=-1e9,mnz=1e9,mxz=-1e9; bound.forEach(p=>{mnx=Math.min(mnx,p[0]);mxx=Math.max(mxx,p[0]);mnz=Math.min(mnz,p[1]);mxz=Math.max(mxz,p[1]);});
    const size=Math.max(mxx-mnx,mxz-mnz); camPos={x:L.cam[0], y:size*0.085, z:L.cam[1]}; }
  return {
    group:g, name:'custom', camPos,
    start:{x:loop[0][0], z:loop[0][1], yaw:startDir},
    checkpoints:cps, loop,
    heightAt(){ return 0; },
    surfaceAt(){ return 'asphalt'; },
    collide(car){ studioCollide(car, bound, cxc, czc, L.islands, barriers); }
  };
}

// ---- KART RACEWAY (technical on-road circuit) ----
function makeRaceway(){
  const g = new THREE.Group();
  const groundMat = new THREE.MeshStandardMaterial({color:0x2c4225, roughness:1});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(520,460), groundMat);
  ground.rotation.x=-Math.PI/2; ground.position.y=-0.01; ground.receiveShadow=true; g.add(ground);

  const loop = wavyLoop(205, 122, [[0.16,4,0.0],[0.12,6,1.2]], 240);
  const roadW = 15.0;
  const road = ribbon(loop, roadW, 0x2b2f36);
  road.position.y=0.02; road.receiveShadow=true; g.add(road);
  const curbIn = ribbonEdge(loop, roadW-2.2, -1, 1.1, 0xcf3b3b);
  const curbOut = ribbonEdge(loop, roadW-2.2, 1, 1.1, 0xe8e8e8);
  curbIn.position.y=0.05; curbOut.position.y=0.05; g.add(curbIn); g.add(curbOut);
  const WALL_H = CAR_H*0.5, wallOff = roadW/2 - 0.2;
  g.add(wallRibbon(loop, wallOff, -1, WALL_H, 0x39424f));
  g.add(wallRibbon(loop, wallOff,  1, WALL_H, 0x39424f));

  const cps = sampleCheckpoints(loop, 6, 9);
  paintStartLine(g, loop[0], loop[1], roadW);
  const startDir = Math.atan2(loop[1][0]-loop[0][0], loop[1][1]-loop[0][1]);
  return {
    group:g, name:'raceway',
    start:{x:loop[0][0], z:loop[0][1], yaw:startDir},
    checkpoints:cps, loop, roadW,
    edgeLimit: roadW/2 - 0.9,
    heightAt(x,z){
      const d=distToLoop(loop,x,z), half=roadW/2;
      if (d>half-2.0 && d<half-0.9) return 0.16;
      return 0;
    },
    surfaceAt(x,z){
      const d=distToLoop(loop,x,z), half=roadW/2;
      if (d < half-2.0) return 'asphalt';
      if (d < half-0.9) return 'curb';
      return 'grass';
    }
  };
}

// ---- OFF-ROAD BUGGY ----
function makeOffroad(){
  const g = new THREE.Group();
  const groundMat = new THREE.MeshStandardMaterial({color:0x4a3a22, roughness:1});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400,400), groundMat);
  ground.rotation.x=-Math.PI/2; ground.position.y=-0.01; ground.receiveShadow=true; g.add(ground);

  const loop = wavyLoop(170, 112, [[0.10,2,1.0],[0.07,3,0.0]], 200);
  const roadW = 51.0;
  const road = ribbon(loop, roadW, 0x6e5333);
  road.position.y=0.02; road.receiveShadow=true; g.add(road);
  const bIn = ribbonEdge(loop, roadW-2.6, -1, 1.4, 0x8a6a3e);
  const bOut = ribbonEdge(loop, roadW-2.6, 1, 1.4, 0x8a6a3e);
  bIn.position.y=0.05; bOut.position.y=0.05; g.add(bIn); g.add(bOut);
  const WALL_H = CAR_H*0.5;
  const wallOff = roadW/2 - 0.2;
  g.add(wallRibbon(loop, wallOff, -1, WALL_H, 0x5e4a2c));
  g.add(wallRibbon(loop, wallOff,  1, WALL_H, 0x5e4a2c));

  const jumps = [];
  for (let i=0;i<loop.length;i+=Math.floor(loop.length/4)){
    jumps.push({i, x:loop[i][0], z:loop[i][1]});
  }
  jumps.forEach(j=>{
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(roadW, 1.4, 4),
      new THREE.MeshStandardMaterial({color:0x5e4a2c, roughness:1}));
    ramp.position.set(j.x, 0.7, j.z); ramp.castShadow=true; ramp.receiveShadow=true;
    g.add(ramp);
  });

  const cps = sampleCheckpoints(loop, 5, 5.5);
  paintStartLine(g, loop[0], loop[1], roadW);
  const startDir = Math.atan2(loop[1][0]-loop[0][0], loop[1][1]-loop[0][1]);

  function heightAt(x,z){
    let h=0;
    for (const j of jumps){
      const d = Math.hypot(x-j.x, z-j.z);
      if (d < 3) h = Math.max(h, (1 - d/3) * 1.3);
    }
    const dc=distToLoop(loop,x,z), half=roadW/2;
    if (dc>half-2.6 && dc<half-0.9) h = Math.max(h, 0.18);
    return h;
  }
  return {
    group:g, name:'offroad',
    start:{x:loop[0][0], z:loop[0][1], yaw:startDir},
    checkpoints:cps, loop, roadW,
    edgeLimit: roadW/2 - 0.9,
    heightAt,
    surfaceAt(x,z){
      const d=distToLoop(loop,x,z), half=roadW/2;
      if (d < half-2.6) return 'dirt';
      if (d < half-0.9) return 'curb';
      return 'grass';
    }
  };
}

// ---- STUDIO TRACK (recreated from reference photo) ----
function makeStudio(){
  const g=new THREE.Group();
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(800,600),
    new THREE.MeshStandardMaterial({color:0x1b2730, roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-0.06; ground.receiveShadow=true; g.add(ground);

  const bound=[ [-72,-60],[130,-60],[130,60],[-112,60],[-130,-12] ];
  let cxc=0,czc=0; bound.forEach(p=>{cxc+=p[0];czc+=p[1];}); cxc/=bound.length; czc/=bound.length;
  const rim=fillPolygon(bound.map(p=>[cxc+(p[0]-cxc)*1.05, czc+(p[1]-czc)*1.05]), 0x1d6fcf);
  rim.position.y=0.0; g.add(rim);
  const pad=fillPolygon(bound, 0x23292f); pad.position.y=0.02; g.add(pad);
  const WALL_H=CAR_H*0.5;
  g.add(wallRibbon(bound, 0, 1, WALL_H, 0x14406e));

  const islands=[
    {x:-94,z:-22,rx:15,rz:9,rot:30},  {x:-50,z:-27,rx:7,rz:5,rot:0},
    {x:12, z:-27,rx:11,rz:6,rot:0},   {x:60, z:-28,rx:9,rz:6,rot:10},
    {x:106,z:-22,rx:7,rz:5,rot:60},   {x:-8, z:4,  rx:17,rz:11,rot:20},
    {x:44, z:22, rx:15,rz:9,rot:-25}, {x:80, z:4,  rx:11,rz:10,rot:0},
    {x:-57,z:15, rx:6,rz:5,rot:0},    {x:50, z:-12,rx:6,rz:5,rot:0},
    {x:-27,z:35, rx:11,rz:7,rot:15},  {x:95, z:25, rx:8,rz:6,rot:-30}
  ];
  islands.forEach(o=>addIsland(g,o));

  const rl=[ [-58,-46],[110,-46],[122,-22],[122,40],[96,50],[-90,50],[-118,16],[-110,-30] ];
  const line=catmullLoop(rl,14);
  paintDashedLine(g, line);
  paintStartLine(g, line[0], line[1], 18);
  const cps=sampleCheckpoints(line, 6, 17);
  const startDir=Math.atan2(line[1][0]-line[0][0], line[1][1]-line[0][1]);

  return {
    group:g, name:'studio',
    start:{x:line[0][0], z:line[0][1], yaw:startDir},
    checkpoints:cps, loop:line,
    heightAt(){ return 0; },
    surfaceAt(){ return 'asphalt'; },
    collide(car){ studioCollide(car, bound, cxc, czc, islands); }
  };
}

// ---- RACEWAY CUSTOM — loop track built from the raceway editor ----
function makeRacewayCustom(L){
  const rawLoop = catmullLoop(L.line, 16);
  const roadW   = L.roadW || 18;

  // Compute bounds for ground size
  let mnx=1e9,mxx=-1e9,mnz=1e9,mxz=-1e9;
  rawLoop.forEach(p=>{ mnx=Math.min(mnx,p[0]); mxx=Math.max(mxx,p[0]); mnz=Math.min(mnz,p[1]); mxz=Math.max(mxz,p[1]); });
  const gW=(mxx-mnx)*2+200, gH=(mxz-mnz)*2+200;

  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gW,gH),
    new THREE.MeshStandardMaterial({color:0x2c4225, roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-0.01; ground.receiveShadow=true; g.add(ground);

  const road = ribbon(rawLoop, roadW, 0x2b2f36);
  road.position.y=0.02; road.receiveShadow=true; g.add(road);

  const curbIn  = ribbonEdge(rawLoop, roadW-2.2, -1, 1.1, 0xcf3b3b);
  const curbOut = ribbonEdge(rawLoop, roadW-2.2,  1, 1.1, 0xe8e8e8);
  curbIn.position.y=0.05; curbOut.position.y=0.05; g.add(curbIn); g.add(curbOut);

  const WALL_H=CAR_H*0.5, wallOff=roadW/2-0.2;
  g.add(wallRibbon(rawLoop, wallOff, -1, WALL_H, 0x39424f));
  g.add(wallRibbon(rawLoop, wallOff,  1, WALL_H, 0x39424f));

  // Rotate loop so it starts at the chosen start point
  let loop = rawLoop;
  if(L.start){
    let bi=0,bd=1e18;
    for(let i=0;i<loop.length;i++){const dx=loop[i][0]-L.start[0],dz=loop[i][1]-L.start[1];const d=dx*dx+dz*dz;if(d<bd){bd=d;bi=i;}}
    loop=loop.slice(bi).concat(loop.slice(0,bi));
  }
  if(L.startDir===-1){ loop=[loop[0]].concat(loop.slice(1).reverse()); }

  paintStartLine(g, loop[0], loop[1], roadW);
  const cps = sampleCheckpoints(loop, 6, roadW/2-2);
  const startDir = Math.atan2(loop[1][0]-loop[0][0], loop[1][1]-loop[0][1]);

  let camPos=null;
  if(L.cam){
    const size=Math.max(mxx-mnx, mxz-mnz);
    camPos={x:L.cam[0], y:size*0.085, z:L.cam[1]};
  }

  return {
    group:g, name:'raceway-custom', camPos,
    start:{x:loop[0][0], z:loop[0][1], yaw:startDir},
    checkpoints:cps, loop, roadW,
    edgeLimit: roadW/2-0.9,
    heightAt(x,z){
      const d=distToLoop(loop,x,z), half=roadW/2;
      if(d>half-2.0 && d<half-0.9) return 0.16;
      return 0;
    },
    surfaceAt(x,z){
      const d=distToLoop(loop,x,z), half=roadW/2;
      if(d<half-2.0) return 'asphalt';
      if(d<half-0.9) return 'curb';
      return 'grass';
    }
  };
}

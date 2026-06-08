"use strict";
// ============================================================
//  TRACK GEOMETRY HELPERS
// ============================================================

// grass island with a red/white kerb ring (offset OUTWARD -> never self-overlaps)
function addGrassIsland(g, o){
  // NOTE: rotation.x=-90 flips the z-axis, so the in-plane spin must be negated
  // to match the collision ellipse (and the 2D editor). Otherwise rotated islands mirror.
  const rot=-o.rot*Math.PI/180, half=(o.type==='half');
  const tS = half?Math.PI:0, tL = half?Math.PI:Math.PI*2;
  const grass=new THREE.Mesh(new THREE.CircleGeometry(1,48,tS,tL),
    new THREE.MeshStandardMaterial({color:0x3c5e2b, roughness:1}));
  grass.scale.set(o.rx,o.rz,1); grass.rotation.x=-Math.PI/2; grass.rotation.z=rot;
  grass.position.set(o.x,0.05,o.z); g.add(grass);
  const red=new THREE.Mesh(new THREE.RingGeometry(0.92,1.0,72,1,tS,tL),
    new THREE.MeshStandardMaterial({color:0xcf3b3b, roughness:.8, side:THREE.DoubleSide}));
  red.scale.set(o.rx+1.0,o.rz+1.0,1); red.rotation.x=-Math.PI/2; red.rotation.z=rot;
  red.position.set(o.x,0.06,o.z); g.add(red);
  const white=new THREE.Mesh(new THREE.RingGeometry(1.0,1.08,72,1,tS,tL),
    new THREE.MeshStandardMaterial({color:0xeeeeee, roughness:.8, side:THREE.DoubleSide}));
  white.scale.set(o.rx+1.0,o.rz+1.0,1); white.rotation.x=-Math.PI/2; white.rotation.z=rot;
  white.position.set(o.x,0.06,o.z); g.add(white);
}

function catmullLoop(ctrl, seg){
  const pts=[];
  const n=ctrl.length;
  for (let i=0;i<n;i++){
    const p0=ctrl[(i-1+n)%n], p1=ctrl[i], p2=ctrl[(i+1)%n], p3=ctrl[(i+2)%n];
    for (let t=0;t<seg;t++){
      const u=t/seg, u2=u*u, u3=u2*u;
      const x=0.5*((2*p1[0])+(-p0[0]+p2[0])*u+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*u2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*u3);
      const z=0.5*((2*p1[1])+(-p0[1]+p2[1])*u+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*u2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*u3);
      pts.push([x,z]);
    }
  }
  return pts;
}

function ribbon(loop, width, color){
  const geo = new THREE.BufferGeometry();
  const verts=[], idx=[];
  const n=loop.length;
  const vn=vertexNormals(loop);
  for (let i=0;i<n;i++){
    const p=loop[i], nx=vn[i][0], nz=vn[i][1];
    verts.push(p[0]+nx*width/2, 0, p[1]+nz*width/2);
    verts.push(p[0]-nx*width/2, 0, p[1]-nz*width/2);
  }
  for (let i=0;i<n;i++){
    const a=i*2, b=i*2+1, c=((i+1)%n)*2, d=((i+1)%n)*2+1;
    idx.push(a,b,c, b,d,c);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color, roughness:.95, side:THREE.DoubleSide}));
}

function ribbonEdge(loop, width, side, ew, color){
  const geo=new THREE.BufferGeometry(); const verts=[], idx=[]; const n=loop.length;
  const vn=vertexNormals(loop);
  for (let i=0;i<n;i++){
    const p=loop[i], nx=vn[i][0], nz=vn[i][1];
    const base=side*width/2;
    verts.push(p[0]+nx*base, 0, p[1]+nz*base);
    verts.push(p[0]+nx*(base+side*ew), 0, p[1]+nz*(base+side*ew));
  }
  for (let i=0;i<n;i++){ const a=i*2,b=i*2+1,c=((i+1)%n)*2,d=((i+1)%n)*2+1; idx.push(a,b,c,b,d,c);}
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color, roughness:.9, side:THREE.DoubleSide}));
}

function sampleCheckpoints(loop, count, r){
  const cps=[]; const step=Math.floor(loop.length/count);
  for (let i=0;i<count;i++){
    const p=loop[(i*step)%loop.length];
    cps.push({x:p[0], z:p[1], r});
  }
  // ensure finish is at loop start
  cps[0] = {x:loop[0][0], z:loop[0][1], r};
  // rotate so finish is last (cross it to complete)
  cps.push(cps.shift());
  return cps;
}

function distToLoop(loop, x, z){
  return nearestOnLoop(loop, x, z).d;
}

function nearestOnLoop(loop, x, z){
  let best=1e9, px=x, pz=z; const n=loop.length;
  for (let i=0;i<n;i++){
    const a=loop[i], b=loop[(i+1)%n];
    const abx=b[0]-a[0], abz=b[1]-a[1];
    const apx=x-a[0], apz=z-a[1];
    let t=(apx*abx+apz*abz)/((abx*abx+abz*abz)||1);
    t=Math.max(0,Math.min(1,t));
    const cx=a[0]+abx*t, cz=a[1]+abz*t;
    const d=Math.hypot(x-cx, z-cz);
    if (d<best){ best=d; px=cx; pz=cz; }
  }
  return {px, pz, d:best};
}

// per-vertex outward normal (angle bisector, miter-capped) — smooth, no shards at corners
function vertexNormals(loop){
  const n=loop.length, out=[];
  for (let i=0;i<n;i++){
    const p=loop[(i-1+n)%n], c=loop[i], q=loop[(i+1)%n];
    let n1x=-(c[1]-p[1]), n1z=(c[0]-p[0]); let l1=Math.hypot(n1x,n1z)||1; n1x/=l1; n1z/=l1;
    let n2x=-(q[1]-c[1]), n2z=(q[0]-c[0]); let l2=Math.hypot(n2x,n2z)||1; n2x/=l2; n2z/=l2;
    let bx=n1x+n2x, bz=n1z+n2z; let bl=Math.hypot(bx,bz)||1; bx/=bl; bz/=bl;
    const miter=Math.min(1.7, 1/Math.max(0.4, bx*n2x+bz*n2z));
    out.push([bx*miter, bz*miter]);
  }
  return out;
}

// closed wavy-oval centerline: curvature is bounded, so offset walls never self-overlap
function wavyLoop(Rx, Rz, mods, N){
  const pts=[];
  for (let i=0;i<N;i++){
    const th=i/N*Math.PI*2;
    let rm=1; for (const m of mods) rm += m[0]*Math.sin(m[1]*th + m[2]);
    pts.push([Rx*rm*Math.cos(th), Rz*rm*Math.sin(th)]);
  }
  return pts;
}

// vertical barrier wall running along the track edge at given offset from centerline
function wallRibbon(loop, offset, side, height, color){
  const geo=new THREE.BufferGeometry(); const v=[], idx=[]; const n=loop.length;
  const vn=vertexNormals(loop);
  for (let i=0;i<n;i++){
    const p=loop[i], nx=vn[i][0], nz=vn[i][1];
    const ex=p[0]+nx*side*offset, ez=p[1]+nz*side*offset;
    v.push(ex,0,ez); v.push(ex,height,ez);
  }
  for (let i=0;i<n;i++){ const a=i*2,b=i*2+1,c=((i+1)%n)*2,d=((i+1)%n)*2+1; idx.push(a,b,c,b,d,c); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v,3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m=new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color, roughness:.8, side:THREE.DoubleSide}));
  m.castShadow=true; m.receiveShadow=true;
  return m;
}

// ---- studio-track helpers (free-roam pad with island obstacles) ----
function pointInPoly(poly,x,z){
  let inside=false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0],zi=poly[i][1],xj=poly[j][0],zj=poly[j][1];
    if (((zi>z)!==(zj>z)) && (x < (xj-xi)*(z-zi)/((zj-zi)||1e-9)+xi)) inside=!inside;
  }
  return inside;
}

function fillPolygon(poly, color){
  const shape=new THREE.Shape();
  shape.moveTo(poly[0][0], -poly[0][1]);
  for (let i=1;i<poly.length;i++) shape.lineTo(poly[i][0], -poly[i][1]);
  shape.closePath();
  const geo=new THREE.ShapeGeometry(shape);
  const m=new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color, roughness:.96, side:THREE.DoubleSide}));
  m.rotation.x=-Math.PI/2; m.receiveShadow=true;
  return m;
}

function addIsland(g,o){
  const rot=o.rot*Math.PI/180;
  const blue=new THREE.Mesh(new THREE.CircleGeometry(1,32),
    new THREE.MeshStandardMaterial({color:0x1f7fd0, roughness:.85}));
  blue.scale.set(o.rx,o.rz,1); blue.rotation.x=-Math.PI/2; blue.rotation.z=rot;
  blue.position.set(o.x,0.06,o.z); g.add(blue);
  const red=new THREE.Mesh(new THREE.RingGeometry(0.90,1.0,48),
    new THREE.MeshStandardMaterial({color:0xcc2b2b, roughness:.8, side:THREE.DoubleSide}));
  red.scale.set(o.rx+1.5,o.rz+1.5,1); red.rotation.x=-Math.PI/2; red.rotation.z=rot;
  red.position.set(o.x,0.05,o.z); g.add(red);
  const white=new THREE.Mesh(new THREE.RingGeometry(1.0,1.10,48),
    new THREE.MeshStandardMaterial({color:0xf0f0f0, roughness:.8, side:THREE.DoubleSide}));
  white.scale.set(o.rx+1.5,o.rz+1.5,1); white.rotation.x=-Math.PI/2; white.rotation.z=rot;
  white.position.set(o.x,0.05,o.z); g.add(white);
}

function paintDashedLine(g, line){
  const mat=new THREE.MeshStandardMaterial({color:0xffffff, roughness:.9, side:THREE.DoubleSide});
  for (let i=0;i<line.length;i+=3){
    const p=line[i], q=line[(i+1)%line.length];
    const dx=q[0]-p[0], dz=q[1]-p[1]; const len=Math.hypot(dx,dz)||1;
    const ang=Math.atan2(dx,dz);
    const dash=new THREE.Mesh(new THREE.PlaneGeometry(0.6, len*0.55), mat);
    dash.rotation.x=-Math.PI/2; dash.rotation.z=ang;
    dash.position.set((p[0]+q[0])/2, 0.08, (p[1]+q[1])/2);
    g.add(dash);
  }
}

// collision for a half-disc island (round side = local +z, flat edge open)
function collideHalf(car, o){
  const m=1.3, rot=o.rot*Math.PI/180, ca=Math.cos(-rot), sa=Math.sin(-rot);
  const dx=car.x-o.x, dz=car.z-o.z;
  const lx=dx*ca - dz*sa, lz=dx*sa + dz*ca;
  if (lz < -m) return;
  const ax=o.rx+m, az=o.rz+m, lzc=Math.max(lz,0);
  const rho=Math.hypot(lx/ax, lzc/az);
  const insideArc  = (lz>=0 && rho<1);
  const insideFlat = (lz<0 && lz>-m && Math.abs(lx)<ax);
  if (!insideArc && !insideFlat) return;
  const cb=Math.cos(rot), sb=Math.sin(rot);
  const exitFlat = lz + m;
  const arcExit  = insideArc ? (1-rho)*Math.min(ax,az) : 1e9;
  if (exitFlat <= arcExit){
    car.x = o.x + lx*cb + m*sb; car.z = o.z + lx*sb - m*cb;
    const nx=sb, nz=-cb, vIn=car.vx*nx+car.vz*nz;
    if (vIn<0){ car.vx-=nx*vIn*1.2; car.vz-=nz*vIn*1.2; }
  } else {
    const dirx=rho>1e-4?(lx/ax)/rho:1, dirz=rho>1e-4?(lzc/az)/rho:1;
    const tlx=dirx*ax, tlz=Math.max(dirz*az,0.01);
    car.x = o.x + tlx*cb - tlz*sb; car.z = o.z + tlx*sb + tlz*cb;
    let ox=car.x-o.x, oz=car.z-o.z; const ol=Math.hypot(ox,oz)||1; ox/=ol; oz/=ol;
    const vIn=car.vx*ox+car.vz*oz;
    if (vIn<0){ car.vx-=ox*vIn*1.2; car.vz-=oz*vIn*1.2; }
  }
  car.yawRate*=0.9;
}

function studioCollide(car, bound, cxc, czc, islands, barriers){
  // keep the car inside the pad boundary
  if (!pointInPoly(bound, car.x, car.z)){
    const np=nearestOnLoop(bound, car.x, car.z);
    let inx=cxc-np.px, inz=czc-np.pz; const il=Math.hypot(inx,inz)||1; inx/=il; inz/=il;
    car.x=np.px+inx*0.5; car.z=np.pz+inz*0.5;
    const vOut=-(car.vx*inx+car.vz*inz);
    if (vOut>0){ car.vx+=inx*vOut*1.2; car.vz+=inz*vOut*1.2; }
    car.yawRate*=0.85;
  }
  // keep the car outside each island
  for (const o of islands){
    if (o.type==='half'){ collideHalf(car,o); continue; }
    const rot=o.rot*Math.PI/180, ca=Math.cos(-rot), sa=Math.sin(-rot);
    const dx=car.x-o.x, dz=car.z-o.z;
    const lx=dx*ca - dz*sa, lz=dx*sa + dz*ca;
    const m=1.3, ax=o.rx+m, az=o.rz+m;
    const ux=lx/ax, uz=lz/az; const rho=Math.hypot(ux,uz);
    if (rho<1){
      const dirx = rho>1e-4 ? ux/rho : 1, dirz = rho>1e-4 ? uz/rho : 0;
      const tlx=dirx*ax, tlz=dirz*az;
      const cb=Math.cos(rot), sb=Math.sin(rot);
      car.x=o.x + (tlx*cb - tlz*sb);
      car.z=o.z + (tlx*sb + tlz*cb);
      let ox=car.x-o.x, oz=car.z-o.z; const ol=Math.hypot(ox,oz)||1; ox/=ol; oz/=ol;
      const vIn=car.vx*ox+car.vz*oz;
      if (vIn<0){ car.vx-=ox*vIn*1.2; car.vz-=oz*vIn*1.2; }
      car.yawRate*=0.9;
    }
  }
  // bounce off straight barriers (capsule: nearest point on segment)
  if (barriers) for (const b of barriers){
    const abx=b.x2-b.x1, abz=b.z2-b.z1; const L2=abx*abx+abz*abz||1;
    let t=((car.x-b.x1)*abx+(car.z-b.z1)*abz)/L2; t=Math.max(0,Math.min(1,t));
    const px=b.x1+abx*t, pz=b.z1+abz*t;
    let nx=car.x-px, nz=car.z-pz; const d=Math.hypot(nx,nz)||1;
    const margin=2.2;
    if (d<margin){ nx/=d; nz/=d; car.x=px+nx*margin; car.z=pz+nz*margin;
      const vIn=car.vx*nx+car.vz*nz; if (vIn<0){ car.vx-=nx*vIn*1.2; car.vz-=nz*vIn*1.2; } car.yawRate*=0.9; }
  }
}

function nearLoop(loop, x, z, half){
  let best=1e9;
  for (let i=0;i<loop.length;i++){
    const d=dist2(x,z,loop[i][0],loop[i][1]);
    if (d<best) best=d;
  }
  return best < (half+1.2)*(half+1.2);
}

// painted checkered start/finish line on the ground
function paintStartLine(g, p0, p1, width){
  const dir=Math.atan2(p1[0]-p0[0], p1[1]-p0[1]);
  const nx=Math.cos(dir), nz=-Math.sin(dir);
  const W=(width||10)*0.9, depth=2.4;
  const base=new THREE.Mesh(new THREE.PlaneGeometry(W, depth),
    new THREE.MeshStandardMaterial({color:0xffffff, roughness:.9}));
  base.rotation.x=-Math.PI/2; base.rotation.z=dir; base.position.set(p0[0],0.05,p0[1]);
  g.add(base);
  const cols=Math.max(8, Math.round(W/1.4));
  const cw=W/cols, rh=depth/2;
  for (let c=0;c<cols;c++){
    for (let r=0;r<2;r++){
      if ((c+r)%2===0) continue;
      const sq=new THREE.Mesh(new THREE.PlaneGeometry(cw, rh),
        new THREE.MeshStandardMaterial({color:0x0a0a0a, roughness:.9}));
      sq.rotation.x=-Math.PI/2; sq.rotation.z=dir;
      const along=(c-(cols-1)/2)*cw;
      const fwd=(r-0.5)*rh;
      sq.position.set(p0[0]+nx*along+Math.sin(dir)*fwd, 0.06, p0[1]+nz*along+Math.cos(dir)*fwd);
      g.add(sq);
    }
  }
}

function scatterCones(g, loop, w){
  const cg=new THREE.ConeGeometry(0.25,0.7,8);
  const cm=new THREE.MeshStandardMaterial({color:0xff8a00});
  for (let i=0;i<loop.length;i+=6){
    const p=loop[i], q=loop[(i+1)%loop.length];
    const dx=q[0]-p[0], dz=q[1]-p[1]; const len=Math.hypot(dx,dz)||1;
    const nx=-dz/len, nz=dx/len;
    const c=new THREE.Mesh(cg,cm);
    c.position.set(p[0]+nx*(w/2+0.6),0.35,p[1]+nz*(w/2+0.6)); c.castShadow=true;
    g.add(c);
  }
}

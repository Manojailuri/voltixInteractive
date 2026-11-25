import * as THREE from 'three';

/*
  A procedural slim can that samples the SAME texture atlas as the real model
  (Coke-style layout: label strip on top, lid + bottom circles below).
  Used only when /model/can.glb is missing, so the page always works.

  Atlas regions, in pixels of the 512 x 512 layout (scale-independent):
    label  x 59–441, y 42–257  (stored upside-down, see README)
    lid    centre (149, 352), r ≈ 88
    bottom centre (351, 352), r ≈ 88
*/
const A = 512;
const LABEL = { x0: 59, w: 383, y0: 42, h: 215 };
const LID = { cx: 149, cy: 352, r: 86 };
const BASE = { cx: 351, cy: 352, r: 86 };

function remapLabelUV(geo) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i); // 1 = top of cylinder
    // label is stored vertically flipped: cylinder top -> bottom row of the rect
    const px = LABEL.x0 + u * LABEL.w;
    const py = LABEL.y0 + v * LABEL.h;
    uv.setXY(i, px / A, 1 - py / A); // flipY=true texture
  }
  uv.needsUpdate = true;
}

function remapDiscUV(geo, c) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const px = c.cx + (uv.getX(i) - 0.5) * 2 * c.r;
    const py = c.cy - (uv.getY(i) - 0.5) * 2 * c.r;
    uv.setXY(i, px / A, 1 - py / A);
  }
  uv.needsUpdate = true;
}

export function createFallbackCan(baseMap, normalMap) {
  const group = new THREE.Group();
  group.name = 'VoltixFallbackCan';

  const R = 0.5;
  const H = 2.1; // printed body height
  const NECK = 0.16;
  const TOP_R = R * 0.84;

  const labelMat = new THREE.MeshPhysicalMaterial({
    map: baseMap,
    metalness: 0.55,
    roughness: 0.32,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
  });
  const metalMat = new THREE.MeshPhysicalMaterial({
    color: 0xd3d7de,
    metalness: 1,
    roughness: 0.22,
  });
  const lidMat = new THREE.MeshPhysicalMaterial({
    map: baseMap,
    normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    metalness: 0.85,
    roughness: 0.28,
  });

  // Body
  const bodyGeo = new THREE.CylinderGeometry(R, R, H, 128, 1, true);
  remapLabelUV(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, labelMat);
  group.add(body);

  // Neck (tapered, plain aluminium)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(TOP_R, R, NECK, 128, 1, true), metalMat);
  neck.position.y = H / 2 + NECK / 2;
  group.add(neck);

  // Bottom dome taper
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.86, 0.1, 128, 1, true), metalMat);
  foot.position.y = -H / 2 - 0.05;
  group.add(foot);

  // Rims
  const rimTop = new THREE.Mesh(new THREE.TorusGeometry(TOP_R, 0.03, 16, 128), metalMat);
  rimTop.rotation.x = Math.PI / 2;
  rimTop.position.y = H / 2 + NECK + 0.01;
  group.add(rimTop);

  // Lid (recessed a touch)
  const lidGeo = new THREE.CircleGeometry(TOP_R, 96);
  remapDiscUV(lidGeo, LID);
  const lid = new THREE.Mesh(lidGeo, lidMat);
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = H / 2 + NECK - 0.015;
  group.add(lid);

  // Inner wall between rim and recessed lid
  const lidWall = new THREE.Mesh(new THREE.CylinderGeometry(TOP_R, TOP_R, 0.04, 96, 1, true), metalMat);
  lidWall.position.y = H / 2 + NECK;
  group.add(lidWall);

  // Bottom
  const baseGeo = new THREE.CircleGeometry(R * 0.86, 96);
  remapDiscUV(baseGeo, BASE);
  const base = new THREE.Mesh(baseGeo, lidMat);
  base.rotation.x = Math.PI / 2;
  base.position.y = -H / 2 - 0.1;
  group.add(base);

  // CylinderGeometry puts u=0 facing +Z; the Voltix front panel is centred at u=0.25.
  group.rotation.y = -Math.PI / 2;

  const wrapper = new THREE.Group();
  wrapper.add(group);
  return wrapper;
}

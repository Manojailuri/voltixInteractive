import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createFallbackCan } from './fallbackCan.js';

/* ------------------------------------------------------------------ *
 *  CONFIG — the only bit you should need to touch
 * ------------------------------------------------------------------ */
const CONFIG = {
  modelUrl: '/model/can.glb',          // drop your model here (.glb or .gltf)
  baseColorUrl: '/textures/voltix_baseColor.png',
  normalUrl: '/textures/can_normal.png',
  overrideModelTexture: true,          // apply the Voltix texture to every mesh of the model
  modelHeight: 2.4,                    // model is auto-scaled to this height (world units)
  modelFrontYaw: 0,                    // radians: rotate if the model's logo doesn't face the camera at the start
};

/* ------------------------------------------------------------------ *
 *  Renderer / scene / camera
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const HOME = { pos: new THREE.Vector3(0, 0.15, 8), target: new THREE.Vector3(0, 0, 0) };
camera.position.copy(HOME.pos);

// Lights: neutral key + lime rim to echo the brand
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 4, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xc6f21a, 3.2);
rim.position.set(-4, 2, -3);
scene.add(rim);
const fill = new THREE.DirectionalLight(0x7aa2ff, 0.8);
fill.position.set(4, -2, -2);
scene.add(fill);

/* ------------------------------------------------------------------ *
 *  Spark particles
 * ------------------------------------------------------------------ */
const sparks = (() => {
  const n = 380;
  const pos = new Float32Array(n * 3);
  const speed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 14;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 9;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
    speed[i] = 0.1 + Math.random() * 0.35;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xc6f21a,
    size: 0.035,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.speed = speed;
  scene.add(pts);
  return pts;
})();

/* ------------------------------------------------------------------ *
 *  Loading
 * ------------------------------------------------------------------ */
const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {
  loaderFill.style.width = `${Math.round((loaded / total) * 100)}%`;
};

const texLoader = new THREE.TextureLoader(manager);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

function loadTex(url, { srgb = false, flipY = true } = {}) {
  const t = texLoader.load(url);
  t.flipY = flipY;
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Procedural-can textures (flipY = true) and glTF textures (glTF UVs expect flipY = false)
const fallbackMaps = {
  base: loadTex(CONFIG.baseColorUrl, { srgb: true }),
  normal: loadTex(CONFIG.normalUrl),
};
const gltfMaps = {
  base: loadTex(CONFIG.baseColorUrl, { srgb: true, flipY: false }),
  normal: loadTex(CONFIG.normalUrl, { flipY: false }),
};

// pivot: driven by scroll; holder: idle float/tilt; model goes inside
const pivot = new THREE.Group();
const holder = new THREE.Group();
pivot.add(holder);
scene.add(pivot);

function normaliseModel(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const s = CONFIG.modelHeight / (size.y || 1);
  obj.position.sub(centre).multiplyScalar(s);
  obj.scale.multiplyScalar(s);
  const wrap = new THREE.Group();
  wrap.add(obj);
  wrap.rotation.y = CONFIG.modelFrontYaw;
  return wrap;
}

function applyVoltixTexture(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      m.map = gltfMaps.base;
      if (!m.normalMap) m.normalMap = gltfMaps.normal;
      if (m.metalness !== undefined) {
        m.metalness = Math.max(m.metalness, 0.5);
        m.roughness = Math.min(m.roughness ?? 0.4, 0.4);
      }
      m.needsUpdate = true;
    });
  });
}

new GLTFLoader(manager).load(
  CONFIG.modelUrl,
  (gltf) => {
    const model = gltf.scene;
    if (CONFIG.overrideModelTexture) applyVoltixTexture(model);
    holder.add(normaliseModel(model));
  },
  undefined,
  () => {
    console.info(`[voltix] No model at ${CONFIG.modelUrl} — using the built-in can.`);
    holder.add(createFallbackCan(fallbackMaps.base, fallbackMaps.normal));
  }
);

manager.onLoad = () => {
  loaderFill.style.width = '100%';
  setTimeout(() => loaderEl.classList.add('done'), 250);
};

/* ------------------------------------------------------------------ *
 *  Scroll choreography
 *  One keyframe per <section data-step>. Values blend as you scroll.
 * ------------------------------------------------------------------ */
const TAU = Math.PI * 2;
const KEYS_DESKTOP = {
  hero:     { x:  1.55, y: -0.05, z: 0,    rx: 0.05, ry: 0,           rz: -0.16, s: 1.0 },
  energy:   { x: -1.6,  y:  0,    z: 0.3,  rx: 0.1,  ry: Math.PI / 2, rz:  0.14, s: 1.05 },
  vitamins: { x:  1.6,  y:  0,    z: 0.3,  rx: 0,    ry: Math.PI,     rz: -0.1,  s: 1.05 },
  top:      { x: -1.4,  y: -0.35, z: 0.6,  rx: 0.85, ry: TAU,         rz:  0.12, s: 1.0 },
  explore:  { x:  0,    y:  0.25, z: 0,    rx: 0,    ry: TAU,         rz:  0,    s: 1.12 },
};
const KEYS_MOBILE = {
  hero:     { x: 0, y: 0.75, z: 0, rx: 0.05, ry: 0,           rz: -0.12, s: 0.78 },
  energy:   { x: 0, y: 0.8,  z: 0, rx: 0.1,  ry: Math.PI / 2, rz:  0.1,  s: 0.78 },
  vitamins: { x: 0, y: 0.8,  z: 0, rx: 0,    ry: Math.PI,     rz: -0.08, s: 0.78 },
  top:      { x: 0, y: 0.75, z: 0, rx: 0.85, ry: TAU,         rz:  0.1,  s: 0.75 },
  explore:  { x: 0, y: 0.45, z: 0, rx: 0,    ry: TAU,         rz:  0,    s: 0.95 },
};

const sections = [...document.querySelectorAll('[data-step]')];
const steps = sections.map((s) => s.dataset.step);
let keys = KEYS_DESKTOP;

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Float step index: 0 at first section's centre, N-1 at last section's centre. */
function scrollStep() {
  const mid = window.scrollY + window.innerHeight / 2;
  const centres = sections.map((s) => s.offsetTop + s.offsetHeight / 2);
  const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
  if (atBottom) return steps.length - 1;
  if (mid <= centres[0]) return 0;
  for (let i = 0; i < centres.length - 1; i++) {
    if (mid < centres[i + 1]) return i + (mid - centres[i]) / (centres[i + 1] - centres[i]);
  }
  return steps.length - 1;
}

function targetPose(stepF) {
  const i = Math.min(Math.floor(stepF), steps.length - 2);
  const t = smooth(THREE.MathUtils.clamp(stepF - i, 0, 1));
  const a = keys[steps[i]];
  const b = keys[steps[i + 1]];
  const out = {};
  for (const k in a) out[k] = lerp(a[k], b[k], t);
  return out;
}

/* ------------------------------------------------------------------ *
 *  Explore mode (free orbit at the end)
 * ------------------------------------------------------------------ */
const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3.2;
controls.maxDistance = 12;
controls.autoRotateSpeed = 1.6;

let exploring = false;
let returningHome = false;

function setExploring(on) {
  if (on === exploring) return;
  exploring = on;
  document.body.classList.toggle('exploring', on);
  controls.enabled = on;
  if (on) {
    controls.target.copy(pivot.position);
    controls.update();
    returningHome = false;
  } else {
    controls.autoRotate = false;
    spinBtn.setAttribute('aria-pressed', 'false');
    returningHome = true;
  }
}

const spinBtn = document.getElementById('btn-spin');
spinBtn.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  spinBtn.setAttribute('aria-pressed', String(controls.autoRotate));
});
document.getElementById('btn-reset').addEventListener('click', () => {
  controls.autoRotate = false;
  spinBtn.setAttribute('aria-pressed', 'false');
  resetTween = 1;
});
document.getElementById('btn-top').addEventListener('click', () => {
  setExploring(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
let resetTween = 0;

/* ------------------------------------------------------------------ *
 *  Copy reveal + nav dots
 * ------------------------------------------------------------------ */
const dotsEl = document.getElementById('dots');
const dots = sections.map((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', `Go to ${s.dataset.step}`);
  b.addEventListener('click', () => {
    if (exploring && i !== sections.length - 1) setExploring(false);
    const y = s.offsetTop + s.offsetHeight / 2 - window.innerHeight / 2;
    window.scrollTo({ top: y, behavior: 'smooth' });
  });
  dotsEl.appendChild(b);
  return b;
});

const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.target.classList.toggle('in', e.isIntersecting)),
  { threshold: 0.35 }
);
document.querySelectorAll('.copy').forEach((el) => io.observe(el));

/* ------------------------------------------------------------------ *
 *  Pointer parallax (scroll phase only)
 * ------------------------------------------------------------------ */
const pointer = new THREE.Vector2();
window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
});

/* ------------------------------------------------------------------ *
 *  Resize
 * ------------------------------------------------------------------ */
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the can a similar size on tall/narrow screens
  HOME.pos.z = camera.aspect < 1 ? 8 + (1 - camera.aspect) * 6 : 8;
  if (!exploring) camera.position.z = HOME.pos.z;
  camera.updateProjectionMatrix();
  keys = w <= 760 ? KEYS_MOBILE : KEYS_DESKTOP;
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------ *
 *  Loop
 * ------------------------------------------------------------------ */
const clock = new THREE.Clock();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const damp = 1 - Math.exp(-dt * 6); // frame-rate independent easing

  const stepF = scrollStep();
  const last = steps.length - 1;
  setExploring(stepF >= last - 0.03);

  // nav dots
  const activeIdx = Math.round(stepF);
  dots.forEach((d, i) => d.classList.toggle('active', i === activeIdx));

  // Scroll-driven pose (also holds the final pose while exploring)
  const p = targetPose(stepF);
  pivot.position.x = lerp(pivot.position.x, p.x, damp);
  pivot.position.y = lerp(pivot.position.y, p.y, damp);
  pivot.position.z = lerp(pivot.position.z, p.z, damp);
  pivot.rotation.x = lerp(pivot.rotation.x, p.rx, damp);
  pivot.rotation.y = lerp(pivot.rotation.y, p.ry, damp);
  pivot.rotation.z = lerp(pivot.rotation.z, p.rz, damp);
  const s = lerp(pivot.scale.x, p.s, damp);
  pivot.scale.setScalar(s);

  // Idle float + pointer tilt (faded out in explore mode)
  const idle = exploring || reduceMotion ? 0 : 1;
  holder.position.y = lerp(holder.position.y, Math.sin(t * 1.3) * 0.06 * idle, damp);
  holder.rotation.x = lerp(holder.rotation.x, pointer.y * 0.12 * idle, damp);
  holder.rotation.y = lerp(holder.rotation.y, pointer.x * 0.25 * idle, damp);

  // Camera
  if (exploring) {
    if (resetTween > 0) {
      camera.position.lerp(HOME.pos, damp);
      controls.target.lerp(pivot.position, damp);
      resetTween = camera.position.distanceTo(HOME.pos) > 0.02 ? 1 : 0;
    }
    controls.update();
  } else if (returningHome) {
    camera.position.lerp(HOME.pos, damp);
    controls.target.lerp(HOME.target, damp);
    camera.lookAt(controls.target);
    if (camera.position.distanceTo(HOME.pos) < 0.01) returningHome = false;
  } else {
    camera.position.copy(HOME.pos);
    camera.lookAt(HOME.target);
  }

  // Sparks drift upward and wrap
  const arr = sparks.geometry.attributes.position.array;
  const sp = sparks.userData.speed;
  for (let i = 0; i < sp.length; i++) {
    arr[i * 3 + 1] += sp[i] * dt * (reduceMotion ? 0 : 1);
    if (arr[i * 3 + 1] > 4.5) arr[i * 3 + 1] = -4.5;
  }
  sparks.geometry.attributes.position.needsUpdate = true;
  sparks.rotation.y = stepF * 0.25;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// KEYBO in real-time 3D, roaming the page above the footer.
//
// The Animation session's Blender rig (assets/keybo/3d/keybo.glb: 1 m tall,
// Y up, facing +Z; bones root, hips, legs, body, arms, eyes, keycaps; morphs
// blink, squint, surprised, smile, mouth_open; actions idle, walk, dangle,
// flail, wave, land, getup), lit like its Cycles studio and moved by physics.
//
// Touch is local and physical:
//   - a press dents the body exactly where it lands, as a soft dimple with
//     the flesh around it bulging a little (volume kept), sized and softened
//     by the part pressed: belly soft and wide, head top firmer, arms and
//     legs small and firm (the limb itself also gives way), keycaps travel
//     down like real keys, eyes squeeze shut;
//   - pressing pushes into the surface; holding pushes harder. The push
//     acts at its real height: high on the body it tips him, the upper body
//     bending first while the feet hold; low on the legs it knocks the feet
//     and the top lags behind;
//   - balance is an inverted pendulum on his footprint: a small push sways
//     and he recovers; once his centre of mass passes the edge of his feet
//     he falls, in the direction of the push and nowhere else, lands, lies,
//     and gets back up;
//   - a sideways swipe pushes him that way, harder the faster the swipe;
//     dragging upwards picks him up (he hangs and swings), and a drop or a
//     throw falls under gravity, motion-blurred, with a squash on landing.
// Plus: he walks the full width of the window and wraps round; inside a
// circle round him he watches the cursor, eyes first, head following; the
// page scrolls when he is carried to its top or bottom and follows a long
// fall down. He draws only while on screen.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const WALK_YAW = THREE.MathUtils.degToRad(60);   // facing while walking: mostly sideways
const STRIDE_SPEED = 0.498;                       // m/s along his facing, from the rig
const G = 9.81 * 2.2;                             // a 1 m toy falls a little snappier than real life
const COM = 0.46;                                 // centre of mass height, m
const TAP = 1.9;                                  // how hard a click pushes
const FOOT = { x: 0.24, z: 0.17 };                // half-size of his footprint, m

// How each part takes a press: dimple radius, how deep it can go, and how
// much of the push reaches the rest of him.
const PARTS = {
  torso: { r: 0.15, depth: 0.075 },
  head: { r: 0.13, depth: 0.05 },
  arm: { r: 0.075, depth: 0.03 },
  leg: { r: 0.065, depth: 0.025 },
  eye: { r: 0.07, depth: 0.022 },
  key: { r: 0.06, depth: 0 },
};

export async function start({ host, modelUrl, reduce }) {
  if (host.__keybo3d) return host.__keybo3d;          // one KEYBO per page
  const canvas = document.createElement("canvas");
  canvas.className = "kb3d";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;       // the renders use Blender "Standard"
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();

  // The Cycles studio, as directional lights at the same places (aimed at
  // his middle), and a grey ambient for the diffuse fill. No bright
  // environment, so the eyes stay deep black with only their highlights.
  const mk = (i, x, y, z, shadow) => {
    const l = new THREE.DirectionalLight(0xffffff, i);
    l.userData.off = new THREE.Vector3(x, y, z);
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.set(1024, 1024);
      Object.assign(l.shadow.camera, { left: -1.6, right: 1.6, top: 1.8, bottom: -1.0, near: 0.1, far: 12 });
      l.shadow.radius = 7; l.shadow.bias = -0.0005; l.shadow.normalBias = 0.02;
    }
    scene.add(l, l.target);
    return l;
  };
  const lights = [mk(2.7, -1.71, 3.18, 2.69, true), mk(0.95, 0.73, 2.44, -2.44), mk(0.18, 0, 3.42, 0), mk(0.14, 2.44, 1.47, 1.95)];
  scene.add(new THREE.AmbientLight(0xffffff, 0.62));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), new THREE.ShadowMaterial({ opacity: 0.17 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(23.9, 1, 0.1, 80);   // the renders' 85 mm

  // ---------- the model ----------
  const draco = new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(modelUrl);
  const model = gltf.scene;
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });

  // mover (where he is) > hang (swings about the point he is held by)
  // > tipper (rotates about the edge of his footprint he is leaning over)
  // > untip > yawer (which way he faces) > the rig.
  const mover = new THREE.Group(), hang = new THREE.Group(), hangBack = new THREE.Group();
  const tipper = new THREE.Group(), untip = new THREE.Group(), yawer = new THREE.Group();
  mover.add(hang); hang.add(hangBack); hangBack.add(tipper); tipper.add(untip); untip.add(yawer); yawer.add(model);
  scene.add(mover);

  const width = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x;
  const bone = n => model.getObjectByName(n);
  const keyNames = ["key_K", "key_E", "key_Y", "key_B", "key_O", "key_space"];
  const B = {
    body: bone("body"), eyeL: bone("eye_L"), eyeR: bone("eye_R"),
    armL: bone("arm_L"), armR: bone("arm_R"), legL: bone("leg_L"), legR: bone("leg_R"),
    keys: keyNames.map(bone).filter(Boolean),
  };
  const limbs = ["armL", "armR", "legL", "legR"].filter(n => B[n]);

  // Every bone this code nudges is put back to its rest pose each frame
  // before the animation and the springs are applied, so nothing piles up.
  const driven = [B.body, B.eyeL, B.eyeR, ...limbs.map(n => B[n]), ...B.keys].filter(Boolean)
    .map(o => ({ o, q: o.quaternion.clone(), p: o.position.clone(), s: o.scale.clone() }));

  // ---------- the soft press: a dimple wherever he is touched ----------
  // Done in the vertex shader after skinning: vertices near the contact are
  // pushed in along the press (a Gaussian), the ring around it bulges out a
  // little, and the normals tilt into the dimple so the light shows it.
  const U = {
    uDentPos: { value: new THREE.Vector3(0, -99, 0) }, uDentDir: { value: new THREE.Vector3(0, 0, -1) },
    uDentR: { value: 0.15 }, uDentD: { value: 0 },
  };
  const dentWorld = new THREE.Vector3(0, -99, 0), dentDirWorld = new THREE.Vector3(0, 0, -1);
  const inv = new THREE.Matrix4();
  const patch = m => {
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
uniform vec3 uDentPos; uniform vec3 uDentDir; uniform float uDentR; uniform float uDentD;
varying float vDentW;`)
        .replace("#include <defaultnormal_vertex>", `{
  #ifdef USE_SKINNING
    vec3 dp = (skinMatrix * vec4(position, 1.0)).xyz;
  #else
    vec3 dp = position;
  #endif
  vec3 dd = dp - uDentPos;
  float dw = exp(-dot(dd, dd) / (uDentR * uDentR));
  objectNormal = normalize(objectNormal - 3.2 * uDentD * dw * dd / (uDentR * uDentR));
}
#include <defaultnormal_vertex>`)
        .replace("#include <skinning_vertex>", `#include <skinning_vertex>
{
  vec3 dd = transformed - uDentPos; float dl = length(dd);
  float w = exp(-dl * dl / (uDentR * uDentR));
  float rr = (dl - uDentR * 1.4) / (uDentR * 0.55);
  transformed += uDentDir * uDentD * (w - 0.22 * exp(-rr * rr));
  vDentW = w * clamp(uDentD / 0.05, 0.0, 1.0);
}`);
      // the bottom of the dimple sits in its own shadow
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vDentW;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.3 * vDentW;");
    };
    m.customProgramCacheKey = () => "keybo-dent";
    m.needsUpdate = true;
  };
  model.traverse(o => {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(patch);
    // the dent lives in each mesh's own space; put it there just before it draws
    o.onBeforeRender = () => {
      inv.copy(o.matrixWorld).invert();
      U.uDentPos.value.copy(dentWorld).applyMatrix4(inv);
      U.uDentDir.value.copy(dentDirWorld).transformDirection(inv);
    };
  });

  const morphMeshes = [];
  model.traverse(o => { if (o.isMesh && o.morphTargetDictionary) morphMeshes.push(o); });
  const face = { blink: 0, squint: 0, surprised: 0, smile: 0, mouth_open: 0 };
  const faceT = { ...face };
  const applyFace = dt => {
    for (const k in face) {
      face[k] += (faceT[k] - face[k]) * Math.min(1, dt * (k === "blink" ? 40 : 10));
      morphMeshes.forEach(m => { const i = m.morphTargetDictionary[k]; if (i !== undefined) m.morphTargetInfluences[i] = face[k]; });
    }
  };

  const mixer = new THREE.AnimationMixer(model);
  const A = {};
  for (const c of gltf.animations) A[c.name] = mixer.clipAction(c);
  for (const n of ["wave", "land", "getup"]) if (A[n]) { A[n].setLoop(THREE.LoopOnce, 1); A[n].clampWhenFinished = true; }
  let cur = null;
  const play = (n, fade = 0.25) => {
    if (cur === n || !A[n]) return;
    const next = A[n].reset().setEffectiveWeight(1).play();
    if (cur && A[cur]) A[cur].crossFadeTo(next, fade, false); else next.fadeIn(fade);
    cur = n;
  };
  const dur = n => (A[n] ? A[n].getClip().duration : 0.6);
  play("walk", 0);

  // ---------- springs ----------
  const spring = (k, c) => ({ x: 0, v: 0, t: 0, k, c, step(dt) { this.v += ((this.t - this.x) * this.k - this.v * this.c) * dt; this.x += this.v * dt; } });
  const S = {
    yaw: spring(42, 11), headYaw: spring(55, 11), headPitch: spring(55, 11),
    eyeX: spring(520, 40), eyeY: spring(520, 40),
    squash: spring(320, 11),
    dent: spring(300, 16),                                  // dimple depth, metres
    bendX: spring(120, 11), bendZ: spring(120, 11),         // the upper body bending at the hips
    keys: B.keys.map(() => spring(420, 13)),
    limb: Object.fromEntries(limbs.map(n => [n, { x: spring(140, 10), z: spring(140, 10) }])),
  };

  // ---------- the stage: a transparent layer over the whole window ----------
  // His floor is the walkway's dashed line, wherever the page has scrolled
  // it to; world y = 0 there and one metre is PPU pixels.
  let W = 1, H = 1, PPU = 170, camD = 10, floorY = 0;
  const EL = THREE.MathUtils.degToRad(8);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  const resize = () => {
    W = innerWidth; H = innerHeight;
    PPU = W < 700 ? 128 : 165;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camD = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * PPU);
    camera.updateProjectionMatrix();
  };
  const placeCamera = () => {
    floorY = host.getBoundingClientRect().bottom;
    const lookY = (floorY - H / 2) / PPU;
    camera.position.set(0, lookY + Math.sin(EL) * camD, Math.cos(EL) * camD);
    camera.lookAt(0, lookY, 0);
    camera.updateMatrixWorld();
  };
  resize(); placeCamera();
  addEventListener("resize", resize, { passive: true });
  const setNdc = (cx, cy) => ndc.set((cx / W) * 2 - 1, -(cy / H) * 2 + 1);
  const toWorld = (cx, cy) => {
    setNdc(cx, cy); ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.y } : { x: 0, y: 0 };
  };
  const v3 = new THREE.Vector3();
  const toScreen = (x, y, z = 0) => { v3.set(x, y, z).project(camera); return { x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H }; };
  const span = () => W / 2 / PPU + width;

  // ---------- state ----------
  const P = { x: -W / 4 / PPU, y: 0, z: 0, vx: 0, vy: 0, vz: 0, dir: 1 };
  let mode = "walk", modeT = 0, mouse = null, grab = null, waved = 0, following = false;
  const swing = { a: 0, w: 0, len: 0.6 };
  // balance: lean of his whole body, x toward +X (screen right), z backward
  // (away from you); up = standing, falling, down = lying, rising = getting up
  const bal = { x: 0, z: 0, wx: 0, wz: 0, state: "up", from: null };
  let spinA = 0, spinV = 0, blinkIn = 1.5;
  const set = m => { mode = m; modeT = 0; };
  const support = (ux, uz) => 1 / Math.sqrt((ux / FOOT.x) ** 2 + (uz / FOOT.z) ** 2 + 1e-9);
  const critical = (ux, uz) => Math.atan2(support(ux, uz), COM);

  // ---------- motion blur: a directional blur on the layer while fast ----------
  const svgNS = "http://www.w3.org/2000/svg";
  const fsvg = document.createElementNS(svgNS, "svg");
  fsvg.setAttribute("width", "0"); fsvg.setAttribute("height", "0"); fsvg.style.position = "absolute";
  fsvg.innerHTML = '<filter id="kb3d-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0 0"/></filter>';
  document.body.appendChild(fsvg);
  const blurNode = fsvg.querySelector("feGaussianBlur");
  let blurOn = false, lastBlur = "";
  const motionBlur = (vx, vy) => {
    const sx = Math.min(9, Math.abs(vx) * PPU / 950), sy = Math.min(13, Math.abs(vy) * PPU / 760);
    const on = !reduce && sx + sy > 0.9;
    if (on) {
      const v = `${sx.toFixed(1)} ${sy.toFixed(1)}`;
      if (v !== lastBlur) { blurNode.setAttribute("stdDeviation", v); lastBlur = v; }
      if (!blurOn) { canvas.style.filter = "url(#kb3d-blur)"; blurOn = true; }
    } else if (blurOn) { canvas.style.filter = ""; blurOn = false; }
  };

  // ---------- speech ----------
  const say = document.createElement("span");
  say.className = "walker-say kb3d-say"; say.setAttribute("aria-hidden", "true");
  document.body.appendChild(say);
  let sayTimer = 0, lastSaid = 0;
  const speak = (text, force) => {
    if (!force && performance.now() - lastSaid < 900) return;
    lastSaid = performance.now();
    say.textContent = text; say.classList.add("show");
    clearTimeout(sayTimer); sayTimer = setTimeout(() => say.classList.remove("show"), 1400);
  };

  // ---------- touching him ----------
  const picker = new THREE.Raycaster();
  const tmpV = new THREE.Vector3(), tmpN = new THREE.Vector3();
  const touchAt = (cx, cy) => {
    setNdc(cx, cy); picker.setFromCamera(ndc, camera);
    return picker.intersectObject(model, true)[0] || null;
  };
  const nearestBone = (p, names) => {
    let best = null, bd = Infinity;
    for (const n of names) { const b = typeof n === "string" ? B[n] : n; if (!b) continue; const d = b.getWorldPosition(tmpV).distanceTo(p); if (d < bd) { bd = d; best = b; } }
    return { bone: best, dist: bd };
  };
  // which part of him a hit landed on: the bone that carries most of the
  // weight of the touched triangle (the rig's own idea of what moves with
  // what), then its material, then its height
  const comp = (a, i, k) => (k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : k === 2 ? a.getZ(i) : a.getW(i));
  const dominantBone = h => {
    const m = h.object, g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!m.isSkinnedMesh || !si || !sw || !h.face) return null;
    const tally = new Map();
    for (const v of [h.face.a, h.face.b, h.face.c]) for (let k = 0; k < 4; k++) {
      const w = comp(sw, v, k);
      if (w > 0) { const b = m.skeleton.bones[comp(si, v, k)]; if (b) tally.set(b, (tally.get(b) || 0) + w); }
    }
    let best = null, bw = 0;
    tally.forEach((w, b) => { if (w > bw) { bw = w; best = b; } });
    return best;
  };
  const classify = h => {
    const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material];
    const name = ((h.face && mats[h.face.materialIndex]) || mats[0]).name.toLowerCase();
    const b = dominantBone(h), bn = b ? b.name : "";
    if (name.includes("keycap") || name.includes("legend") || bn.startsWith("key_")) return { part: "key", bone: bn.startsWith("key_") ? b : nearestBone(h.point, B.keys).bone };
    if (name.includes("eye") || name.includes("highlight")) return { part: "eye", bone: B.body };
    if (bn === "arm_L" || bn === "arm_R") return { part: "arm", bone: b, limb: bn === "arm_L" ? "armL" : "armR" };
    if (bn === "leg_L" || bn === "leg_R") return { part: "leg", bone: b, limb: bn === "leg_L" ? "legL" : "legR" };
    const local = yawer.worldToLocal(h.point.clone());
    if (local.y < 0.27) { const n = nearestBone(h.point, ["legL", "legR"]); return { part: "leg", bone: n.bone, limb: n.bone === B.legL ? "legL" : "legR" }; }
    return { part: local.y > 0.8 ? "head" : "torso", bone: B.body };
  };

  // a press in progress: where (stuck to the bone under it), which way, how hard
  let contact = null, lastTouch = null;
  const contactWorld = () => {
    contact.bone.updateWorldMatrix(true, false);
    return { p: contact.bone.localToWorld(tmpV.copy(contact.localP)), n: tmpN.copy(contact.localDir).transformDirection(contact.bone.matrixWorld) };
  };

  // The push itself. F is a world direction (x, z), J its strength, h how
  // high above his feet it lands. High pushes tip him (more the higher);
  // pushes below his centre of mass knock his feet, and the top lags.
  const applyPush = (fx, fz, J, h, pt) => {
    const lx = fx, lz = -fz;                                  // lean axes: +x right, +z backward
    const tip = J * (h * 1.5 - Math.max(0, COM - h) * 1.1);
    bal.wx += lx * tip; bal.wz += lz * tip;
    const bend = J * Math.max(0, h - 0.27) * 2.0;             // the upper body bends first
    S.bendX.v += lx * bend; S.bendZ.v += lz * bend;
    if (h < 0.5 && mode !== "held") { P.vx += fx * J * (0.5 - h) * 1.6; P.vz += fz * J * (0.5 - h) * 1.6; }   // the feet slide
    // off centre, the push also turns him: the side that is pushed goes back
    if (pt) S.yaw.v += ((pt.z - P.z) * fx - (pt.x - P.x) * fz) * J * 8;
    S.keys.forEach(k => k.v += J * (6 + Math.random() * 6));
    if (mode === "walk" || mode === "look" || mode === "idle") set("react");
  };
  // turn a world push into the rig's own axes (he may be turned to walk)
  const toLocal = (fx, fz) => {
    const y = yawer.rotation.y, c = Math.cos(y), s = Math.sin(y);
    return { x: c * fx - s * fz, z: s * fx + c * fz };
  };

  const busy = () => mode === "dizzy" || bal.state !== "up";
  const onScreen = () => { const t = toScreen(P.x, P.y + 1.2), b = toScreen(P.x, P.y - 0.1); return b.y > -20 && t.y < H + 20 && t.x > -PPU && t.x < W + PPU; };
  let downAt = null, hovering = false;
  const cursor = c => { document.documentElement.style.cursor = c; };

  addEventListener("pointerdown", e => {
    if ((e.pointerType === "mouse" && e.button !== 0) || mode === "air" || !onScreen()) return;
    const h = touchAt(e.clientX, e.clientY);
    if (!h || bal.state === "falling") return;
    e.preventDefault(); e.stopPropagation();
    mouse = { x: e.clientX, y: e.clientY };
    const c = classify(h);
    const n = (h.face ? h.face.normal.clone() : new THREE.Vector3(0, 0, 1)).transformDirection(h.object.matrixWorld);
    c.bone.updateWorldMatrix(true, false);
    const boneInv = new THREE.Matrix4().copy(c.bone.matrixWorld).invert();
    contact = {
      ...c, t0: performance.now(), pressure: 0,
      localP: c.bone.worldToLocal(h.point.clone()),
      localDir: n.clone().negate().transformDirection(boneInv),     // into the body
      h: h.point.y - P.y,
      key: c.part === "key" ? B.keys.indexOf(c.bone) : -1,
    };
    const R = PARTS[c.part];
    U.uDentR.value = R.r;
    lastTouch = { part: c.part, bone: c.bone && c.bone.name, h: +contact.h.toFixed(2), n: [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(2)] };
    downAt = { x: e.clientX, y: e.clientY, t: performance.now(), samples: [{ x: e.clientX, t: performance.now() }] };
    grab = null;
    document.documentElement.style.userSelect = "none";
    following = false;
    if (c.part === "key") speak(["K", "E", "Y", "B", "O", "space"][keyNames.indexOf(c.bone.name)] + "!", true);
    else if (c.part === "eye") { faceT.squint = 1; speak("My eye!", true); }
    else if (c.part === "torso" && h.point.y - P.y < 0.62) speak("Hehe, that tickles", true);
    else speak("Hey!", true);
    wake();
  }, { capture: true });

  addEventListener("pointermove", e => {
    mouse = { x: e.clientX, y: e.clientY };
    if (!downAt) {
      if (onScreen() && !busy()) {
        const w = toWorld(e.clientX, e.clientY);
        const h = Math.abs(w.x - P.x) < width * 0.6 && w.y > P.y - 0.05 && w.y < P.y + 1.08;
        if (h !== hovering) { hovering = h; cursor(h ? "grab" : ""); }
      }
      return;
    }
    downAt.samples.push({ x: e.clientX, t: performance.now() });
    if (downAt.samples.length > 6) downAt.samples.shift();
    const dx = e.clientX - downAt.x, dy = e.clientY - downAt.y;
    if (!contact || mode === "held" || Math.hypot(dx, dy) < 8) return;
    if (dy < -8 && -dy > Math.abs(dx) * 0.8 && contact.part !== "key") {
      // upwards: pick him up by the point you are holding
      const w = toWorld(e.clientX, e.clientY);
      grab = { gx: w.x - P.x, gy: Math.max(0.35, w.y - P.y), tx: w.x, ty: w.y, px: w.x, pvx: 0, last: performance.now() };
      endContact(true);
      set("held"); speak("Whoa, put me down!", true); play("dangle", 0.15);
      faceT.surprised = 1; faceT.smile = 0;
      swing.len = Math.max(0.3, grab.gy - 0.42); swing.a = 0; swing.w = 0;
      cursor("grabbing");
    } else if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      // sideways: a shove that way, as hard as the swipe was fast
      const s = downAt.samples, a = s[0], b = s[s.length - 1];
      const speed = Math.abs((b.x - a.x) / Math.max(16, b.t - a.t) * 1000);
      const J = Math.min(7, Math.max(0.8, speed / 300));
      applyPush(Math.sign(dx), 0, J, contact.h, contactWorld().p);
      S.dent.v += PARTS[contact.part].depth * 18 * Math.min(1, J / 3);
      speak(J > 3 ? "Whoa!" : "Hey!", true);
      endContact(true);
    }
  }, { passive: true });

  function endContact(fromSwipe) {
    if (!contact) return;
    S.dent.t = 0; S.dent.k = 380; S.dent.c = 9;          // springs back with a jiggle
    if (contact.part === "key") S.keys[contact.key].t = 0;
    if (contact.limb) { S.limb[contact.limb].x.t = 0; S.limb[contact.limb].z.t = 0; }
    S.bendX.t = 0; S.bendZ.t = 0;
    faceT.squint = 0;
    if (!fromSwipe && performance.now() - contact.t0 < 180) {
      // a quick tap: a short dimple that springs back, and a sharp push into the surface
      const R = PARTS[contact.part];
      S.dent.v += R.depth * 12;
      if (contact.part === "key") S.keys[contact.key].v -= 14;
      else {
        const { n } = contactWorld();
        const len = Math.hypot(n.x, n.z);
        if (len > 0.3) {
          const fx = n.x / len, fz = n.z / len;
          applyPush(fx, fz, TAP, contact.h, contactWorld().p);
          if (contact.limb) { const loc = toLocal(fx, fz); S.limb[contact.limb].x.v += loc.z * 7; S.limb[contact.limb].z.v -= loc.x * 7; }
        } else { S.squash.v -= 7; S.keys.forEach(k => k.v += 8); }       // from on top: he squats
      }
    }
    contact = null;
  }

  // a fast double tap on the top of his head: he spins, dizzy, then falls
  // the way he is facing when the spin runs out
  let lastHeadTap = 0;
  const headTap = () => {
    if (!downAt || !contact || (contact.part !== "head" && contact.part !== "key") || performance.now() - downAt.t > 220) return false;
    const now = performance.now();
    if (now - lastHeadTap < 380 && !busy()) { lastHeadTap = 0; spinV = 24; faceT.squint = 1; speak("Wheee…", true); set("dizzy"); return true; }
    lastHeadTap = now; return false;
  };

  const release = () => {
    if (headTap()) endContact(true);
    if (mode === "held") {
      set("air"); play("flail", 0.12);
      following = floorY > H - 40;                          // dropped above a floor that is off screen: follow him down
    }
    endContact(false);
    grab = null; downAt = null; hovering = false;
    cursor(""); document.documentElement.style.userSelect = "";
  };
  addEventListener("pointerup", release, true);
  addEventListener("pointercancel", release, true);
  document.documentElement.addEventListener("pointerleave", () => { if (!downAt) mouse = null; });
  addEventListener("touchstart", e => { const t = e.touches[0]; if (t && onScreen() && touchAt(t.clientX, t.clientY)) e.preventDefault(); }, { passive: false, capture: true });
  addEventListener("wheel", () => { following = false; }, { passive: true });
  addEventListener("touchmove", () => { if (!downAt) following = false; }, { passive: true });

  // ---------- the loop ----------
  const clock = new THREE.Clock();
  let running = false, drawn = false, frozen = false;
  const eul = new THREE.Euler(), q = new THREE.Quaternion(), axis = new THREE.Vector3();

  const near = () => {
    if (!mouse || downAt || mode === "held" || mode === "air" || busy()) return false;
    const w = toWorld(mouse.x, mouse.y);
    return Math.hypot(w.x - P.x, w.y - (P.y + 0.6)) < 1.6;
  };

  const stepBalance = dt => {
    let a = Math.hypot(bal.x, bal.z);
    const ux = a > 1e-6 ? bal.x / a : 0, uz = a > 1e-6 ? bal.z / a : 0;
    if (bal.state === "up") {
      if (a > critical(ux, uz)) { bal.state = "falling"; faceT.surprised = 1; speak("Whoa!", true); play("flail", 0.15); }
      else {
        // his feet push him back upright, less and less as his weight nears
        // the edge of his footprint, while gravity leans on him more: so a
        // small push rocks and settles, a big one hangs on the edge a moment
        // and then goes over
        const r = a / critical(ux, uz), k = 62 * Math.max(0, 1 - r * r), c = 6;
        const g = (G / COM) * 0.35 * Math.sin(a);
        bal.wx += (-k * bal.x + g * ux - c * bal.wx) * dt;
        bal.wz += (-k * bal.z + g * uz - c * bal.wz) * dt;
      }
    }
    if (bal.state === "falling") {
      // past the edge of his feet nothing holds him: gravity's torque grows as he goes over
      const acc = G / (COM * 1.2) * Math.sin(Math.max(a, 0.05));
      bal.wx += (acc * ux - 0.3 * bal.wx) * dt;
      bal.wz += (acc * uz - 0.3 * bal.wz) * dt;
    }
    if (bal.state === "up" || bal.state === "falling") { bal.x += bal.wx * dt; bal.z += bal.wz * dt; }
    a = Math.hypot(bal.x, bal.z);
    if (bal.state === "falling" && a >= Math.PI / 2) {
      const s = (Math.PI / 2) / a; bal.x *= s; bal.z *= s;
      const wr = bal.wx * ux + bal.wz * uz;                   // how fast he hit the floor
      if (wr > 0) {
        bal.wx -= 1.32 * wr * ux; bal.wz -= 1.32 * wr * uz;   // a little bounce back up
        S.squash.v -= Math.min(14, wr * 2.2); S.keys.forEach(k => k.v += wr * 10);
        const e = support(ux, uz);
        dust(P.x + ux * (e + 0.6), Math.min(1, wr / 6));
        if (wr < 1.6) { bal.wx = bal.wz = 0; bal.state = "down"; faceT.surprised = 0; faceT.squint = 1; set("down"); }
      }
    }
  };

  const tick = () => {
    if (!floorNear && !downAt && mode !== "air" && mode !== "held") { running = false; if (drawn) { renderer.clear(); drawn = false; } return; }
    const dt = Math.min(0.033, clock.getDelta());
    if (!frozen) { update(dt); draw(); }
    schedule(tick);
  };
  const update = dt => {
    modeT += dt;
    const isNear = near();

    // --- pressing: the dent deepens, the limb gives, he leans away ---
    if (contact) {
      contact.pressure = 1 - Math.exp(-(performance.now() - contact.t0) / 260);
      const p = contact.pressure, R = PARTS[contact.part];
      S.dent.k = 300; S.dent.c = 16; S.dent.t = R.depth * p;
      const { p: cp, n: cn } = contactWorld();
      dentWorld.copy(cp); dentDirWorld.copy(cn);
      const fx = cn.x, fz = cn.z, len = Math.hypot(fx, fz);
      if (contact.part === "key") S.keys[contact.key].t = -p;           // the key goes down
      else if (len > 0.2) {
        // holding the push: a steady force at the contact's height. He braces
        // against it at first; keep pushing past a second and a half and he
        // gives way and goes over
        const held = (performance.now() - contact.t0) / 1000;
        const k = (5.5 * p + 7 * Math.max(0, held - 1.5)) * dt;
        applyPushSteady(fx / len, fz / len, k, contact.h);
        const loc = toLocal(fx / len, fz / len);
        if (contact.limb) { S.limb[contact.limb].x.t = loc.z * 0.55 * p; S.limb[contact.limb].z.t = -loc.x * 0.55 * p; }
        if (contact.part === "torso" || contact.part === "head") { S.bendX.t = -loc.x * 0.2 * p; S.bendZ.t = -loc.z * 0.2 * p; }
      } else S.squash.t = -0.6 * p;                                      // pressed from on top: he squats
      faceT.squint = Math.max(faceT.squint, contact.part === "eye" ? 1 : p * 0.5);
    } else if (S.dent.x < 0.0005 && Math.abs(S.dent.v) < 0.01) dentWorld.set(0, -99, 0);
    if (!contact) S.squash.t = 0;

    // --- behaviour ---
    if (mode === "walk") {
      play("walk");
      S.yaw.t = P.dir * WALK_YAW;
      const along = Math.min(1, Math.abs(Math.sin(S.yaw.x)) / Math.sin(WALK_YAW));
      P.x += P.dir * STRIDE_SPEED * Math.sin(WALK_YAW) * along * dt;
      if (P.x > span()) P.x = -span(); else if (P.x < -span()) P.x = span();
      if (Math.random() < dt * 0.05) set("idle");
      if (isNear) set("look");
    } else if (mode === "idle") {
      play("idle"); S.yaw.t = 0;
      if (isNear) set("look");
      else if (modeT > 1.6) { if (Math.random() < 0.25) P.dir = -P.dir; set("walk"); }
    } else if (mode === "look") {
      if (cur !== "wave") play("idle");
      S.yaw.t = 0; faceT.smile = 0.45;
      if (modeT < 0.05 && performance.now() - waved > 12000 && Math.random() < 0.5 && A.wave) {
        waved = performance.now(); A.wave.reset(); play("wave", 0.2); faceT.mouth_open = 0.8; speak("Hi!");
        setTimeout(() => { faceT.mouth_open = 0; }, 900);
        setTimeout(() => { if (cur === "wave") play("idle", 0.35); }, dur("wave") * 1000 - 300);
      }
      if (!isNear) { faceT.smile = 0; set("idle"); modeT = 1.2; }
    } else if (mode === "react") {
      // pushed and finding his feet again
      if (cur !== "flail") play("idle", 0.15);
      faceT.smile = 0;
      P.vx *= Math.pow(0.02, dt); P.x += P.vx * dt;           // feet slide, friction stops them
      P.vz *= Math.pow(0.02, dt); P.z += P.vz * dt;
      const settled = bal.state === "up" && Math.hypot(bal.x, bal.z) < 0.02 && Math.hypot(bal.wx, bal.wz) < 0.08 && !contact;
      if (settled && modeT > 0.4) set(isNear ? "look" : "idle");
    } else if (mode === "held") {
      if (mouse) {
        const edgeZ = 80;
        if (mouse.y < edgeZ) scrollBy(0, -Math.ceil((edgeZ - mouse.y) * 0.4));
        else if (mouse.y > H - edgeZ) scrollBy(0, Math.ceil((mouse.y - (H - edgeZ)) * 0.4));
        placeCamera();
        const w = toWorld(mouse.x, mouse.y);
        grab.tx = w.x; grab.ty = Math.max(grab.gy, w.y);
      }
      // he hangs from the hold point as a pendulum, pushed by its sideways acceleration
      const now = performance.now(), ddt = Math.max(0.008, (now - grab.last) / 1000);
      const vx = (grab.tx - grab.px) / ddt, ax = (vx - grab.pvx) / ddt;
      grab.pvx = vx; grab.px = grab.tx; grab.last = now;
      const L = swing.len;
      const alpha = -(G / L) * Math.sin(swing.a) - Math.max(-60, Math.min(60, ax)) / L * Math.cos(swing.a) - 3.2 * swing.w;
      swing.w += alpha * dt; swing.a = Math.max(-1.3, Math.min(1.3, swing.a + swing.w * dt));
      // lifted off his feet, whatever lean he had straightens out
      bal.state = "up"; bal.wx = bal.wz = 0; bal.x *= Math.pow(0.004, dt); bal.z *= Math.pow(0.004, dt);
      const nx = grab.tx - grab.gx, ny = grab.ty - grab.gy;
      P.vx = (nx - P.x) / dt; P.vy = (ny - P.y) / dt;
      P.x = nx; P.y = ny;
      S.yaw.t = 0;
    } else if (mode === "air") {
      P.vy = Math.max(-16, P.vy - G * dt);
      P.x += P.vx * dt; P.y += P.vy * dt;
      if (Math.abs(P.x) > span()) P.x = -Math.sign(P.x) * span();
      if (following) {
        const sy = toScreen(P.x, P.y + 0.5).y;
        if (sy > H * 0.55) { scrollBy(0, Math.round(sy - H * 0.55)); placeCamera(); }
      }
      swing.w += (-(G / swing.len) * Math.sin(swing.a) * 0.15 - 2.0 * swing.w) * dt; swing.a += swing.w * dt;
      if (P.y <= 0) {
        const impact = -P.vy; P.y = 0;
        S.squash.v -= Math.min(30, impact * 2.6);
        S.keys.forEach(k => k.v += impact * 4.5 + Math.random() * 6);
        swing.w *= 0.4;
        dust(P.x, Math.min(1, impact / 9));
        if (impact > 3.4) { P.vy = impact * 0.3; P.vx *= 0.55; }
        else {
          // he lands moving sideways: the feet stop, the top carries on
          bal.wx += P.vx * 0.9; swing.a = 0;
          P.vy = 0; P.vx = 0; faceT.surprised = 0; following = false; set("land");
          if (A.land) play("land", 0.08); else play("idle", 0.2);
          speak(impact > 2.2 ? "Oof!" : "Phew.");
        }
      }
    } else if (mode === "land") {
      swing.a *= Math.pow(0.02, dt);
      if (modeT > Math.max(0.5, dur("land"))) set(bal.state === "up" ? (isNear ? "look" : "idle") : "react");
    } else if (mode === "dizzy") {
      spinA += spinV * dt; spinV *= Math.pow(0.16, dt);
      if (spinV < 2.2) {
        // he falls the way he is facing when the spin runs out
        const y = yawer.rotation.y + spinA; spinA = 0;
        bal.x = Math.sin(y) * 0.5; bal.z = -Math.cos(y) * 0.5; bal.wx = bal.x * 2; bal.wz = bal.z * 2;
        set("react");
      }
    } else if (mode === "down") {
      play("idle", 0.3);
      if (modeT > 1.2) { bal.state = "rising"; bal.from = { x: bal.x, z: bal.z }; faceT.squint = 0; speak("I'm okay!", true); set("rising"); }
    } else if (mode === "rising") {
      // back up onto his feet: rolls up, a little hop, a squash as he lands
      const t = Math.min(1, modeT / 0.85), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      bal.x = bal.from.x * (1 - e); bal.z = bal.from.z * (1 - e);
      P.y = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.06;
      if (t >= 1) { P.y = 0; bal.x = bal.z = bal.wx = bal.wz = 0; bal.state = "up"; S.squash.v -= 5; set("idle"); }
    }
    if (mode !== "held" && mode !== "air") { swing.a *= Math.pow(0.001, dt); swing.w = 0; }
    if (mode === "walk" || mode === "idle" || mode === "look") { P.z *= Math.pow(0.35, dt); P.vz = 0; }
    if (mode !== "held" && mode !== "air" && mode !== "rising") stepBalance(dt);

    // --- where to look: eyes first, the head after ---
    let ex = 0, ey = 0, hy = 0, hp = 0;
    if (mode === "look" && mouse) {
      const w = toWorld(mouse.x, mouse.y);
      const dx = w.x - P.x, dy = w.y - (P.y + 0.62);
      const yaw = Math.atan2(dx, 1.3), pitch = Math.atan2(dy, 1.3 + Math.abs(dx) * 0.5);
      ex = Math.max(-1, Math.min(1, yaw / 0.55)); ey = Math.max(-1, Math.min(1, pitch / 0.45));
      hy = Math.max(-1.2, Math.min(1.2, yaw * 0.9)); hp = Math.max(-0.38, Math.min(0.42, pitch * 0.75));
    } else if (mode === "walk") ex = 0.25;
    else if (mode === "held") { ey = -0.6; hp = -0.2; }
    else if (contact && dentWorld.y > -50) {
      // looking at the finger that is pressing him
      const lp = yawer.worldToLocal(tmpV.copy(dentWorld));
      ex = Math.max(-1, Math.min(1, lp.x / 0.4)); ey = Math.max(-1, Math.min(1, (lp.y - 0.62) / 0.3));
    }
    S.eyeX.t = ex; S.eyeY.t = ey; S.headYaw.t = hy; S.headPitch.t = hp;
    for (const s of [S.yaw, S.headYaw, S.headPitch, S.eyeX, S.eyeY, S.squash, S.dent, S.bendX, S.bendZ]) s.step(dt);
    S.keys.forEach(k => k.step(dt));
    for (const n of limbs) { S.limb[n].x.step(dt); S.limb[n].z.step(dt); }

    blinkIn -= dt;
    if (blinkIn <= 0) { faceT.blink = 1; setTimeout(() => { faceT.blink = 0; }, 90); blinkIn = 2.2 + Math.random() * 3.2; }

    // --- pose ---
    driven.forEach(d => { d.o.quaternion.copy(d.q); d.o.position.copy(d.p); d.o.scale.copy(d.s); });
    mixer.update(dt);
    applyFace(dt);
    yawer.rotation.y = S.yaw.x + spinA;
    if (B.body) {
      // looking, plus the bend at the hips (in his own axes)
      const bl = toLocal(S.bendX.x, -S.bendZ.x);
      eul.set(-S.headPitch.x + bl.z, S.headYaw.x, -bl.x, "YXZ");
      B.body.quaternion.multiply(q.setFromEuler(eul));
      const speed = Math.hypot(P.vx, P.vy);
      const stretch = mode === "air" ? Math.min(0.2, speed * 0.016) : 0;
      const sy = Math.max(0.6, 1 + S.squash.x * 0.22 + stretch), sxz = 1 / Math.sqrt(sy);
      B.body.scale.x *= sxz; B.body.scale.y *= sy; B.body.scale.z *= sxz;
    }
    for (const n of limbs) {
      eul.set(S.limb[n].x.x, 0, S.limb[n].z.x, "XYZ");
      B[n].quaternion.multiply(q.setFromEuler(eul));
    }
    for (const e of [B.eyeL, B.eyeR]) if (e) { e.position.x += S.eyeX.x * 0.024; e.position.y += S.eyeY.x * 0.016; }
    B.keys.forEach((k, i) => { k.position.y += S.keys[i].x * 0.026; k.rotation.x += S.keys[i].x * 0.06; });
    U.uDentD.value = Math.max(-0.02, S.dent.x);

    // --- placement ---
    mover.position.set(P.x, P.y, P.z);
    const held = mode === "held" || mode === "air" || mode === "land";
    const gy = grab ? grab.gy : 0.75;
    hang.position.y = held ? gy : 0; hangBack.position.y = held ? -gy : 0;
    hang.rotation.z = swing.a;
    // the lean pivots on the edge of his footprint it is going over
    const a = Math.hypot(bal.x, bal.z);
    if (a > 1e-5) {
      const ux = bal.x / a, uz = bal.z / a;
      const e = support(ux, uz) * Math.min(1, a / 0.2);
      tipper.position.set(ux * e, 0, -uz * e); untip.position.set(-ux * e, 0, uz * e);
      axis.set(-uz, 0, -ux).normalize();                     // up x (ux, 0, -uz)
      tipper.quaternion.setFromAxisAngle(axis, a);
    } else { tipper.position.set(0, 0, 0); untip.position.set(0, 0, 0); tipper.quaternion.identity(); }

    for (const l of lights) { l.position.set(P.x + l.userData.off.x, l.userData.off.y, l.userData.off.z); l.target.position.set(P.x, 0.586, 0); }
  };
  const draw = () => {
    placeCamera();
    const sp = toScreen(P.x, P.y + 1.12);
    say.style.left = sp.x + "px"; say.style.top = sp.y + "px";
    if (onScreen()) {
      const held = mode === "held" || mode === "air" || mode === "land";
      motionBlur(held ? P.vx : 0, mode === "air" ? P.vy : 0);
      renderer.render(scene, camera);
      drawn = true;
    } else if (drawn) { renderer.clear(); drawn = false; }
  };
  // a steady push while held down, as a torque per frame
  function applyPushSteady(fx, fz, k, h) {
    const lx = fx, lz = -fz;
    const tip = k * (h * 1.5 - Math.max(0, COM - h) * 1.1);
    bal.wx += lx * tip; bal.wz += lz * tip;
    if (h < 0.5) { P.vx += fx * k * (0.5 - h) * 0.8; P.vz += fz * k * (0.5 - h) * 0.8; }
    if (mode === "walk" || mode === "look" || mode === "idle") set("react");
  }
  const schedule = f => (document.hidden ? setTimeout(f, 33) : requestAnimationFrame(f));

  // dust puffs on landings
  function dust(x, amount) {
    const s = toScreen(x, 0);
    for (let i = 0; i < 6; i++) {
      const d = document.createElement("i");
      d.className = "kb3d-dust";
      d.style.left = s.x + "px"; d.style.top = (s.y - 9) + "px";
      d.style.setProperty("--dx", ((i - 2.5) * 22 * (0.6 + amount)).toFixed(0) + "px");
      d.style.setProperty("--s", (0.6 + amount * 0.9).toFixed(2));
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 700);
    }
  }

  let floorNear = true;
  function wake() { if (!running) { running = true; clock.getDelta(); schedule(tick); } }
  new IntersectionObserver(([e]) => { floorNear = e.isIntersecting; if (floorNear) wake(); }, { rootMargin: "100% 0px" }).observe(host);
  running = true; clock.getDelta(); schedule(tick);

  // For checking the physics by hand from the console.
  return host.__keybo3d = {
    canvas,
    get state() {
      const m = toScreen(P.x, P.y + 0.5);
      return {
        mode, bal: bal.state, lean: { x: +bal.x.toFixed(3), z: +bal.z.toFixed(3) }, x: +P.x.toFixed(3), y: +P.y.toFixed(3),
        dent: +S.dent.x.toFixed(4), bend: { x: +S.bendX.x.toFixed(3), z: +S.bendZ.x.toFixed(3) }, anim: cur,
        sx: Math.round(m.x), sy: Math.round(m.y), following, touch: lastTouch,
        headTurn: B.body ? +(2 * Math.acos(Math.min(1, Math.abs(B.body.quaternion.w)))).toFixed(3) : 0,
      };
    },
    screenOf(x, y, z = 0) { return toScreen(P.x + x, P.y + y, z); },
    drop(height = 1.6) { P.y = height; P.vx = 0; P.vy = 0; swing.a = 0.25; swing.w = 0; set("air"); play("flail", 0.1); },
    push(fx, fz, J, h) { applyPush(fx, fz, J, h); },
    forceRun() { floorNear = true; wake(); },
    // tests: stop the clock, then run the simulation forward by `sec` at 60 fps and draw once
    freeze(on = true) { frozen = on; },
    advance(sec, every) { const out = []; for (let t = 0, i = 0; t < sec; t += 1 / 60, i++) { update(1 / 60); if (every && i % every === 0) out.push(this.state); } draw(); return out; },
  };
}

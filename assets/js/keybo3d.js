// KEYBO in real-time 3D, above the footer.
//
// The Animation session's Blender rig (assets/keybo/3d/keybo.glb: 1 m tall,
// Y up, facing +Z; bones root, hips, legs, body, arms, eyes, keycaps; morphs
// blink, squint, surprised, smile, mouth_open; actions idle, walk, dangle,
// flail, wave, land, getup), lit like its Cycles studio and moved by physics:
//   - it walks the floor at its real stride (0.332 m per cycle);
//   - inside a circle round it, it stops and watches the cursor the way a
//     person does: the eyes jump first, the head follows on a softer spring;
//   - pick it up and it hangs from where you hold it and swings like a
//     pendulum, legs kicking;
//   - let go, or throw it, and it falls under gravity, stretched and motion
//     blurred, lands with a volume-keeping squash, bounces lower each time,
//     its keycaps jiggling;
//   - poke it and it wobbles; three pokes and it tips over its bottom edge
//     and gets up; a fast double tap on its head and it spins dizzy first.
// It draws only while on screen. Without WebGL or the model, site.js keeps
// the sprite walker.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const WALK_YAW = THREE.MathUtils.degToRad(60);   // facing while walking: mostly sideways
const STRIDE_SPEED = 0.498;                       // m/s along its facing, from the rig
const G = 9.81 * 2.2;                             // a 1 m toy falls a little snappier than real life

export async function start({ host, modelUrl, reduce }) {
  if (host.__keybo3d) return host.__keybo3d;          // one KEYBO per floor
  const canvas = document.createElement("canvas");
  canvas.className = "kb3d";
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;       // the renders use Blender "Standard"
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();

  // The Cycles studio, as directional lights at the same places (aimed at
  // KEYBO's middle), and a grey ambient for the diffuse fill. No bright
  // environment, so the eyes stay deep black with only their highlights.
  const ambient = new THREE.AmbientLight(0xffffff, 0.62);
  const mk = (i, x, y, z, shadow) => {
    const l = new THREE.DirectionalLight(0xffffff, i);
    l.userData.off = new THREE.Vector3(x, y, z);
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.set(1024, 1024);
      Object.assign(l.shadow.camera, { left: -1.3, right: 1.3, top: 1.6, bottom: -0.6, near: 0.1, far: 12 });
      l.shadow.radius = 7; l.shadow.bias = -0.0005; l.shadow.normalBias = 0.02;
    }
    scene.add(l, l.target);
    return l;
  };
  const lights = [mk(2.7, -1.71, 3.18, 2.69, true), mk(0.95, 0.73, 2.44, -2.44), mk(0.18, 0, 3.42, 0), mk(0.14, 2.44, 1.47, 1.95)];
  scene.add(ambient);

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

  // mover (where it is) > hang (swings about the point you hold it by)
  // > tipper (turns on the bottom edge it topples over) > leaner (sways and
  // wobbles about its feet) > yawer (which way it faces) > the rig.
  const mover = new THREE.Group(), hang = new THREE.Group(), hangBack = new THREE.Group();
  const tipper = new THREE.Group(), untip = new THREE.Group(), leaner = new THREE.Group(), yawer = new THREE.Group();
  mover.add(hang); hang.add(hangBack); hangBack.add(tipper); tipper.add(untip); untip.add(leaner); leaner.add(yawer); yawer.add(model);
  scene.add(mover);

  const width = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x;
  const bone = n => model.getObjectByName(n);
  const B = {
    body: bone("body"), eyeL: bone("eye_L"), eyeR: bone("eye_R"),
    keys: ["key_K", "key_E", "key_Y", "key_B", "key_O", "key_space"].map(bone).filter(Boolean),
  };
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
    squash: spring(320, 11), tilt: spring(150, 6), lean: spring(70, 10),
    keys: B.keys.map((_, i) => spring(240 + i * 18, 5.5)),
  };

  // ---------- the stage ----------
  let W = 1, H = 1;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  const resize = () => {
    W = host.clientWidth; H = host.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const ppu = Math.min(185, Math.max(120, H * 0.42));      // pixels per metre, so KEYBO is about this tall
    const d = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * ppu);
    const lookY = (H / 2 - 20) / ppu;                         // the floor sits 20 px above the bottom
    const el = THREE.MathUtils.degToRad(10);
    camera.position.set(0, lookY + Math.sin(el) * d, Math.cos(el) * d);
    camera.lookAt(0, lookY, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(host);
  const toWorld = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.y } : { x: 0, y: 0 };
  };
  const toScreen = (x, y) => {
    const v = new THREE.Vector3(x, y, 0).project(camera);
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H };
  };
  const halfW = () => Math.abs(toWorld(canvas.getBoundingClientRect().right - 2, canvas.getBoundingClientRect().bottom - 24).x) - width * 0.75;
  const topY = () => toWorld(canvas.getBoundingClientRect().left + W / 2, canvas.getBoundingClientRect().top + 8).y - 1.05;

  // ---------- state ----------
  const P = { x: -halfW() * 0.5, y: 0, vx: 0, vy: 0, dir: 1 };
  let mode = "walk", modeT = 0, mouse = null, grab = null, pokes = 0, pokeAt = 0, headTapAt = 0, waved = 0;
  const swing = { a: 0, w: 0, len: 0.6 };
  const topple = { a: 0, v: 0 };
  let spinA = 0, spinV = 0, blinkIn = 1.5;
  const set = m => { mode = m; modeT = 0; };

  // ---------- motion blur: a directional blur on the canvas while fast ----------
  const svgNS = "http://www.w3.org/2000/svg";
  const fsvg = document.createElementNS(svgNS, "svg");
  fsvg.setAttribute("width", "0"); fsvg.setAttribute("height", "0"); fsvg.style.position = "absolute";
  fsvg.innerHTML = '<filter id="kb3d-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0 0"/></filter>';
  document.body.appendChild(fsvg);
  const blurNode = fsvg.querySelector("feGaussianBlur");
  let blurOn = false, lastBlur = "";
  const motionBlur = (vx, vy) => {
    const ppm = H * 0.42;
    const sx = Math.min(9, Math.abs(vx) * ppm / 950), sy = Math.min(13, Math.abs(vy) * ppm / 760);
    const on = !reduce && sx + sy > 0.9;
    if (on) {
      const v = `${sx.toFixed(1)} ${sy.toFixed(1)}`;
      if (v !== lastBlur) { blurNode.setAttribute("stdDeviation", v); lastBlur = v; }
      if (!blurOn) { canvas.style.filter = "url(#kb3d-blur)"; blurOn = true; }
    } else if (blurOn) { canvas.style.filter = ""; blurOn = false; }
  };

  // ---------- speech ----------
  const say = host.querySelector(".walker-say-3d");
  let sayTimer = 0;
  const speak = text => {
    if (!say) return;
    say.textContent = text; say.classList.add("show");
    clearTimeout(sayTimer); sayTimer = setTimeout(() => say.classList.remove("show"), 1400);
  };

  // ---------- input ----------
  const busy = () => ["topple", "down", "getup", "dizzy"].includes(mode);
  const hits = (cx, cy) => {
    const w = toWorld(cx, cy);
    return !busy() && Math.abs(w.x - P.x) < width * 0.6 && w.y > P.y - 0.05 && w.y < P.y + 1.08;
  };
  let downAt = null;
  canvas.style.cursor = "default";
  canvas.addEventListener("pointerdown", e => {
    if (!hits(e.clientX, e.clientY)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    downAt = { x: e.clientX, y: e.clientY, head: w.y > P.y + 0.6 };
    grab = { gx: w.x - P.x, gy: Math.max(0.35, w.y - P.y), tx: w.x, ty: w.y, px: w.x, pvx: 0, last: performance.now() };
  });
  canvas.addEventListener("pointermove", e => {
    mouse = { x: e.clientX, y: e.clientY };
    if (!grab) { canvas.style.cursor = hits(e.clientX, e.clientY) ? "grab" : "default"; return; }
    const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6;
    if (moved && mode !== "held") {
      set("held"); speak("Whoa, put me down!"); play("dangle", 0.15);
      faceT.surprised = 1; faceT.smile = 0;
      swing.len = Math.max(0.3, grab.gy - 0.42); swing.a = 0; swing.w = 0;
      canvas.style.cursor = "grabbing";
    }
    if (mode === "held") {
      const w = toWorld(e.clientX, e.clientY);
      grab.tx = Math.max(-halfW() - 0.2, Math.min(halfW() + 0.2, w.x));
      grab.ty = Math.max(grab.gy, Math.min(topY() + grab.gy, w.y));
    }
  });
  const release = () => {
    if (!grab) return;
    if (mode === "held") {
      set("air"); play("flail", 0.12);
      canvas.style.cursor = "default";
    } else if (downAt) poke(downAt.head);
    grab = null; downAt = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  addEventListener("pointermove", e => { mouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { mouse = null; });
  canvas.addEventListener("touchstart", e => { const t = e.touches[0]; if (t && hits(t.clientX, t.clientY)) e.preventDefault(); }, { passive: false });

  function poke(head) {
    if (busy() || mode === "air") return;
    const now = performance.now();
    if (head && now - headTapAt < 380) { headTapAt = 0; pokes = 0; speak("Wheee…"); spinV = 24; faceT.squint = 1; set("dizzy"); return; }
    if (head) headTapAt = now;
    pokes = now - pokeAt < 900 ? pokes + 1 : 1; pokeAt = now;
    if (pokes >= 3) { pokes = 0; speak("Whoa!"); faceT.surprised = 1; topple.v = 1.3; set("topple"); return; }
    speak(pokes === 1 ? "Hey!" : "Hey, stop it 😄");
    S.tilt.v += (Math.random() < .5 ? -1 : 1) * 10; S.squash.v -= 5;
    S.keys.forEach(k => k.v += 16 + Math.random() * 10);
    faceT.squint = 1; setTimeout(() => { faceT.squint = 0; }, 260);
    if (mode === "walk") set("idle");
  }

  // ---------- the loop ----------
  const clock = new THREE.Clock();
  let running = false;
  const eul = new THREE.Euler(), q = new THREE.Quaternion();

  const near = () => {
    if (!mouse || mode === "held" || mode === "air" || busy()) return false;
    const w = toWorld(mouse.x, mouse.y);
    return Math.hypot(w.x - P.x, w.y - (P.y + 0.6)) < 1.6;
  };

  const tick = () => {
    if (!running) return;
    const dt = Math.min(0.033, clock.getDelta());
    modeT += dt;
    const isNear = near();

    // --- behaviour ---
    if (mode === "walk") {
      play("walk");
      S.yaw.t = P.dir * WALK_YAW;
      const along = Math.min(1, Math.abs(Math.sin(S.yaw.x)) / Math.sin(WALK_YAW));   // no gliding while turning
      P.x += P.dir * STRIDE_SPEED * Math.sin(WALK_YAW) * along * dt;
      if (Math.abs(P.x) > halfW()) { P.x = Math.sign(P.x) * halfW(); P.dir = -P.dir; set("idle"); }
      else if (Math.random() < dt * 0.05) set("idle");
      if (isNear) set("look");
    } else if (mode === "idle") {
      play("idle"); S.yaw.t = 0;
      if (isNear) set("look"); else if (modeT > 1.6) set("walk");
    } else if (mode === "look") {
      if (cur !== "wave") play("idle");
      S.yaw.t = 0; faceT.smile = 0.45;
      if (modeT < 0.05 && performance.now() - waved > 12000 && Math.random() < 0.5 && A.wave) {
        waved = performance.now(); A.wave.reset(); play("wave", 0.2); faceT.mouth_open = 0.8; speak("Hi!");
        setTimeout(() => { faceT.mouth_open = 0; }, 900);
        setTimeout(() => { if (cur === "wave") play("idle", 0.35); }, dur("wave") * 1000 - 300);
      }
      if (!isNear) { faceT.smile = 0; set("idle"); modeT = 1.2; }
    } else if (mode === "held") {
      // The hold point follows the pointer; KEYBO hangs below it as a
      // pendulum, pushed by the hold point's sideways acceleration.
      const now = performance.now(), ddt = Math.max(0.008, (now - grab.last) / 1000);
      const vx = (grab.tx - grab.px) / ddt, ax = (vx - grab.pvx) / ddt;
      grab.pvx = vx; grab.px = grab.tx; grab.last = now;
      const L = swing.len;
      const alpha = -(G / L) * Math.sin(swing.a) - Math.max(-60, Math.min(60, ax)) / L * Math.cos(swing.a) - 3.2 * swing.w;
      swing.w += alpha * dt; swing.a = Math.max(-1.3, Math.min(1.3, swing.a + swing.w * dt));
      const nx = grab.tx - grab.gx, ny = grab.ty - grab.gy;
      P.vx = (nx - P.x) / dt; P.vy = (ny - P.y) / dt;
      P.x = nx; P.y = ny;
      S.yaw.t = 0;
    } else if (mode === "air") {
      P.vy -= G * dt; P.x += P.vx * dt; P.y += P.vy * dt;
      if (Math.abs(P.x) > halfW() + 0.2) { P.x = Math.sign(P.x) * (halfW() + 0.2); P.vx *= -0.4; }
      swing.w += (-(G / swing.len) * Math.sin(swing.a) * 0.15 - 2.0 * swing.w) * dt; swing.a += swing.w * dt;
      if (P.y <= 0) {
        const impact = -P.vy; P.y = 0;
        S.squash.v -= Math.min(30, impact * 2.6);                      // the body presses into the floor
        S.keys.forEach(k => k.v += impact * 4.5 + Math.random() * 6);
        swing.w *= 0.4;
        dust(P.x, Math.min(1, impact / 9));
        if (impact > 3.4) { P.vy = impact * 0.3; P.vx *= 0.55; }      // bounce, lower each time
        else {
          P.vy = 0; P.vx = 0; faceT.surprised = 0; set("land");
          if (A.land) { play("land", 0.08); } else play("idle", 0.2);
          speak(impact > 2.2 ? "Oof!" : "Phew.");
        }
      }
    } else if (mode === "land") {
      swing.a *= Math.pow(0.02, dt);
      if (modeT > Math.max(0.5, dur("land"))) set(isNear ? "look" : "idle");
    } else if (mode === "dizzy") {
      spinA += spinV * dt; spinV *= Math.pow(0.16, dt);
      if (spinV < 2.2) { spinA = 0; topple.v = 1.5; faceT.surprised = 1; set("topple"); }
    } else if (mode === "topple") {
      // a rigid box tipping over its bottom edge: gravity's torque grows as it leans
      topple.v += 10 * Math.sin(topple.a + 0.16) * dt; topple.a += topple.v * dt;
      if (topple.a >= Math.PI / 2) {
        topple.a = Math.PI / 2; topple.v = -topple.v * 0.3;
        S.keys.forEach(k => k.v += 20); S.squash.v -= 6; dust(P.x + 0.5, 0.75);
        if (Math.abs(topple.v) < 0.7) { topple.v = 0; faceT.surprised = 0; faceT.squint = 1; set("down"); }
      }
    } else if (mode === "down") {
      if (modeT > 1.1) {
        // The rig's getup starts lying on its left side with its feet at the
        // root: hand over to it where the feet are now.
        P.x += width * 0.48; topple.a = 0; faceT.squint = 0;
        if (A.getup) play("getup", 0.06);
        speak("I'm okay!"); set("getup");
      }
    } else if (mode === "getup") {
      if (modeT > dur("getup")) set("idle");
    }
    if (mode !== "held" && mode !== "air") { swing.a *= Math.pow(0.001, dt); swing.w = 0; }

    // --- where to look: eyes first, the head after ---
    let ex = 0, ey = 0, hy = 0, hp = 0;
    if (mode === "look" && mouse) {
      const w = toWorld(mouse.x, mouse.y);
      const dx = w.x - P.x, dy = w.y - (P.y + 0.62);
      const yaw = Math.atan2(dx, 1.3), pitch = Math.atan2(dy, 1.3 + Math.abs(dx) * 0.5);
      ex = Math.max(-1, Math.min(1, yaw / 0.55)); ey = Math.max(-1, Math.min(1, pitch / 0.45));
      hy = Math.max(-1.2, Math.min(1.2, yaw * 0.9)); hp = Math.max(-0.38, Math.min(0.42, pitch * 0.75));
    } else if (mode === "walk") { ex = 0.25; }
    else if (mode === "held") { ey = -0.6; hp = -0.2; }
    S.eyeX.t = ex; S.eyeY.t = ey; S.headYaw.t = hy; S.headPitch.t = hp;
    S.tilt.t = 0; S.lean.t = 0;
    for (const s of [S.yaw, S.headYaw, S.headPitch, S.eyeX, S.eyeY, S.squash, S.tilt, S.lean]) s.step(dt);
    S.keys.forEach(k => k.step(dt));

    // blinking
    blinkIn -= dt;
    if (blinkIn <= 0) { faceT.blink = 1; setTimeout(() => { faceT.blink = 0; }, 90); blinkIn = 2.2 + Math.random() * 3.2; }

    // --- pose ---
    mixer.update(dt);
    applyFace(dt);
    yawer.rotation.y = S.yaw.x + spinA;
    if (B.body) {
      eul.set(-S.headPitch.x, S.headYaw.x, 0, "YXZ");
      B.body.quaternion.multiply(q.setFromEuler(eul));
      // squash and stretch about the neck, keeping the volume
      const speed = Math.hypot(P.vx, P.vy);
      const stretch = mode === "air" ? Math.min(0.2, speed * 0.016) : 0;
      const sy = Math.max(0.6, 1 + S.squash.x * 0.22 + stretch), sxz = 1 / Math.sqrt(sy);
      B.body.scale.x *= sxz; B.body.scale.y *= sy; B.body.scale.z *= sxz;
    }
    for (const e of [B.eyeL, B.eyeR]) if (e) { e.position.x += S.eyeX.x * 0.024; e.position.y += S.eyeY.x * 0.016; }
    B.keys.forEach((k, i) => { k.position.y += S.keys[i].x * 0.0035; k.rotation.x += S.keys[i].x * 0.018; });

    // --- placement ---
    mover.position.set(P.x, P.y, 0);
    const held = mode === "held" || mode === "air" || mode === "land";
    const gy = grab ? grab.gy : 0.75;
    hang.position.y = held ? gy : 0; hangBack.position.y = held ? -gy : 0;
    hang.rotation.z = swing.a;
    const edge = width * 0.48;
    tipper.position.x = edge; untip.position.x = -edge;
    tipper.rotation.z = -topple.a;
    leaner.rotation.z = S.tilt.x * 0.045;

    // lights and the shadow follow KEYBO
    for (const l of lights) { l.position.set(P.x + l.userData.off.x, l.userData.off.y, l.userData.off.z); l.target.position.set(P.x, 0.586, 0); }

    if (say) { const s = toScreen(P.x, P.y + 1.12); say.style.left = s.x + "px"; say.style.bottom = (H - s.y) + "px"; }
    motionBlur(held ? P.vx : 0, mode === "air" ? P.vy : 0);
    renderer.render(scene, camera);
    schedule(tick);
  };
  // a hidden page gets no animation frames; keep time moving so it never stalls
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
      host.appendChild(d);
      setTimeout(() => d.remove(), 700);
    }
  }

  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting;
    if (running && !was) { clock.getDelta(); schedule(tick); }
  }, { rootMargin: "120px 0px" }).observe(host);
  running = true; clock.getDelta(); schedule(tick);

  // For checking the physics by hand from the console.
  return host.__keybo3d = {
    canvas,
    get state() {
      const r = canvas.getBoundingClientRect(), m = toScreen(P.x, P.y + 0.5);
      return { mode, x: +P.x.toFixed(3), y: +P.y.toFixed(3), vy: +P.vy.toFixed(2), squash: +S.squash.x.toFixed(3), topple: +topple.a.toFixed(2), swing: +swing.a.toFixed(2), anim: cur, sx: Math.round(r.left + m.x), sy: Math.round(r.top + m.y) };
    },
    drop(height = 1.6) { P.y = height; P.vx = 0; P.vy = 0; swing.a = 0.25; swing.w = 0; set("air"); play("flail", 0.1); },
    poke,
  };
}

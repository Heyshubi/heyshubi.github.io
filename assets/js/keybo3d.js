// KEYBO in real-time 3D, above the footer.
//
// The Animation session's Blender rig (assets/keybo/3d/keybo.glb), drawn
// with three.js, moved by physics:
//   - walks the floor at its real stride, turning in 3D at the ends;
//   - inside a circle round it, it stops and watches the cursor the way a
//     person does: the eyes jump to the cursor first, the head follows
//     on a softer spring;
//   - pick it up and it dangles, swinging from where it was grabbed;
//   - let go (or throw it) and it falls under gravity, stretched along its
//     path and motion-blurred, lands with a squash that keeps its volume,
//     springs back, and its keycaps jiggle;
//   - poke it and it wobbles, poke it three times and it topples over,
//     double-tap its head fast and it spins dizzy and topples, then it
//     gets up and walks on.
// It draws only while on screen. If WebGL or the model is missing, the
// sprite walker in site.js stays.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export async function start({ host, modelUrl, reduce }) {
  const canvas = document.createElement("canvas");
  canvas.className = "kb3d";
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // Studio: a soft key from front-left above, a fill, a rim from behind.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9e8a8, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -1.4;
  key.shadow.camera.right = key.shadow.camera.top = 1.4;
  key.shadow.camera.near = 0.1; key.shadow.camera.far = 12;
  key.shadow.radius = 6; key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xf4ffd6, 1.1);
  rim.position.set(2, 3, -4);
  scene.add(rim);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);

  // ---------- the model ----------
  const draco = new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(modelUrl);
  const model = gltf.scene;
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  // mover (where it is) > tipper (pivots on the bottom edge it topples over)
  // > untip (puts the pivot back) > leaner (sway and wobble about the feet)
  // > yawer (which way it faces) > model.
  const mover = new THREE.Group(), tipper = new THREE.Group(), untip = new THREE.Group();
  const leaner = new THREE.Group(), yawer = new THREE.Group();
  mover.add(tipper); tipper.add(untip); untip.add(leaner); leaner.add(yawer); yawer.add(model);
  scene.add(mover);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const unit = 1 / size.y;                    // make KEYBO exactly 1 tall
  model.scale.setScalar(unit);
  model.position.y = -box.min.y * unit;
  const width = size.x * unit, height = 1;

  const bone = name => model.getObjectByName(name);
  const B = {
    body: bone("body"), eyeL: bone("eye_L"), eyeR: bone("eye_R"),
    keys: ["key_K", "key_E", "key_Y", "key_B", "key_O", "keys"].map(bone).filter(Boolean),
  };
  // The bones this code turns are reset to their rest pose every frame
  // before the animation and the springs are applied, so nothing builds up.
  const driven = [B.body, B.eyeL, B.eyeR, ...B.keys].filter(Boolean)
    .map(o => ({ o, q: o.quaternion.clone(), p: o.position.clone() }));
  const morphs = [];
  model.traverse(o => { if (o.isMesh && o.morphTargetDictionary) morphs.push(o); });
  const morph = (name, v) => morphs.forEach(m => {
    const i = m.morphTargetDictionary[name];
    if (i !== undefined) m.morphTargetInfluences[i] = v;
  });

  const mixer = new THREE.AnimationMixer(model);
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  const act = {};
  for (const n of ["idle", "walk", "dangle", "flail", "wave", "getup"]) {
    if (clips[n]) { act[n] = mixer.clipAction(clips[n]); act[n].play(); act[n].setEffectiveWeight(0); }
  }
  let current = null;
  const blendTo = (name, t = 0.25) => {
    if (current === name || !act[name]) return;
    if (current && act[current]) act[current].fadeOut(t);
    act[name].reset().setEffectiveWeight(1).fadeIn(t).play();
    current = name;
  };
  const walkCycle = clips.walk ? clips.walk.duration : 0.667;
  const STRIDE = 0.2;                         // KEYBO heights per walk cycle; set from the rig's measured stride
  const walkSpeed = STRIDE / walkCycle;

  // ---------- springs ----------
  const spring = (k, c) => ({ x: 0, v: 0, t: 0, k, c, step(dt) { this.v += ((this.t - this.x) * this.k - this.v * this.c) * dt; this.x += this.v * dt; } });
  const S = {
    yaw: spring(60, 13), headYaw: spring(70, 12), headPitch: spring(70, 12),
    eyeX: spring(420, 34), eyeY: spring(420, 34),
    squash: spring(260, 9), tilt: spring(140, 7), lean: spring(60, 9),
    keys: B.keys.map(() => spring(220, 6)),
  };

  // ---------- the stage: px <-> world on the z = 0 plane ----------
  let W = 1, H = 1, ppu = 170, camY = 1;
  const resize = () => {
    W = host.clientWidth; H = host.clientHeight;
    ppu = Math.min(190, Math.max(120, H * 0.42));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const visH = H / ppu;
    const dist = visH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camY = (H / 2 - 18) / ppu;                // the floor sits 18 px above the bottom
    camera.position.set(0, camY, dist);
    camera.lookAt(0, camY, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(host);
  const toWorld = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - W / 2) / ppu, y: camY - (cy - r.top - H / 2) / ppu };
  };
  const halfW = () => W / 2 / ppu - width * 0.7;

  // ---------- state ----------
  const P = { x: -halfW() * 0.6, y: 0, vx: 0, vy: 0, dir: 1 };
  let mode = "walk", modeT = 0, mouse = null, grab = null, pokes = 0, pokeAt = 0, headTapAt = 0;
  let topple = { a: 0, v: 0, side: 1 }, spin = { a: 0, v: 0 }, blinkAt = 2, blinkT = 0;
  const setMode = m => { mode = m; modeT = 0; };

  // ---------- motion blur: a directional blur on the canvas while fast ----------
  const svgNS = "http://www.w3.org/2000/svg";
  const fsvg = document.createElementNS(svgNS, "svg");
  fsvg.setAttribute("width", "0"); fsvg.setAttribute("height", "0"); fsvg.style.position = "absolute";
  fsvg.innerHTML = '<filter id="kb3d-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0 0"/></filter>';
  document.body.appendChild(fsvg);
  const blurNode = fsvg.querySelector("feGaussianBlur");
  let blurOn = false, lastBlur = "";
  const motionBlur = (vx, vy) => {
    const sx = Math.min(10, Math.abs(vx) * ppu / 900), sy = Math.min(14, Math.abs(vy) * ppu / 700);
    const on = sx + sy > 0.8 && !reduce;
    if (on) {
      const v = `${sx.toFixed(1)} ${sy.toFixed(1)}`;
      if (v !== lastBlur) { blurNode.setAttribute("stdDeviation", v); lastBlur = v; }
      if (!blurOn) { canvas.style.filter = "url(#kb3d-blur)"; blurOn = true; }
    } else if (blurOn) { canvas.style.filter = ""; blurOn = false; }
  };

  // ---------- input ----------
  const hits = (cx, cy) => {
    const w = toWorld(cx, cy);
    return Math.abs(w.x - P.x) < width * 0.55 && w.y > P.y - 0.05 && w.y < P.y + height * 1.05 && topple.a < 0.6;
  };
  const say = host.parentElement.querySelector(".walker-say-3d");
  let sayTimer = 0;
  const speak = text => {
    if (!say) return;
    say.textContent = text; say.classList.add("show");
    clearTimeout(sayTimer); sayTimer = setTimeout(() => say.classList.remove("show"), 1300);
  };
  let downAt = null;
  canvas.addEventListener("pointerdown", e => {
    if (!hits(e.clientX, e.clientY)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    downAt = { x: e.clientX, y: e.clientY, t: performance.now(), head: w.y > P.y + height * 0.55 };
    grab = { dx: w.x - P.x, dy: w.y - P.y, tx: P.x, ty: P.y, lastX: w.x, lastY: w.y, lastT: performance.now(), vx: 0, vy: 0 };
  });
  canvas.addEventListener("pointermove", e => {
    mouse = { x: e.clientX, y: e.clientY };
    if (!grab) return;
    const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6;
    if (moved && mode !== "held") { setMode("held"); speak("Whoa, put me down!"); blendTo("dangle", 0.15); morph("surprised", 1); }
    if (mode === "held") {
      const w = toWorld(e.clientX, e.clientY), now = performance.now(), dt = Math.max(1, now - grab.lastT) / 1000;
      grab.vx = grab.vx * 0.6 + ((w.x - grab.lastX) / dt) * 0.4; grab.vy = grab.vy * 0.6 + ((w.y - grab.lastY) / dt) * 0.4;
      grab.lastX = w.x; grab.lastY = w.y; grab.lastT = now;
      grab.tx = Math.max(-halfW(), Math.min(halfW(), w.x - grab.dx));
      grab.ty = Math.max(0, Math.min(camY * 2 - height - 0.1, w.y - grab.dy));
    }
  });
  const release = e => {
    if (!grab) return;
    if (mode === "held") {
      P.vx = Math.max(-9, Math.min(9, grab.vx)); P.vy = Math.max(-9, Math.min(12, grab.vy));
      setMode("air"); blendTo("flail", 0.12); morph("surprised", 1);
    } else if (downAt) poke(downAt.head);
    grab = null; downAt = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  addEventListener("pointermove", e => { mouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { mouse = null; });
  // On phones, a touch that starts on KEYBO picks it up instead of scrolling.
  canvas.addEventListener("touchstart", e => { const t = e.touches[0]; if (t && hits(t.clientX, t.clientY)) e.preventDefault(); }, { passive: false });

  function poke(head) {
    if (["topple", "down", "getup", "dizzy", "air", "land"].includes(mode)) return;
    const now = performance.now();
    if (head && now - headTapAt < 380) { headTapAt = 0; pokes = 0; speak("Wheee…"); spin.v = 22; setMode("dizzy"); return; }
    if (head) headTapAt = now;
    pokes = now - pokeAt < 900 ? pokes + 1 : 1; pokeAt = now;
    if (pokes >= 3) { pokes = 0; speak("Whoa!"); topple.side = P.dir; topple.v = 1.2; setMode("topple"); return; }
    speak(pokes === 1 ? "Hey!" : "Hey, stop it 😄");
    S.tilt.v += (Math.random() < .5 ? -1 : 1) * 9; S.squash.v -= 4;
    S.keys.forEach(k => k.v += 14 + Math.random() * 8);
    if (mode === "walk") setMode("idle");
  }

  // ---------- the loop ----------
  const clock = new THREE.Clock();
  let running = false;
  const target = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), eul = new THREE.Euler();
  const G = 22;                                  // gravity, in KEYBO heights per second squared

  const tick = () => {
    if (!running) return;
    const dt = Math.min(0.033, clock.getDelta());
    modeT += dt;
    const near = (() => {
      if (!mouse || mode === "held") return false;
      const w = toWorld(mouse.x, mouse.y);
      return Math.hypot(w.x - P.x, w.y - (P.y + 0.6)) < 1.7 && mode !== "air";
    })();

    // --- behaviour ---
    if (mode === "walk") {
      blendTo("walk");
      S.yaw.t = P.dir * 0.75;
      P.x += P.dir * walkSpeed * dt;
      if (Math.abs(P.x) > halfW()) { P.x = Math.sign(P.x) * halfW(); P.dir = -P.dir; setMode("idle"); }
      else if (Math.random() < dt * 0.06) setMode("idle");
      if (near) setMode("look");
    } else if (mode === "idle") {
      blendTo("idle"); S.yaw.t = 0;
      if (near) setMode("look");
      else if (modeT > 1.4 + Math.random() * 0.02) setMode("walk");
    } else if (mode === "look") {
      blendTo("idle"); S.yaw.t = 0;
      if (!near) { setMode("idle"); modeT = 1.0; }
    } else if (mode === "held") {
      // a pendulum hanging from the grab point: it swings against the motion
      P.vx = (grab.tx - P.x) / Math.max(dt, 1e-3) * 0.35 + P.vx * 0.65;
      P.vy = (grab.ty - P.y) / Math.max(dt, 1e-3) * 0.35 + P.vy * 0.65;
      P.x += (grab.tx - P.x) * Math.min(1, dt * 18); P.y += (grab.ty - P.y) * Math.min(1, dt * 18);
      S.lean.t = Math.max(-0.7, Math.min(0.7, -P.vx * 0.09)) + Math.sin(modeT * 9) * 0.03;
      S.yaw.t = 0;
    } else if (mode === "air") {
      P.vy -= G * dt; P.x += P.vx * dt; P.y += P.vy * dt;
      if (Math.abs(P.x) > halfW()) { P.x = Math.sign(P.x) * halfW(); P.vx *= -0.45; }
      S.lean.t = Math.max(-0.5, Math.min(0.5, P.vx * 0.06));
      if (P.y <= 0) {
        const impact = -P.vy; P.y = 0;
        S.squash.v -= Math.min(26, impact * 2.4);          // the body flattens on contact
        S.keys.forEach(k => k.v += impact * 4 + Math.random() * 6);
        dust(P.x, Math.min(1, impact / 10));
        if (impact > 3.2) { P.vy = impact * 0.28; P.vx *= 0.6; }   // a bounce, a little lower each time
        else { P.vy = 0; P.vx = 0; setMode("land"); morph("surprised", 0); blendTo("idle", 0.2); speak(impact > 2 ? "Oof!" : "Phew."); }
      }
    } else if (mode === "land") {
      if (modeT > 0.9) setMode(near ? "look" : "idle");
    } else if (mode === "dizzy") {
      spin.a += spin.v * dt; spin.v *= Math.pow(0.18, dt);
      if (spin.v < 2) { spin.a = 0; topple.side = Math.random() < .5 ? -1 : 1; topple.v = 1.4; setMode("topple"); }
    } else if (mode === "topple") {
      // a rigid box tipping over its bottom edge: gravity's torque grows with the angle
      topple.v += 9 * Math.sin(topple.a + 0.18) * dt; topple.a += topple.v * dt;
      if (topple.a >= Math.PI / 2) { topple.a = Math.PI / 2; topple.v = -topple.v * 0.32; S.keys.forEach(k => k.v += 18); dust(P.x + topple.side * 0.5, 0.7); if (Math.abs(topple.v) < 0.6) { topple.v = 0; setMode("down"); } }
    } else if (mode === "down") {
      if (modeT > 1.2) { setMode("getup"); speak("I'm okay!"); }
    } else if (mode === "getup") {
      topple.a = Math.max(0, topple.a - dt * 3.2);
      if (topple.a === 0) { S.squash.v -= 5; setMode("idle"); }
    }

    // --- looking: the eyes go first, the head follows ---
    let eyeTX = 0, eyeTY = 0, headTY = 0, headTP = 0;
    if (mode === "look" && mouse) {
      const w = toWorld(mouse.x, mouse.y);
      const dx = w.x - P.x, dy = w.y - (P.y + 0.62);
      const yaw = Math.atan2(dx, 1.4), pitch = Math.atan2(dy, 1.4 + Math.abs(dx) * 0.4);
      eyeTX = Math.max(-1, Math.min(1, yaw / 0.6)); eyeTY = Math.max(-1, Math.min(1, pitch / 0.5));
      headTY = Math.max(-1.25, Math.min(1.25, yaw * 0.95)); headTP = Math.max(-0.4, Math.min(0.42, pitch * 0.8));
    } else if (mode === "walk") { headTY = 0; eyeTX = P.dir * 0.3; }
    S.eyeX.t = eyeTX; S.eyeY.t = eyeTY; S.headYaw.t = headTY; S.headPitch.t = headTP;
    if (mode !== "held" && mode !== "air") S.lean.t = 0;

    for (const s of [S.yaw, S.headYaw, S.headPitch, S.eyeX, S.eyeY, S.squash, S.tilt, S.lean]) s.step(dt);
    S.keys.forEach(k => k.step(dt));

    // --- pose ---
    driven.forEach(d => { d.o.quaternion.copy(d.q); d.o.position.copy(d.p); });
    mixer.update(dt);
    yawer.rotation.y = S.yaw.x + spin.a;
    // squash and stretch, volume kept: in the air it stretches along its speed
    const speed = Math.hypot(P.vx, P.vy);
    const stretch = mode === "air" ? Math.min(0.22, speed * 0.018) : 0;
    const sy = Math.max(0.6, 1 + S.squash.x * 0.14 + stretch);
    const sxz = 1 / Math.sqrt(sy);
    model.scale.set(unit * sxz, unit * sy, unit * sxz);
    // toppling turns it about the bottom edge it falls over; leaning and
    // wobbling turn it about its feet
    const edge = topple.side * width * 0.48;
    mover.position.set(P.x, P.y, 0);
    tipper.position.x = edge; untip.position.x = -edge;
    tipper.rotation.z = -topple.side * topple.a;
    leaner.rotation.z = S.tilt.x * 0.04 + S.lean.x;
    if (B.body) {
      eul.set(-S.headPitch.x, S.headYaw.x, 0, "YXZ");
      tmpQ.setFromEuler(eul); B.body.quaternion.multiply(tmpQ);
    } else {
      yawer.rotation.y += S.headYaw.x; yawer.rotation.x = -S.headPitch.x;
    }
    for (const e of [B.eyeL, B.eyeR]) if (e) {
      eul.set(-S.eyeY.x * 0.32, S.eyeX.x * 0.42, 0, "YXZ");
      tmpQ.setFromEuler(eul); e.quaternion.multiply(tmpQ);
    }
    B.keys.forEach((k, i) => { k.position.y += S.keys[i].x * 0.004; k.rotation.x += S.keys[i].x * 0.02; });
    // blinking
    blinkAt -= dt;
    if (blinkAt <= 0) { blinkT = 0.16; blinkAt = 2.4 + Math.random() * 3; }
    if (blinkT > 0) { blinkT -= dt; morph("blink", Math.sin(Math.max(0, blinkT) / 0.16 * Math.PI)); }
    if (mode === "dizzy" || mode === "down") morph("squint", 1); else morph("squint", 0);

    // the speech bubble rides above KEYBO's head
    if (say) { say.style.left = (W / 2 + P.x * ppu) + "px"; say.style.bottom = (18 + (P.y + height * 1.02) * ppu) + "px"; }
    // the key light and its shadow follow KEYBO
    key.position.set(P.x - 2.2, 4.5, 3.2); key.target.position.set(P.x, 0, 0);

    motionBlur(mode === "air" || mode === "held" ? P.vx : 0, mode === "air" || mode === "held" ? P.vy : 0);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };

  // dust puffs on landings, in the DOM above the canvas
  function dust(x, amount) {
    const r = canvas.getBoundingClientRect();
    const px = W / 2 + x * ppu;
    for (let i = 0; i < 6; i++) {
      const d = document.createElement("i");
      d.className = "kb3d-dust";
      d.style.left = px + "px";
      d.style.setProperty("--dx", ((i - 2.5) * 22 * (0.6 + amount)).toFixed(0) + "px");
      d.style.setProperty("--s", (0.6 + amount * 0.9).toFixed(2));
      host.appendChild(d);
      setTimeout(() => d.remove(), 700);
    }
  }

  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running) { clock.getDelta(); requestAnimationFrame(tick); }
  }, { rootMargin: "120px 0px" }).observe(host);

  return { canvas };
}

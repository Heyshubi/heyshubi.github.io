// KEYBO website: theme toggle, header, side rail, the AI feature tour
// with its recordings, and KEYBO's hero loop.
// Scroll work is one requestAnimationFrame at most, transforms only.

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Theme: white and lime, or dark and lime. The choice is remembered.
  const themeBtn = $(".theme-btn");
  const applyTheme = t => {
    root.setAttribute("data-theme", t);
    themeBtn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  };
  applyTheme(root.getAttribute("data-theme") || "light");
  themeBtn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("keybo-theme", next); } catch (e) {}
  });

  // Header: solid once the page leaves the very top.
  const header = $(".site-header");
  const sentinel = document.createElement("div");
  sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px";
  document.body.prepend(sentinel);
  new IntersectionObserver(([e]) => header.classList.toggle("scrolled", !e.isIntersecting)).observe(sentinel);

  // Phone menu.
  const menuBtn = $(".menu-btn");
  menuBtn.addEventListener("click", () => {
    const open = header.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-links a").forEach(a => a.addEventListener("click", () => {
    header.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  }));

  // Sections fade in once as they arrive.
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -6% 0px" });
  $$(".reveal").forEach(el => io.observe(el));

  // Side rail: one link per section, lit for the section in the middle of
  // the screen. Hidden while the hero fills the view.
  const rail = $(".rail");
  const sections = $$("[data-rail]");
  rail.innerHTML = sections.map(s =>
    `<a href="#${s.id}" data-for="${s.id}"><i></i><span>${s.dataset.rail}</span>${s.id === "features" ? "<small></small>" : ""}</a>`
  ).join("");
  const railLinks = $$("a", rail);
  const setActive = id => railLinks.forEach(a => {
    const on = a.dataset.for === id;
    a.classList.toggle("on", on);
    if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
  });
  const spy = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach(s => spy.observe(s));
  new IntersectionObserver(([e]) => rail.classList.toggle("show", !e.isIntersecting), { threshold: 0, rootMargin: "-40% 0px 0px 0px" })
    .observe($(".hero"));

  // AI features, one at a time. On large screens the section holds still
  // and one scroll moves exactly one feature: a wheel or trackpad gesture is
  // taken whole, and the page glides to the next feature's spot. At the first
  // and last feature the gesture passes through, so the page carries on.
  // Tabs jump straight to a feature. Phones get a plain list, and whichever
  // clip is on screen plays. Only one video ever plays.
  const tour = $(".tour");
  const panels = $$(".tour-panel");
  const visuals = $$(".tour-visual");
  const tourTabs = $$(".tour-tab");
  const counter = $('.rail a[data-for="features"] small');
  const n = panels.length;
  const pinned = () => tour && getComputedStyle($(".tour-pin")).position === "sticky";
  const playOnly = v => {
    $$(".tour video").forEach(o => { if (o !== v) o.pause(); });
    if (v && !reduce) { v.preload = "auto"; v.play().catch(() => {}); }
  };
  let step = -1;
  const show = i => {
    if (i === step) return;
    step = i;
    const mark = (el, k) => { el.classList.toggle("on", k === i); el.classList.toggle("past", k < i); };
    panels.forEach(mark); visuals.forEach(mark);
    tourTabs.forEach((t, k) => t.classList.toggle("on", k === i));
    if (counter) counter.textContent = `${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;
    const big = $(".tour-count b");
    if (big) big.textContent = String(i + 1).padStart(2, "0");
    if (pinned()) playOnly(visuals[i].querySelector("video"));
  };
  if (reduce) $$(".tour video").forEach(v => v.controls = true);

  if (tour && n) {
    // The held view's height and where it sticks: centred under the header.
    const pin = $(".tour-pin");
    let pinH = 620, pinTop = 68;
    const measure = () => {
      if (!pinned()) return;
      pinH = pin.offsetHeight;
      pinTop = Math.round(68 + Math.max(12, (innerHeight - 68 - pinH) / 2));
      tour.style.setProperty("--pinh", pinH + "px");
      tour.style.setProperty("--pintop", pinTop + "px");
    };
    measure();
    addEventListener("resize", measure, { passive: true });
    addEventListener("load", measure, { once: true });
    const travel = () => tour.offsetHeight - pinH;
    const tourTop = () => tour.getBoundingClientRect().top + scrollY - pinTop;
    const spot = i => tourTop() + (i + 0.5) / n * travel();
    const stepAt = () => Math.min(n - 1, Math.max(0, Math.floor((pinTop - tour.getBoundingClientRect().top) / travel() * n)));
    const engaged = () => {
      const r = tour.getBoundingClientRect();
      return r.top <= pinTop + 2 && r.bottom >= pinTop + pinH - 2;
    };

    let ticking = false, near = false;
    const update = () => { ticking = false; if (pinned()) show(stepAt()); };
    const onScroll = () => { if (near && !ticking) { ticking = true; requestAnimationFrame(update); } };
    new IntersectionObserver(([e]) => {
      near = e.isIntersecting;
      if (near) onScroll(); else $$(".tour video").forEach(v => v.pause());
    }, { rootMargin: "100px 0px" }).observe(tour);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });

    // The pinned view does not move, so the page jumps straight to the
    // feature's spot; the panels and the video do the animating.
    const go = i => {
      const html = document.documentElement, was = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      scrollTo(0, spot(i));
      html.style.scrollBehavior = was;
    };
    tourTabs.forEach(t => t.addEventListener("click", () => { if (pinned()) go(+t.dataset.step); }));

    // One gesture, one feature. A gesture is a run of wheel events with no
    // gap over 200 ms. Its first event inside the section decides: step to
    // the next feature, or, at either end, pass through so the page carries
    // on. The rest of a stepping gesture is held, so a trackpad's glide
    // cannot run on by itself; a gesture that glides in from outside stops
    // on the feature it arrives at.
    let gesture = null, busyUntil = 0, lastWheel = 0;
    addEventListener("wheel", e => {
      const now = performance.now();
      const fresh = now - lastWheel > 200;
      lastWheel = now;
      const inside = pinned() && engaged();
      if (fresh) gesture = inside ? "new" : "outside";
      if (!inside || e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX) || gesture === "pass") return;
      const dir = Math.sign(e.deltaY);
      if (gesture === "outside") {
        e.preventDefault(); gesture = "step"; busyUntil = now + 350; go(stepAt()); return;
      }
      if (gesture === "new") {
        const target = stepAt() + dir;
        if (now >= busyUntil && (target < 0 || target >= n)) {
          // Leave in one go: just past the end going down, back to the
          // section's heading going up, and hold the rest of the gesture.
          e.preventDefault(); gesture = "step"; busyUntil = now + 350;
          const html = document.documentElement, was = html.style.scrollBehavior;
          html.style.scrollBehavior = "auto";
          scrollTo(0, target >= n ? tourTop() + travel() + innerHeight * 0.35 : tourTop() - innerHeight * 0.45);
          html.style.scrollBehavior = was;
          return;
        }
        e.preventDefault(); gesture = "step";
        if (now >= busyUntil) { busyUntil = now + 350; go(target); }
        return;
      }
      e.preventDefault();
      if (now > busyUntil + 250 && Math.abs(e.deltaY) > 40) {
        const target = stepAt() + dir;
        if (target >= 0 && target < n) { busyUntil = now + 350; go(target); }
      }
    }, { passive: false });

    // Phones: the clip on screen plays.
    const vo = new IntersectionObserver(entries => {
      if (pinned()) return;
      for (const e of entries) {
        const v = e.target.querySelector("video");
        if (!v) continue;
        if (e.isIntersecting) playOnly(v); else v.pause();
      }
    }, { threshold: 0.6 });
    visuals.forEach(v => vo.observe(v));
  }

  // The rail steps aside while the features hold the screen; their own
  // list does the same job there.
  const featuresSection = $("#features");
  if (featuresSection) new IntersectionObserver(([e]) => rail.classList.toggle("aside", e.isIntersecting && pinned()),
    { rootMargin: "-30% 0px -30% 0px" }).observe(featuresSection);

  // On phones the hero is the phone alone with the small hello KEYBO in
  // front: its loop (540) after load, paused off screen. The still
  // underneath is the loop's own first frame.
  const art = $("#hero-art .hero-keybo");
  if (art && !reduce && matchMedia("(max-width: 700px)").matches) {
    const small = true;
    const suffix = "-540";
    addEventListener("load", () => {
      const v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute("aria-hidden", "true");
      v.width = small ? 540 : 1080; v.height = v.width;
      v.innerHTML = `<source src="assets/keybo/hero-loop${suffix}.mov?v=keybo3" type='video/mp4; codecs="hvc1"'>` +
                    `<source src="assets/keybo/hero-loop${suffix}.webm?v=keybo3" type="video/webm">`;
      v.addEventListener("playing", () => {
        const still = art.querySelector("img");
        if (still) still.style.visibility = "hidden";
      }, { once: true });
      art.appendChild(v);
      new IntersectionObserver(([e]) => { e.isIntersecting ? v.play().catch(() => {}) : v.pause(); }).observe(art);
    }, { once: true });
  }

  // From tablet width up, KEYBO holding the phone breathes and blinks: a
  // 4 s transparent loop of the back layer (phone and hands pinned, so the
  // screen hole never moves), after load and paused off screen. Its first
  // frame matches the still, which hides once it plays.
  const hold = $(".hold");
  if (hold && !reduce && matchMedia("(min-width: 701px)").matches) {
    addEventListener("load", () => {
      const big = hold.offsetWidth * (devicePixelRatio || 1) > 1100 ? "" : "-1000";
      const v = document.createElement("video");
      v.className = "hold-loop"; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute("aria-hidden", "true");
      v.innerHTML = `<source src="assets/keybo/hold/hold2-loop${big}.mov?v=1" type='video/mp4; codecs="hvc1"'>` +
                    `<source src="assets/keybo/hold/hold2-loop${big}.webm?v=1" type="video/webm">`;
      v.addEventListener("playing", () => { const still = $(".hold-back img", hold); if (still) still.style.visibility = "hidden"; }, { once: true });
      hold.insertBefore(v, $(".hp-screen", hold));
      new IntersectionObserver(([e]) => { e.isIntersecting ? v.play().catch(() => {}) : v.pause(); }).observe(hold);
    }, { once: true });
  }

  // The hero phone: the real keyboard's four feature clips in turn, two
  // video layers cross-fading. Starts after load; the next clip loads once
  // the current one is half way; everything pauses off screen. With reduced
  // motion it stays on the first frame.
  const phone = $(".hp-screen");
  if (phone && !reduce) {
    const CLIPS = [["reply", "Reply"], ["tones", "Tone"], ["fix-rewrite", "Fix & Rewrite"], ["translate", "Translate"]];
    const vids = $$(".hp-v", phone), label = $(".hp-chip b"), dots = $$(".hp-dots i");
    const src = i => `assets/videos/${CLIPS[i][0]}.mp4?v=2`;
    let k = 0, cur = 0, visible = true, started = false;
    const load = (v, i) => { v.dataset.k = i; v.src = src(i); v.preload = "auto"; v.load(); };
    const show = () => { label.textContent = CLIPS[k][1]; dots.forEach((d, j) => d.classList.toggle("on", j === k)); };
    const playCur = () => { if (started && visible) vids[cur].play().catch(() => {}); };
    vids.forEach(v => {
      v.addEventListener("timeupdate", () => {
        const other = vids[1 - cur], next = (k + 1) % CLIPS.length;
        if (v === vids[cur] && v.currentTime > v.duration / 2 && other.dataset.k !== String(next)) load(other, next);
      });
      v.addEventListener("ended", () => {
        if (v !== vids[cur]) return;
        k = (k + 1) % CLIPS.length;
        const next = vids[1 - cur];
        if (next.dataset.k !== String(k)) load(next, k);
        next.currentTime = 0;
        next.classList.add("on"); v.classList.remove("on");
        cur = 1 - cur; show(); playCur();
      });
    });
    addEventListener("load", () => { started = true; load(vids[0], 0); playCur(); }, { once: true });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? playCur() : vids[cur].pause(); }).observe(phone);
  }

  // Setup: iPhone or Android, picked for the visitor's phone.
  const tabs = $$('[role="tab"]');
  const pick = tab => tabs.forEach(t => {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    $("#" + t.getAttribute("aria-controls")).hidden = !on;
  });
  tabs.forEach(tab => tab.addEventListener("click", () => pick(tab)));
  if (/android/i.test(navigator.userAgent)) pick($("#tab-android"));

  // FAQ: one answer open at a time.
  $$(".faq details").forEach(d => d.addEventListener("toggle", () => {
    if (d.open) $$(".faq details").forEach(o => { if (o !== d) o.open = false; });
  }));

  // Stores. Every store button goes to its own store. One that is not open
  // yet (the App Store before 18 Oct 2026, 10:30 IST; Google Play until
  // KEYBO is published there) opens a small note instead of a dead page.
  const LIVE = {
    ios: Date.now() >= Date.UTC(2026, 9, 18, 5, 0),
    android: false,
  };
  // Android is in Google Play's closed test: people send us their Gmail,
  // the owner adds it to the testers list, then the testing link works.
  const ANDROID_TEST = "https://play.google.com/apps/testing/com.aikeyboard.app";
  const pop = document.createElement("div");
  pop.className = "soon-pop"; pop.hidden = true; pop.setAttribute("role", "dialog");
  document.body.appendChild(pop);
  const closePop = () => { pop.hidden = true; };
  const openPop = (anchor, store, review) => {
    const ios = store === "ios";
    const title = review ? "App Store reviews open on 18 October" : ios ? "On the App Store from 18 October" : "KEYBO for Android is coming soon";
    if (!ios && !review) {
      // Android: the closed test
      const join = "mailto:hellokeybo@gmail.com?subject=" + encodeURIComponent("Add me to the KEYBO Android test") + "&body=" + encodeURIComponent("The Gmail address on my Android phone: \n");
      pop.innerHTML = `<button class="soon-x" type="button" aria-label="Close">×</button><b>${title}</b><p>Try it now in the Android test. Send us the Gmail address on your phone; once we've added you, open the test link on that phone and install KEYBO from Google Play.</p>` +
        `<a class="btn btn-lime" href="${join}">Join the Android test</a><a class="soon-alt" href="${ANDROID_TEST}" target="_blank" rel="noopener">Already added? Open the test link</a>`;
    } else {
    const line = review ? "That's the day KEYBO goes live. Until then, tell us what you think by email." : "Want a nudge when it's out? Drop us a line and we'll write back the day it lands.";
    const subject = encodeURIComponent(review ? "KEYBO feedback" : "Tell me when KEYBO is on the App Store");
    pop.innerHTML = `<button class="soon-x" type="button" aria-label="Close">×</button><b>${title}</b><p>${line}</p><a class="btn btn-lime" href="mailto:hellokeybo@gmail.com?subject=${subject}">${review ? "Email us" : "Email me when it's out"}</a>`;
    }
    pop.hidden = false;
    const r = anchor.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
    pop.style.width = w + "px";
    pop.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + "px";
    const below = r.bottom + 10, h = pop.offsetHeight;
    pop.style.top = (below + h < innerHeight - 8 ? below : Math.max(8, r.top - h - 10)) + "px";
    pop.querySelector(".soon-x").addEventListener("click", closePop);
  };
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-store]");
    if (!a) return;
    const store = a.dataset.store;
    if (LIVE[store]) return;
    e.preventDefault(); e.stopPropagation();
    openPop(a, store, a.hasAttribute("data-review"));
    if (a.closest("#dl-menu")) setTimeout(() => closeDl(), 0);   // this click doesn't reach the menu's own handler
  }, true);
  addEventListener("click", e => { if (!pop.hidden && !pop.contains(e.target)) closePop(); });
  addEventListener("keydown", e => { if (e.key === "Escape") { closePop(); closeDl(); } });
  addEventListener("scroll", () => { if (!pop.hidden) closePop(); }, { passive: true });

  // Header Download: choose iPhone & iPad or Android.
  const dlBtn = $(".dl-btn"), dlMenu = $("#dl-menu");
  const closeDl = () => { if (dlMenu && !dlMenu.hidden) { dlMenu.hidden = true; dlBtn.setAttribute("aria-expanded", "false"); } };
  if (dlBtn) {
    dlBtn.addEventListener("click", e => {
      e.stopPropagation();
      const open = dlMenu.hidden;
      dlMenu.hidden = !open;
      dlBtn.setAttribute("aria-expanded", String(open));
    });
    addEventListener("click", e => { if (!dlMenu.contains(e.target) && e.target !== dlBtn) closeDl(); });
    $$(".dl-item", dlMenu).forEach(a => a.addEventListener("click", () => setTimeout(closeDl, 0)));
  }

  // Privacy: one message's journey. The person types a message with a
  // typo or two; it seals into code in place; travels encrypted to KEYBO;
  // KEYBO fixes it; it travels back encrypted; and it opens as the fixed
  // message. Runs only while on screen.
  const journey = $(".journey");
  if (journey) {
    const typed = "hey r u free tmrw for the meetng?";
    const fixedMsg = "Hey, are you free tomorrow for the meeting?";
    const text = $(".j-text", journey), status = $(".ai-status", journey), pcode = $(".pcode", journey);
    // Each side is a loop with a one-shot that starts and ends on the
    // loop's first frame: the one-shot plays over it, then hands back.
    const stacks = $$(".clipstack", journey).map(st => ({ st, loop: $(".loop", st), once: $(".once", st) }));
    const [you, ai] = stacks;
    const oneShot = side => {
      if (!side || reduce) return;
      side.once.currentTime = 0;
      side.once.play().then(() => side.st.classList.add("oneshot")).catch(() => {});
      side.once.onended = () => { side.loop.currentTime = 0; side.loop.play().catch(() => {}); side.st.classList.remove("oneshot"); };
    };
    const hex = "0123456789abcdef";
    const code = len => Array.from({ length: len }, (_, i) => (i % 5 === 4 ? " " : hex[(Math.random() * 16) | 0])).join("");
    // The tube: from the person's phone (62%, 42% of their clip) into
    // KEYBO's laptop (16%, 72% of his), bowing through the middle of the
    // lane. Redrawn whenever the layout changes. Each code stream is two
    // identical halves sliding by one half, so it loops without a seam.
    const tube = $(".tube", journey), tubePath = $("#tube-path", journey), lane = $(".lane", journey);
    const lock = $(".pipe-lock", journey), packet = $(".packet", journey), tubeCap = $(".tube-cap", journey);
    const streams = $$(".tube-code", journey).map(el => ({ el, tp: $("textPath", el), anim: $("animate", el), back: el.classList.contains("back") }));
    streams.forEach(st => { const half = code(140); st.tp.insertBefore(document.createTextNode(half + " " + half + " "), st.anim); });
    const layoutTube = () => {
      const jr = journey.getBoundingClientRect();
      if (!jr.width) return;
      const at = (el, fx, fy) => { const r = el.getBoundingClientRect(); return { x: r.left - jr.left + r.width * fx, y: r.top - jr.top + r.height * fy }; };
      const A = at(you.st, .62, .42), B = at(ai.st, .16, .72), M = at(lane, .5, .5);
      const f = n => n.toFixed(1);
      // on small screens the person is top left and KEYBO bottom right, so
      // the tube is an S from the phone down into the laptop
      const d = matchMedia("(max-width: 860px)").matches
        ? `M${f(A.x)},${f(A.y)} C${f(A.x + 90)},${f(A.y)} ${f(B.x - 90)},${f(B.y)} ${f(B.x)},${f(B.y)}`
        : `M${f(A.x)},${f(A.y)} C${f(A.x + (B.x - A.x) * .35)},${f(M.y)} ${f(A.x + (B.x - A.x) * .65)},${f(M.y)} ${f(B.x)},${f(B.y)}`;
      tube.setAttribute("width", jr.width); tube.setAttribute("height", jr.height);
      tube.setAttribute("viewBox", `0 0 ${jr.width} ${jr.height}`);
      tubePath.setAttribute("d", d);
      packet.style.offsetPath = `path("${d}")`;
      const mid = tubePath.getPointAtLength(tubePath.getTotalLength() / 2);
      lock.style.left = mid.x + "px"; lock.style.top = mid.y + "px";
      tubeCap.style.left = mid.x + "px"; tubeCap.style.top = (mid.y - 40) + "px";
      streams.forEach(st => {
        const h = (st.el.getComputedTextLength() / 2).toFixed(1);
        st.anim.setAttribute("values", st.back ? `0;-${h}` : `-${h};0`);
      });
    };
    layoutTube();
    if ("ResizeObserver" in window) new ResizeObserver(layoutTube).observe(journey);
    addEventListener("load", layoutTube, { once: true });
    if (tube.pauseAnimations) tube.pauseAnimations();
    let timers = [], shuffle = 0, on = false;
    const later = (ms, f) => timers.push(setTimeout(f, ms));
    const stopAll = () => { timers.forEach(clearTimeout); timers = []; clearInterval(shuffle); };
    // turn `from` into `to`, left to right, scrambling what is not done yet
    const morph = (to, ms, sealed) => new Promise(done => {
      const t0 = performance.now(), n = Math.max(to.length, text.textContent.length);
      clearInterval(shuffle);
      shuffle = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        const fixedUpTo = Math.round(k * n);
        text.textContent = Array.from({ length: n }, (_, i) => i < fixedUpTo ? (to[i] || "") : (to[i] === " " ? " " : hex[(Math.random() * 16) | 0])).join("");
        if (k >= 1) { clearInterval(shuffle); text.textContent = to; done(); }
      }, 40);
    });
    const run = () => {
      if (!on) return;
      stopAll();
      journey.classList.remove("sealed");
      journey.dataset.s = "0"; status.textContent = "Ready"; text.textContent = "";
      [...typed].forEach((ch, i) => later(120 + i * 48, () => { text.textContent += ch; }));
      let t = 120 + typed.length * 48 + 500;
      later(t, () => { journey.dataset.s = "1"; journey.classList.add("sealed"); morph(code(typed.length), 520); });
      t += 750;
      later(t, () => { journey.dataset.s = "2"; pcode.textContent = code(14); status.textContent = "Receiving 🔒"; });
      t += 1350;
      later(t, () => { journey.dataset.s = "3"; status.textContent = "Fixing"; });
      t += 1700;
      later(t, () => { journey.dataset.s = "4"; status.textContent = "Sent back 🔒"; pcode.textContent = code(14); text.textContent = code(fixedMsg.length); oneShot(ai); });
      t += 1450;
      later(t, () => { journey.dataset.s = "5"; journey.classList.remove("sealed"); morph(fixedMsg, 650); oneShot(you); });
      t += 3200;
      later(t, () => { journey.dataset.s = "6"; status.textContent = "Done, nothing kept"; });
      later(t + 900, run);
    };
    if (reduce) { journey.dataset.s = "5"; text.textContent = fixedMsg; status.textContent = "Done, nothing kept"; }
    else new IntersectionObserver(([e]) => {
      if (e.isIntersecting === on) return;
      on = e.isIntersecting;
      journey.classList.toggle("run", on);
      if (tube.pauseAnimations) on ? tube.unpauseAnimations() : tube.pauseAnimations();
      stacks.forEach(x => { if (on) { x.loop.preload = x.once.preload = "auto"; x.loop.play().catch(() => {}); } else { x.loop.pause(); x.once.pause(); } });
      if (on) run(); else stopAll();
    }, { threshold: 0.3 }).observe(journey);
  }

  // Works in every app: each row's icons are repeated once (hidden from
  // screen readers) so the slide loops; the rows pause while off screen.
  const appRows = $(".apps-rows");
  if (appRows) {
    $$(".apps-track", appRows).forEach((t, k) => {
      const n = t.children.length;
      t.insertAdjacentHTML("beforeend", t.innerHTML);
      [...t.children].slice(n).forEach(c => c.setAttribute("aria-hidden", "true"));
      t.style.setProperty("--t", (n * 3.6 + k * 4) + "s");
    });
    if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => appRows.classList.toggle("off", !e.isIntersecting)).observe(appRows);
  }

  // Reviews people post here. The form posts to the reviews API
  // (REVIEWS_API) as "pending"; the owner approves, edits or deletes them
  // in /admin/, and approved ones show as cards, newest first. Until the
  // API is live the cards come from assets/data/reviews.json, and the form
  // opens an email with the review filled in, so nothing anyone writes is
  // lost.
  const REVIEWS_API = "https://ai-keyboard-backend-production.up.railway.app";
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wall = $("#real-reviews"), SHOW = 9;
  let approved = [];
  const when = iso => { const d = new Date(iso || ""); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", year: "numeric" }); };
  const card = (r, mine) => {
    const n = Math.max(1, Math.min(5, Math.round(r.rating) || 5));
    const sub = [r.place, when(r.created_at)].filter(Boolean).map(esc).join(" · ");
    return `<article class="rcard${mine ? " mine" : ""}"><div class="rtop"><span class="rav" aria-hidden="true">${esc(r.name.trim()[0] || "K").toUpperCase()}</span>` +
      `<span><b>${esc(r.name)}</b>${sub ? `<small>${sub}</small>` : ""}</span><span class="rstars" role="img" aria-label="${n} out of 5 stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</span></div>` +
      `<p>${esc(r.text)}</p>${mine ? '<span class="rnote">Only you can see this until it\'s approved.</span>' : ""}</article>`;
  };
  const showWall = (list, mine) => {
    approved = (list || []).filter(r => r && r.text && r.name);
    if (!wall || (!approved.length && !mine)) return;
    wall.innerHTML = (mine ? card(mine, true) : "") + approved.slice(0, SHOW).map(r => card(r)).join("") +
      (approved.length > SHOW ? `<button class="btn btn-line reviews-more" type="button">Show all ${approved.length} reviews</button>` : "");
    const more = $(".reviews-more", wall);
    if (more) more.addEventListener("click", () => { more.insertAdjacentHTML("beforebegin", approved.slice(SHOW).map(r => card(r)).join("")); more.remove(); });
    const head = $(".review-head");
    if (head) head.hidden = false;
    wall.hidden = false;
  };
  // The server first; if its reviews part isn't live yet, the file.
  const fromFile = () => location.protocol === "file:" ? { reviews: [] } : fetch("assets/data/reviews.json").then(r => r.json());
  fetch(REVIEWS_API + "/reviews").then(r => { if (!r.ok) throw 0; return r.json(); }).catch(fromFile)
    .then(d => showWall(d.reviews)).catch(() => {});

  const form = $("#review-form");
  const stars = $$(".stars button");
  const msg = $(".review-msg"), storeBtn = $(".review-store");
  let rating = 0;
  stars.forEach(b => {
    b.addEventListener("click", () => {
      rating = +b.dataset.v;
      stars.forEach(o => { o.classList.toggle("on", +o.dataset.v <= rating); o.setAttribute("aria-checked", String(+o.dataset.v === rating)); });
      msg.classList.remove("ok");
      msg.textContent = rating >= 4 ? "Thank you! Tell us a little more below." : "Thanks for being honest. What should we fix?";
    });
    b.addEventListener("mouseenter", () => stars.forEach(o => o.classList.toggle("hover", +o.dataset.v <= +b.dataset.v)));
    b.addEventListener("mouseleave", () => stars.forEach(o => o.classList.remove("hover")));
  });
  if (form) form.addEventListener("submit", async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (data.website) return;                          // a bot filled the hidden field
    if (!rating) { msg.textContent = "Tap a star first."; return; }
    if (!data.name.trim() || data.text.trim().length < 4) { msg.textContent = "Add your name and a few words."; return; }
    const review = { rating, name: data.name.trim(), place: data.place.trim(), text: data.text.trim(), lang: navigator.language || "" };
    let sent = false;
    if (REVIEWS_API) {
      try {
        const r = await fetch(REVIEWS_API + "/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(review) });
        sent = r.ok;
      } catch (err) {}
    }
    if (!sent) {
      const body = `Rating: ${rating}/5\nName: ${review.name}\nFrom: ${review.place}\n\n${review.text}\n`;
      location.href = "mailto:hellokeybo@gmail.com?subject=" + encodeURIComponent(`KEYBO review: ${rating}/5`) + "&body=" + encodeURIComponent(body);
    }
    if (sent) showWall(approved, review);           // their own card, until it's approved for everyone
    msg.classList.add("ok");
    msg.textContent = sent ? "Thank you! Your review will appear for everyone once it's checked." : "Thanks! Your email app has it ready to send.";
    storeBtn.hidden = rating < 4;
    form.reset(); rating = 0; stars.forEach(o => o.classList.remove("on"));
  });

  // KEYBO, out for a walk, in the Animation session's Blender sprites.
  // It walks at its real stride (43.2 px per 16-frame cycle in a 320 cell,
  // so the planted foot never slides). To stop, it finishes the step, turns
  // to face us (8 frames), and stands with its eye layer following the
  // cursor; to walk on, the turn plays backwards. Pokes: one wobbles it, the
  // third knocks it over (fall, lie, get up); a fast double tap on the head
  // spins it dizzy before it falls. Every strip starts and ends on the front
  // or the lying frame, so they chain cleanly.
  const walker = $(".walker");
  if (walker) {
    const floor = walker.parentElement, say = $(".walker-say", walker);
    const MS = { wobble: 417, fall: 583, down: 1100, getup: 583, dizzy: 833, turn: 333, cycle: 667 };
    const speed = () => 43.2 / 320 * walker.offsetWidth / MS.cycle;   // px per ms at the shown size
    let x = 40, dir = 1, state = "", until = 0, on = false, last = 0, walkStart = 0, after = null;
    let mouse = null, pokes = 0, pokeTimer = 0, headTap = 0, sayTimer = 0;
    const W = () => floor.clientWidth - walker.offsetWidth;
    const set = (st, ms) => {
      state = st; until = performance.now() + (ms || 0);
      walker.className = "walker " + st;
      if (st.startsWith("walk")) walkStart = performance.now();
    };
    const side = () => (dir > 0 ? "r" : "l");
    const walkOn = () => set("unturn-" + side(), MS.turn);          // front -> walking pose, then walk
    const stop = then => { after = then; set("stopping-" + side()); walker.className = "walker walk-" + side(); };
    const speak = text => {
      say.textContent = text; say.classList.add("show");
      clearTimeout(sayTimer); sayTimer = setTimeout(() => say.classList.remove("show"), 1300);
    };
    const eyes = (dx, dy) => {
      const k = walker.offsetWidth / 320;
      walker.style.setProperty("--ex", (Math.max(-1, Math.min(1, dx)) * 7 * k).toFixed(2) + "px");
      walker.style.setProperty("--ey", (Math.max(-1, Math.min(1, dy)) * 4 * k).toFixed(2) + "px");
    };
    const centre = () => {
      const r = floor.getBoundingClientRect();
      return { cx: r.left + x + walker.offsetWidth / 2, cy: r.bottom - walker.offsetWidth * 0.55, top: r.top };
    };
    // The region: a circle round KEYBO. Inside it, KEYBO stops and turns
    // to watch the cursor; the moment the cursor leaves, it walks on.
    const R = () => walker.offsetWidth * 1.7;
    const nearCursor = () => {
      if (!mouse) return false;
      const c = centre();
      return Math.hypot(mouse.x - c.cx, mouse.y - c.cy) < R();
    };
    // Turning to look: the whole KEYBO turns (yaw) and tilts (pitch) toward
    // the cursor, eased like a spring, shown from the Blender look grid
    // (17 x 5 cells: yaw -80..+80 by 10, pitch +20..-20 by 10).
    let yaw = 0, pitch = 0;
    const aim = (ty, tp) => {
      yaw += (ty - yaw) * 0.18; pitch += (tp - pitch) * 0.18;
      const col = Math.round((Math.max(-80, Math.min(80, yaw)) + 80) / 10);
      const row = Math.round((20 - Math.max(-20, Math.min(20, pitch))) / 10);
      walker.style.setProperty("--lx", (col / 16 * 100).toFixed(4) + "%");
      walker.style.setProperty("--ly", (row / 4 * 100).toFixed(4) + "%");
    };
    const frame = now => {
      if (!on) return;
      const dt = Math.min(50, now - (last || now)); last = now;
      const walking = state === "walk-r" || state === "walk-l" || state.startsWith("stopping");
      if (walking) {
        x += dir * dt * speed();
        // start stopping one step before the edge, so the last step ends on it
        const edge = 22 / 160 * walker.offsetWidth;
        x = Math.max(0, Math.min(W(), x));
        if (state.startsWith("walk") && ((dir < 0 && x <= edge) || (dir > 0 && x >= W() - edge))) {
          stop(() => { dir = -dir; set("idle", 600 + Math.random() * 900); });
        } else if (state.startsWith("walk") && nearCursor()) {
          stop(() => set("look"));
        } else if (state.startsWith("walk") && Math.random() < 0.0012) {
          stop(() => set("idle", 1000 + Math.random() * 1600));
        }
        // a stop waits for the step to finish: walk frame 0 is where the turn begins
        if (state.startsWith("stopping") && (now - walkStart) % MS.cycle < dt + 1 && now - walkStart > 60) {
          set("turn-" + side(), MS.turn);
        }
      } else if (now >= until && state) {
        if (state === "fall" || state === "dizzy") { set("down", MS.down); walker.classList.add("landed"); }
        else if (state === "down") { set("getup", MS.getup); speak("I'm okay!"); }
        else if (state === "getup" || state === "wobble") set("idle", 400);
        else if (state.startsWith("turn")) { const f = after; after = null; f ? f() : set("idle", 800); }
        else if (state.startsWith("unturn")) set("walk-" + side());
        else if (state === "idle") { if (nearCursor()) set("look"); else walkOn(); }
        else if (state === "look" && !nearCursor()) { eyes(0, 0); yaw = pitch = 0; aim(0, 0); walkOn(); }
      }
      if (state === "look" && mouse) {
        const c = centre(), r = R();
        const dx = Math.max(-1, Math.min(1, (mouse.x - c.cx) / r));
        const dy = Math.max(-1, Math.min(1, (mouse.y - c.cy) / r));
        aim(dx * 80, -dy * 20);                        // turn toward it, tilt up or down
        if (Math.random() < 0.004) speak(["Hi!", "Oh, hello", "👀"][(Math.random() * 3) | 0]);
      }
      if (!state) set("walk-" + side());
      walker.style.setProperty("--x", x.toFixed(1) + "px");
      requestAnimationFrame(frame);
    };
    const poke = e => {
      if (["fall", "down", "getup", "dizzy"].includes(state)) return;
      const r = walker.getBoundingClientRect();
      const head = e.clientY && e.clientY < r.top + r.height * 0.5;
      const now = performance.now();
      eyes(0, 0);
      if (head && now - headTap < 350) { headTap = 0; pokes = 0; speak("Wheee…"); set("dizzy", MS.dizzy); return; }
      if (head) headTap = now;
      pokes++;
      clearTimeout(pokeTimer); pokeTimer = setTimeout(() => { pokes = 0; }, 900);
      if (pokes >= 3) { pokes = 0; speak("Whoa!"); set("fall", MS.fall); }
      else { speak(pokes === 1 ? "Hey!" : "Hey, stop it 😄"); set("wobble", MS.wobble); }
    };
    walker.addEventListener("click", poke);
    walker.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); poke({}); } });
    addEventListener("pointermove", e => { mouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => { mouse = null; });
    const preload = () => {
      ["wobble", "fall", "getup", "dizzy", "turn-from-right", "turn-from-left"]
        .forEach(n => { const i = new Image(); i.src = `assets/keybo/walker/${n}-strip.png?v=keybo2`; });
      new Image().src = "assets/keybo/walker/look-grid.webp?v=keybo2";
    };
    let preloaded = false, retired = false;
    if (reduce) walker.className = "walker idle";
    else new IntersectionObserver(([e]) => {
      on = e.isIntersecting && !retired; last = 0;
      if (on) { if (!preloaded) { preloaded = true; preload(); } requestAnimationFrame(frame); }
    }, { rootMargin: "200px 0px" }).observe(walker.closest(".walkway"));

    // Real-time 3D KEYBO (assets/js/keybo3d.js, three.js, the Blender rig):
    // loaded only when the walkway is near and only if the model is there
    // and WebGL works. Then it takes over and the sprite walker retires.
    const floorEl = walker.closest(".walk-floor"), MODEL = "assets/keybo/3d/keybo.glb?v=keybo2";
    const webgl = (() => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch (e) { return false; } })();
    if (webgl && location.protocol !== "file:") {
      // Fetch it quietly once the page has loaded and gone idle, so KEYBO is
      // ready long before anyone scrolls down to it.
      let started = false;
      const go = () => {
        if (started) return; started = true;
        fetch(MODEL, { method: "HEAD" }).then(r => {
          if (!r.ok) return;
          return import(new URL("assets/js/keybo3d.js", document.baseURI).href)
            .then(m => m.start({ host: floorEl, modelUrl: MODEL, reduce }))
            .then(api => { window.KEYBO3D = api; retired = true; on = false; walker.hidden = true; floorEl.classList.add("is-3d"); });
        }).catch(() => {});
      };
      const idle = window.requestIdleCallback || (f => setTimeout(f, 1200));
      if (document.readyState === "complete") idle(go, { timeout: 2500 });
      else addEventListener("load", () => idle(go, { timeout: 2500 }), { once: true });
      // and straight away if someone gets there first
      const io3d = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io3d.disconnect(); go(); } }, { rootMargin: "900px 0px" });
      io3d.observe(floorEl);
    }
  }

  $("#year").textContent = new Date().getFullYear();
})();

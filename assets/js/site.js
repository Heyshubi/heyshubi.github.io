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
    const travel = () => tour.offsetHeight - (innerHeight - 68);
    const tourTop = () => tour.getBoundingClientRect().top + scrollY - 68;
    const spot = i => tourTop() + (i + 0.5) / n * travel();
    const stepAt = () => Math.min(n - 1, Math.max(0, Math.floor((68 - tour.getBoundingClientRect().top) / travel() * n)));
    const engaged = () => {
      const r = tour.getBoundingClientRect();
      return r.top <= 70 && r.bottom >= innerHeight - 2;
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
        if (now >= busyUntil && (target < 0 || target >= n)) { gesture = "pass"; return; }
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

  // KEYBO's hero loop: large screens only, after load, paused off screen.
  // Phones keep the still, which is the loop's own first frame.
  const art = $("#hero-art");
  if (art && !reduce && matchMedia("(min-width: 901px)").matches) {
    addEventListener("load", () => {
      const v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute("aria-hidden", "true");
      v.width = 1080; v.height = 1080;
      v.innerHTML = '<source src="assets/keybo/hero-loop.mov" type=\'video/mp4; codecs="hvc1"\'>' +
                    '<source src="assets/keybo/hero-loop.webm" type="video/webm">';
      v.addEventListener("playing", () => {
        const still = art.querySelector("img");
        if (still) still.style.visibility = "hidden";
      }, { once: true });
      art.appendChild(v);
      new IntersectionObserver(([e]) => { e.isIntersecting ? v.play().catch(() => {}) : v.pause(); }).observe(art);
    }, { once: true });
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
  if (LIVE.ios) $$("[data-release-note]").forEach(p => { p.innerHTML = "<b>iPhone &amp; iPad:</b> available now &nbsp;·&nbsp; <b>Android:</b> coming soon"; });
  const pop = document.createElement("div");
  pop.className = "soon-pop"; pop.hidden = true; pop.setAttribute("role", "dialog");
  document.body.appendChild(pop);
  const closePop = () => { pop.hidden = true; };
  const openPop = (anchor, store, review) => {
    const ios = store === "ios";
    const title = review ? "App Store reviews open on 18 October" : ios ? "On the App Store from 18 October" : "KEYBO for Android is coming soon";
    const line = review ? "That's the day KEYBO goes live. Until then, tell us what you think by email." : "Want a nudge when it's out? Drop us a line and we'll write back the day it lands.";
    const subject = encodeURIComponent(review ? "KEYBO feedback" : ios ? "Tell me when KEYBO is on the App Store" : "Tell me when KEYBO is on Android");
    pop.innerHTML = `<button class="soon-x" type="button" aria-label="Close">×</button><b>${title}</b><p>${line}</p><a class="btn btn-lime" href="mailto:hellokeybo@gmail.com?subject=${subject}">${review ? "Email us" : "Email me when it's out"}</a>`;
    pop.hidden = false;
    const r = anchor.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
    pop.style.width = w + "px";
    pop.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + "px";
    const below = r.bottom + 10, h = pop.offsetHeight;
    pop.style.top = (below + h < innerHeight - 8 ? below : Math.max(8, r.top - h - 10)) + "px";
    pop.querySelector(".soon-x").addEventListener("click", closePop);
  };
  $$("[data-store]").forEach(a => a.addEventListener("click", e => {
    const store = a.dataset.store;
    if (LIVE[store]) return;
    e.preventDefault(); e.stopPropagation();
    openPop(a, store, a.hasAttribute("data-review"));
  }));
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

  // Hero: a message that rewrites itself, the way KEYBO does.
  const live = $(".live");
  if (live && !reduce) {
    const versions = [
      ["Original", "hey can u send me the file"],
      ["Professional", "Could you please send me the file when you have a moment?"],
      ["Friendly", "Hey! Could you send me the file when you get a sec? 😊"],
      ["Funny", "Plot twist: I still need that file 🙃 Send it my way?"],
      ["Spanish", "¿Me puedes enviar el archivo?"],
    ];
    const tone = $(".live-tone", live), text = $(".live-text", live);
    let k = 0, timer = 0;
    const next = () => {
      k = (k + 1) % versions.length;
      live.classList.add("swap");
      setTimeout(() => { tone.textContent = versions[k][0]; text.textContent = versions[k][1]; live.classList.remove("swap"); }, 220);
    };
    new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting) timer = setInterval(next, 2600);
    }).observe(live);
  }

  // Privacy: a line scrambles on its way out and comes back intact, which
  // is what an encrypted connection does to your words.
  const cipher = $(".cipher-text");
  if (cipher && !reduce) {
    const plain = cipher.textContent, glyphs = "abcdef0123456789";
    let timer = 0;
    const scramble = () => {
      let t = 0;
      const run = setInterval(() => {
        t++;
        const back = t > 14;                    // 14 frames out, 14 back
        const keep = back ? Math.round((t - 14) / 14 * plain.length) : 0;
        cipher.textContent = [...plain].map((c, i) => c === " " ? " " : i < keep ? c : glyphs[(Math.random() * 16) | 0]).join("");
        cipher.classList.toggle("locked", !back || keep < plain.length);
        if (t >= 28) { clearInterval(run); cipher.textContent = plain; cipher.classList.remove("locked"); }
      }, 55);
    };
    new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting) { scramble(); timer = setInterval(scramble, 3800); }
    }).observe(cipher);
  }

  // Numbers count up once, when they arrive.
  $$("[data-count]").forEach(el => {
    const end = +el.dataset.count;
    if (reduce || end === 0) return;
    el.textContent = "0";
    const o = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      o.disconnect();
      const t0 = performance.now(), dur = 900;
      const tick = now => {
        const p = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    o.observe(el);
  });

  // Leave a review: 4 or 5 stars go to the App Store; 1 to 3, to our inbox.
  const stars = $$(".stars button");
  const msg = $(".review-msg"), actions = $(".review-actions");
  const storeBtn = $(".review-store"), mailBtn = $(".review-mail");
  stars.forEach(b => {
    b.addEventListener("click", () => {
      const v = +b.dataset.v;
      stars.forEach(o => { const on = +o.dataset.v <= v; o.classList.toggle("on", on); o.setAttribute("aria-checked", String(+o.dataset.v === v)); });
      actions.hidden = false;
      const happy = v >= 4;
      msg.textContent = happy ? "Thank you! A quick App Store review helps others find KEYBO." : "Thanks for being honest. Tell us what to fix, and we'll get on it.";
      storeBtn.hidden = !happy;
      mailBtn.className = "btn review-mail " + (happy ? "btn-line" : "btn-lime");
      mailBtn.textContent = happy ? "Email us" : "Tell us what to fix";
      mailBtn.href = "mailto:hellokeybo@gmail.com?subject=" + encodeURIComponent(`KEYBO feedback: ${v}/5`) + "&body=" + encodeURIComponent(happy ? "What do you love most about KEYBO?\n\n" : "What would make KEYBO better for you?\n\n");
    });
    b.addEventListener("mouseenter", () => stars.forEach(o => o.classList.toggle("hover", +o.dataset.v <= +b.dataset.v)));
    b.addEventListener("mouseleave", () => stars.forEach(o => o.classList.remove("hover")));
  });

  $("#year").textContent = new Date().getFullYear();
})();

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
  // while you scroll through it, and the step follows the scroll; tapping a
  // feature scrolls to it. On phones it is a plain list, and whichever clip
  // is on screen plays. Only one video ever plays.
  const tour = $(".tour");
  const items = $$(".tour-item");
  const visuals = $$(".tour-visual");
  const counter = $('.rail a[data-for="features"] small');
  const pinned = () => getComputedStyle($(".tour-pin")).position === "sticky";
  const playOnly = v => {
    $$(".tour video").forEach(o => { if (o !== v) o.pause(); });
    if (v && !reduce) { v.preload = "auto"; v.play().catch(() => {}); }
  };
  let step = -1;
  const show = i => {
    if (i === step) return;
    step = i;
    items.forEach((el, k) => el.classList.toggle("on", k === i));
    visuals.forEach((el, k) => el.classList.toggle("on", k === i));
    if (counter) counter.textContent = `${String(i + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;
    if (pinned()) playOnly(visuals[i].querySelector("video"));
  };
  if (reduce) $$(".tour video").forEach(v => v.controls = true);

  if (tour && items.length) {
    let ticking = false, near = false;
    const travel = () => tour.offsetHeight - (innerHeight - 68);
    const update = () => {
      ticking = false;
      if (!pinned()) return;
      const p = Math.min(0.9999, Math.max(0, (68 - tour.getBoundingClientRect().top) / travel()));
      show(Math.floor(p * items.length));
    };
    const onScroll = () => { if (near && !ticking) { ticking = true; requestAnimationFrame(update); } };
    new IntersectionObserver(([e]) => {
      near = e.isIntersecting;
      if (near) { step = -1; onScroll(); } else $$(".tour video").forEach(v => v.pause());
    }, { rootMargin: "100px 0px" }).observe(tour);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });

    $$(".tour-tab").forEach(t => t.addEventListener("click", () => {
      if (!pinned()) return;
      const i = +t.dataset.step;
      const top = tour.getBoundingClientRect().top + scrollY - 68 + (i + 0.5) / items.length * travel();
      scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    }));

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

  // The App Store page opens once KEYBO is out (18 Oct 2026, 10:30 IST).
  // Before that the buttons lead to the download section.
  const released = Date.now() >= Date.UTC(2026, 9, 18, 5, 0);
  $$("[data-appstore]").forEach(a => { if (!released) a.setAttribute("href", "#download"); });
  if (released) $$("[data-release-note]").forEach(p => { p.innerHTML = "<b>iPhone &amp; iPad:</b> available now &nbsp;·&nbsp; <b>Android:</b> coming soon"; });

  $("#year").textContent = new Date().getFullYear();
})();

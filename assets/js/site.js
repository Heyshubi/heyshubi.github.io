// KEYBO website: theme toggle, header, side rail, the stacking feature
// cards, the demos, and KEYBO's hero loop.
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

  // Feature cards that stack in 3D. Each card is sticky a little lower than
  // the last; as the next one slides over it, it sinks back and dims. Runs
  // only while the stack is on screen, once per frame at most.
  const stack = $(".stack");
  const cards = $$(".stack-card");
  const counter = $('.rail a[data-for="features"] small');
  if (stack && cards.length) {
    let ticking = false, visible = false;
    const update = () => {
      ticking = false;
      const tops = cards.map(c => c.getBoundingClientRect().top);
      const heights = cards.map(c => c.offsetHeight);
      const n = cards.length;
      const cover = new Array(n).fill(0);
      for (let i = 0; i < n - 1; i++) {
        const dist = tops[i + 1] - tops[i];
        const full = heights[i] + 56, stacked = 16;
        cover[i] = Math.min(1, Math.max(0, 1 - (dist - stacked) / (full - stacked)));
      }
      let current = 0;
      for (let i = 0; i < n; i++) {
        let depth = 0;
        for (let j = i; j < n - 1; j++) depth += cover[j];
        const enter = i === 0 ? 1 : cover[i - 1];
        if (enter > 0.5) current = i;
        const scale = 1 - Math.min(depth, 4) * 0.045;
        const tilt = reduce ? 0 : (1 - enter) * 9;
        cards[i].style.transform = `perspective(1400px) rotateX(${tilt.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
        cards[i].style.setProperty("--dim", (Math.min(depth, 3) * 0.045).toFixed(3));
      }
      if (counter) counter.textContent = `${String(current + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;
      playActive(current);
    };
    const onScroll = () => { if (visible && !ticking) { ticking = true; requestAnimationFrame(update); } };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) onScroll(); }, { rootMargin: "200px 0px" }).observe(stack);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
  }

  // Feature videos, once they exist: only the card on top plays.
  let playing = -1;
  function playActive(i) {
    if (i === playing) return;
    playing = i;
    cards.forEach((c, k) => {
      const v = c.querySelector("video");
      if (!v) return;
      if (k === i && !reduce) v.play().catch(() => {}); else v.pause();
    });
  }

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

  // Reply demo: tap an answer and it is sent into the thread.
  const thread = $("#reply-thread");
  $$("#reply-demo .reply").forEach(btn => btn.addEventListener("click", () => {
    $$("#reply-demo .reply").forEach(b => b.classList.toggle("picked", b === btn));
    $$(".bubble.out", thread).forEach(b => b.remove());
    const out = document.createElement("div");
    out.className = "bubble out";
    out.textContent = btn.lastChild.textContent.trim();
    thread.appendChild(out);
  }));

  // A row of chips that swaps the text in a field.
  const swapper = (chipSel, fieldSel, texts, key) => {
    const field = $(fieldSel);
    if (!field) return;
    $$(chipSel).forEach(btn => btn.addEventListener("click", () => {
      $$(chipSel).forEach(b => b.classList.toggle("on", b === btn));
      field.textContent = texts[btn.dataset[key]];
    }));
  };
  swapper("#tone-demo [data-tone]", "#tone-field", {
    original: "hey can we move the meeting to tomorrow, something came up",
    friendly: "Hey! Would it be okay to move our meeting to tomorrow? Something came up on my end 😊",
    professional: "Hi, would it be possible to reschedule our meeting to tomorrow? Something unexpected has come up. Apologies for the short notice.",
    funny: "Plot twist: life happened 🙃 Any chance we can move the meeting to tomorrow?",
    custom: "Something's come up, so can we move the meeting to tomorrow? Same time works for me."
  }, "tone");
  swapper("#fix-demo [data-fix]", "#fix-field", {
    original: "i realy wanna se u tmrw, its been to long since we talk",
    fix: "I really want to see you tomorrow. It's been too long since we talked.",
    rewrite: "I'd love to see you tomorrow! It feels like ages since we last caught up."
  }, "fix");

  // Translate demo: one line, many languages.
  const out = $("#translation");
  $$("#translate-demo [data-t]").forEach(btn => btn.addEventListener("click", () => {
    $$("#translate-demo [data-t]").forEach(b => b.classList.toggle("on", b === btn));
    out.textContent = btn.dataset.t;
    out.dir = /[؀-ۿ]/.test(btn.dataset.t) ? "rtl" : "ltr";
  }));

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

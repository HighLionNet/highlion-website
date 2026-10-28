(function () {
  "use strict";
  var dialog = document.createElement("dialog");
  dialog.className = "hlctf-window";
  dialog.setAttribute("aria-labelledby", "hlctf-title");
  dialog.innerHTML = '<div class="hlctf-chrome"><span>HL / CHALLENGE ENGINE</span><button type="button" aria-label="Close challenge window">×</button></div><div class="hlctf-scene"><canvas aria-hidden="true"></canvas><div class="hlctf-horizon" aria-hidden="true"></div><div class="hlctf-orbit" aria-hidden="true"></div><div class="hlctf-actors" aria-hidden="true"></div><div class="hlctf-readout"><span>CONNECTION SECURE</span><span>HLCTF // V.08</span></div></div><div class="hlctf-copy"><span class="hlctf-eyebrow">HIDDEN SIGNAL</span><h2 id="hlctf-title">Challenge detected</h2><p class="hlctf-bubble"></p><span class="hlctf-filename"></span></div>';
  document.body.appendChild(dialog);
  var scene = dialog.querySelector(".hlctf-scene");
  var canvas = dialog.querySelector("canvas");
  var ctx = canvas.getContext("2d");
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var frame = 0, last = 0, elapsed = 0, confetti = [], celebration = false;
  var previousFocus = null;
  var actors = null, faceZones = [];
  var bubble = dialog.querySelector(".hlctf-bubble");
  var bubbleText = "", typeFrame = 0, typeTimer = 0;
  function finishType() {
    clearTimeout(typeTimer); cancelAnimationFrame(typeFrame);
    typeTimer = 0; typeFrame = 0;
    bubble.textContent = bubbleText;
  }
  function typeBubble() {
    finishType();
    if (motion.matches) return;
    var sizer = document.createElement("span"), run = document.createElement("span");
    sizer.className = "hlctf-bubble-sizer"; sizer.textContent = bubbleText;
    run.className = "hlctf-bubble-run"; run.setAttribute("aria-hidden", "true");
    bubble.replaceChildren(sizer, run);
    // Shutter 0–400ms, assemble 400–1100ms, then the complete exact message.
    typeTimer = setTimeout(function () {
      var began = performance.now(), glyphs = Array.from(bubbleText);
      var duration = Math.min(1800, Math.max(360, glyphs.length * 17));
      function type(now) {
        if (!dialog.open || motion.matches || now - began >= duration) { finishType(); return; }
        run.textContent = glyphs.slice(0, Math.floor(glyphs.length * (now - began) / duration)).join("");
        typeFrame = requestAnimationFrame(type);
      }
      typeFrame = requestAnimationFrame(type);
    }, 1100);
  }
  function loadActors() {
    if (!actors) actors = fetch("/assets/hlctf-operatives.svg?v=hl97", { credentials: "same-origin" }).then(function (response) {
      if (!response.ok) throw new Error("operatives unavailable");
      return response.text();
    }).then(function (source) {
      var svg = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
      if (svg.localName !== "svg") throw new Error("invalid operatives");
      dialog.querySelector(".hlctf-actors").appendChild(document.importNode(svg, true));
      if (dialog.open) resize();
    }).catch(function () { actors = null; });
    return actors;
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(scene.clientWidth * dpr);
    canvas.height = Math.round(scene.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var bounds = scene.getBoundingClientRect();
    faceZones = Array.from(dialog.querySelectorAll(".hlctf-head")).map(function (head) {
      var box = head.getBoundingClientRect();
      return { x: box.left - bounds.left - 18, y: box.top - bounds.top - 24, w: box.width + 36, h: box.height + 42 };
    });
  }
  function burst() {
    confetti = Array.from({ length: celebration ? 90 : 18 }, function () {
      return { x: scene.clientWidth / 2, y: scene.clientHeight * .50, vx: (Math.random() - .5) * 520, vy: -110 - Math.random() * 340, spin: Math.random() * 6, life: 2 + Math.random() * 3, color: ["#61faff", "#ff51bb", "#f8ed73", "#b897ff"][Math.floor(Math.random() * 4)] };
    });
  }
  function paint(now) {
    if (!dialog.open || document.hidden) { frame = 0; return; }
    frame = requestAnimationFrame(paint);
    if (now - last < 32) return;
    var dt = Math.min(.05, (now - (last || now - 32)) / 1000);
    last = now; elapsed += dt;
    var w = scene.clientWidth, h = scene.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h);
    faceZones.forEach(function (zone) { ctx.rect(zone.x, zone.y, zone.w, zone.h); });
    ctx.clip("evenodd");
    ctx.font = '10px "JetBrains Mono", monospace';
    var time = motion.matches ? 0 : elapsed;
    for (var col = 0; col < w / 24; col++) {
      for (var row = 0; row < 5; row++) {
        var y = ((time * (19 + col % 4 * 9) + col * 43 + row * 19) % (h + 90)) - 70;
        ctx.fillStyle = row === 4 ? "#9affec35" : "#4d8dba18";
        ctx.fillText("01<>7{}Σ+"[(col + row) % 9], col * 24, y);
      }
    }
    if (!motion.matches) confetti.forEach(function (p) {
      p.life -= dt; if (p.life <= 0) return;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.spin += dt * 5;
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.fillStyle = p.color; ctx.fillRect(-2, -5, celebration ? 5 : 2, celebration ? 11 : 3); ctx.restore();
    });
    ctx.restore();
    if (motion.matches) { cancelAnimationFrame(frame); frame = 0; }
  }
  function start() { if (dialog.open && !frame) { last = 0; frame = requestAnimationFrame(paint); } }
  function show(detail, found) {
    previousFocus = dialog.open ? previousFocus : document.activeElement;
    celebration = found;
    dialog.classList.toggle("is-celebrating", found);
    dialog.querySelector(".hlctf-eyebrow").textContent = found ? "SIGNAL VERIFIED" : "HIDDEN SIGNAL";
    dialog.querySelector("h2").textContent = found ? "Flag secured" : "Challenge detected";
    bubbleText = found
      ? (detail.reward ? "Wow, looks like you got your hands on a flag!\nHere is your reward-\nThe root password is " + detail.reward : "Flag verified. Reward needs server configuration.")
      : "Your move.";
    dialog.querySelector(".hlctf-filename").textContent = found ? "HL / " + detail.id.toUpperCase() : String(detail.path || "").split("/").pop();
    if (!dialog.open) dialog.showModal();
    resize(); burst(); loadActors(); typeBubble(); start();
  }
  dialog.querySelector("button").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("close", function () {
    cancelAnimationFrame(frame); frame = 0; confetti = [];
    finishType();
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  });
  window.addEventListener("hl:challenge-open", function (event) {
    if (event.detail && /\.hlctf$/.test(event.detail.path || "")) show(event.detail, false);
  });
  window.addEventListener("hl:flag-found", function (event) {
    if (!event.detail || ["modular", "route", "xor", "timeline"].indexOf(event.detail.id) === -1) return;
    var detail = event.detail;
    var flagDialog = document.querySelector(".flag-dialog[open]");
    // Let the FLAGS success burst finish before presenting the reward window.
    if (flagDialog) flagDialog.addEventListener("close", function () { show(detail, true); }, { once: true });
    else setTimeout(function () { show(detail, true); }, 0);
  });
  window.addEventListener("resize", function () { if (dialog.open) resize(); });
  document.addEventListener("visibilitychange", function () {
    dialog.classList.toggle("is-paused", document.hidden);
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else start();
  });
  motion.addEventListener("change", function () { if (motion.matches) finishType(); start(); });
})();

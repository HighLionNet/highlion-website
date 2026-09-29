(function () {
  "use strict";

  if (window.HighLionSfx) return;

  var key = "hl-sfx";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var stored = null;
  try { stored = window.sessionStorage.getItem(key); } catch (error) { stored = null; }
  var enabled = stored === "on" || (stored !== "off" && !reduced.matches);
  var context = null;
  var unlocked = false;
  var lastKeyAt = 0;
  var intelSwept = false;

  function audioContext() {
    if (!context) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    }
    if (context.state === "suspended") context.resume().catch(function () {});
    return context;
  }

  function unlock() {
    if (!enabled) return;
    unlocked = Boolean(audioContext());
  }

  function tone(frequency, duration, type, volume, delay) {
    if (!enabled || !unlocked) return;
    var ctx = audioContext();
    if (!ctx) return;
    var at = ctx.currentTime + (delay || 0);
    var oscillator = ctx.createOscillator();
    var gain = ctx.createGain();
    oscillator.type = type || "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume || 0.025, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.01);
  }

  function glide(from, to, duration, volume, delay) {
    if (!enabled || !unlocked) return;
    var ctx = audioContext();
    if (!ctx) return;
    var at = ctx.currentTime + (delay || 0);
    var oscillator = ctx.createOscillator();
    var gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume || 0.014, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.01);
  }

  function noise(duration, volume, delay) {
    if (!enabled || !unlocked) return;
    var ctx = audioContext();
    if (!ctx) return;
    var frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var index = 0; index < frames; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
    var source = ctx.createBufferSource();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    filter.Q.value = 0.7;
    gain.gain.value = volume || 0.004;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime + (delay || 0));
  }

  function confetti() {
    if (reduced.matches) return;
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var width = window.innerWidth;
    var height = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var terminal = document.querySelector(".hlterm-panel");
    var rect = terminal ? terminal.getBoundingClientRect() : { left: width - 120, top: height - 120, width: 80, height: 80 };
    var originX = Math.min(width - 20, Math.max(20, rect.left + rect.width * 0.78));
    var originY = Math.min(height - 20, Math.max(20, rect.top + Math.min(80, rect.height * 0.2)));
    var colors = ["#66f7ff", "#e7c56b", "#ffffff"];
    var count = 40 + Math.floor(Math.random() * 31);
    var pieces = Array(count).fill(0).map(function (_, index) {
      var angle = -Math.PI * (0.15 + Math.random() * 0.7);
      var speed = 130 + Math.random() * 230;
      return { x: originX, y: originY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, w: 3 + Math.random() * 5, h: 2 + Math.random() * 4, spin: (Math.random() - 0.5) * 14, rotation: Math.random() * Math.PI, color: colors[index % colors.length] };
    });
    var started = performance.now();
    function frame(now) {
      var elapsed = Math.min(0.9, (now - started) / 1000);
      var delta = Math.min(0.032, elapsed - (frame.previous || 0));
      frame.previous = elapsed;
      ctx.clearRect(0, 0, width, height);
      pieces.forEach(function (piece) {
        piece.vy += 520 * delta;
        piece.x += piece.vx * delta;
        piece.y += piece.vy * delta;
        piece.rotation += piece.spin * delta;
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rotation);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - 0.62) / 0.28);
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        ctx.restore();
      });
      if (elapsed < 0.9) window.requestAnimationFrame(frame);
      else canvas.remove();
    }
    window.requestAnimationFrame(frame);
  }

  function paintChip() {
    var chip = document.getElementById("navSfx");
    if (!chip) return false;
    chip.textContent = "SFX";
    chip.setAttribute("aria-label", "SFX " + (enabled ? "on" : "off"));
    chip.setAttribute("aria-pressed", enabled ? "true" : "false");
    chip.dataset.state = enabled ? "on" : "off";
    return true;
  }

  function setEnabled(next, remember) {
    enabled = Boolean(next);
    if (remember) {
      try { window.sessionStorage.setItem(key, enabled ? "on" : "off"); } catch (error) {}
    }
    if (enabled) unlock();
    paintChip();
  }

  var api = {
    enabled: function () { return enabled; },
    unlock: unlock,
    tick: function () { glide(440, 660, 0.075, 0.012); },
    key: function () {
      var now = performance.now();
      if (now - lastKeyAt < 36) return;
      lastKeyAt = now;
      noise(0.018, 0.004);
    },
    ok: function () { glide(440, 660, 0.09, 0.014); },
    error: function () { tone(98, 0.16, "triangle", 0.018); },
    sent: function () { tone(440, 0.07, "sine", 0.014); tone(660, 0.09, "sine", 0.015, 0.085); },
    flag: function () { tone(261.63, 0.12, "sine", 0.016); tone(329.63, 0.12, "sine", 0.016, 0.1); tone(392, 0.16, "sine", 0.017, 0.2); confetti(); },
    formError: function () { tone(330, 0.09, "sine", 0.024); tone(196, 0.14, "triangle", 0.03, 0.09); },
    sweep: function () {
      tone(180, 0.13, "sine", 0.012);
      tone(260, 0.13, "sine", 0.012, 0.07);
      tone(360, 0.16, "sine", 0.01, 0.14);
    }
  };
  window.HighLionSfx = api;

  document.addEventListener("pointerdown", unlock, { capture: true, once: true });
  document.addEventListener("keydown", unlock, { capture: true, once: true });
  document.addEventListener("click", function (event) {
    var toggle = event.target.closest("#navSfx");
    if (toggle) {
      setEnabled(!enabled, true);
      if (enabled) api.tick();
      return;
    }
    if (event.target.closest(".nav .link")) api.tick();
  });
  window.addEventListener("hl:intel", function (event) {
    if (!intelSwept && event.detail && event.detail.state === "live") {
      intelSwept = true;
      api.sweep();
    }
  });

  if (!paintChip()) {
    var observer = new MutationObserver(function () {
      if (!paintChip()) return;
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();

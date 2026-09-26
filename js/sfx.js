(function () {
  "use strict";

  if (window.HighLionSfx) return;

  var key = "hl-sfx";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var stored = null;
  try { stored = window.localStorage.getItem(key); } catch (error) { stored = null; }
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

  function noise(duration, volume, delay) {
    if (!enabled || !unlocked) return;
    var ctx = audioContext();
    if (!ctx) return;
    var frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var index = 0; index < frames; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
    var source = ctx.createBufferSource();
    var gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = volume || 0.012;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime + (delay || 0));
  }

  function paintChip() {
    var chip = document.getElementById("navSfx");
    if (!chip) return false;
    chip.textContent = "SFX · " + (enabled ? "on" : "off");
    chip.setAttribute("aria-pressed", enabled ? "true" : "false");
    chip.dataset.state = enabled ? "on" : "off";
    return true;
  }

  function setEnabled(next, remember) {
    enabled = Boolean(next);
    if (remember) {
      try { window.localStorage.setItem(key, enabled ? "on" : "off"); } catch (error) {}
    }
    if (enabled) unlock();
    paintChip();
  }

  var api = {
    enabled: function () { return enabled; },
    unlock: unlock,
    tick: function () { tone(930, 0.035, "square", 0.012); },
    key: function () {
      var now = performance.now();
      if (now - lastKeyAt < 36) return;
      lastKeyAt = now;
      noise(0.018, 0.008);
    },
    ok: function () { tone(176, 0.09, "sine", 0.025); tone(232, 0.08, "sine", 0.018, 0.055); },
    error: function () { tone(92, 0.16, "triangle", 0.035); noise(0.08, 0.012); },
    sent: function () { tone(440, 0.09, "sine", 0.025); tone(660, 0.12, "sine", 0.028, 0.09); },
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

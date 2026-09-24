(function () {
  "use strict";

  var canvases = Array.from(document.querySelectorAll(".rule-band .rain-canvas"));
  if (!canvases.length) return;

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var fontSize = 11;

  canvases.forEach(function (canvas) {
    var band = canvas.closest(".rule-band");
    var context = canvas.getContext("2d");
    if (!band || !context) return;

    var width = 0;
    var height = 0;
    var glyphs = [];
    var frame = 0;
    var lastPaint = 0;

    function resetGlyphs() {
      var rows = Math.max(1, Math.min(2, Math.floor(height / fontSize)));
      var count = Math.max(1, Math.floor(width / 24));
      glyphs = Array.from({ length: count }, function (_, index) {
        return {
          x: index * 24 + Math.random() * 12,
          row: Math.floor(Math.random() * rows),
          char: Math.random() > 0.5 ? "1" : "0",
          alpha: 0.22 + Math.random() * 0.23
        };
      });
    }

    function paint(randomize) {
      context.clearRect(0, 0, width, height);
      context.font = fontSize + "px JetBrains Mono, ui-monospace, monospace";
      glyphs.forEach(function (glyph) {
        if (randomize && Math.random() > 0.92) glyph.char = glyph.char === "1" ? "0" : "1";
        context.fillStyle = "rgba(102,247,255," + glyph.alpha.toFixed(2) + ")";
        context.fillText(glyph.char, glyph.x, (glyph.row + 1) * fontSize + 1);
      });
    }

    function draw(now) {
      if (motionQuery.matches) {
        frame = 0;
        paint(false);
        return;
      }
      frame = window.requestAnimationFrame(draw);
      if (now - lastPaint < 140) return;
      lastPaint = now;
      paint(true);
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = band.clientWidth;
      height = band.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      resetGlyphs();
      paint(false);
    }

    function start() {
      if (!frame && !motionQuery.matches) frame = window.requestAnimationFrame(draw);
    }

    var observer = new ResizeObserver(resize);
    observer.observe(band);
    motionQuery.addEventListener("change", function () {
      if (motionQuery.matches) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        paint(false);
      } else {
        start();
      }
    });

    resize();
    start();
  });
})();

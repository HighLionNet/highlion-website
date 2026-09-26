(function () {
  "use strict";

  var canvases = Array.from(document.querySelectorAll(".rule-band .rain-canvas"));
  if (!canvases.length) return;
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var fontSize = 10;
  var vocabulary = ["a7f3", "0x3d", "8841", "13", "dead", "7c"];

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
      var count = Math.max(4, Math.floor(width / 92));
      glyphs = Array.from({ length: count }, function (_, index) {
        return {
          x: index * (width / count) + Math.random() * 24,
          row: index % rows,
          text: vocabulary[index % vocabulary.length],
          alpha: 0.10 + Math.random() * 0.10,
          speed: 4 + Math.random() * 6
        };
      });
    }

    function paint(elapsed) {
      context.clearRect(0, 0, width, height);
      context.font = fontSize + 'px "JetBrains Mono", ui-monospace, monospace';
      context.textBaseline = "middle";
      glyphs.forEach(function (glyph) {
        if (!motionQuery.matches) {
          glyph.x += glyph.speed * elapsed;
          var measured = context.measureText(glyph.text).width;
          if (glyph.x > width + measured) glyph.x = -measured;
        }
        context.fillStyle = "rgba(122,164,184," + glyph.alpha.toFixed(3) + ")";
        context.fillText(glyph.text, glyph.x, Math.min(height - 5, 6 + glyph.row * 12));
      });
    }

    function draw(now) {
      if (motionQuery.matches) {
        frame = 0;
        paint(0);
        return;
      }
      frame = window.requestAnimationFrame(draw);
      if (now - lastPaint < 32) return;
      var elapsed = Math.min(0.1, (now - (lastPaint || now - 32)) / 1000);
      lastPaint = now;
      paint(elapsed);
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
      paint(0);
    }

    function start() {
      if (!frame && !motionQuery.matches) frame = window.requestAnimationFrame(draw);
    }

    new ResizeObserver(resize).observe(band);
    motionQuery.addEventListener("change", function () {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      paint(0);
      start();
    });
    resize();
    start();
  });
})();

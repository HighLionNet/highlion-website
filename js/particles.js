(function () {
  "use strict";

  var ATTRACT_RADIUS = 170;
  var ATTRACT_FORCE = 0.10;
  var DRAG = 0.95;
  var MAX_SPEED = 2.2;
  var COUNT_DIVISOR = 22000;
  var LINK_DIST = 90;
  var LINK_ALPHA = 0.08;
  var RIVER_GUTTER = 22;
  var RIVER_GLYPHS = [
    "a7f3", "0x3d8bff", "deadbeef", "sha256:9c82…", "md5:25a1",
    "mov rax, rdi", "/proc/net/tcp", "GET /api/intel 200", "ttl=64 seq=3"
  ];

  var canvas = document.getElementById("fx");
  if (!canvas) return;
  var context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var points = [];
  var river = [];
  var width = 0;
  var height = 0;
  var frame = 0;
  var lastFrame = 0;
  var lastSpawn = 0;
  var targetCount = 55;
  var enabled = true;
  var pointer = { x: 0, y: 0, active: false };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function between(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function perimeter() {
    return Math.max(1, 2 * (width + height));
  }

  function makePoint(atEdge) {
    var x = Math.random() * width;
    var y = Math.random() * height;
    if (atEdge) {
      var edge = Math.floor(Math.random() * 4);
      if (edge === 0) y = 0;
      if (edge === 1) x = width;
      if (edge === 2) y = height;
      if (edge === 3) x = 0;
    }
    var angle = Math.random() * Math.PI * 2;
    var drift = between(3, 10);
    var baseSize = between(1, 1.8);
    return {
      x: x,
      y: y,
      vx: Math.cos(angle) * drift,
      vy: Math.sin(angle) * drift,
      driftX: between(-0.8, 0.8),
      driftY: between(-0.8, 0.8),
      baseSize: baseSize,
      size: baseSize,
      alpha: atEdge ? 0 : between(0.18, 0.42),
      targetAlpha: between(0.18, 0.42),
      age: atEdge ? 0 : between(0, 12),
      life: between(18, 42),
      fadeIn: between(0.8, 1.6),
      fadeOut: between(1.2, 2.4),
      retiring: false,
      held: false
    };
  }

  function makeRiver(index, total) {
    return {
      distance: perimeter() * (index / total) + between(-18, 18),
      direction: index % 2 === 0 ? 1 : -1,
      speed: between(12, 28),
      alpha: between(0.14, 0.32),
      color: index % 2 === 0 ? "122,164,184" : "102,200,208",
      text: RIVER_GLYPHS[index % RIVER_GLYPHS.length]
    };
  }

  function rebuildRiver() {
    var count = clamp(Math.round(perimeter() / 130), 28, 48);
    river = Array.from({ length: count }, function (_, index) { return makeRiver(index, count); });
  }

  function circuitPosition(distance) {
    var span = perimeter();
    var cursor = ((distance % span) + span) % span;
    if (cursor <= width) return { x: cursor, y: RIVER_GUTTER - 9, angle: 0 };
    cursor -= width;
    if (cursor <= height) return { x: width - RIVER_GUTTER + 9, y: cursor, angle: Math.PI / 2 };
    cursor -= height;
    if (cursor <= width) return { x: width - cursor, y: height - RIVER_GUTTER + 9, angle: Math.PI };
    cursor -= width;
    return { x: RIVER_GUTTER - 9, y: height - cursor, angle: -Math.PI / 2 };
  }

  function clear() {
    context.clearRect(0, 0, width, height);
  }

  function drawField() {
    points.forEach(function (point) {
      context.beginPath();
      context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
      context.fillStyle = "rgba(102,200,208," + clamp(point.alpha, 0, 0.7).toFixed(3) + ")";
      context.fill();
    });
    for (var left = 0; left < points.length; left += 1) {
      for (var right = left + 1; right < points.length; right += 1) {
        var dx = points[right].x - points[left].x;
        var dy = points[right].y - points[left].y;
        var distance = Math.hypot(dx, dy);
        if (distance >= LINK_DIST) continue;
        var alpha = LINK_ALPHA * (1 - distance / LINK_DIST) * Math.min(points[left].alpha, points[right].alpha);
        context.beginPath();
        context.moveTo(points[left].x, points[left].y);
        context.lineTo(points[right].x, points[right].y);
        context.strokeStyle = "rgba(122,164,184," + alpha.toFixed(3) + ")";
        context.stroke();
      }
    }
  }

  function drawRiver() {
    context.font = '10px "JetBrains Mono", ui-monospace, monospace';
    context.textBaseline = "middle";
    river.forEach(function (glyph) {
      var position = circuitPosition(glyph.distance);
      context.save();
      context.translate(position.x, position.y);
      context.rotate(position.angle);
      context.fillStyle = "rgba(" + glyph.color + "," + glyph.alpha.toFixed(3) + ")";
      context.fillText(glyph.text, 0, 0);
      context.restore();
    });
  }

  function draw() {
    clear();
    drawField();
    drawRiver();
  }

  function resize() {
    var oldWidth = width || window.innerWidth;
    var oldHeight = height || window.innerHeight;
    var held = pointer.active ? points.filter(function (point) { return point.held; }) : [];
    width = window.innerWidth;
    height = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    targetCount = clamp(Math.floor(width * height / COUNT_DIVISOR), 55, 110);
    held.forEach(function (point) {
      point.x = clamp(point.x / oldWidth * width, 0, width);
      point.y = clamp(point.y / oldHeight * height, 0, height);
    });
    points = held;
    while (points.length < targetCount) points.push(makePoint(false));
    rebuildRiver();
    draw();
  }

  function updatePoint(point, elapsed) {
    var attracted = false;
    if (pointer.active) {
      var dx = pointer.x - point.x;
      var dy = pointer.y - point.y;
      var distance = Math.hypot(dx, dy);
      if (distance < ATTRACT_RADIUS && distance > 0.01) {
        attracted = true;
        point.vx += (dx / distance) * ATTRACT_FORCE * 60;
        point.vy += (dy / distance) * ATTRACT_FORCE * 60;
      }
    }
    point.held = attracted;
    var drag = Math.pow(DRAG, elapsed * 60);
    point.vx = point.vx * drag + point.driftX * elapsed;
    point.vy = point.vy * drag + point.driftY * elapsed;
    var speed = Math.hypot(point.vx, point.vy);
    var maxPerSecond = MAX_SPEED * 60;
    if (speed > maxPerSecond) {
      point.vx = point.vx / speed * maxPerSecond;
      point.vy = point.vy / speed * maxPerSecond;
    }
    point.x += point.vx * elapsed;
    point.y += point.vy * elapsed;
    if (point.x < 0) point.x += width;
    else if (point.x > width) point.x -= width;
    if (point.y < 0) point.y += height;
    else if (point.y > height) point.y -= height;

    if (!point.held) point.age += elapsed;
    if (point.age >= point.life && !point.held) point.retiring = true;
    var desiredAlpha = point.held ? 0.70 : point.targetAlpha;
    if (point.age < point.fadeIn && !point.held) desiredAlpha *= point.age / point.fadeIn;
    if (point.retiring && !point.held) desiredAlpha = 0;
    var alphaRate = point.retiring ? elapsed / point.fadeOut : elapsed * 4;
    point.alpha += (desiredAlpha - point.alpha) * clamp(alphaRate, 0, 1);
    var desiredSize = point.baseSize + (point.held ? 0.3 : 0);
    point.size += (desiredSize - point.size) * clamp(elapsed * 7, 0, 1);
  }

  function animate(now) {
    if (!enabled) {
      frame = 0;
      clear();
      return;
    }
    if (motionQuery.matches) {
      frame = 0;
      draw();
      return;
    }
    frame = window.requestAnimationFrame(animate);
    if (document.hidden || now - lastFrame < 24) return;
    var elapsed = Math.min(0.08, Math.max(0.001, (now - (lastFrame || now - 24)) / 1000));
    lastFrame = now;

    if (points.length < targetCount && now - lastSpawn > 120) {
      points.push(makePoint(true));
      lastSpawn = now;
    }
    if (points.length > targetCount + 8) {
      var candidate = points.find(function (point) { return !point.held && !point.retiring && point.alpha < 0.05; });
      if (candidate) candidate.retiring = true;
    }
    points.forEach(function (point) { updatePoint(point, elapsed); });
    points = points.filter(function (point) {
      return !(point.retiring && !point.held && point.alpha < 0.05);
    });
    river.forEach(function (glyph) {
      glyph.distance += glyph.direction * glyph.speed * elapsed;
      var span = perimeter();
      if (glyph.distance < 0) glyph.distance += span;
      else if (glyph.distance >= span) glyph.distance -= span;
    });
    draw();
  }

  function start() {
    enabled = true;
    if (motionQuery.matches) {
      draw();
      return;
    }
    if (!frame) {
      lastFrame = 0;
      frame = window.requestAnimationFrame(animate);
    }
  }

  function stop() {
    enabled = false;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    clear();
  }

  window.HighLionParticles = { start: start, stop: stop, resize: resize };
  window.addEventListener("pointermove", function (event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }, { passive: true });
  window.addEventListener("pointerleave", function () { pointer.active = false; }, { passive: true });
  window.addEventListener("blur", function () { pointer.active = false; });
  window.addEventListener("resize", function () { if (enabled) resize(); }, { passive: true });
  motionQuery.addEventListener("change", function () {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    if (enabled) start();
  });

  resize();
  start();
})();

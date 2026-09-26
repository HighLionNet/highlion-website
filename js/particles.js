(function () {
  "use strict";

  var ATTRACT_RADIUS = 170;
  var ATTRACT_FORCE = 0.10;
  var DRAG = 0.96;
  var MAX_SPEED = 2.4;
  var ALPHA_MIN = 0.45;
  var ALPHA_MAX = 0.88;
  var SIZE_MIN = 1.3;
  var SIZE_MAX = 2.6;
  var LINK_DIST = 130;
  var LINK_ALPHA = 0.20;
  var COUNT_DIVISOR = 16000;

  var canvas = document.getElementById("fx");
  if (!canvas) return;
  var context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var points = [];
  var width = 0;
  var height = 0;
  var dpr = 1;
  var frame = 0;
  var lastFrame = 0;
  var enabled = true;
  var pointer = { x: 0, y: 0, active: false };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function between(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function makePoint(atEdge) {
    var x = Math.random() * width;
    var y = Math.random() * height;
    if (atEdge) {
      var edge = Math.floor(Math.random() * 4);
      if (edge === 0) y = -4;
      if (edge === 1) x = width + 4;
      if (edge === 2) y = height + 4;
      if (edge === 3) x = -4;
    }
    var life = between(6, 16);
    var age = atEdge ? 0 : between(0.8, Math.max(0.9, life - 1));
    var targetAlpha = between(ALPHA_MIN, ALPHA_MAX);
    return {
      x: x,
      y: y,
      vx: between(-0.42, 0.42),
      vy: between(-0.42, 0.42),
      driftX: between(-0.018, 0.018),
      driftY: between(-0.018, 0.018),
      size: between(SIZE_MIN, SIZE_MAX),
      alpha: atEdge ? 0 : targetAlpha,
      targetAlpha: targetAlpha,
      age: age,
      life: life,
      fadeIn: between(0.4, 0.8),
      fadeOut: between(0.5, 0.9)
    };
  }

  function respawnOpposite(point) {
    var next = makePoint(true);
    if (point.x < -24) { next.x = width + 4; next.y = clamp(point.y, 0, height); }
    else if (point.x > width + 24) { next.x = -4; next.y = clamp(point.y, 0, height); }
    else if (point.y < -24) { next.y = height + 4; next.x = clamp(point.x, 0, width); }
    else if (point.y > height + 24) { next.y = -4; next.x = clamp(point.x, 0, width); }
    return next;
  }

  function clear() {
    context.clearRect(0, 0, width, height);
  }

  function draw() {
    clear();
    for (var index = 0; index < points.length; index += 1) {
      var point = points[index];
      context.beginPath();
      context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
      context.fillStyle = "rgba(102,247,255," + point.alpha.toFixed(3) + ")";
      context.fill();
    }
    for (var left = 0; left < points.length; left += 1) {
      for (var right = left + 1; right < points.length; right += 1) {
        var dx = points[right].x - points[left].x;
        var dy = points[right].y - points[left].y;
        var distance = Math.hypot(dx, dy);
        if (distance < LINK_DIST) {
          context.beginPath();
          context.moveTo(points[left].x, points[left].y);
          context.lineTo(points[right].x, points[right].y);
          context.strokeStyle = "rgba(61,139,255," + (LINK_ALPHA * (1 - distance / LINK_DIST)).toFixed(3) + ")";
          context.stroke();
        }
      }
    }
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = clamp(Math.floor(width * height / COUNT_DIVISOR), 70, 160);
    points = Array.from({ length: count }, function () { return makePoint(false); });
    if (!enabled || motionQuery.matches) clear();
    else draw();
  }

  function animate(now) {
    if (!enabled || motionQuery.matches) {
      frame = 0;
      clear();
      return;
    }
    frame = window.requestAnimationFrame(animate);
    if (document.hidden || now - lastFrame < 24) return;
    var elapsed = Math.min(0.08, Math.max(0.001, (now - (lastFrame || now - 24)) / 1000));
    lastFrame = now;

    points.forEach(function (point, index) {
      var attracted = false;
      if (pointer.active) {
        var dx = pointer.x - point.x;
        var dy = pointer.y - point.y;
        var distance = Math.hypot(dx, dy);
        if (distance < ATTRACT_RADIUS && distance > 0.01) {
          attracted = true;
          point.vx += (dx / distance) * ATTRACT_FORCE;
          point.vy += (dy / distance) * ATTRACT_FORCE;
        }
      }
      point.vx *= DRAG;
      point.vy *= DRAG;
      point.vx += point.driftX;
      point.vy += point.driftY;
      var speed = Math.hypot(point.vx, point.vy);
      if (speed > MAX_SPEED) {
        point.vx = point.vx / speed * MAX_SPEED;
        point.vy = point.vy / speed * MAX_SPEED;
      }
      point.x += point.vx;
      point.y += point.vy;
      point.age += elapsed;

      var lifeAlpha = point.targetAlpha;
      if (point.age < point.fadeIn) lifeAlpha *= point.age / point.fadeIn;
      else if (point.life - point.age < point.fadeOut) lifeAlpha *= Math.max(0, (point.life - point.age) / point.fadeOut);
      point.alpha = attracted ? Math.max(point.alpha, point.targetAlpha * 0.95) : lifeAlpha;
      point.size = clamp(point.size, SIZE_MIN, SIZE_MAX);

      if (point.age >= point.life) {
        points[index] = makePoint(true);
        return;
      }
      if (point.x < -24 || point.x > width + 24 || point.y < -24 || point.y > height + 24) {
        points[index] = respawnOpposite(point);
      }
    });
    draw();
  }

  function start() {
    enabled = true;
    if (!frame && !motionQuery.matches) {
      lastFrame = 0;
      frame = window.requestAnimationFrame(animate);
    } else if (motionQuery.matches) {
      draw();
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
    if (motionQuery.matches) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (enabled) draw();
    } else if (enabled) start();
  });

  resize();
  start();
})();

/* ==========================================================================
   HighLion Particles v3.5 — modes: hybrid | stars | orbs | off
   Frame-rate aware motion; reduced-motion support; API: window.__HLParticles
   Longer than v3 and tuned for Pi 5 stability.
   ========================================================================== */

(function(){
  let canvas = null, ctx = null, width = 0, height = 0;
  let mode = 'hybrid';
  let particles = [];
  let rafId = null;
  let lastTs = 0;
  let density = 100; // adjusted by performance & window size
  const prefersReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setCanvas(el) {
    canvas = el;
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    initParticles();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function resize() {
    if (!canvas) return;
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    // density scale based on viewport, capped tighter for ultra-wide/4K
    const area = width * height;
    density = Math.min(180, Math.max(60, Math.floor(area / 20000)));
    if (prefersReduce) density = 0; // honor reduced motion
  }

  function initParticles() {
    particles = [];
    const count = (mode === 'off' || prefersReduce) ? 0 : density;
    for (let i = 0; i < count; i++) {
      particles.push(spawnParticle());
    }
  }

  function spawnParticle() {
    const base = {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 2 + 0.7,
      a: Math.random()
    };
    if (mode === 'stars') {
      base.vx *= 0.2; base.vy *= 0.2; base.r = Math.random() * 1.6 + 0.4;
    } else if (mode === 'orbs') {
      base.vx *= 0.35; base.vy *= 0.35; base.r = Math.random() * 2.6 + 1.1;
    } else if (mode === 'hybrid') {
      if (Math.random() > 0.5) { base.r += 0.8; }
    }
    return base;
  }

  function draw(ts) {
    if (!ctx) return;
    const dt = Math.min(32, (ts - lastTs) || 16);
    lastTs = ts;
    ctx.clearRect(0, 0, width, height);

    if (mode === 'off' || prefersReduce) return;

    if (mode === 'stars' || mode === 'hybrid') {
      // trailing parallax lanes
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(0,240,255,0.15)';
      ctx.lineWidth = 1;
      for (let i=0;i<6;i++) {
        const y = (i / 6) * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    const dtScale = dt / 16;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      // move (frame-rate aware)
      p.x += p.vx * dtScale;
      p.y += p.vy * dtScale;
      // bounce
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      // draw glow orbs
      if (mode === 'orbs' || (mode === 'hybrid' && p.r > 2.0)) {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        grad.addColorStop(0, 'rgba(122,92,255,0.9)');
        grad.addColorStop(1, 'rgba(122,92,255,0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // draw core point
      ctx.fillStyle = 'rgba(0,240,255,0.88)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(ts) {
    draw(ts || performance.now());
    rafId = requestAnimationFrame(loop);
  }

  // Public API for script.js
  window.__HLParticles = {
    setMode(next) {
      mode = next;
      initParticles();
    },
    getStatus() {
      return { mode, count: particles.length };
    },
    onCanvasReady(el) {
      setCanvas(el);
    }
  };

  // If canvas already on DOM by the time this script runs:
  function tryAttachEarly() {
    const el = document.getElementById('particles-canvas');
    if (el) setCanvas(el);
  }

  window.addEventListener('resize', resize);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryAttachEarly);
  } else {
    tryAttachEarly();
  }
})();

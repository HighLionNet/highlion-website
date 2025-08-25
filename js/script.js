// =====================================================
// HLv6 • SHARED SCRIPT (includes, FX, terminal, forms)
// =====================================================
(() => {
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  // ---- Client-side includes for header/footer ----
  async function includePartials() {
    const parts = $$('[data-include]');
    await Promise.all(parts.map(async el => {
      const url = el.getAttribute('data-include');
      const res = await fetch(url, {cache:'no-cache'});
      el.innerHTML = await res.text();
    }));
  }

  // ---- Toast helper ----
  function ensureToastBox(){
    let box = $('#toast');
    if(!box){ box = document.createElement('div'); box.id='toast'; document.body.appendChild(box); }
    return box;
  }
  function toast(msg){
    const box = ensureToastBox();
    const n=document.createElement('div'); n.className='toast'; n.textContent=msg; box.appendChild(n); setTimeout(()=>n.remove(),2200);
  }
  const copyText = (t)=> navigator.clipboard?.writeText(t).then(()=>toast('Copied'));

  // ---- FX canvases (background particles + hero grid) ----
  function initFX(){
    // Overlay particles
    const fx = $('#fx'); if(!fx) return;
    const ctx = fx.getContext('2d');
    function size(){ fx.width=innerWidth; fx.height=innerHeight; }
    size(); addEventListener('resize', size);
    const P = Array.from({length: 90}, ()=>({x: Math.random()*fx.width, y: Math.random()*fx.height, vx:(Math.random()-.5)*.2, vy:(Math.random()-.5)*.2, r:Math.random()*2+0.3}));
    (function loop(){ requestAnimationFrame(loop); ctx.clearRect(0,0,fx.width,fx.height);
      ctx.globalAlpha=.6; ctx.fillStyle='rgba(102,247,255,.5)';
      for(const p of P){ p.x+=p.vx; p.y+=p.vy; if(p.x<0||p.x>fx.width) p.vx*=-1; if(p.y<0||p.y>fx.height) p.vy*=-1; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); }
      ctx.globalAlpha=.12; ctx.strokeStyle='rgba(138,107,255,.8)';
      for(let i=0;i<P.length;i++) for(let j=i+1;j<P.length;j++){
        const dx=P[i].x-P[j].x, dy=P[i].y-P[j].y, d=dx*dx+dy*dy; if(d<140*140){ ctx.beginPath(); ctx.moveTo(P[i].x,P[i].y); ctx.lineTo(P[j].x,P[j].y); ctx.stroke(); }
      }
    })();

    // Hero grid
    const g = $('#grid'); if(!g) return; const gctx = g.getContext('2d');
    function sizeG(){ g.width=innerWidth; g.height=Math.max(220, innerHeight*0.45); }
    sizeG(); addEventListener('resize', sizeG);
    let t=0; (function draw(){ requestAnimationFrame(draw); t+=0.016; const w=g.width, h=g.height; gctx.clearRect(0,0,w,h);
      const grd=gctx.createLinearGradient(0,0,0,h); grd.addColorStop(0,'rgba(102,247,255,.12)'); grd.addColorStop(1,'rgba(138,107,255,.06)'); gctx.fillStyle=grd; gctx.fillRect(0,0,w,h);
      gctx.strokeStyle='rgba(102,247,255,.18)'; gctx.lineWidth=1; const s=28, off=(Math.sin(t*.4)*s)|0;
      for(let x=off;x<w;x+=s){ gctx.beginPath(); gctx.moveTo(x,0); gctx.lineTo(x,h); gctx.stroke(); }
      for(let y=((off*1.2)|0); y<h; y+=s){ gctx.beginPath(); gctx.moveTo(0,y); gctx.lineTo(w,y); gctx.stroke(); }
      gctx.fillStyle='rgba(102,247,255,.10)'; const yy=(t*80 % (h+120))-120; gctx.fillRect(0,yy,w,120);
    })();
  }

  // ---- Session telemetry & nav behavior ----
  function initSession() {
    const startedAt = Date.now();
    const store = window.localStorage || {getItem:()=>null,setItem:()=>{}};
    const VISITS_KEY = 'hl_visits_v6';
    const visits = (parseInt(store.getItem(VISITS_KEY)||'0',10) + 1);
    store.setItem(VISITS_KEY, String(visits));

    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    $('#vVisits') && ($('#vVisits').textContent = visits);
    $('#vTZ') && ($('#vTZ').textContent = tz);
    $('#ua') && ($('#ua').textContent = navigator.userAgent);
    $('#os') && ($('#os').textContent = (navigator.platform || '—'));
    $('#cores') && ($('#cores').textContent = (navigator.hardwareConcurrency || '—'));
    $('#mem') && ($('#mem').textContent = navigator.deviceMemory? navigator.deviceMemory + ' GB' : '—');
    $('#year') && ($('#year').textContent = new Date().getFullYear());
    const upt = $('#vUptime');
    if (upt) setInterval(()=>{ const s=Math.floor((Date.now()-startedAt)/1000);
      const hh=String(Math.floor(s/3600)).padStart(2,'0'); const mm=String(Math.floor((s%3600)/60)).padStart(2,'0'); const ss=String(s%60).padStart(2,'0'); upt.textContent=`${hh}:${mm}:${ss}`; },1000);

    // Header effects + back to top
    const navEl = $('#nav'); const backTop = $('#backTop');
    addEventListener('scroll', ()=>{
      const y = Math.min(1, scrollY/140);
      if(navEl){ navEl.style.background = `linear-gradient(180deg, rgba(10,16,40,${.7 + y*.2}), transparent)`; navEl.style.boxShadow = `0 8px 24px rgba(0,0,0,${.25 + y*.25})`; }
      if(backTop){ backTop.style.display = (scrollY>400? 'inline-flex':'none'); }
    });
    backTop && backTop.addEventListener('click', ()=> scrollTo({top:0, behavior:'smooth'}));
  }



  // ---- Theme & download ----
const THEMES = ['cyber','indigo','emerald','amber','violet'];

function setTheme(mode){
  const t = THEMES.includes(mode) ? mode : 'cyber';
  document.documentElement.setAttribute('data-theme', t);
  document.body.setAttribute('data-theme', t);
}

setTheme('cyber');

    // Download this page
    $('#dlBtn') && $('#dlBtn').addEventListener('click', ()=>{
      const html="<!DOCTYPE html>\n" + new XMLSerializer().serializeToString(document);
      const blob=new Blob([html], {type:'text/html'}); const a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download=document.title.replaceAll(' ','_')+'.html';
      a.click(); URL.revokeObjectURL(a.href);
    });
  }

  // ---- Cards shine ----
  function initCards(){ $$('.card').forEach(card=>{ card.addEventListener('pointermove', e=>{ const r=card.getBoundingClientRect(); card.style.setProperty('--mx', `${e.clientX-r.left}px`); }); }); }

  // ---- Contact form & socials ----
  function initContact(){
    const form = $('#contactForm'); if(!form) return;
    const statusEl = $('#status');
    form.addEventListener('submit', (e)=>{
      e.preventDefault(); const data=Object.fromEntries(new FormData(form).entries());
      const ok = data.name && data.email && data.msg && /.+@.+/.test(data.email);
      if(!ok){ statusEl.textContent='Validation failed'; toast('Please complete all fields'); return; }
      statusEl.textContent='Sending… (simulated)';
      setTimeout(()=>{ const payload=JSON.stringify({...data, when:new Date().toISOString(), page:location.pathname}, null, 2);
        copyText(payload); statusEl.textContent='Sent (copied to clipboard)'; $('#lastSent') && ($('#lastSent').textContent=new Date().toLocaleString()); form.reset();
      }, 500);
    });
    const resumeBtn = $('#linkResume');
    if(resumeBtn){ resumeBtn.addEventListener('click', ()=> toast('Resume is locked. Use: unlock resume lion')); }
  }

  // ---- Terminal (inline + overlay) ----

function handleThemeCmd(args, println){
  if (!args.length || args[0] === 'list') {
    return println('themes: ' + THEMES.join(', '));
  }
  const t = (args[0] === 'set' ? args[1] : args[0]); // supports "theme set X" and "theme X"
  if (THEMES.includes(t)) { setTheme(t); return println(`theme set to ${t}`); }
  return println('usage: theme [list|set <name>]');
}




function initTerminal(){
    const termPrimary = { body: $('#termBody'), input: $('#termInput'), send: $('#termSend'), path: $('#termPath') };
    const termModal = { dialog: $('#termModal'), body: $('#termBody2'), input: $('#termInput2'), send: $('#termSend2'), path: $('#termPath2'), close: $('#termClose') };
    const termBtn=$('#termBtn');
    const startedAt = Date.now();
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

    function print(el, text){ if(!el) return; const div=document.createElement('div'); div.textContent=text; el.appendChild(div); el.scrollTop = el.scrollHeight; }
    function help(){ return `Commands:
  help                Show this
  projects            List project tiles (on pages with cards)
  open <id|github|linkedin|email|resume>
  goto <section>      projects|about|contact
  scan                System scan
  whoami              UA + cores + tz
  skills              Show skill tags
  theme [dark|light|cyber]
  matrix [on|off]     Toggle matrix overlay
  unlock resume <key> Unlock guarded resume
  uptime              Show session uptime
  clear               Clear terminal`; }

    const links={ github:()=>$('#linkGithub')?.click(), linkedin:()=>$('#linkLinkedin')?.click(), email:()=>$('#linkEmail')?.click(), resume:()=>toast('Resume is locked. Use: unlock resume lion') };
    let resumeUnlocked=false;
    function run(cmd, where){
      const out=t=>print(where.body, t);
      const args=cmd.trim().split(/\s+/); const c=(args.shift()||'').toLowerCase(); if(!c) return;
      switch(c){
        case 'help': out(help()); break;
        case 'projects': $$('.card').forEach((el,i)=>out(`[${i}] ${el.querySelector('.hdr span').textContent}`)); break;
        case 'open': {
          const x=args[0]; if(!x){ out('open what?'); break; }
          if(/^\d+$/.test(x)){ const idx=+x; const node=$$('.card')[idx]; if(node){ node.scrollIntoView({behavior:'smooth', block:'center'}); out(`opened ${idx}`);} else out('not found'); }
          else { const f=links[x]; if(f){ f(); out(`opening ${x}…`);} else out('unknown target'); }
          break;
        }
        case 'goto': { const id=(args[0]||'').toLowerCase(); const node=document.getElementById(id); if(node){ node.scrollIntoView({behavior:'smooth'}); out('navigated '+id);} else out('unknown section'); break; }
        case 'scan': out('Scanning…'); setTimeout(()=>{ out(`UA: ${navigator.userAgent}`); out(`Cores: ${navigator.hardwareConcurrency||'—'}`); out(`Memory: ${navigator.deviceMemory||'—'} GB`); out(`TZ: ${tz}`); }, 180); break;
        case 'whoami': out('Identifying…'); setTimeout(()=>{ out(`You are a local browser session.`); out(`OS: ${navigator.platform||'—'}  Cores: ${navigator.hardwareConcurrency||'—'}  Mem: ${navigator.deviceMemory||'—'} GB`); out(`TZ: ${tz}`); }, 140); break;
        case 'skills': out('Web UX, NetSec, Linux, Canvas FX, Terminal UIs, Bash, Pi, Nextcloud, VLANs, FL-Studio macros'); break;
        case 'theme': handleThemeCmd(args, out); break;
        case 'matrix': { const on=(args[0]||'').toLowerCase()==='on'; window.runMatrix && window.runMatrix(on); out('matrix '+(on?'on':'off')); break; }
        case 'unlock': { const what=(args[0]||''); if(what==='resume'){ const key=(args[1]||''); if(key==='lion'){ resumeUnlocked=true; const btn=$('#linkResume'); if(btn){ btn.classList.remove('locked'); btn.innerHTML = btn.innerHTML.replace('Resume (locked)','Resume'); btn.onclick=()=>{ window.open('/assets/resume.pdf','_blank'); }; } out('Resume unlocked.'); toast('Resume unlocked'); } else out('Bad key.'); } else out('Unknown unlock target'); break; }
        case 'uptime': { const s=Math.floor((Date.now()-startedAt)/1000); out(`${s}s since load`); break; }
        case 'clear': where.body.innerHTML=''; break;
        default: out(`Unknown: ${c}. Try 'help'.`);
      }
    }

    function bindTerm(w){
      if(!w || !w.body || !w.input || !w.send) return;
      w.send.addEventListener('click', ()=>{ const v=w.input.value; print(w.body, `hl ${w.path?.textContent||'~/v6'} $ ${v}`); run(v, w); w.input.value=''; });
      w.input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ w.send.click(); }});
    }

    function openTerminal(){
      const dlg = $('#termModal');
      if(dlg && !dlg.open){ dlg.showModal(); $('#termInput2')?.focus(); }
      else if(!dlg){ toast('Terminal opened'); }
    }

    $('#termBtn') && $('#termBtn').addEventListener('click', openTerminal);
    $('#termClose') && $('#termClose').addEventListener('click', ()=> $('#termModal')?.close());
    document.addEventListener('keydown', e=>{ if((e.key==='`'||e.key==='~') && !/input|textarea/i.test(e.target.tagName)){ e.preventDefault(); openTerminal(); }});

    bindTerm(termPrimary); bindTerm(termModal);

    // Matrix overlay impl (shared)
    const mcv = $('#matrix'); const mctx = mcv?.getContext('2d');
    function sizeMatrix(){ if(!mcv) return; mcv.width=innerWidth; mcv.height=innerHeight; }
    window.runMatrix = function(on){
      if(!mcv || !mctx) return;
      if(on){ mcv.style.display='block'; sizeMatrix(); const cols=Math.floor(mcv.width/16); const drops=new Array(cols).fill(0); const glyphs='アァカサタナハマヤャラワガザダバパ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        (function loop(){ if(mcv.style.display==='none') return; requestAnimationFrame(loop); mctx.fillStyle='rgba(0,0,0,.08)'; mctx.fillRect(0,0,mcv.width,mcv.height); mctx.fillStyle='rgba(0,255,100,.8)'; mctx.font='14px ui-monospace, monospace'; for(let i=0;i<drops.length;i++){ const text=glyphs[Math.floor(Math.random()*glyphs.length)]; mctx.fillText(text, i*16, drops[i]*16); if(drops[i]*16 > mcv.height && Math.random()>.975) drops[i]=0; drops[i]++; } })();
      } else { mcv.style.display='none'; }
    };
    addEventListener('resize', ()=>{ if(mcv && mcv.style.display!=='none') sizeMatrix(); });
  }

  // ---- Active nav link by URL ----
  function markActiveNav(){
    const here = location.pathname.replace(/\/+$/,'');
    $$('.nav a.link').forEach(a=>{
      const to = a.getAttribute('href').replace(/\/+$/,'');
      if (to === here) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    });
  }

  // ---- Boot sequence ----
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      // Create FX canvases if missing
      if(!$('#fx')){ const fx = document.createElement('canvas'); fx.id='fx'; fx.className='fx'; fx.setAttribute('aria-hidden','true'); document.body.prepend(fx); }
      if(!$('.scanlines')){ const sl=document.createElement('div'); sl.className='scanlines'; sl.setAttribute('aria-hidden','true'); document.body.prepend(sl); }

      // Inject header/footer
      await includePartials();

      // Initialize systems
      initSession(); initFX(); initCards(); initContact(); initTerminal(); markActiveNav();
    } catch (e){
      console.error(e);
      toast('Init error — check console');
    }
  });
})();

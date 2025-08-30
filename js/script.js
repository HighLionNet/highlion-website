/* HighLion include helper (idempotent + dedupe) */
(function(){
  "use strict";
  if (window.__HL_INCLUDES_DONE) return;       // don't run twice
  window.__HL_INCLUDES_DONE = true;

  function dedupeOnce(){
    // keep the first header/footer; remove the rest
    var hs = document.querySelectorAll('header'); 
    for (var i=1;i<hs.length;i++) try{ hs[i].remove(); }catch(e){}
    var fs = document.querySelectorAll('footer'); 
    for (var j=1;j<fs.length;j++) try{ fs[j].remove(); }catch(e){}
  }

  document.addEventListener('DOMContentLoaded', function(){
    // fetch and replace placeholders
    var nodes = Array.from(document.querySelectorAll('[data-include]'));
    if (!nodes.length){ dedupeOnce(); return; }
    Promise.all(nodes.map(function(el){
      var url = el.getAttribute('data-include');
      return fetch(url, {cache:'no-store', credentials:'same-origin'})
        .then(function(r){ if(!r.ok) throw new Error(r.status+' '+r.statusText); return r.text(); })
        .then(function(html){
          el.insertAdjacentHTML('beforebegin', html);   // inject content
          try{ el.remove(); }catch(e){}                 // remove placeholder
        })
        .catch(function(e){ console.error('include fail:', url, e); });
    }))
    .finally(function(){
      // one pass of dedupe after all inserts
      dedupeOnce();
      // extra pass shortly after in case something else injects late
      setTimeout(dedupeOnce, 100);
    });
  });
})();

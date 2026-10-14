/**
 * Diagnostic page: mount the REAL rows, then print the resulting DOM state into
 * the page so it can be screenshotted (stdout from the browser is not capturable
 * in this environment, and --dump-dom returns nothing here).
 *
 *   node tools/diag.mjs && <browser> --headless --screenshot=... tools/diag.html
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { apply } from '../lib/index.js'

const rows = []
apply({ on: (e, h) => { if (e === 'webserver/index-inject') h(rows) } })
const style = rows.find((r) => r.kind === 'style')
const script = rows.find((r) => r.kind === 'script')

const probe = `
(function(){
  var out=[];
  function line(k,v){ out.push(k+' :: '+v); }
  try{
    var h=document.getElementById('dshboot-host');
    line('html.children', Array.prototype.map.call(document.documentElement.children,function(n){return n.tagName}).join('>'));
    line('html.hasCoverClass', document.documentElement.classList.contains('dshboot-on'));
    line('host found', h?('yes, parent='+h.parentNode.tagName):'NO');
    if(h){
      var r=h.getBoundingClientRect();
      line('host rect', [r.width,r.height].join('x')+' @'+r.left+','+r.top);
      var cs=getComputedStyle(h);
      line('host --total', JSON.stringify(cs.getPropertyValue('--total')));
      line('host --c-stage', JSON.stringify(cs.getPropertyValue('--c-stage')));
      line('host --fx', JSON.stringify(cs.getPropertyValue('--fx')));
      line('host display/zi', cs.display+' / '+cs.zIndex);
      line('host background', cs.backgroundColor);
      var sr=h.shadowRoot;
      line('shadowRoot', sr?('yes, children='+sr.childElementCount):'NO');
      if(sr){
        line('sr tags', Array.prototype.map.call(sr.children,function(n){return n.tagName+(n.id?'#'+n.id:'')+(n.className&&typeof n.className==='string'?'.'+n.className.split(' ')[0]:'')}).join(' | '));
        line('style sheet rules', sr.querySelector('style')?sr.querySelector('style').sheet.cssRules.length:'no style');
        var stage=sr.getElementById('stage');
        line('stage', stage?('found, rect='+JSON.stringify(stage.getBoundingClientRect().toJSON())):'NO');
        var veil=sr.getElementById('veil');
        line('veil', veil?('op='+getComputedStyle(veil).opacity+' bg='+getComputedStyle(veil).backgroundColor):'NO');
        var boot=sr.getElementById('boot');
        line('boot', boot?('disp='+getComputedStyle(boot).display+' zi='+getComputedStyle(boot).zIndex):'NO');
        var svg=sr.querySelector('svg.mark');
        line('svg.mark', svg?('rect='+JSON.stringify(svg.getBoundingClientRect().toJSON())+' opacity='+getComputedStyle(svg).opacity):'NO');
        var txt=sr.getElementById('st');
        line('status text', txt?JSON.stringify(txt.textContent):'NO');
        line('pct text', sr.getElementById('pc')?JSON.stringify(sr.getElementById('pc').textContent):'NO');
        line('ticks built', sr.getElementById('ticks')?sr.getElementById('ticks').childElementCount:'NO');
        // --- the gate: what the pause actually did -------------------------
        line('host inline --ps', JSON.stringify(h.style.getPropertyValue('--ps')));
        line('host computed --ps', JSON.stringify(cs.getPropertyValue('--ps')));
        var nd=sr.querySelector('.needle');
        if(nd){
          var ncs=getComputedStyle(nd);
          line('needle play-state', ncs.animationPlayState);
          line('needle dur/delay', ncs.animationDuration+' / '+ncs.animationDelay);
          line('needle transform', ncs.transform);
        }
        var vv=sr.getElementById('veil');
        if(vv){ var vcs=getComputedStyle(vv);
          line('veil play-state', vcs.animationPlayState+' op='+vcs.opacity+' tf='+vcs.transform); }
        // Does --ps on the HOST actually reach the shadow tree? This is the one
        // mechanism the gate depends on, and it needs no elapsed time to test.
        if(nd){
          var before=getComputedStyle(nd).animationPlayState;
          h.style.setProperty('--ps','paused');
          var after=getComputedStyle(nd).animationPlayState;
          line('--ps propagation', before+' -> '+after+(after==='paused'?'   PASS':'   FAIL'));
          h.style.removeProperty('--ps');
          line('--ps restored', getComputedStyle(nd).animationPlayState);
        }
      }
    }
  }catch(err){ line('EXCEPTION', err && err.message); }
  var box=document.getElementById('probe');
  box.textContent='';
  out.forEach(function(s){ var d=document.createElement('div'); d.textContent=s; box.appendChild(d); });
})();
`

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>diag</title>
<style>
 html,body{margin:0;height:100%;overflow:hidden;background:#15171F}
 #probe{position:fixed;left:0;top:0;z-index:2147483000;padding:10px 14px;background:#000;color:#7CFFB2;
   font:13px/1.75 ui-monospace,Consolas,monospace;white-space:pre;max-width:100%}
</style>
${style.text}
</head>
<body>
<div id="probe">(running…)</div>
<div data-dsh-boot><span data-dsh-boot-spinner></span></div>
<script>${script.text}</script>
<script>${probe}</script>
</body></html>
`

writeFileSync(fileURLToPath(new URL('./diag.html', import.meta.url)), html, 'utf8')
console.log('diag.html written')

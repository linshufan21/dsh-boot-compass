/**
 * Build tools/preview.html by calling the REAL host half.
 *
 * This deliberately does not reimplement the injection: it imports lib/index.js,
 * runs apply() against a fake context to capture the rows the carrier would have
 * received, and writes those rows verbatim into a page. So if the preview looks
 * right, the rows are right -- a preview built from a copy could pass while the
 * shipped code was broken.
 *
 * The page also supplies what DSH would: a mock app behind the splash (so the
 * exit has something to reveal) and a [data-dsh-boot] card, which is removed on a
 * timer to exercise the real readiness gate. Query params:
 *
 *   ?delay=5000   hold the card for 5s -> the gate freezes on the HOLD frame
 *   ?theme=light  force the light theme
 *   ?mode=off     write the off switch, then reload to check a plain boot
 *   ?replay=1     stub the window route, so the replay trigger can be driven
 *                 from the console (window.__MOCK) without the desktop shell
 *
 * The fake context also answers ctx.inject, so the host's route is registered and
 * its payload checked here rather than only on a real machine.
 *
 *   node tools/build-preview.mjs [stem]
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { apply, WINDOW } from '../lib/index.js'

const rows = []
const routes = new Map()
const scoped = {
  effect(fn) { const dispose = fn(); return () => { dispose?.() } },
  webServer: {
    register(route) { routes.set(route.path, route); return () => routes.delete(route.path) },
  },
}
apply({
  on(event, handler) {
    if (event === 'webserver/index-inject') handler(rows)
  },
  effect(fn) { fn(); return () => {} },
  inject(_deps, callback) { callback(scoped) },
})

const kinds = rows.map((r) => r.kind).join(', ')
const style = rows.find((r) => r.kind === 'style')
const script = rows.find((r) => r.kind === 'script')
if (style === undefined || script === undefined) {
  throw new Error(`apply() did not emit the expected rows (got: ${kinds})`)
}
if (script.placement !== 'head') throw new Error('script row must be placement:head')
// The whole ordering guarantee rests on this: assets must precede boot.js.
const cssAt = script.text.indexOf('window.__dshBootCss=')
const htmlAt = script.text.indexOf('window.__dshBootHtml=')
const iifeAt = script.text.indexOf('(function ()')
if (!(cssAt === 0 && htmlAt > cssAt && iifeAt > htmlAt)) {
  throw new Error('asset globals must be assigned before the boot IIFE')
}
// The replay route must exist and must answer JSON even where no watcher can be
// built -- the page has to be able to tell "no" from "no answer".
const route = routes.get(WINDOW.path)
if (route === undefined || route.kind !== 'exact') {
  throw new Error(`apply() did not register ${WINDOW.path} as an exact route (got: ${[...routes.keys()].join(', ')})`)
}
let payload = null
route.handler({}, { writeHead() {}, end(text) { payload = JSON.parse(text) } })
if (payload === null || typeof payload.ok !== 'boolean') {
  throw new Error(`window route did not answer a JSON object with .ok (got: ${JSON.stringify(payload)})`)
}
console.log(`route       : ${WINDOW.path} -> ${JSON.stringify(payload)}`)

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-boot-compass · 宿主行实况预览</title>
<!-- 这一段是 DSH 自己的界面样式，只为让"被揭示出来的应用"看得见 -->
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#1B1D24;color:#c9cede;
    font:13px/1.5 -apple-system,"Segoe UI","Noto Sans SC",sans-serif}
  /* 预览用的占位界面 —— 真实插件交接的是你自己的 DSH 界面，不是这一堆灰条。 */
  #app{position:fixed;inset:0;display:flex;flex-direction:column;background:#1B1D24}
  #app .top{height:44px;flex:none;display:flex;align-items:center;gap:11px;padding:0 16px;
    border-bottom:1px solid rgba(150,162,200,.14);background:#20232B}
  #app .logo{width:19px;height:19px;border-radius:6px;background:#4D6BFE;opacity:.85}
  #app .title{font-size:13px;font-weight:600;color:#dfe3ee;letter-spacing:.02em}
  #app .sp{flex:1}
  #app .pill{width:56px;height:22px;border-radius:11px;background:rgba(150,162,200,.14)}
  #app .pill.acc{width:74px;background:rgba(77,107,254,.30)}
  #app .body{flex:1;display:flex;min-height:0}
  #app .side{width:15%;min-width:132px;border-right:1px solid rgba(150,162,200,.14);
    padding:14px 12px;display:flex;flex-direction:column;gap:7px;background:#181A21}
  #app .nav{height:27px;border-radius:7px;background:rgba(150,162,200,.10)}
  #app .nav.on{background:rgba(77,107,254,.26)}
  #app .nav.gap{margin-top:12px}
  #app .main{flex:1;padding:20px 22px;display:flex;flex-direction:column;gap:12px;overflow:hidden}
  #app .h1{width:34%;height:17px;border-radius:5px;background:rgba(190,202,235,.34)}
  #app .sub{width:52%;height:10px;border-radius:5px;background:rgba(150,162,200,.16)}
  #app .cards{display:flex;gap:12px;margin-top:5px}
  #app .card{flex:1;height:88px;border-radius:10px;border:1px solid rgba(150,162,200,.14);
    background:rgba(150,162,200,.07)}
  #app .card.hi{border-color:rgba(77,107,254,.40);background:rgba(77,107,254,.11)}
  #app .line{height:9px;border-radius:5px;background:rgba(150,162,200,.13)}
  #app .line.w80{width:80%} #app .line.w65{width:65%} #app .line.w45{width:45%}
  [data-dsh-boot]{position:fixed;inset:0;z-index:1;display:grid;place-items:center;background:#191b23;
    color:#8d94a8;font-size:14px}
  [data-dsh-boot] .row{display:flex;align-items:center;gap:11px}
  [data-dsh-boot-spinner]{width:15px;height:15px;border-radius:50%;
    border:1.6px solid rgba(141,148,168,.3);border-top-color:#8d94a8;animation:spin .9s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  #probe{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;padding:5px 10px;
    font:11px/1.6 ui-monospace,Consolas,monospace;color:#6b7183;background:rgba(10,11,16,.82);
    pointer-events:none;white-space:nowrap;overflow:hidden}
  #probe b{color:#4D6BFE;font-weight:600}
</style>
<!-- ===== 下面是 lib/index.js 真正产出的 style 行，一字未改 ===== -->
${style.text}
</head>
<body>
<div id="app">
  <div class="top">
    <span class="logo"></span><span class="title">DeepSeek Harness</span><span class="sp"></span>
    <span class="pill"></span><span class="pill acc"></span>
  </div>
  <div class="body">
    <div class="side">
      <div class="nav on"></div><div class="nav"></div><div class="nav"></div>
      <div class="nav"></div><div class="nav gap"></div><div class="nav"></div>
    </div>
    <div class="main">
      <div class="h1"></div><div class="sub"></div>
      <div class="cards"><div class="card hi"></div><div class="card"></div><div class="card"></div></div>
      <div class="line w80"></div><div class="line"></div><div class="line w65"></div><div class="line w45"></div>
    </div>
  </div>
</div>
<div data-dsh-boot><div class="row"><span data-dsh-boot-spinner></span><span>HARNESS 正在加载插件…</span></div></div>
<div id="probe">宿主行实况 · rows[<b>${kinds}</b>] · style ${style.text.length} B · script ${script.text.length} B</div>

<!-- ===== 模拟宿主卡消失 = 应用就绪；这是真实 gate 的输入 ===== -->
<script>
(function(){
  var q=new URLSearchParams(location.search);
  var delay=parseFloat(q.get('delay')); if(!isFinite(delay)) delay=2400;
  // ?probe=0 收掉底部那行调试实况 —— 拿去给人看动画本身时不该有这行。
  if(q.get('probe')==='0'){ var pb=document.getElementById('probe'); if(pb) pb.style.display='none'; }
  if(q.get('mode')==='off'){ try{localStorage.setItem('dsh-boot-compass:mode','off')}catch(e){} }
  else { try{localStorage.removeItem('dsh-boot-compass:mode')}catch(e){} }
  var th=q.get('theme'); try{ if(th) localStorage.setItem('dsh-boot-compass:theme',th); else localStorage.removeItem('dsh-boot-compass:theme') }catch(e){}
  // ?replay=1 用一个脚本化的"宿主"顶掉真正的窗口路由：桌面壳不在场时，重播判定
  // 仍然可以被完整驱动（window.__MOCK 改状态，visibilitychange 叫醒它）。
  var rp=q.get('replay');
  if(rp==='1'||rp==='any'||rp==='win'){
    try{ localStorage.setItem('dsh-boot-compass:replay', rp==='any'?'any':'window') }catch(e){}
    window.__MOCK={ok:true,visible:true,iconic:false,epoch:0,kind:null,at:0,hiddenFor:0};
    var real=window.fetch&&window.fetch.bind(window);
    window.fetch=function(url,init){
      if(String(url).indexOf('/__boot-compass/window')===0){
        return Promise.resolve(new Response(JSON.stringify(window.__MOCK),{status:200,headers:{'content-type':'application/json'}}));
      }
      return real?real(url,init):Promise.reject(new Error('no fetch'));
    };
  } else { try{ localStorage.removeItem('dsh-boot-compass:replay') }catch(e){} }
  var card=document.querySelector('[data-dsh-boot]');
  setTimeout(function(){
    if(card&&card.parentNode) card.parentNode.removeChild(card);
  }, delay);
  // ?skip=MS 派发一次真实 pointerdown，走的还是 boot.js 里那个监听器
  var sk=parseFloat(q.get('skip'));
  if(isFinite(sk)) setTimeout(function(){
    window.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  }, sk);
  // 实时探针：--ps 是 gate 的直接证据；__dshBoot.state() 是插件自己的控制面
  var probe=document.getElementById('probe');
  setInterval(function(){
    var h=document.getElementById('dshboot-host');
    var ps='-';
    try{ ps=getComputedStyle(h).getPropertyValue('--ps').trim()||'(unset=running)'; }catch(e){}
    var st='-';
    try{ st=window.__dshBoot.state(); }catch(e){}
    probe.innerHTML='占位界面（真实插件交接的是你自己的 DSH）· t=<b>'+Math.round(performance.now())+'</b> ms'+
      ' · 宿主卡 '+(document.querySelector('[data-dsh-boot]')?'在':'已移除')+
      ' · cover '+(document.documentElement.classList.contains('dshboot-on')?'在':'已撤')+
      ' · <b>--ps '+ps+'</b>'+
      ' · state '+(st&&st.progress!=null?('p='+st.progress.toFixed(2)+' held='+st.held+' done='+st.finished):'-');
  }, 120);
})();
</script>

<!-- ===== 下面是 lib/index.js 真正产出的 script 行，一字未改 ===== -->
<script>${script.text}</script>
</body>
</html>
`

// Optional output stem, so the same builder can emit an A/B variant (e.g. one with
// the promotion hints restored) for interleaved measurement.
const out = fileURLToPath(new URL(`./${process.argv[2] ?? 'preview'}.html`, import.meta.url))
writeFileSync(out, html, 'utf8')
console.log(`rows        : ${kinds}`)
console.log(`style row   : ${style.text.length} B`)
console.log(`script row  : ${script.text.length} B`)
console.log(`preview     : ${out}  (${html.length} B)`)

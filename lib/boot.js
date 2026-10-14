/**
 * Browser half of dsh-boot-compass.
 *
 * Delivered as an inline `<script>` row from the host (lib/index.js), so it runs
 * while <head> is still parsing -- earlier than any client plugin, and earlier
 * than DSH's own boot card is built.
 *
 * It does five things, in this order:
 *
 *   1. Bows out entirely if the mode is 'off' (no cover, no DOM, no black frame).
 *   2. Mounts the whole splash inside a SHADOW ROOT. That is what lets boot.css
 *      stay written against plain selectors (.grid, .txt, .rail ...): the shadow
 *      boundary isolates both directions, so nothing leaks into the app and
 *      nothing in the app can reach the splash.
 *   3. Retires the CSS-only cover (html.dshboot-on) on the SAME task that the
 *      shadow root is on screen. One task, one paint, no seam. The cover and the
 *      host share a background colour for exactly this reason.
 *   4. Drives the parts CSS cannot: the decoded status line, the percentage, and
 *      the readiness gate at 0.76 -- the design's HOLD frame, where nothing is
 *      mid-flight, so freezing there is invisible.
 *   5. Arms the replay: reopening the window after it was really hidden plays the
 *      whole thing again (see below).
 *
 * Contract with lib/index.js (keep in sync): MODE_KEY, THEME_KEY, COVER_CLASS,
 * the two globals carrying boot.css / boot.html, and WINDOW_PATH.
 *
 * The clock is the CSS one. Nothing here writes styles per frame except the
 * pause/resume flag, so the animation stays on the compositor.
 *
 * WHY A REPLAY CANNOT JUST LISTEN FOR visibilitychange
 * `document.hidden` is true both when the window was hidden to the tray and when
 * it is merely covered by another application -- measured at 1 ms and 23 ms
 * respectively on the shipped build, so the two are indistinguishable, and a
 * splash that trusted the event would fire on every alt-tab back from a
 * maximized window. The host half reads the real Win32 window state
 * (lib/window.js) and counts genuine reopens in `epoch`; visibilitychange is
 * used only as the cue to ask, so the answer arrives about one local request
 * after the window is on screen. Everything about that path degrades: no route,
 * no answer, no replay -- never a broken boot.
 */
(function () {
  var MODE_KEY = 'dsh-boot-compass:mode';
  var THEME_KEY = 'dsh-boot-compass:theme';
  var TOTAL_KEY = 'dsh-boot-compass:total';
  /** 'window' (default) | 'any' | 'off' -- see config() below. */
  var REPLAY_KEY = 'dsh-boot-compass:replay';
  /** Milliseconds the window must have been away before a replay is worth it. */
  var REPLAY_MIN_KEY = 'dsh-boot-compass:replaymin';
  var COVER_CLASS = 'dshboot-on';
  var HOST_ID = 'dshboot-host';
  /** Hard ceiling (ms): past this the splash releases whatever is on the page. */
  var MAX_MS = 12000;
  /** The HOLD frame. Nothing is mid-flight between .74 and .80, so pausing is seamless. */
  var GATE = 0.76;
  /** Where a click-to-skip lands: the RELEASE point, so the exit still plays. */
  var SEEK = 0.80;
  /** Fallback if the CSS variable cannot be read. Must match boot.css. */
  var TOTAL_FALLBACK = 3000;
  /** lib/index.js WINDOW_PATH -- keep in sync. */
  var WINDOW_PATH = '/__boot-compass/window';
  /**
   * Below this, a reopen is a mis-click rather than a new session.
   *
   * The first default was 1000 ms; a real close-to-tray-and-reopen measured
   * 1020 ms, which made the feature feel intermittent for exactly the gesture it
   * exists to serve. The floor now sits well under a natural reopen instead of
   * on top of it. The host samples at 250 ms, so anything faster than that is
   * invisible to it whatever this says.
   */
  var REPLAY_MIN_DEFAULT = 600;
  /**
   * A transition older than this is history, not a reopen. The heartbeat poll
   * exists to catch a missed event, not to replay a splash seconds late.
   */
  var FRESH_MS = 2500;
  /** Safety net for a missed visibilitychange; also refreshes the epoch baseline. */
  var HEARTBEAT_MS = 10000;

  function store(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }

  function num(key, lo, hi, fallback) {
    var value = parseFloat(store(key));
    if (!isFinite(value) || value < lo || value > hi) return fallback;
    return value;
  }

  // ---- 1. off switch -----------------------------------------------------
  if (store(MODE_KEY) === 'off') return;
  if (document.getElementById(HOST_ID) !== null) return; // idempotent

  var css = window.__dshBootCss;
  var html = window.__dshBootHtml;
  if (typeof css !== 'string' || typeof html !== 'string') {
    // Diagnosable, and above all not a black screen: drop the cover and leave
    // DSH to boot normally.
    document.documentElement.classList.remove(COVER_CLASS);
    if (window.console && console.warn) {
      console.warn('[boot-compass] assets missing (__dshBootCss/__dshBootHtml); splash skipped');
    }
    return;
  }

  var root = document.documentElement;
  var NS = 'http://www.w3.org/2000/svg';

  /* Deterministic PRNG. The decoded status line must render identically for the
     same progress, so scrubbing/screenshots reproduce -- Math.random() cannot. */
  function rnd(a, b) {
    var x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  // ---- content shared by every play -------------------------------------
  /** rails: the periphery carries information, not just texture */
  var SUBS = [['KERNEL', 'OK'], ['PATCH LAYER', 'OK'], ['WEB ROUTE', 'OK'],
              ['SESSION', 'OK'], ['SANDBOX', 'OK'], ['BUNDLES', '11'], ['PLUGINS', '7/7']];
  var PLUGINS = ['dsh-dream-skin', 'dsh-all-usage', 'dshmarket', 'dsh-bundle-web',
                 'dsh-bundle-desktop', 'dsh-ui-font', 'dsh-550c-boot'];
  var SEG = [
    { p: 0.00, t: '\u6b63\u5728\u521d\u59cb\u5316\u5185\u6838', hud: 'INIT' },
    { p: 0.09, t: '\u6b63\u5728\u626b\u63cf\u63d2\u4ef6\u6e05\u5355', hud: 'SCAN' },
    { p: 0.30, t: '\u6b63\u5728\u6302\u8f7d\u8865\u4e01\u5c42', hud: 'LOAD' },
    { p: 0.46, t: '\u6b63\u5728\u6ce8\u518c Web \u670d\u52a1', hud: 'LOAD' },
    { p: 0.56, t: '\u6b63\u5728\u6062\u590d\u4f1a\u8bdd', hud: 'LOAD' },
    { p: 0.62, t: '\u6b63\u5728\u9501\u5b9a\u914d\u7f6e', hud: 'LOCK' },
    { p: 0.74, t: '\u5df2\u5c31\u7eea\uff0c\u6b63\u5728\u79fb\u4ea4', hud: 'READY' }
  ];
  var GLY = '#$%&/\\<>*+=~^0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  // ---- 2. one play -------------------------------------------------------
  /**
   * Mount and run one splash. Called once for the document and again for every
   * replay, so every piece of state below is local to this call: two plays never
   * share a clock, a shadow root or a teardown.
   *
   * @param options - `replay` skips the readiness gate (the app is already up and
   *   there is no boot card to wait for), `done` runs when the splash is gone.
   */
  function play(options) {
    var replaying = options.replay === true;

    var theme = store(THEME_KEY);
    if (theme !== 'light' && theme !== 'dark') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    var host = document.createElement('div');
    host.id = HOST_ID;
    if (theme === 'light') host.setAttribute('data-theme', 'light');
    // The colour the cover is already painting, so retiring it is invisible.
    host.style.background = theme === 'light' ? '#F6F7FB' : '#0A0B10';

    var sr = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = css;
    sr.appendChild(style);

    var staging = document.createElement('div');
    staging.innerHTML = html;
    while (staging.firstChild !== null) sr.appendChild(staging.firstChild);

    // ---- 3. same task, one paint ----------------------------------------
    // Cover on -> splash on top of it -> cover off. All three in one task, in that
    // order, so there is no instant where neither is painted. The two share a
    // background colour, which is what makes retiring the cover invisible.
    //
    // A replay has no cover to bridge: the host paints its own opaque stage, the
    // append below is synchronous, and the only thing toggling the class would
    // achieve is asking the desktop shell to restyle its caption strip for a
    // frame.
    if (replaying) {
      root.appendChild(host);
    } else {
      root.classList.add(COVER_CLASS);
      root.appendChild(host);
      root.classList.remove(COVER_CLASS);
    }

    // ---- duration: boot.css is the single source of truth -----------------
    var TOTAL = TOTAL_FALLBACK;
    var override = parseFloat(store(TOTAL_KEY));
    if (isFinite(override) && override >= 800 && override <= 12000) {
      host.style.setProperty('--total', String(override));
    }
    try {
      var read = parseFloat(getComputedStyle(host).getPropertyValue('--total'));
      if (isFinite(read) && read > 0) TOTAL = read;
    } catch (error) { /* keep the fallback */ }

    var $ = function (id) { return sr.getElementById(id); };
    /**
     * The pause flag must be set on the HOST, not on <html>.
     *
     * boot.css carries `:host{--ps:running}` (it came from the reviewed file's
     * `:root` block), and a declaration ON the host beats anything inherited from
     * an ancestor -- so setting it on documentElement looked correct and did
     * nothing at all. An inline style on the host wins over the :host rule.
     */
    var sv = function (k, v) { host.style.setProperty(k, v); };

    // ---- the parts CSS cannot express: geometry ---------------------------
    var ticksG = $('ticks');
    for (var i = 0; i < 12; i++) {
      var card = (i % 3 === 0);
      var rO = card ? 88 : 84;
      var rI = card ? 74 : 76;
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', 'rotate(' + String(i * 30) + ' 100 100)');
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', '100'); l.setAttribute('y1', String(100 - rO));
      l.setAttribute('x2', '100'); l.setAttribute('y2', String(100 - rI));
      l.setAttribute('class', 'tick a' + (card ? ' card' : ''));
      l.setAttribute('stroke-width', card ? '3' : '1.9');
      l.style.setProperty('--d', String(0.09 + i * (0.23 / 12)));
      l.style.setProperty('--dur', '0.16');
      g.appendChild(l);
      ticksG.appendChild(g);
    }

    var bezG = $('bezel');
    for (var t = 0; t < 24; t++) {
      var cdm = (t % 6 === 0);
      var bg2 = document.createElementNS(NS, 'g');
      bg2.setAttribute('transform', 'rotate(' + String(t * 15) + ' 100 100)');
      var bl = document.createElementNS(NS, 'line');
      bl.setAttribute('x1', '100'); bl.setAttribute('y1', cdm ? '134' : '142');
      bl.setAttribute('x2', '100'); bl.setAttribute('y2', '152');
      bl.setAttribute('stroke-width', cdm ? '2' : '1');
      bg2.appendChild(bl);
      bezG.appendChild(bg2);
    }

    var nodesG = $('nodes');
    for (var n = 0; n < 3; n++) {
      var gn = document.createElementNS(NS, 'g');
      gn.setAttribute('transform', 'rotate(' + String(n * 120) + ' 100 100)');
      var fly = document.createElementNS(NS, 'g');
      fly.setAttribute('class', 'node-fly a');
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', '100'); c.setAttribute('cy', '48'); c.setAttribute('r', '3.4');
      c.setAttribute('class', 'node a');
      c.style.setProperty('--d', String(0.18 + n * 0.03));
      fly.appendChild(c);
      gn.appendChild(fly);
      nodesG.appendChild(gn);
    }

    var motesG = $('motes');
    for (var m = 0; m < 8; m++) {
      var gm = document.createElementNS(NS, 'g');
      gm.setAttribute('transform', 'rotate(' + String(m * 45 + 22) + ' 100 100)');
      var mc = document.createElementNS(NS, 'circle');
      mc.setAttribute('cx', '100'); mc.setAttribute('cy', '-12'); mc.setAttribute('r', '1.7');
      mc.setAttribute('class', 'mote a');
      mc.style.setProperty('--d', String(0.34 + m * 0.024));
      gm.appendChild(mc);
      motesG.appendChild(gm);
    }

    var railL = $('railL');
    var hd = document.createElement('div');
    hd.className = 'hd a';
    hd.style.setProperty('--d', '0.06');
    hd.textContent = 'SUBSYSTEM';
    railL.appendChild(hd);
    SUBS.forEach(function (s, k) {
      var d = document.createElement('div');
      d.className = 'rl a';
      d.style.setProperty('--d', String(0.32 + k * 0.048));
      var a = document.createElement('span');
      a.textContent = s[0];
      var b = document.createElement('b');
      b.textContent = s[1];
      d.appendChild(a); d.appendChild(b);
      railL.appendChild(d);
    });

    var railR = $('railR');
    var hd2 = document.createElement('div');
    hd2.className = 'hd a';
    hd2.style.setProperty('--d', '0.06');
    hd2.textContent = 'BUFFER';
    railR.appendChild(hd2);
    var mtr = document.createElement('div');
    mtr.className = 'mtr';
    railR.appendChild(mtr);
    for (var b2 = 0; b2 < 16; b2++) {
      var eb = document.createElement('i');
      eb.className = 'a';
      eb.style.width = String(24 + Math.round(rnd(b2 * 7 + 3, 11) * 62)) + '%';
      eb.style.setProperty('--d', String(0.32 + b2 * 0.021));
      mtr.appendChild(eb);
    }

    var logi = $('logi');
    PLUGINS.forEach(function (name, k) {
      var d = document.createElement('div');
      d.className = 'a';
      d.style.setProperty('--d', String(0.30 + k * 0.045));
      var lead = document.createElement('i');
      lead.textContent = '\u203A';
      d.appendChild(lead);
      d.appendChild(document.createTextNode(name));
      logi.appendChild(d);
    });

    // ---- text clock -------------------------------------------------------
    var st = $('st'), pc = $('pc'), hudTl = $('hudTl'), hudBl = $('hudBl');
    var lastPct = -1, lastSeg = -1;

    function text(p) {
      var pct = Math.round(Math.min(1, Math.max(0, (p - 0.30) / 0.40)) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        pc.textContent = String(pct).padStart(3, '0') + '%';
        hudBl.textContent = 'PLUGINS ' + String(Math.round(pct / 100 * PLUGINS.length)) + '/' + String(PLUGINS.length);
      }
      var si = 0;
      for (var k = 0; k < SEG.length; k++) { if (p >= SEG[k].p) si = k; }
      if (si !== lastSeg) {
        lastSeg = si;
        hudTl.textContent = 'DSH // ' + SEG[si].hud;
      }
      // Segment 0 is never scrambled: the first frame the user sees must be legible.
      var prog = si === 0 ? 1 : Math.min(1, Math.max(0, (p - SEG[si].p) / 0.035));
      var src = SEG[si].t, out = '';
      for (var q = 0; q < src.length; q++) {
        var ch = src[q];
        if (ch === ' ') { out += ' '; continue; }
        var local = (prog - (q / Math.max(1, src.length)) * 0.62) / 0.38;
        if (local >= 1) { out += ch; continue; }
        if (local <= 0) local = 0;
        var fr = Math.floor(local * 9), seed = si * 97 + q;
        out += (rnd(seed, fr) < local) ? ch : GLY[Math.floor(rnd(seed + 131, fr + 31) * GLY.length)];
      }
      if (st.textContent !== out) st.textContent = out;
    }

    // ---- 4. the readiness gate -------------------------------------------
    var t0 = performance.now();
    var offset = 0;        // time spent held, subtracted from the clock
    var heldAt = 0;
    var held = false;
    /**
     * A replay is already released: the app it covers is fully booted, so there
     * is no card to wait for and nothing to hold at the HOLD frame. `released`
     * also short-circuits the gate in the loop, which keeps the replay path free
     * of the timer machinery below.
     */
    var released = replaying;
    var sawCard = false;
    var finished = false;
    var forced = replaying;   // set by __dshBoot.ready()
    var seekT0 = 0;        // accumulated skip, in fractions of the timeline
    var skipUsed = false;
    var lastP = 0;
    var raf = 0;
    var watch = 0;
    var ceiling = 0;

    function isReady() {
      if (forced) return true;
      if (window.__DSH_BOOT_READY__ === true) return true;
      var el = document.querySelector('[data-dsh-boot]');
      if (el === null) return sawCard;   // seen, then gone => the app mounted
      // The card renders its own failure state by dropping the spinner; a broken
      // page must be readable rather than hidden behind a splash forever.
      return el.querySelector('[data-dsh-boot-spinner]') === null;
    }

    function release() {
      if (!held) return;
      held = false;
      offset += performance.now() - heldAt;
      sv('--ps', 'running');
    }

    var handle = {
      ready: function () { forced = true; release(); },
      skip: function () { skip(); },
      state: function () {
        return { progress: lastP, held: held, released: released, finished: finished, total: TOTAL, replay: replaying };
      },
    };

    function finish() {
      if (finished) return;
      finished = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      window.clearInterval(watch);
      window.clearTimeout(ceiling);
      window.clearTimeout(cleanup);
      detach();
      root.classList.remove(COVER_CLASS);
      if (host.parentNode !== null) host.parentNode.removeChild(host);
      if (current === handle) current = null;
      options.done();
    }

    // A slow app must never be hidden forever, and a fast one must never be cut off.
    if (!replaying) {
      watch = window.setInterval(function () {
        if (isReady()) { sawCard = true; release(); }
        else if (document.querySelector('[data-dsh-boot]') !== null) { sawCard = true; }
      }, 200);
      ceiling = window.setTimeout(function () { release(); }, MAX_MS);
    }
    /**
     * Safety net. The loop above is the normal teardown, but rAF is the first thing
     * a browser starves -- a backgrounded tab, a thrashing machine, or headless
     * virtual time all leave the loop unable to reach p >= 1 while the CSS clock
     * (compositor-driven) runs to the end. Timers keep firing in exactly those
     * cases, so this guarantees the host is removed instead of leaking a
     * full-screen overlay and a 200 ms poll for the rest of the session.
     *
     * Sized off TOTAL, not MAX_MS: if the gate never engages, the splash is over at
     * TOTAL and the net only needs to cover a stalled loop. It is pushed out to the
     * ceiling in the gate branch below, because a slow app is entitled to the wait.
     */
    var cleanup = window.setTimeout(function () { finish(); }, TOTAL + 1200);

    /* ------------------------------------------------------------------ skip --
     * Clicking anywhere (or Escape/Space/Enter) leaves for the main interface.
     *
     * It SEEKS rather than cuts: `--t0` advances every animation by the same
     * fraction -- it is subtracted inside .a's animation-delay -- and the JS clock
     * is re-anchored to match. So the user still gets the shockwave, the node
     * fly-out and the reveal, in about 0.6 s, instead of a hard cut to a bare app.
     *
     * On a replay this doubles as the escape hatch from a splash the user did not
     * ask for: one click, or any key, and it is gone.
     */
    function detach() {
      window.removeEventListener('pointerdown', onSkip, true);
      window.removeEventListener('keydown', onKey, true);
    }
    function onSkip() { skip(); }
    function onKey(ev) {
      if (ev.key === 'Escape' || ev.key === ' ' || ev.key === 'Enter') skip();
    }
    function skip() {
      if (finished || skipUsed) return;
      skipUsed = true;
      detach();
      var now = performance.now();
      var p = (now - t0 - offset - (held ? now - heldAt : 0)) / TOTAL;
      var delta = Math.max(0, SEEK - p);
      if (delta > 0) {
        seekT0 += delta;
        sv('--t0', String(seekT0));
        offset = now - t0 - SEEK * TOTAL;   // re-anchor: p becomes SEEK and runs on
      }
      held = false;
      released = true;
      sv('--ps', 'running');
    }
    window.addEventListener('pointerdown', onSkip, true);
    window.addEventListener('keydown', onKey, true);

    current = handle;

    function loop() {
      raf = 0;
      // The gate is evaluated on the raw clock and BEFORE the finish check. If a
      // single frame straddles both 0.76 and 1.0 -- a dropped frame, a backgrounded
      // tab, or a virtual-time jump -- then p is already >= 1 in the very frame the
      // gate fires, and finish() would tear the splash down while it is meant to be
      // waiting. `held` is therefore set first and short-circuits the finish below.
      if (!released) {
        var raw = (performance.now() - t0 - offset) / TOTAL;
        if (raw >= GATE) {
          if (isReady()) {
            released = true;
          } else {
            held = true;
            heldAt = performance.now();
            sv('--ps', 'paused');   // freeze on the HOLD frame
            window.clearTimeout(cleanup);
            cleanup = window.setTimeout(function () { release(); finish(); }, MAX_MS + 1500);
          }
        }
      }
      var now = performance.now();
      // While held the JS clock stops too, so the text cannot drift past the visuals.
      var p = (now - t0 - offset - (held ? now - heldAt : 0)) / TOTAL;
      lastP = p;
      if (p >= 1 && !held) {
        text(1);
        finish();
        return;
      }
      text(Math.min(p, 1));
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    stats.plays += 1;
  }

  // ---- 5. the replay -------------------------------------------------------
  var stats = { plays: 0, replays: 0, last: 'load', epoch: -1, hiddenFor: 0, hostOk: null, reason: null };
  var current = null;    // the play in flight, so the control surface can reach it
  var playing = false;   // one splash at a time, ever
  var armed = false;
  var seenEpoch = -1;    // -1 until the host has given us a baseline
  var hiddenAt = 0;      // the 'any' mode only

  /** Read the switches at trigger time, so the console can change them live. */
  function config() {
    var mode = store(REPLAY_KEY);
    if (mode !== 'window' && mode !== 'any' && mode !== 'off') {
      /**
       * Default: the precise rule. The crude one cannot tell a hidden window from
       * a covered one, and replaying on every alt-tab is worse than not replaying.
       */
      mode = 'window';
    }
    return { mode: mode, min: num(REPLAY_MIN_KEY, 0, 600000, REPLAY_MIN_DEFAULT) };
  }

  function startReplay(why, hiddenFor) {
    if (playing) return false;
    if (document.getElementById(HOST_ID) !== null) return false;
    playing = true;
    stats.replays += 1;
    stats.last = why;
    stats.hiddenFor = Math.round(hiddenFor) | 0;
    play({ replay: true, done: function () { playing = false; } });
    return true;
  }

  /**
   * Ask the host whether the window was really reopened.
   *
   * The answer arrives about one local request after the window is on screen,
   * which is why the cue is the event and not a poll. `epoch` counts transitions
   * out of a genuine hide or minimize, so a bump is the only thing that replays.
   */
  function ask(min) {
    var request;
    try {
      request = window.fetch(WINDOW_PATH + '?t=' + String(Date.now()), { cache: 'no-store' });
    } catch (error) {
      stats.hostOk = false;
      stats.reason = String((error && error.message) || error);
      return;
    }
    request.then(function (response) {
      if (response.ok !== true) throw new Error('HTTP ' + String(response.status));
      return response.json();
    }).then(function (data) {
      if (data === null || typeof data !== 'object' || data.ok !== true) {
        stats.hostOk = false;
        stats.reason = (data && data.reason) || 'host has no window watcher';
        return;
      }
      stats.hostOk = true;
      stats.reason = null;
      var epoch = typeof data.epoch === 'number' ? data.epoch : 0;
      if (seenEpoch < 0) { seenEpoch = epoch; stats.epoch = epoch; return; }   // baseline
      if (epoch === seenEpoch) return;
      seenEpoch = epoch;
      stats.epoch = epoch;
      // A missed transition must not replay seconds later: the heartbeat poll
      // exists to keep the baseline honest, not to ambush the user.
      var age = typeof data.at === 'number' ? Date.now() - data.at : 0;
      if (age > FRESH_MS) return;
      if (data.visible !== true) return;
      if ((data.hiddenFor | 0) < min) return;
      startReplay(String(data.kind || 'window'), data.hiddenFor);
    }).catch(function (error) {
      stats.hostOk = false;
      stats.reason = String((error && error.message) || error);
    });
  }

  function onVisibility() {
    var c = config();
    if (c.mode === 'off') return;
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (c.mode === 'any') {
      var away = hiddenAt === 0 ? 0 : Date.now() - hiddenAt;
      hiddenAt = 0;
      if (away >= c.min) startReplay('any', away);
      return;
    }
    ask(c.min);
  }

  /** Armed only once the first splash is over: the boot itself is not a replay. */
  function arm() {
    if (armed) return;
    armed = true;
    document.addEventListener('visibilitychange', onVisibility);
    window.setInterval(function () {
      if (playing || document.hidden) return;
      var c = config();
      if (c.mode !== 'window') return;
      ask(c.min);
    }, HEARTBEAT_MS);
    ask(config().min);   // baseline
  }

  /**
   * Control surface. `ready()` is the supported way for the shell or another
   * plugin to open the gate -- strictly better than the [data-dsh-boot] poll,
   * which can only infer readiness from the card disappearing. `replay()` exists
   * so the effect can be seen without closing the window.
   */
  window.__dshBoot = {
    ready: function () { if (current !== null) current.ready(); },
    skip: function () { if (current !== null) current.skip(); },
    replay: function () {
      var c = config();
      if (c.mode === 'off') return false;
      return startReplay('manual', 0);
    },
    state: function () {
      if (current === null) return { finished: true, plays: stats.plays };
      return current.state();
    },
    stats: function () {
      var out = {};
      for (var key in stats) { if (Object.prototype.hasOwnProperty.call(stats, key)) out[key] = stats[key]; }
      out.armed = armed;
      out.playing = playing;
      out.config = config();
      return out;
    },
  };

  playing = true;
  play({
    replay: false,
    done: function () {
      playing = false;
      arm();
    },
  });
})();

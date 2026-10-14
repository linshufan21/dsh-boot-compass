/**
 * Host half of dsh-boot-compass.
 *
 * WHY THIS EXISTS AT ALL
 * The splash's first frame cannot come from a client plugin. DSH draws its boot
 * card ("HARNESS / Loading plugins…") from the shell before any client plugin is
 * materialised, so a splash that only paints from its own JS always leaves that
 * card on screen for a few hundred milliseconds, at any z-index. The one surface
 * that exists earlier is the served document, and DSH exposes it through
 * `webserver/index-inject`: a table of rows rendered into index.html while <head>
 * is still parsing -- ahead of the shell kernel that builds the card.
 *
 * So the cover is pure CSS (`html.dshboot-on::before`), which needs no DOM and is
 * therefore on the glass as soon as the style row is parsed, and the full splash
 * is one synchronous `script` row that mounts it in a shadow root and retires the
 * cover on the same task.
 *
 * WHY THE ASSETS ARE CONCATENATED INTO ONE SCRIPT ROW
 * lib/boot.js reads window.__dshBootCss / __dshBootHtml as its first act, so they
 * have to exist before it evaluates. `{kind:'global'}` rows would express that
 * intent, but their placement relative to a script row is not something this
 * package can verify, and getting it wrong means a black screen. Assigning them
 * in the same row makes the ordering a property of the string, not of the carrier.
 *
 * No service is injected: `webserver/index-inject` is a plain composition event
 * emitted per index response, so this costs two rows and nothing when nobody asks.
 * A profile with no HTTP carrier simply never shows the splash.
 *
 * @module dsh-boot-compass
 */

import { readFileSync } from 'node:fs'

export const name = 'boot-compass'

/** lib/boot.js MODE_KEY -- keep in sync. */
const MODE_KEY = 'dsh-boot-compass:mode'
/** lib/boot.js COVER_CLASS -- keep in sync. */
const COVER_CLASS = 'dshboot-on'

/** Painted by the cover, and again by the shadow host, so the handoff is invisible. */
const DARK_BG = '#0A0B10'
const LIGHT_BG = '#F6F7FB'
const BRAND_DARK = '#4D6BFE'
const BRAND_LIGHT = '#2B3ED9'

/** Just below the shadow host (2147482001): the cover must never outrank the splash. */
const COVER_Z = 2147482000

/**
 * The cover: a background the moment the style row is parsed, plus the two tokens
 * the Desktop preload measures into `setTitleBarOverlay` -- without them the OS
 * caption strip stays Windows-grey above a near-black splash.
 *
 * Scoped to `html.dshboot-on`, so retiring the class restores whatever the app
 * wanted for those tokens. `prefers-color-scheme` is the only theme signal that
 * exists before the app has loaded any of its own CSS.
 */
const COVER_CSS =
  'html.' + COVER_CLASS + '{background:' + DARK_BG + ';' +
  '--dsw-specific-sidebar-fill:' + DARK_BG + ';--dsw-alias-label-primary:' + BRAND_DARK + '}' +
  'html.' + COVER_CLASS + '::before{content:"";position:fixed;inset:0;background:' + DARK_BG +
  ';z-index:' + String(COVER_Z) + ';pointer-events:none}' +
  '@media (prefers-color-scheme: light){' +
  'html.' + COVER_CLASS + '{background:' + LIGHT_BG + ';' +
  '--dsw-specific-sidebar-fill:' + LIGHT_BG + ';--dsw-alias-label-primary:' + BRAND_LIGHT + '}' +
  'html.' + COVER_CLASS + '::before{background:' + LIGHT_BG + '}}'

/**
 * JSON that is safe to embed in an inline <script>. The `</` escape is the one
 * that matters: neither asset contains it today, and this keeps it that way if
 * one ever does.
 */
function inline(value) {
  return JSON.stringify(value).replace(/<\//g, '<\\/')
}

/** Read once per process; null on failure so a bad install downgrades to a normal boot. */
let cached = null
let loadFailed = false

function assets() {
  if (cached !== null || loadFailed) return cached
  try {
    cached = {
      css: readFileSync(new URL('./boot.css', import.meta.url), 'utf8'),
      html: readFileSync(new URL('./boot.html', import.meta.url), 'utf8'),
      js: readFileSync(new URL('./boot.js', import.meta.url), 'utf8'),
    }
  } catch (error) {
    loadFailed = true
    console.error('[boot-compass] cannot read lib/boot.{css,html,js}; splash disabled', error)
  }
  return cached
}

/**
 * Contribute the splash to every index response.
 *
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    const found = assets()
    // Degrade to a plain DSH boot rather than serve a page whose script throws.
    if (found === null) return
    table.push({ kind: 'style', text: COVER_CSS })
    table.push({
      kind: 'script',
      placement: 'head',
      text:
        'window.__dshBootCss=' + inline(found.css) + ';' +
        'window.__dshBootHtml=' + inline(found.html) + ';' +
        found.js,
    })
  })
}

export const MODE = { key: MODE_KEY, off: 'off' }

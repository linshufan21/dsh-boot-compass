/**
 * What the Page Visibility API cannot tell us.
 *
 * A desktop window can be in four states, and the page sees only two of them:
 *
 *   | window state                | document.hidden | IsWindowVisible | IsIconic |
 *   | normal                      | false           |        1        |    0     |
 *   | hidden to the tray (hide()) | true            |        0        |    0     |
 *   | minimized                   | true            |        1        |    1     |
 *   | covered by another window   | true            |        1        |    0     |
 *
 * Measured on the shipped build (Electron 44.0.0 / Chromium 152, Windows): the
 * renderer flips to hidden 1 ms after hide(), 8 ms after minimize() and 23 ms
 * after being fully occluded, so a splash that replayed on "hidden -> visible"
 * would also fire every time the user alt-tabs back from a maximized window.
 * `IsWindowVisible` is the discriminator: FALSE only for a real hide.
 *
 * This module is deliberately paranoid. Every step -- locating koffi, binding
 * user32, finding the window -- can fail on a machine this package has never
 * seen, and the only acceptable failure mode is `{ ok: false }`: the splash
 * itself must never depend on any of it.
 *
 * @module dsh-boot-compass/window
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** How often the window state is sampled. A hide/reopen shorter than this is invisible to us. */
const POLL_MS = 250

/** The window class every Chromium top-level window uses, Electron's included. */
const CLASS_NAME = 'Chrome_WidgetWin_1'

/**
 * Every path that could hold koffi, most likely first.
 *
 * The runtime is launched as `<electron> --expose-internals <dsh-desktop-host>
 * <dshDir> <profileDir> ...`, so `process.argv[2]` is the dsh directory inside
 * app.asar and everything else is derived from it. The remaining shapes are a
 * safety net for a launch we have not seen, and a wrong guess costs one failed
 * require -- the candidates that carry no separator are left to Node.
 */
function koffiCandidates() {
  const roots = []
  const push = (value) => {
    if (typeof value === 'string' && value !== '' && !roots.includes(value)) roots.push(value)
  }
  push(process.argv[2])
  if (typeof process.resourcesPath === 'string') push(join(process.resourcesPath, 'app.asar', 'dsh'))
  if (typeof process.execPath === 'string') push(join(dirname(process.execPath), 'resources', 'app.asar', 'dsh'))

  const list = []
  for (const root of roots) {
    const host = join(root, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'node_modules')
    list.push(join(host, '@koromix', 'koffi-win32-x64', 'index.js'))
    list.push(join(host, 'koffi', 'index.js'))
    // A hoisted layout puts the same package one level up, and a future host may
    // carry the desktop host outside the dsh tree. Both are guesses, and a wrong
    // guess costs one failed require.
    list.push(join(root, 'node_modules', '@koromix', 'koffi-win32-x64', 'index.js'))
    list.push(join(root, 'node_modules', 'koffi', 'index.js'))
  }
  list.push('@koromix/koffi-win32-x64')
  list.push('koffi')
  return list
}

/** Load koffi, or null. Silent by design: a missing FFI is a supported state. */
function loadKoffi() {
  const require = createRequire(import.meta.url)
  for (const candidate of koffiCandidates()) {
    if (candidate.includes('\\') || candidate.includes('/')) {
      if (!existsSync(candidate)) continue
    }
    try {
      return { koffi: require(candidate), from: candidate }
    } catch (error) {
      /* try the next shape */
    }
  }
  return null
}

/** Bind the user32 entry points this module needs. Handles are uint64 throughout. */
function bindUser32(koffi) {
  const user32 = koffi.load('user32.dll')
  return {
    FindWindowExW: user32.func('uint64 FindWindowExW(uint64 parent, uint64 after, const char16_t *cls, const char16_t *title)'),
    GetWindowThreadProcessId: user32.func('uint32 GetWindowThreadProcessId(uint64 hwnd, _Out_ uint32 *pid)'),
    GetWindowRect: user32.func('bool GetWindowRect(uint64 hwnd, _Out_ int32_t *rect)'),
    IsWindow: user32.func('bool IsWindow(uint64 hwnd)'),
    IsWindowVisible: user32.func('bool IsWindowVisible(uint64 hwnd)'),
    IsIconic: user32.func('bool IsIconic(uint64 hwnd)'),
  }
}

/** A koffi uint64 handle arrives as a Number (or BigInt); 0 must stay falsy. */
function positive(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** koffi returns a real boolean for `bool`, but never depend on that. */
function flag(value) {
  return value === true || value === 1 || value === 1n
}

/**
 * Start watching the desktop window.
 *
 * @param options - `pid` overrides the owning process (used by tests), `onError`
 *   receives the reason a watcher could not be built.
 * @returns A watcher whose `read()` is always safe to call, or null when this
 *   platform cannot support one. `read().ok === false` carries the same meaning.
 */
export function startWindowWatch(options = {}) {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') return null

  const ownerPid = options.pid ?? process.ppid
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) return null

  const loaded = loadKoffi()
  if (loaded === null) {
    options.onError?.('koffi not found')
    return null
  }
  let api
  try {
    api = bindUser32(loaded.koffi)
  } catch (error) {
    options.onError?.(`user32 unavailable: ${String((error && error.message) || error)}`)
    return null
  }

  /** Every top-level window of the Chromium class owned by the shell process. */
  function candidates() {
    const found = []
    let after = 0
    for (let guard = 0; guard < 512; guard++) {
      const hwnd = positive(api.FindWindowExW(0, after, CLASS_NAME, null))
      if (hwnd === 0) break
      after = hwnd
      const pid = [0]
      api.GetWindowThreadProcessId(hwnd, pid)
      if (pid[0] !== ownerPid) continue
      const rect = [0, 0, 0, 0]
      const measured = flag(api.GetWindowRect(hwnd, rect))
      found.push({
        hwnd,
        visible: flag(api.IsWindowVisible(hwnd)),
        area: measured ? Math.abs(rect[2] - rect[0]) * Math.abs(rect[3] - rect[1]) : 0,
      })
    }
    return found
  }

  /**
   * The main window is the visible one with the largest area: the shell also
   * creates small hidden helpers in the same class, and a welcome window can
   * exist briefly at startup, so area is the tiebreak that survives both.
   */
  function locate() {
    const found = candidates()
    if (found.length === 0) return 0
    const shown = found.filter((c) => c.visible)
    const pool = shown.length > 0 ? shown : found
    return pool.reduce((best, c) => (c.area > best.area ? c : best), pool[0]).hwnd
  }

  let hwnd = 0
  let visible = false
  let iconic = false
  let away = null
  let awaySince = 0
  let awayReason = null
  let epoch = 0
  let kind = null
  let at = 0
  let hiddenFor = 0
  let failure = null

  /** One sample. A transition is only ever reported by a pair of samples. */
  function sample() {
    if (hwnd === 0 || !flag(api.IsWindow(hwnd))) {
      const found = locate()
      if (found === 0) {
        // The window may not exist yet -- the runtime boots before the shell
        // shows it -- or may already be gone. Report absent rather than guess.
        failure = 'window not found'
        return
      }
      if (found !== hwnd) {
        /*
         * A different window means a different history. The shell can destroy
         * and recreate its window, and the first locate() can land on a helper
         * or a welcome window that later closes, so the next sample must be a
         * baseline rather than a transition -- otherwise "the window appeared"
         * would be read as "the window was reopened" and replay a splash nobody
         * asked for.
         */
        away = null
        hwnd = found
      }
      failure = null
    }
    const nowVisible = flag(api.IsWindowVisible(hwnd))
    const nowIconic = flag(api.IsIconic(hwnd))
    const nowAway = !nowVisible || nowIconic
    if (away === null) {
      // The first sample is a baseline; it can never be a transition.
      away = nowAway
      if (nowAway) {
        awaySince = Date.now()
        awayReason = nowVisible ? 'restore' : 'show'
      }
    } else if (nowAway && !away) {
      awaySince = Date.now()
      awayReason = nowVisible ? 'restore' : 'show'
    } else if (!nowAway && away) {
      epoch += 1
      at = Date.now()
      hiddenFor = awaySince === 0 ? 0 : at - awaySince
      awaySince = 0
      kind = awayReason
    }
    visible = nowVisible
    iconic = nowIconic
    away = nowAway
  }

  sample()
  const timer = setInterval(() => {
    try {
      sample()
    } catch (error) {
      failure = String((error && error.message) || error)
      hwnd = 0
    }
  }, POLL_MS)
  if (typeof timer.unref === 'function') timer.unref()

  return {
    /** Sample now and report. Never throws, never stale. */
    read() {
      try {
        sample()
      } catch (error) {
        failure = String((error && error.message) || error)
        hwnd = 0
      }
      return {
        ok: failure === null,
        visible,
        iconic,
        epoch,
        kind,
        at,
        hiddenFor,
        ...(failure === null ? {} : { reason: failure }),
      }
    },
    /** Diagnostics for a console, never part of the route payload. */
    info() {
      return { ownerPid, hwnd, koffi: loaded.from, pollMs: POLL_MS }
    },
    dispose() {
      clearInterval(timer)
    },
  }
}

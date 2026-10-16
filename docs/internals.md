# 内部实现说明

面向要读代码的人。想快速了解这个插件做什么，看 [README](../README.md)。

---

## 它为什么必须是宿主侧插件

DSH 的加载卡（`HARNESS / Loading plugins…`）由 shell 在**任何客户端插件被实例化之前**
就画出来了。所以只从自己 JS 里画动画的插件，无论 z-index 多高，都必然让那张卡在屏幕上
停留几百毫秒。唯一比它更早的界面是**被服务的文档本身**，而 DSH 把它开放出来：
`webserver/index-inject` 收集一组 index 行，载体在 `<head>` 还在解析时就渲染进
index.html —— 早于构建那张卡的 shell 内核。

因此这里的两半是：

| 行 | 内容 | 作用 |
|---|---|---|
| `style` | 407 B | 纯 CSS 覆盖层 `html.dshboot-on::before` + 两个 Desktop 标题栏 token。**不需要 DOM**，所以样式行一被解析就在玻璃上 |
| `script` | ~78 KB | 把 `boot.css` / `boot.html` 赋成全局，随后挂载到 **shadow root**，并在同一个任务里撤掉覆盖层 |

资产是在**同一个 script 行**里拼接的，而不是用单独的行：`boot.js` 第一件事就是读那两个
全局，而 `{kind:'global'}` 行相对于 script 行的渲染位置无法在本包内验证，弄错就是黑屏。
拼在同一个字符串里，顺序就成了字符串的性质，而不是载体的性质。

**shadow root** 是让 `boot.css` 保持原生写法的原因：边界双向隔离，既不会漏进应用，
应用也够不到启动画面。所以那份 CSS 几乎是评审版原文。

---

## 安装

**桌面客户端独占管理 `desktop` profile** —— `dsh plugin` 内部就是
`profile.toLowerCase() === "desktop"` 直接拒绝（`@deepseek-ai/dsh/lib/bin.js`），
报的是 `profile "desktop" is managed exclusively by the Electron application`。
所以桌面壳只有两条路：**设置 → 插件**里装，或在该 profile 目录里手工 `pnpm add`。
npm 上有正式包（`dsh-boot-compass`），桌面上直接写包名即可；
非 desktop 的 profile 走 CLI：

```bash
dsh plugin --profile <name> add dsh-boot-compass
```

### 安装期有两道闸门（pnpm 11.7.0，本机逐条实测）

pnpm 的「新版本冷静期」`minimumReleaseAge` 会按住刚发布的版本，而**不带版本号**的安装会
静默落到旧版 —— exit 0、无告警。在自足目录里逐条量到的（pnpm 11.7.0，同一台机器）：

| 实验（目录里 `pnpm add dsh-boot-compass`） | 结果 |
|---|---|
| 干净目录、豁免表里没有这个包、也没显式配窗口 | `+ ^0.2.1`（直接拿最新 —— 窗口并不默认生效） |
| 显式 `minimumReleaseAge: 1440`、豁免表里没有这个包 | `ERR_PNPM_NO_MATURE_MATCHING_VERSION` —— **硬报错，不静默** |
| 豁免表首条是 `dsh-boot-compass@0.1.0`（本机原始状态） | `+ ^0.1.0` |
| 首条改成合并式 `@0.1.0 \|\| 0.1.1 \|\| 0.1.2` | `+ ^0.1.2` |
| 两条规则：`@0.1.2` 在前、`@0.2.0` 在后 | `+ ^0.1.2`（**后面那条被吃掉**） |
| 只写 `@0.2.0` | `+ ^0.2.0` |
| 首条 `@0.1.0` + `--config.minimum-release-age=6`（6 分钟窗口） | `+ ^0.2.0`（0.2.1 太新，退到 0.2.0） |
| 首条 `@0.1.0` + `--config.minimum-release-age=0` | `+ ^0.2.1`（**窗口整个关掉**；驼峰拼写 `minimumReleaseAge` 同样有效） |
| 写死版本 `add dsh-boot-compass@0.2.0` | `+ 0.2.0`，锁 0.2.0，且 pnpm 自动把该版本追加进豁免表 |

由此确定三件事：

1. **让这台机器静默降级的，是豁免表里这个包的那条规则，不是"默认就有 24 小时窗口"** ——
   这个包不在豁免表里时裸装直接拿最新；显式配了窗口而没有豁免时 pnpm 反而**硬报错**。
   窗口本身是 24 小时：profile 的 `.plugin-manager/logs/*/pnpm.log` 里 cutoff 正好是
   "当时 − 24h"，而 `pnpm config get minimumReleaseAge` 返回 `undefined`。
2. `minimumReleaseAgeExclude` 对同一个包名**只读第一条规则**（用户装的 `dshmarket` 把这条
   记成 issue #732，它的代码注释就写着 "pnpm honours only the FIRST per name"），
   所以同一个包的多行必须合并成一行。
3. 想立刻装新版有两条路：**把版本号写死**，或者用 dshmarket 更新路径的那条一次性开关
   `--config.minimum-release-age=0`（它的常量名就叫 `RELEASE_AGE_OVERRIDE`）。
   "等满 24 小时"同样有效 —— 版本成熟后窗口不再挡它。

## 开关与调节

宿主侧插件目前**没有设置界面**（见下方「还没做」），所以用这五个 localStorage 键：

| 键 | 值 | 说明 |
|---|---|---|
| `dsh-boot-compass:mode` | `off` | 完全不注入 —— 覆盖层和启动画面都不出现，直接进 DSH |
| `dsh-boot-compass:theme` | `light` / `dark` | 强制主题；不设则跟随 `prefers-color-scheme` |
| `dsh-boot-compass:total` | 毫秒，800–12000 | 覆盖全片时长；不设则用 `boot.css` 里的 `--total`（4500） |
| `dsh-boot-compass:replay` | `window` / `any` / `off` | 重播策略，默认 `window`（见「重播」） |
| `dsh-boot-compass:replaymin` | 毫秒，0–600000 | 窗口要离开多久才算「重新打开」，默认 600（见「重播」） |

在开发者工具控制台里：

```js
localStorage.setItem('dsh-boot-compass:mode','off')   // 关掉
localStorage.removeItem('dsh-boot-compass:mode')      // 打开
```

**总时长只有一个来源**：`lib/boot.css` 里的 `--total`。`boot.js` 从
`getComputedStyle(host)` 读它，不从常数读 —— 改一处即可，不会出现"改了 4500 但文件里
还是 3000"这种漂移。

## 跳过：点一下直接进主界面

**点屏幕任意处**（或 `Esc` / `空格` / `Enter`）立刻进入主界面。

它不是硬切，而是**把整条时间轴整体前推到 0.90（释放点）**：`--t0` 是 `.a` 的
`animation-delay` 里被减掉的那一项，所以给它加一个增量就等于把**所有**动画同时前推，
JS 时钟再重新锚定对齐。因此冲击波、节点外弹归位、轻推近、交接这几拍仍然会放完 ——
约 0.6 秒，看起来像一个有意的快退，而不是画面被掐掉。

点击监听挂在 `window` 的捕获阶段，而不是 host 上：host 是
`pointer-events:none`（它只是画面，不是 UI），所以监听 window 才既能接住点击，
又不会挡住应用。

### 给宿主/其它插件用的控制面

```js
window.__dshBoot.ready()    // 立即开闸。比轮询 [data-dsh-boot] 更准 —— 你直接说"我好了"
window.__dshBoot.skip()     // 程序化跳过，等价于用户点了一下
window.__dshBoot.replay()   // 立刻重播一遍（不受 replaymin 限制，受 replay='off' 限制）
window.__dshBoot.state()    // { progress, held, released, finished, total, replay }
window.__dshBoot.stats()    // { plays, replays, last, epoch, hiddenFor, hostOk, reason, armed, playing, config }
```

`ready()` 是推荐的接入方式：轮询只能从"那张卡消失了"**推断**就绪，而 `ready()` 是被告知。
`replay()` 是给调试用的：不必真的关窗再开，也能看到重播的画面。
`stats()` 是给"为什么没重播"用的：`hostOk`/`reason` 直接说明宿主那半边答了什么。

## 就绪 gate

播放 0 → 0.84 是**无条件**的。到 0.84 时：

* 已就绪 → 一路播到 1.00，然后交接。这是常态。
* 未就绪 → 在 HOLD 帧冻结（`--ps: paused` 写在 **host 的行内样式**上），
  等就绪信号后放行。
* 12000 ms 硬上限 → 无条件放行，慢应用不会被永久挡住。

就绪信号按优先级：`window.__DSH_BOOT_READY__ === true` →
`[data-dsh-boot]` 出现过又消失（应用已挂载）→
那张卡丢掉了 `[data-dsh-boot-spinner]`（卡自己进了失败态，页面必须可读）。

**gate 点是 0.84 而不是 0.94**：0.84–0.94（约 450 ms）里没有任何元素在动，
冻结它不会把任何一帧切在半途；真正的收尾动画（0.94–1.00 的轻推近 + 淡出）
必须等放行之后才开始，所以冻结点只能落在它之前。

## 重播：网页问不出来的问题，去问操作系统

点 X 是收进托盘。再从托盘打开时 `focusPrimaryWindow()` 只调用 `window.show()` /
`window.focus()`（`lib/main.js:12165`），**页面不重新加载**，所以开机动画本来只播一次。

重播的难点全在**判定**上。网页能看到的唯一信号是 Page Visibility，而它对两件完全不同的事
给出同一个答案（本机实测，Electron 44.0.0 / Chromium 152）：

| 窗口状态 | `document.hidden` | 翻转延迟 | `IsWindowVisible` | `IsIconic` |
|---|---|---|---|---|
| 正常 | false | — | 1 | 0 |
| `hide()`（托盘） | **true** | 1 ms | **0** | 0 |
| `minimize()` | **true** | 8 ms | 1 | **1** |
| 被另一个窗口完全盖住 | **true** | 23 ms | 1 | 0 |

也就是说，只听 `visibilitychange` 的插件会在**每次 alt-tab 切回来**时糊一脸动画。
`IsWindowVisible` 才是判别依据：只有真的被隐藏才是 0。被盖住这一列**一个字节都没变**。

所以判定被放到宿主侧：

* `lib/window.js` 用 **DSH 自己带的 koffi**（`@deepseek-ai/dsh-desktop-host` 的依赖，
  `@koromix/koffi-win32-x64`，v3.3.2）绑 `user32`，用 `FindWindowExW` 枚举
  `Chrome_WidgetWin_1` 顶层窗口，**只认 `pid === process.ppid`** 的那个 —— 这个类名
  是每个 Chromium 应用都在用的，不按 pid 过滤会抓到 QQ 和 Chrome。
  宿主进程正是 Electron 主进程的直接子进程（`argv` 里带着 `dsh-desktop-host/lib/index.js`），
  所以 `process.ppid` 就是拥有主窗口的那个进程。
* 250 ms 采样一次。`!visible || iconic` 为「离开」，离开→回来才算一次 transition，
  `epoch` 自增并记下 `kind`（`show` / `restore`）与 `hiddenFor`。
* 首次采样、以及**句柄更换后的首次采样只做基线**，绝不当作 transition：
  窗口可能被 shell 销毁重建，`locate()` 也可能第一次落在欢迎窗口上，
  否则"窗口出现了"会被读成"窗口被重新打开了"。
* 结果经 `webServer.register()` 挂成 `GET /__boot-compass/window`。
  桌面窗口的 `dsh-app://app` 协议把**所有非静态路径**转发给 Host
  （`lib/main.js:11542-11548`），所以页面 `fetch` 一个相对路径就能拿到，
  不需要 CORS，也不需要额外权限。

网页侧只把 `visibilitychange` 当作**叫醒信号**：窗口一出现就 `fetch` 一次，`epoch`
变大且时间戳新鲜（≤ 2500 ms）且 `hiddenFor ≥ replaymin` 才重播。答案在窗口出现后
约一个本地请求到达 —— 这是它不用轮询的原因。另有 10 s 心跳，只为把基线校准，
**不会**在几十秒后突然补播一次。

`lib/boot.js` 因此被重构成可重播的 `play({ replay, done })`：每次播放拥有自己的
shadow root、时钟、定时器和监听器，`finish()` 拆除自己的那一份并回调。
重播时 `released` 直接为 `true`（应用早就挂好了，没有卡要等，也就没有 HOLD），
并且**不碰 `html.dshboot-on`**：那层覆盖是为了首帧，重播时它只会让桌面壳白白重设一次
标题栏颜色。

整条链路都是可失败的：非 Windows、找不到 koffi、找不到窗口，一律退化成
`{ok:false}`，`replay` 默认策略下就不重播 —— 启动动画本身不受任何影响。

**门槛默认 600 ms，不是 1000。** 第一版按"1 秒"定，真机上第一次实测的
「收进托盘再打开」是 **1020 ms** —— 正好压在门槛上，也就是这个功能会在它本该服务的那个
动作上时灵时不灵。默认值因此降到 600：远高于手滑连点，也稳稳低于人的自然动作。
宿主 250 ms 采样本身就是下限，比 250 ms 更短的离开，host 看不见，`replaymin` 写多少都一样。

## 开发工具（不随包发布）

```bash
node tools/build-preview.mjs        # 调真实的 apply()，把产出的行写成 tools/preview.html
node tools/build-preview.mjs v2     # 同上去写成 tools/preview-v2.html（A/B 用）
node tools/diag.mjs                 # 同上，但把 DOM 状态打印进页面里
```

`build-preview.mjs` **不重新实现注入**：它 import `lib/index.js`，用一个假 ctx 跑
`apply()`，把拿到的行逐字写进页面，断言资产全局出现在 boot IIFE 之前，
并**真的调用一次窗口路由的 handler**、检查它答的是不是带 `.ok` 的 JSON。所以预览对了，
行就是对的 —— 从副本搭的预览可能在真正代码坏掉时依然通过。

预览页支持 `?delay=6000`（拖慢就绪以观察 gate）、`?theme=light`、`?mode=off`，
以及 `?replay=1`（把一个脚本化的宿主装进 `window.__MOCK`，
于是没有桌面壳也能把重播判定完整跑一遍）。

## 还没做

* **设置界面。** 本包只有宿主侧，没有 `dsh.client`。要做「通用设置」里的开关/主题/时长，
  需要按 `@deepseek-ai/dsh-client-ui-settings` 的 API 写客户端半边。在此之前开关只能靠
  上面的 localStorage 键。
* **主题在极早时刻只能靠猜。** `prefers-color-scheme` 是应用还没加载任何自己的 CSS 之前
  唯一存在的主题信号。如果 DSH 的主题被设成与系统不一致，启动画面可能是"错"的那一套
  配色，直到交接 —— 覆盖层底色是刻意选的中性近黑/近白，就是为了让这段偏差尽量不刺眼。
  真正的修法是读 DSH 持久化的主题键，但那需要先确认它的键名。
* **重播只在 Windows 上成立。** 判定依赖 `user32`。macOS 的窗口遮挡是 `NSWindow`
  概念，Linux 各家不同，本包都没有做 —— 那两个平台上 `replay` 等于 `off`。
* **koffi 的路径跟着 DSH 的安装布局走。** 不新增依赖（它本来就在 runtime 里），
  代价是路径写死在 `@deepseek-ai/dsh-desktop-host` 下面。DSH 换了布局就静默降级。

## 验证过的部分

| 项 | 怎么验的 | 结果 |
|---|---|---|
| `apply()` 产出的行与顺序 | `build-preview.mjs` 断言 | `style, script`；资产全局在 IIFE 之前 |
| 窗口路由 | `build-preview.mjs` 真的调一次 handler | 200 + `{"ok":…}` JSON |
| shadow 挂载与布局 | `diag.mjs` 打印真实 rect | host 1150×665，`#boot` `display:grid; z-index:4`，`svg.mark` 246×246 居中 |
| 覆盖层撤除 | diag 读 `classList` | `hasCoverClass :: false`，与挂载同一任务 |
| 首帧文字可读 | diag 读 `#st` | `"正在初始化内核"`（第 0 段不做解码） |
| CSS 是否真的作用到 shadow 树 | diag 打印样式表规则数 | 181 条规则 |
| **`--ps` 能否穿过 shadow 边界** | diag 就地设值后重读 `animationPlayState` | `running -> paused   PASS`，移回 `running` |
| 语法 | `node --check` 三个文件 | 退出码 0 |
| 画面真的在画 | 预览截图体积 | 启动画面 228 KB（有纹理）/ 交接后 18 KB（纯占位界面） |
| **gate 会冻结等慢应用** | `?delay=8000` 跑 3000 ms 后截图 | 228 KB —— 冻在 HOLD 帧 |
| **点击确实能直接进主界面** | 同上但 `&skip=600` | 14 KB —— 已退场，绕过了 gate |
| **user32 判别信号**（`_shoot` 外的隔离 Electron 探针） | 对自建窗口依次 `hide` / `show` / `minimize` / `restore` / 全屏覆盖 | `visible` 只在真隐藏时为 0；覆盖期间 `visible`/`iconic` 全部不变 |
| **监视器端到端**（同一探针里跑真的 `lib/window.js`） | 5 项断言 | hide→show 记 `show`（hiddenFor 1635）、minimize→restore 记 `restore`（1370）、**覆盖 0 次**、800 ms 短隐藏也抓到 |
| **重构没有动首屏** | 用 `git show HEAD:lib/boot.js` 出一份旧预览，两套各拍 9 帧冻帧 | 8/9 逐像素相同；剩下 1 帧的差异只在极光锥边缘（95% 的差异像素仅差 1） |
| ↑ 那一帧的归属 | `animdump.mjs` 对比两版动画表 | 106 条动画，**集合、顺序、delay、duration、iterations、冻结 currentTime 全部相同** —— 差异是光栅化，不是行为 |
| **重播与首播一致** | 同一会话内交替导航，同为 p=0.50 | **0 个像素不同**，动画表同样 106/106 全等 |
| **触发判定** | `replay-logic.mjs`，10 项 | 新鲜 epoch 才播；同 epoch（被盖住）不播；过期/过短不播；`ok:false` 记为不可用；`any` 与 `off` 各按定义 |
| 真机安装（走 registry） | `pnpm add dsh-boot-compass@0.2.0` 装进 desktop profile，核对包内文件与锁 | `package.json` `^0.2.0`；锁里的 integrity 与 registry 上 0.2.0 逐字相同；`lib/window.js` 在场（装 0.1.0 时它不存在） |

最后两行是 A/B：同一个"应用迟迟不就绪"的场景，不点就等，点一下就立刻交接。

## 许可

MIT

---

## 五阶段改版（2026-10-16）之后的复测

上面「验证过的部分」那张表里的数字属于 0.2.2 时代（三秒、七拍、gate 0.76、
106 条动画），是当时的事实，**保留不改**。五阶段改版后的复测记在这里：

| 项 | 怎么验的 | 结果 |
|---|---|---|
| 确定性 | `_shoot/shoot.mjs` 同一份代码拍两遍（1600×900，10 帧） | **10/10 逐位相同** |
| 重放判定 | `_shoot/replay-logic.mjs` | **11/11 通过** |
| 对比度（深浅两套主题） | `_tools/_contrast.py` 解析令牌并按 alpha 合成 | **全部达标**（浅色侧修了 6 处） |
| 3D 分层是否真的生效 | `_shoot/depth-probe.mjs` 读计算样式与 rect | 图层链 `preserve-3d` 完好；`#bg`/`.cross` 在相机推近（`.stack` +11.27%）时宽度变化 **0.00%** |
| 伪元素的 Z 是否参与投影 | `_shoot/depth-verify.mjs` 对照实验 | **不参与**：`translateZ` 改成 0 或 ±600 画面逐位相同；真实元素的 Z 正常（`.core` 给 Z=300 后 360→491 px） |
| 注入成本 | `build-preview.mjs` | `style` 407 B、`script` 80,084 B（0.2.2 基线 59,053 B） |
| 视觉抽查 | 全帧 + 定格帧人工看 | 定格帧同心、四角镜像、无残余动效；倾斜轨道收在画面内 |
| **减弱动效真的减了吗** | `_shoot/rm-check.mjs`：CDP `Emulation.setEmulatedMedia` 把 `prefers-reduced-motion` 真的切成 `reduce` | **原先没减** —— 114 条动画里 105 条照跑（原因见 `design-notes.md` §1.4：`.a{animation-name:none}` 被复合选择器压住、`#bg` 被 ID 规则压住）。修完：6 个进度上**零插值**、相机与远场压平、轨道保留各自倾角、时间轴仍收敛并交接 |
| 减弱动效修复没有伤到正常路径 | 改动前后各拍 10 帧 | **10/10 逐位相同** |
| **盘心漂移**（0.3.1 稳定性验收） | `_shoot/drift-check.mjs`：逐 2% 采样 51 点，冻结后读 `.core` 的 rect 中心，拿 `.railwrap` 当对照 | 0.3.0 横向 **5.86px** / 纵向 **6.98px** → 0.3.1 **0.00 / 0.00**；推近仍保留 1.125×；减弱动效 0.00 且无缩放 |
| **全元素侧移审计** | `_shoot/lateral-audit.mjs`：213 个元素 × 51 个采样点，同时记 rect 与各自的 transform 矩阵 | 往复且真平移（= 摇晃）**0 个**；10 个"往复"被证明是旋转方块的 AABB 伪影（自身平移 0px）；真有横向平移的 10 个**变向全为 0 次**（单向：1 个整屏扫描条 + 10px 侧栏入场滑入） |
| 相机参数化不改变行为 | 单旋钮 `--cam-k` 默认 1 时与写死的 7 个数值各拍 10 帧 | **10/10 逐位相同** |

脚手架都在工作区的 `_tools/` 与 `_shoot/`，不随包发布。

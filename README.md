# dsh-boot-compass

**开机那 4.5 秒，也值得设计一下。**

DSH 启动时会先画一张「HARNESS 正在加载插件…」的卡。这个插件在它出现之前就接住画面，
放一段五阶段的罗盘序列，播完再交给主界面。纯代码，零视频资源，零运行时依赖。

- 首帧是一条**纯 CSS 覆盖层** —— 样式行一被解析就已经在玻璃上，那张加载卡从头到尾没机会出现
- **关掉窗口再从托盘打开，动画会重播一遍**；alt-tab 切回来不会（Windows，见下）
- 点一下屏幕直接进主界面，仍然走完释放和交接（约 0.6 秒）
- 只动 `transform` / `opacity` / `filter`；系统开了「减弱动效」会自动降级

![稳定定格：交接前的完整启动界面](https://raw.githubusercontent.com/linshufan21/dsh-boot-compass/main/assets/screenshot-1.png)

> A full-screen boot splash for DSH: a CSS cover lands before the loading card is
> painted, a five-stage compass sequence plays, then the app fades up from inside it.

## 它是什么

一句话：**它不画 UI，它接管首帧。**

DSH 的启动链上有一段没人负责的时间：文档开始解析 → shell 起来 → 组合加载插件 → 主界面就绪。
那张「HARNESS 正在加载插件…」的卡，就是这段空窗里唯一的画面。这个插件把这段窗口接过来：

- 首帧是**纯 CSS 覆盖层**（`html.dshboot-on::before`）。它比任何客户端插件都早，
  因为它是**被服务的文档本身**的一部分；
- 之后整个启动画面挂在 **shadow root** 里，不碰 DSH 的 DOM，也不跟任何样式打架；
- 播完五阶段就把画面交出去 —— 主界面早就绪就立刻交接，没就绪就停在「静止」那一拍等。

```
服务 HTML ─► 解析 <head> ─► shell 启动 ─► 组合加载插件 ─► 主界面就绪
                 │                                          ▲
                 └── 本插件在这里就位（纯 CSS 覆盖层）────────┘
                     五阶段播放中；应用早就绪就立刻交接
```

它**不做**这些：没有设置界面、不注册客户端模块、不改主题、不装任何依赖、不读任何用户数据。
把它关掉，DSH 就是原本的样子。

实现细节（就绪 gate 为什么卡在 0.84、为什么资产要拼进同一个 script 行、
窗口状态为什么必须问操作系统）都在 [docs/internals.md](docs/internals.md)。

## 装

**桌面客户端** —— 侧栏 → **插件** → **添加插件**，这一行就行：

```
dsh-boot-compass
```

（`github:linshufan21/dsh-boot-compass` 也可以 —— 那条直接去 GitHub 取，不经过 registry。）

装完点**立即启用**，然后**完全退出客户端再打开**。
开机动画是在启动时注入页面的，刷新浏览器看不到。

**其它 profile** 用命令行（`desktop` 除外 —— 宿主 CLI 会直接拒绝它，原文是
`profile "desktop" is managed exclusively by the Electron application`）：

```bash
dsh plugin --profile <name> add dsh-boot-compass
```

这条路会顺带把这个组合包写进 profile 的 `dsh.profile.bundles`（也就是启用），
重启那个 profile 即可看到。

要求 DSH `>= 0.2.0-rc.1`。零运行时依赖，不依赖任何 `@deepseek-ai/*` 包。

## 首次（冷）启动，起步那一下可能顿一下

这是已知的：**客户端刚起来、第一次加载页面时，动画的头一两个节拍可能不跟手。**
问题出在「挂载」那一刻，不在动画本身。

- 挂载是**一个任务**里做完的：建 shadow root、注入 181 条 CSS 规则、构建罗盘 SVG、
  注册 106 条动画。而这时主线程正被 DSH 自己的启动工作占着（解析组合、加载插件）。
- **不是脚本体积的问题。** 注入的那一行 62,259 字节，本机实测（V8，3 次）冷解析
  **0.51–0.53 ms**、热解析 0.05 ms —— 看着大，编译是惰性的。文档因此大了约 62 KB（未压缩），
  那是几十毫秒量级的解析，不是体感的来源。
- 只影响**冷启动的起步**：动画只动 `transform` / `opacity` / `filter`，跑起来之后在合成器上；
  交接、跳过都不走这条路。重播（关窗再打开）时页面已经在跑、主线程是空的，
  实测与首播逐像素一致。

想让它更稳：把 `total` 调短、直接点一下跳过、或者干脆 `mode = 'off'` 关掉（见「五个开关」）。

## 五阶段

```
核心唤醒 ── 环形展开 ── 轨道汇聚 ── 能量同步 ── 稳定定格
```

一台罗盘从**绷紧**开始：指针被反向压住。

然后一段亮弧绕着盘面走完一周读刻度，像在扫什么。

接着指针被放开 —— 甩过正北、过冲、回摆、停住。
**停住那一下是故意的**：一直动的东西读起来是"还在忙"，停一下才像"到位了"。

最后一拍是**稳定定格**：整幅画面停住不动，等主界面接过去 —— 不再有从前的「冲击波把画面推出镜头」。
**停住是故意的**：一直动的东西读起来是「还在忙」，停下来才像「到位了」。

| 汇聚：轨道收拢、外层亮弧合圆 | 同步：指针解扣、整盘提亮 |
| --- | --- |
| ![汇聚拍](https://raw.githubusercontent.com/linshufan21/dsh-boot-compass/main/assets/screenshot-2.png) | ![同步拍](https://raw.githubusercontent.com/linshufan21/dsh-boot-compass/main/assets/screenshot-3.png) |

浅色主题下是同一套编排，只是底色换成 `#F6F7FB`（`assets/screenshot-4.png`，也在
`screenshots.json` 里）。五阶段十格分镜（下排是冻结点 / 交接 / 减弱动效 / 浅色，全部真实冻帧）：

![五阶段分镜](https://raw.githubusercontent.com/linshufan21/dsh-boot-compass/main/assets/storyboard.png)

<!-- 图片用绝对 raw 地址：npm 包只发 lib/README/配置，assets 不进包，相对路径在 npm 页面上会 404。改回来之前先想清楚这一点。 -->

## 嫌 4.5 秒长？

**点一下屏幕就直接进主界面**，仍然走完释放和交接，约 0.6 秒。
`Esc` / `空格` / `Enter` 也行。

它不是硬切，而是把整条时间轴整体前推到释放点，所以冲击波、节点飞出、穿镜头、交接
这四拍仍然会放完 —— 只是快。

还有一层保险：主界面如果迟迟没就绪，动画会停在「静止」那一拍等你，最多 12 秒。
那一下是挑过的 —— 那一刻画面上没有东西在飞。

## 再打开也播一遍

DSH 点 X 是收进托盘，再从托盘打开时页面并没有重新加载，所以开机动画本来只播一次。
0.2.0 起这件事变了：**真的重新打开窗口，就重播一遍**。

麻烦的是「真的」这两个字。网页能看到的信号只有一个：`document.hidden`。而它是**两件事**：

| 你做的事 | 网页看到 | 实际 |
| --- | --- | --- |
| 关掉窗口，再点托盘 | 隐藏了 | 窗口真的被隐藏 |
| 切到别的最大化窗口，再切回来 | 隐藏了 | 窗口只是被盖住 |

实测（Electron 44 / Chromium 152）：托盘关窗 1 ms 后网页就报隐藏，被别的窗口完全盖住
23 ms 后也报隐藏 —— 在网页这边，这两件事一模一样。所以只看这个信号的话，
你每次 alt-tab 回来都会被糊一脸动画。

于是插件走了一条更硬的路：宿主侧用 DSH 自带的 FFI 直接问 Windows
（`IsWindowVisible` / `IsIconic`），它分得很清楚 —— 真被隐藏时它返回 0，
只是被盖住时它一个字节都不变。网页把「重新打开」这件事交给它判定，
自己只负责在窗口重新出现时叫一声，所以延迟大约就是一个本地请求。

判定结果也让 alt-tab 之外的情况各归各位：**最小化再还原**同样算「重新打开」，会重播；
**被别的窗口盖住再切回来**不算。

门槛：窗口得真的离开 **0.6 秒**以上才重播。这个数字是量出来的 —— 真实的「收进托盘再打开」
是 1020 ms，所以默认值压在它下面，而不是正好压在它身上；否则这个功能会在它本该服务的
那个动作上时灵时不灵。（宿主每 250 ms 采样一次，比这更短的离开它本来也看不见。）

**Windows 专属。** 其它系统上问不到窗口状态，这个功能就静静地不生效 ——
启动动画本身一切照旧。

## 五个开关

都在 `localStorage` 里，改完刷新即可：

```js
localStorage.setItem('dsh-boot-compass:mode', 'off')       // 整个关掉，直接进 DSH
localStorage.setItem('dsh-boot-compass:theme', 'light')    // 强制浅色；默认跟随系统
localStorage.setItem('dsh-boot-compass:total', 2000)       // 全片时长，800–12000 毫秒
localStorage.setItem('dsh-boot-compass:replay', 'window')  // 重播策略：window（默认）/ any / off
localStorage.setItem('dsh-boot-compass:replaymin', 5000)   // 离开多久才算「重新打开」，默认 600
```

- `mode` 只认 `'off'`；设成别的值等于没设。
- `theme` 只认 `'light'` / `'dark'`，其它值回退到跟随系统。
- `total` 只认 `800`–`12000` 之间的数，**超出范围会被忽略**（退回默认 4500），不会报错。
- `replay` 只认 `'window'` / `'any'` / `'off'`：`'window'` 是默认的精确判定；
  `'any'` 退回纯网页规则（**被盖住也会重播**，非 Windows 上想要这个效果就用它）；
  `'off'` 只播开机那一次。
- `replaymin` 是重播门槛（毫秒），`0`–`600000`，默认 `600`。

想立刻看效果，不用反复关窗：控制台里 `__dshBoot.replay()` 直接播一遍。
`__dshBoot.stats()` 会告诉你一共播了几次、上一次因为什么、宿主那边答了什么。

宿主侧还开了一个只读路由，方便别的插件或脚本判断窗口状态：

```
GET /__boot-compass/window
→ {ok, visible, iconic, epoch, kind, at, hiddenFor}
```

`epoch` 只在「真的重新打开」时自增，所以它是判定重播的唯一依据。

## 减弱动效

系统开了「减弱动效」（`prefers-reduced-motion: reduce`）时会自动降级：
不保留任何位移和旋转，只留一次交叉淡入。
但进度指示仍然保留 —— 那是功能，不是装饰。

## 兼容性

| 项 | 要求 / 行为 |
| --- | --- |
| DSH | `>= 0.2.0-rc.1` 且 `< 0.3.0`（`dsh.engines.dsh`）；已实测 0.2.0-rc.1、0.2.0-rc.2、0.2.1-rc.1、0.2.1-rc.2 |
| 认不出的宿主 | 认不出启动卡时最多等 **2 秒**就照常播完并把界面交出来，不会挂到 12 秒 |
| 运行时依赖 | **零**；不依赖任何 `@deepseek-ai/*` 包 |
| 启动动画 | Windows / macOS / Linux 都有 |
| 重播 | **Windows 专属**；其它平台问不到窗口状态，这个功能静静不生效 |
| 减弱动效 | 自动降级为交叉淡入，进度指示保留 |
| 主题 | 跟随系统，可用 `theme` 强制 |

## 更新到新版本

- 客户端插件页里点「更新」即可，**不用卸载重装**。
- 但**发布 24 小时内**的版本会被 pnpm 的「新版本冷静期」按住：不带版本号的安装会
  **静默**装回旧版（exit 0、不报错，看起来就像"我明明装的是新版"）。这段时间两条路：
  等满 24 小时再更新，或者写死版本号安装：

  ```bash
  cd "$DSH_HOME/profiles/desktop"     # 桌面 profile 只能这样装：宿主 CLI 拒绝 --profile desktop
  pnpm add dsh-boot-compass@<version>
  ```

- 装完**完全退出客户端再打开**。注入行和资产是进程启动时读一次并缓存的，刷新页面不够。

## 关掉 / 卸载

临时关掉，用上面的 `mode = 'off'` 就行，插件还装着，随时改回来。

真不要了：

- **桌面客户端**：插件页里卸载
- **命令行**：`dsh plugin --profile <name> remove dsh-boot-compass`

## 想先看看？

双击 [`tools/preview.html`](tools/preview.html)。

单文件、零依赖，里面就是宿主侧真实注入的那两行，一个字没改。
点一下就能试跳过。加 `?replay=1` 还能用一个假的宿主把重播判定跑起来。

## 项目结构

```
dsh-boot-compass/
├── cordis.patch.yml       # 组合层：把宿主半边挂上去（纯 insert 行）
├── lib/
│   ├── index.js           # 宿主半边：登记注入行 + 注册 /__boot-compass/window
│   ├── boot.css           # 首帧覆盖层 + 全片样式（--total 是时长的唯一来源）
│   ├── boot.html          # shadow 树的结构
│   ├── boot.js            # 页面侧：挂载、五阶段时间轴、就绪 gate、重播判定
│   └── window.js          # 窗口状态读取（koffi → user32）
├── tools/
│   ├── build-preview.mjs  # 用假 ctx 跑一遍 apply()，产出单文件预览
│   ├── preview.html       # 生成物：真实注入的两行，可直接双击
│   └── diag.mjs / .html   # 在真壳里打印 rect、规则数、播放态
├── docs/internals.md      # 实现细节与全部测量记录
├── assets/                # 截图与分镜（screenshots.json 声明）
└── screenshots.json
```

改了 `lib/` 之后跑 `node tools/build-preview.mjs` 重建预览（生成物是提交进仓库的），
`node --check lib/*.js` 做语法检查。发布流程见仓库外的 `_market/`。

## 常见问题

**装完 / 更新完看不到变化？**
注入行与资产是**进程启动时读一次**并缓存的，刷新页面不够 —— 完全退出客户端
（点 X 只是收进托盘）再打开。

**重播没反应？**
依次看：是不是 Windows；离开时间有没有超过 `replaymin`（默认 600 ms，宿主每 250 ms 采样一次）；
是不是只是被别的窗口盖住（那不算「重新打开」，这是故意的，`replay = 'any'` 可改）；
`replay` 有没有被设成 `'off'`。控制台 `__dshBoot.stats()` 会直接告诉你上一次为什么没播。

**动画停在半路不动？**
那是就绪 gate：主界面还没就绪时会停在「稳定定格」那一阶段等，最多 12 秒。点一下屏幕就立刻走完。

**装了还是旧版？**
见「更新到新版本」—— 冷静期 + `^0.1.0` 这种 caret 够不到新 minor，都会让不带版本号的安装
静默装回旧版。

**非 Windows 会怎样？**
启动动画一切照旧，只是没有重播。

**能关掉吗？**
`localStorage['dsh-boot-compass:mode'] = 'off'`，见「五个开关」。

## License

MIT

# 设计进修笔记 · 启动动画相关

这份文件回答一个问题：**「这个动画为什么长这样」**，以及每个数字的出处。
它不是规范复述，而是「一手规范 → 可量化原则 → 落到本项目的具体取值」的对照表；
凡是本项目自己实测出来的结论，都标了 `实测`。

- 原始调研原件（未删改，供查证）：`docs/research/dark-glow.md`、`docs/research/composition.md`
- 实现细节（架构、时序表、注入机制）：`docs/internals.md`
- 测量脚手架在工作区（不进发布包）：`_tools/_contrast.py`、`_tools/_pick.py`、
  `_shoot/depth-probe.mjs`、`_shoot/depth-verify.mjs`、`_shoot/shoot.mjs`、
  `_tools/_framediff.py`

---

## 1. 动效时序与缓动

### 1.1 时长分级（一手数值）

| 级别 | 用途 | 时长 |
|---|---|---|
| M3 `short1–4` | 50 / 100 / 150 / 200 ms | 图标、ripple、状态切换（100–150） |
| M3 `medium1–4` | 250 / 300 / 350 / 400 ms | tooltip、小浮层（200–250）、卡片/面板展开（300–500） |
| M3 `long1–4` | 450 / 500 / 550 / 600 ms | 全屏转场（500–800） |
| M3 `extra-long1–4` | 700 / 800 / 900 / 1000 ms | 大范围编排 |
| Carbon | fast-01 70 / fast-02 110 / moderate-01 150 / moderate-02 240 / slow-01 400 / slow-02 700 | 距离与尺寸越大越长 |

- NN/g：多数 UI 动画落在 **100–500 ms**，越高频出现的动画应越短。
- **进入 vs 退出**：进入用 decelerate（先快后慢），退出用 accelerate（先慢后快），且
  **退出取进入的 70–85%** —— 用户已经决定离开，拖延只是阻塞。

### 1.2 缓动曲线（一手数值）

| 名称 | cubic-bezier | 用在哪 |
|---|---|---|
| M3 standard | `(0.2, 0, 0, 1)` | 通用 |
| M3 standard-decelerate | `(0, 0, 0, 1)` | 进入 |
| M3 standard-accelerate | `(0.3, 0, 1, 1)` | 退出 |
| **M3 emphasized-decelerate** | `(0.05, 0.7, 0.1, 1)` | 有存在感的进入 |
| **M3 emphasized-accelerate** | `(0.3, 0, 0.8, 0.15)` | 有存在感的退出 |
| M3 legacy | `(0.4, 0, 0.2, 1)` / 减 `(0,0,.2,1)` / 加 `(0.4,0,1,1)` | 旧版，已被上面取代 |
| 强 ease-out | `(0.23, 1, 0.32, 1)` | 位移进入 |
| 过冲（back-out） | `(0.34, 1.56, 0.64, 1)` | 回弹 |

两条硬规矩：**ease-out 用于进入，ease-in 用于退出**；线性只给旋转、循环、进度条。
「进入用 ease-in」在 UI 里基本等于 bug（慢启动 = 没响应）。

### 1.3 编排

- stagger 步长 **30–40 ms/项**；<20 ms 等于同时出现，>50 ms 显拖沓。
- 级联总量封顶 **≤300 ms**（约 8 项，超出部分与第 8 项同时入场）。
- 相邻元素运动区间应重叠 **30–50%**，让动作读成一条流而不是逐条排队。
- **每一拍只准一个焦点主体**：同拍内其它元素降幅（位移/缩放减半）。
- anticipation：动作前 2–3% 反向预备。

### 1.4 性能与无障碍

- 只有 `transform` / `opacity` 能纯合成；`filter`、`width/top/margin` 都会掉主线程。
- `will-change` 只在「即将运动」时加、结束即撤；**禁止 `* { will-change: transform }`**。
- 帧预算：60 Hz = 16.7 ms（应用约 10 ms）；合成阶段目标 4–5 ms。
- `prefers-reduced-motion` = **减运动，不是减反馈**：去掉位移/缩放/视差，保留
  150–200 ms 的透明度与颜色过渡。
- 闪烁：任意 1 秒内 ≤3 次，闪烁面积上限 341×256 CSS px。
- WCAG 2.2 SC 2.2.2：自动播放且持续 **>5 s** 的动效必须可暂停/停止/隐藏。

`实测`（`_shoot/rm-check.mjs`，用 CDP 把媒体特性真的切成 `reduce`）
本项目这条路径原本是**空转的**，两个具体原因：

1. **特异性陷阱**。降级块写的是 `.a{animation-name:none}`（0,1,0），而正常规则是
   `.wm-i.a{animation-name:wmIn}` 这类复合选择器（0,2,0）—— 前者**一条也压不住**。
   实测：减弱动效下 114 条动画里仍有 **105 条**在跑，画面与正常帧几乎一致
   （针照样甩、雷达照样转、微粒照样飞）。
   修法是改压**时长**而不是清名字：`.a{animation-duration:1ms}`。因为
   `animation-duration` 只在 `.a` 上声明过一次，没有任何逐元素规则跟它抢；
   配合 `.a` 自带的 `fill-mode:both`，每个元素在到点前停在 `from` 态、
   到点后**直接出现在终态** —— 零位移、零缩放、零旋转，却保住了分阶段揭示与交接时序。
   **不能**用 `animation-name:none` 一刀切：那会让元素停在 CSS 基础态
   （很多是 `opacity:0`），整个启动画面会变黑。
2. **ID 压类**。3D 那条是 `#bg{transform:translateZ(-160px) scale(1.145)}`，
   降级块写的却是 `.bg{transform:none}` —— ID（1,0,0）压过类（0,1,0），
   于是远场在减弱动效下**仍带着 −160 px / 1.145 的矩阵**，纵深根本没被压平。
   改成 `#bg` 即可（`.cross` 没有 id，本来就是好的）。

### 1.5 本项目与这些数字的关系（重要）

上面 1.1 / 1.3 的数字是给**交互式 UI 过渡**的。本项目是一次 **4.5 s 的叙事式启动序列**，
不是用户操作触发的转场，所以：

- 「单元素 250–400 ms」「级联总量 ≤300 ms」**不直接适用**；
- 真正适用的是「**每一拍的比例**」和「**每拍一个焦点**」。

`实测`（当前 4.5 s 时间线，单位 ms）：

| 项目 | 实测 | 说明 |
|---|---|---|
| 五拍窗口 | 0–630 / 630–1620 / 1620–2790 / 2790–3780 / 3780–4500 | 见 `internals.md` |
| 左侧栏行级联 | 162 ms/行 × 6 行 ≈ 810 ms | 刻意偏慢的「数据在刷」节奏 |
| 日志行级联 | 171 ms/行 × 5 行 ≈ 680 ms | 同上 |
| 节点/刻度/微粒 | 90 / 117 / 90 ms 步进 | 汇聚拍 |
| 骨架入场（字标/框线） | 450–630 ms | 属于「进入」但更长，因为要撑住 4.5 s |

**这些是观感旋钮，不是缺陷**；如果觉得左栏「刷得太慢」，把 162 ms 收到 ~110 ms 即可。

`实测` 曲线现状：`--e-enter` 目前是 legacy-decelerate `(0,0,.2,1)`，
`--e-exit` 是 legacy-accelerate `(.4,0,1,1)`。按 1.2 应该换成
emphasized 那一对 —— 这是一次全局观感变更，留作 A/B 让使用者拍板。

### 1.6 另一个来源：Motion.Lab（中文动效库）

[motionlab.uanx.online](https://motionlab.uanx.online/lab?cat=basic) 收录 160 个可直接复制的
前端动效（basic 42 / text / interaction / advanced），每个用一个 CSS 自定义属性暴露时长与
幅度并给出默认值与范围，另外打包了一份 SKILL.md 供 AI Agent 调用
（[源码仓库](https://github.com/yangxu128/Motion.Lab)）。

**能用上的三条：**

1. **缓动用法与本文 §1.2 完全一致** —— 进入 `ease-out`、循环 `ease-in-out`、
   spinner/marquee 用 `linear`、过冲用 `cubic-bezier(.34,1.56,.64,1)`（正是本文的 back-out）。
   算一次独立佐证。
2. **参数化纪律**：一个效果 = 一个带范围的旋钮（`--duration` / `--distance` / `--intensity`）。
   本项目据此把相机行程也收成单个变量，而不是散在 7 个关键帧里写死。
3. **它把 `shake` / `wobble` / `swing` 明确归入"表单错误提示 / 俏皮"这一类语义动效** ——
   这正好是 §6.5 那个坑的镜像：**横向往复振荡是有语义的**（报错、抢注意、卖萌），
   不能拿它当焦点元素的"环境生命力"。

**不能照搬的**：`zoom-bounce` 从 `scale(0)` 入场 —— 而 §1.3 的常见错误清单里
"`scale(0)` 入场"正是常见的一条（真实物体不会从无到有）；`pulse` 把 `ease-in-out` 用在
持续抢注意的循环上也值得怀疑。它是**效果目录**，不是动效理论的权威；
结论冲突时以 Material 3 / NN/g / WCAG 为准。

---

## 2. 暗色、辉光与对比度

### 2.1 阈值与「辉光会吃掉对比度」

- WCAG 2.2：SC 1.4.3 AA 正文 ≥4.5:1、大字号 ≥3:1；SC 1.4.6 AAA 正文 7:1；
  SC 1.4.11 有意义的图形/控件 ≥3:1。阈值不四舍五入（4.499 不合格）。
- `#FFF` on `#000` = 21:1，是**最大眩光**而不是最佳可读性：黑底白字会 halation
  （光晕扩散），散光用户看到笔画外溢发糊。
- `实测`（引一手结论）：30% 的白色光晕会把 `#05070D` 的底抬到 L\*31.9，
  正文对比从 16.7:1 掉到 **7.25:1**；50% 掉到 5.07:1。
  → **辉光只给装饰，正文/小字不给辉光。**

### 2.2 暗色「抬升」用亮度叠加，不用阴影

投影在深色底上不可见。Material 的 overlay 公式 `alpha = (4.5·ln(dp+1)+2)/100`，
1/2/3/4/6/8/12/16/24 dp → 5.1/6.9/8.2/9.2/10.8/11.9/13.5/14.8/16.5 %。
深空黑阶梯（ΔL\*≥3 才可辨）：`#05070D`(1.9) → `#0B0F18`(4.3) → `#131824`(8.3) → `#1B2230`(13.2)。
本项目只用到前三层，步进 ΔL\*≈3–6，符合。

### 2.3 辉光克制（经验区间，无文献硬标准）

- 半径 ≈ 元素短边的 1/4–1/2，且不超过元素尺寸；HUD 小元素 ≤12–16 px。
- 单层不透明度 ≤0.35，总叠加 ≤0.5。
- 数量：每屏 **≤1 个强辉光 + ≤3 个弱辉光**（Von Restorff 孤立效应）；
  发光体重叠会加法饱和成白团，主次一起丢。
- 去廉价霓虹：降饱和（混 15–25% 白/灰）、缩半径、只在关键点发光。

本项目预算写在 `lib/boot.css` 的 `:host` 里：文字 `≤18px/α.32`、
核心 `≤24px/α.45`、地平线亮边 `1px/α.42` —— 与上面区间一致。

### 2.4 本项目实测的对比度体检

脚手架 `_tools/_contrast.py` 直接解析 `lib/boot.css` 的令牌块（半透明先按 alpha
合成到背景再算），输出 `_tools/_contrast.txt`。**修前 / 修后**：

| 令牌 | 主题 | 修前 | 修后 | 阈值 |
|---|---|---|---|---|
| `--c-ui-dim` | light | 3.79:1 ✗ | **4.70:1** ✓ | 4.5（正文小字） |
| `--c-glacier` / `--c-lock` | light | 4.50:1 ✗ | **5.45:1** ✓ | 4.5 |
| `--c-line-hi` | light | 2.02:1 | **2.53:1** | 装饰下限 2.2 |
| `--c-rule` | light | 1.72:1 | **2.45:1** | 装饰下限 2.2 |
| `--c-tick` | light | 1.88:1 | **2.64:1** | 装饰下限 2.2 |
| `--c-rule` | dark | 1.90:1 | **2.19:1** | 装饰下限 2.2 |
| `--c-ui-fg` | dark | 16.06:1 | 16.06:1 ✓ | 4.5 |
| `--c-ui-dim` | dark | 5.98:1 | 5.98:1 ✓ | 4.5 |

判断依据：真正承载文字的令牌按 SC 1.4.3 的 4.5:1 卡；结构细线（框线/刻度/分隔线）
是装饰性的，SC 1.4.11 不覆盖它们，所以只卡「**淡到看不见**」的下限 2.2:1 ——
把发丝线强行抬到 3:1 会把界面做成线框画，那是另一种错。
浅色主题的问题是**真的看不见**（1.7–1.9:1），所以必须修。

---

## 3. 3D 纵深

### 3.1 透视数学

视点距 z=0 平面为 `P`（`perspective`），点 z=d 时屏幕缩放 **k = P/(P−d)**；
z 轴指向观察者，d≥P 的元素位于眼后、不渲染。想让远层回到原尺寸，
补 `scale(P/(P−|d|))`。视场角 ≈ `2·arctan(半宽/P)`：
`800px ≈ 61°`（广角夸张）、`1100px ≈ 45°`（UI 安全区）、`1600px ≈ 31°`（长焦扁平）。

本项目取 `P=1100px`，远场补偿按公式取整：

| 层 | Z | 补偿 scale | 理论 k | `实测` rect 变化 |
|---|---|---|---|---|
| `#bg` | −160 px | 1.145 | 0.873 | **0.00 %**（完全补偿，纯视差） |
| `.cross` | −80 px | 1.072 | 0.932 | **0.00 %** |
| `.stack`（相机） | −104 → +16 px | — | 0.914 → 1.015 | **+11.27 %** |

### 3.2 推拉与景深线索

- `translateZ` 改变相机-各层距离，各层位移不同 → 自动产生视差与透视变化；
  纯 `scale` 没有视差也不能当推拉用。
- 相机行程建议 ≤ 屏高的 3–5%（900 px → 27–45 px）；本项目 11.27% 的增长属于
  **电影式推近**，比 UI 转场大，但速率只有 0.024 viewport/s，不触发不适区间。
- 景深线索优先级：**遮挡 > 相对大小 > 运动视差 > 空气透视 > 焦点模糊**。
  空气透视最便宜：远层降亮降饱和。`实测`给 `#bg` 加
  `filter:brightness(.80) saturate(.70)`、`.cross` 加 `brightness(.92)`，
  画面 55% 的像素有变化、单通道最大 29 —— 远场确实退了一档。

### 3.3 `实测`：伪元素的 Z 会被整个丢弃（本轮最重要的发现）

用 `_shoot/depth-verify.mjs` 做对照实验（同一帧冻结，只注入一段 CSS，再逐位比对）：

| 变体 | 注入 | 结果 | 说明 |
|---|---|---|---|
| `ctrl_bg_off` | `#bg{transform:none}` | 大幅变化 | 注入能赢层叠 ✓ |
| `trackrot` | 关键帧只改旋转 | 有变化 | `@keyframes` 覆盖生效 ✓ |
| `trackxy` | 关键帧把 Z 换成屏幕位移 | 有变化 | 伪元素的 translate 生效 ✓ |
| `trackz0` | 轨道 `translateZ` 改成 0 | **逐位相同** | Z 无投影作用 |
| `trackz600` | 轨道 `translateZ` 改成 ±600 | **逐位相同** | Z 也不参与遮挡 |
| `cross_z400` | 非伪元素 `.cross` 给 Z=400 | 1600 → **2514 px** | 真实元素的 Z 生效 ✓ |
| `cross_z400_op` / `_mask` | 同上 + `opacity:.5` / `mask` | 仍是 2514 px | **不是** opacity/mask 的锅 |
| `core3d_orig` | 给 `.core` 补恒等 3D transform | 逐位相同 | 不是缺 transform |
| `nocam_orig` | 摘掉 `.stack` 相机动画 | 逐位相同 | 不是合成层边界 |
| `core_z300` | `.core` 给 Z=300 | 360 → **491 px** | 孙子层真实元素照样吃 Z |
| `radarwrap_z300` | `.radarwrap` 给 Z=300 | 360 → **491 px** | 曾孙层真实元素照样吃 Z |

结论：**Chromium 152 里，`::before/::after` 不参与父级的 3D 渲染上下文**，
它的 Z 分量被整体丢弃（旋转、X/Y 位移照常）。真实元素没有这个问题。

**由此抓到一个真 bug**：两条倾斜轨道因此是**共面**的，前后只能由 DOM 绘制顺序决定 ——
而 `::before` 画在 `.radarwrap` 子内容（表盘）**之下**、`::after` 画在其**之上**。
原实现把「近轨」放在 `::before`、「远轨」放在 `::after`，于是
**远轨压在表盘上、近轨藏在表盘后，前后关系整个反了**（截图看不出来）。
修法：`::before` 换成远轨（暗）、`::after` 换成近轨（亮），并把那条**写了但不生效**的
`translateZ()` 从关键帧里删掉，避免 CSS 继续骗人。

### 3.4 `preserve-3d` 的陷阱清单

- `overflow != visible`、`opacity < 1`、`filter`、`clip-path`、`mask`、
  `mix-blend-mode`、`contain: paint` 都会把元素「分组」，其 `transform-style`
  被强制退回 `flat`（只影响子孙，不影响它自己的 Z —— 对真实元素成立）。
- `transform-style` 不继承，必须逐层声明。
- `perspective` 必须放在 3D 子元素的**父级**。
- 交互与文字必须留在 z=0：跟透视漂移会让命中区错位、字形重采样发虚。
  本项目的 HUD / 侧栏 / 四角框线**故意留在平面**，就是这个理由。
- 层数：全屏 1600×900 每层纹理约 5.8 MB，控制在 8 层内。
- 不要动画 `perspective` 本身（每帧重算投影），固定透视 + 动相机层。

---

## 4. 构图、网格与排印

### 4.1 网格与比例（一手数值）

- 12 列 × 8 px 基线；1920×1080 下槽沟 24 px、列宽 ≈144 px、
  边距 48–64 px（2.5–3.3% 屏宽）；EBU R95 安全区 5%。
- 间距用 4/8 px 基数 + 1.25 比例阶梯；字号阶梯 11/14/18/22/28/36/64/100。
- 组间空白 ≈ 组内空白的 3 倍。

### 4.2 层级

- 对比手段的优先级：**明度 > 尺寸 > 运动 > 色彩 > 位置 > 字重**
  （深空黑底上，明度是唯一不被色觉缺陷抹掉的通道）。
- 硬约束：字号 ≤3–4 档；「最大元素」≤2 个；主色 ≤2 + 辅色 ≤2；对比档 ≤3；
  前景墨迹 ≤25% 屏面。

### 4.3 光学与数据图形

- 圆/三角比同尺寸方形要**放大 2–5%** 才显得一样大；圆内文字按「墨迹」而不是视框居中。
- 发丝线用低透明度替代 1px 实灰。
- 数据图形必须有 **0 基线**并锁定振幅量程；条宽:间距 = 1:1–1:2（2–3 px 条）；
  删掉不承载信息的刻度/网格。

### 4.4 定格帧的验收条件

同心 <2%、四角镜像、基线共线、无残余动效、中心主体 ≥35% 屏宽、静置 ≥300 ms。

### 4.5 本项目自查

| 项 | 现状 | 判定 |
|---|---|---|
| 数字用等宽/表格数字 | `.pc{font-variant-numeric:tabular-nums}`，其余数字走 `--mono` | ✓ |
| 全大写小标签字距 | `.rail .r` .05em、`.hud` .13em、`.rail .hd` .2em | 前两个在 5–12% 区间 ✓；`.rail .hd` 的 .2em 偏宽，是刻意的 HUD 风格 |
| 字标字距 | `.wm-i` .40em | 品牌字标，属于刻意的排印风格，不按正文标准衡量 |
| 右栏数据图形 | 以中线为零线、上下对称发散的波形 | ✓ 收敛到 0 基线；条 2.5 px、间距 ≥7 px → 1:2.8，略稀 |
| 定格静置 | gate 落在 0.84，之后 720 ms 全体冻结（`实测`两次采集逐位相同） | ✓ 远超 300 ms |
| 边距 / 中央模块占比 | 见 `docs/internals.md` 的构图参数 | 待与 4.1 逐条核对 |

---

## 5. 本轮据此改了什么

1. `lib/boot.css` 浅色主题 6 处对比度不达标 → 全部修到阈值以上（见 2.4 表）。
2. 深色 `--c-rule` alpha .38 → .44，越过「淡到看不见」的下限。
3. 倾斜轨道前后关系反转的真 bug → 交换 `::before/::after` 的角色（见 3.3）。
4. 删掉轨道关键帧里**不生效**的 `translateZ()`，并把实测结论写成注释。
5. 远场加空气透视：`#bg{filter:brightness(.80) saturate(.70)}`、`.cross{brightness(.92)}`。
6. 减弱动效下两条轨道保留各自倾角（原本被压成同一条）。
7. 缓动升级：`--e-enter` 由 legacy-decelerate `(0,0,.2,1)` 换成**强 ease-out**
   `(.23,1,.32,1)`（起步更利落、到位更干脆）；`--e-exit` 由 `(.4,0,1,1)` 换成
   M3 **standard-accelerate** `(.3,0,1,1)`。
   **刻意没采用 M3 emphasized 那一对**：它在 5% 处就跑到 0.7，用在 4.5 s 的相机推拉
   或字标升起上会"一上来就撞到位"，那是给大范围空间转场用的。
8. 左栏级联收紧：行 162 → **117 ms/行**、日志行 171 → **126 ms/行**
   （改的是 `lib/boot.js` 里的内联 `--d`，不是 CSS），整段级联由 810/684 ms
   收到 **585/504 ms**，减少与 S2 环形展开抢焦点。
9. 雷达扫描峰值 alpha 收档：`.radar` .66 → **.46**、`.radar.r2` .34 → **.26**。
10. **修掉「减弱动效」这条路径的空转**（见 §1.4 实测）：加
    `.a{animation-duration:1ms}`，并把降级里的 `.bg{transform:none}` 改成
    `#bg{transform:none}`（ID 压类）。修完实测：6 个进度上**没有任何动画在插值**
    （105 条全部时长 ≤1 ms）、相机与远场全部压平、两条轨道保留各自倾角、
    时间轴仍然收敛到 `finished` 并交接；定格帧是一张信息完整的静止启动界面。

**正常路径不受影响**：这一改只落在媒体查询里，改前改后各拍 10 帧**逐位相同**。

每一条都重新过了一遍验证：`10/10` 帧两次采集逐位相同、重放逻辑 `11/11` 通过、
对比度体检（深浅两个主题）`全部达标`、减弱动效 `全部通过`。

---

## 6. 还没做 / 留给使用者拍板的旋钮

- **缓动曲线换不换**：`--e-enter/--e-exit` 目前是 legacy 一対，按 §1.2 应换成
  emphasized；这是全局观感变更，建议 A/B 后再定。
- **左栏级联 162 ms/行 → 110 ms/行**：收紧后「数据在刷」的节奏更利落。
- **倾斜轨道的倾角/亮度**：现在 68°、α.55/.40。
  ⚠ 更正：调研建议的「1.35× / 72° / α.28·.18」**不适用于本项目** ——
  那一组数字是给「环境式视差背景层」的；这里的两条轨道是**构图主体之一**，
  按提案收紧会直接把它做没。`实测`看了全帧：1.9× 的椭圆收在画面内、
  读起来就是绕表盘的轨道环，**尺寸不动**。倾角与亮度仍可微调。
- **雷达扫描锥的体量**：`.radar` 主扫描峰值 α 已由 .66 收到 .46（副扫描 .34→.26）。
  注意：**它那条直边是"前沿"，不是缺陷** —— 雷达扫描本来就该是「前沿硬、尾巴拖」
  （conic 从 0° 透明升到 360° 峰值）。所以别去把这条边磨圆。
  静止帧里它仍是最接近能量核心体量的一块；如果嫌重，该动的是**夹角宽度与半径带**
  （现在 mask 是 30%–58% 的环带），不是 alpha。
- **相机行程**：现在 −104 → +16 px（11.27%）；调研给 UI 的区间是屏高 3–5%（27–45 px）。
- **`perspective-origin`**：现在 `50% 44%`；调研建议全屏 HUD 用 50%，
  避免四角框线左右不等宽。
- **`will-change` 的四处全屏层**：`#veil`、`.aur`、`.radar` 等是长期提升，
  与「用完即撤」的建议相左；要不要改成按需开关，需要先测帧成本。
- **注释搬家**：脚本行已到 79,102 B（0.2.2 基线 59,053 B）。把 CSS 里那些长段
  「为什么」搬进本文件、只留一行指引，可省约 4–5 KB。

---

## 6.5 「稳定版」的验收：盘心不许漂（0.3.1）

使用者原话是「中心时钟会左右摇晃，这个版本我不喜欢」。根因是我自己在 v6 相机关键帧里
塞了"手持感"：

```
36% {transform:translate3d(-6px, 3px,-26px)}
62% {transform:translate3d( 5px,-3px, 18px)}
```

即 1.6 s → 2.8 s 之间整个 `.stack` 左右各偏一次。**HUD 与侧栏是静止的**，所以这点位移
读起来不是"镜头在动"，而是被摄主体（表盘）自己在摇 —— 这是设计失误，不是渲染问题。

量化工具 `_shoot/drift-check.mjs`：逐 2% 采样 51 点，冻结后读 `.core` 的 rect 中心，
报最大 |Δx| / |Δy| 与"盘心直径"的缩放比，并拿 `.railwrap` 当对照（它必须一动不动）。
两个坑：p=1.00 时启动画面已卸载（rect 全 0），这种退化点必须剔除，否则统计被带歪；
判据必须写成"≤1px"这样的数，否则"稳不稳"只能靠吵。

| | 横向 max\|Δx\| | 纵向 max\|Δy\| | 缩放 | HUD 对照 |
|---|---|---|---|---|
| 0.3.0 | **5.86 px** | **6.98 px** | 1.125× | 0.00 px |
| 0.3.1 | **0.00 px** | **0.00 px** | 1.125× | 0.00 px |

两条各一行的修改，推近效果一点没丢：

1. `@keyframes v6cam` 去掉全部 X/Y 分量 → **相机只允许动 Z**。
   规则：相机层上的任何 X/Y 都会原样变成被摄主体的位移。
2. `perspective-origin` 44% → **39.76%**：推拉必须绕**盘心**同心缩放，否则缩放本身就会
   把盘心推着走。39.76% 是实测的盘心布局位置（357.84 px / 900）。这个真值是被"减弱动效"
   那一路暴露出来的 —— 那条路径没有任何变换，量到的就是布局真值；而 p=0 时相机在
   Z=−104（k=0.9136），量到 358.03，反解回去正好也是 357.84，两路互证。

**方法论**：这类 bug 单帧截图抓不到（每帧都是静态的），只有把关键元素的屏幕坐标
逐点打出来才看得见形状（是缓慢正弦还是单次偏移）。

### S2 全元素侧移审计（`_shoot/lateral-audit.mjs`）

盘心归零不等于"画面就稳了"。再扫一遍所有可见元素：51 个采样点 × 213 个元素，
每个元素同时记 rect 与**它自己的 transform 矩阵**，两条判据并用：

- **往复**（左边缘偏移的符号翻转 ≥2 次）才算"摇晃"；单向滑入/汇聚不算。
- **自身平移分量**（矩阵里的 tx）必须同时在变，否则是伪影：一个**旋转的方块**，
  它的 AABB 会周期性变宽变窄（左边缘来回动），但自己的 transform 里平移分量恒定。

| 判据 | 数量 |
|---|---|
| 元素总数 | 213 |
| **往复且真平移（= 摇晃）** | **0** |
| 往复但自身不平移（旋转/缩放伪影） | 10（AABB 幅度最大 120px / 自身平移 **0px**） |
| 自身有横向平移 | 10 —— **全部变向 0 次（纯单向）** |

那 10 个单向平移逐个都说得清：`div.sweep` 2640px 是整屏扫描条（它的工作就是横扫一次）、
`div.hd` ×2 与 `div.rl` ×8 是侧栏标题与行的 **10px 入场滑入**。
**除相机之外，画面里没有任何元素在做往复式横向位移。**

两个度量陷阱记在这里，免得下次重犯：

1. **不能用选择器当 key**。`i` / `b` / `g` / `span` 各匹配几十个元素，归并后会把不同元素
   混成一条时间序列，算出 800px 这种荒唐位移 —— 第一版就是这么错的。
   必须用**元素身份**（首次出现时发号）来归并。
2. **伪元素没有 rect**，量不到；它们的位移只能靠父元素与关键帧代码判断。

---

## 7. 出处

- [Material 3 · Easing and duration tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)（JS 渲染站点，数值取自官方 token 库）
- [Flutter `motion.dart`（由 M3 token 生成）](https://raw.githubusercontent.com/flutter/flutter/master/packages/flutter/lib/src/material/motion.dart)
- [Material Web · `_md-sys-motion.scss`](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-sys-motion.scss)
- [NN/g · Animation duration](https://www.nngroup.com/articles/animation-duration/)｜[Visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/)｜[Parallax usability](https://www.nngroup.com/articles/parallax-usability/)
- [web.dev · Compositor-only properties](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)｜[RAIL](https://web.dev/articles/rail)
- [CSS Transforms 2](https://drafts.csswg.org/css-transforms-2/#perspective-property)｜[MDN `perspective`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/perspective)｜[`transform-style`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style)｜[`will-change`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/will-change)
- [WCAG 2.2 · 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)｜[1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)｜[2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)｜[2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)｜[C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)
- [Apple HIG · Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)｜[Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Material Android · ElevationOverlayProvider](https://github.com/material-components/material-components-android/blob/master/lib/java/com/google/android/material/elevation/ElevationOverlayProvider.java)
- [IBM Carbon · colors tokens](https://github.com/carbon-design-system/carbon/blob/main/packages/colors/tokens/colors.tokens.json)
- [EBU R95 安全区](https://tech.ebu.ch/docs/r/r95.pdf)｜[easings.net](https://easings.net/)｜[CSS `linear()` 弹簧](https://developer.chrome.com/docs/css-ui/css-linear-easing-function)

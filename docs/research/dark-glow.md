# 深空 HUD 暗色＋辉光 设计笔记（可落地 CSS）

## 1. 暗底正文/小字：阈值与 halation
- WCAG 2.2：SC 1.4.3（AA）正文 ≥4.5:1、大字号（≥18pt／粗体 ≥14pt，≈24px／18.7px）≥3:1；SC 1.4.6（AAA）正文 7:1、大字号 4.5:1；SC 1.4.11 控件/图形/焦点 ≥3:1。阈值不四舍五入（4.499 不合格）。
- 纯白 #FFF on #000 = 21:1 → 最大对比＝最大眩光；`#000` 上白字因光晕扩散（halation）在散光用户眼中笔画外溢模糊。Apple HIG 明确要求"白底要压暗，避免在暗色环境中发光"。
- 推荐：正文 `#E6EAF2`（#05070D 上 16.7:1，最亮面 #1B2230 上仍 13.2:1）；次级 `#A7B0C0`（9.2/7.3:1）；最弱 `#8B96A8`（6.7:1，但在 #131824 上仅 5.9:1，勿更暗）。
- 小字补偿：优先加字重而非加对比。11–13px 用 400→500（+100，M3 label-small = 11px/500/行高 16px）；WCAG 提示细体实际渲染会比 CSS 色更淡，应选更粗字面或超出阈值配色。
- 关键量化：辉光会抬高局部底色。30% 白光晕把 #05070D 抬到 L\*31.9，正文对比从 16.7 掉到 **7.25:1**；50% 掉到 5.07:1。→ 辉光只给装饰元素，正文 + 小字禁止辉光。

## 2. 暗色"抬升"：亮度叠加，不用阴影
- Apple HIG：暗色用 base（更暗，后退）与 elevated（更亮，前进）两套背景表达层级；投影在暗底不可见（等于脏灰）。
- Material（ElevationOverlayProvider）overlay 透明度公式：`alpha = (4.5·ln(elevationDp+1)+2)/100`，另加 2% accent 着色。取值：1dp 5.1%、2dp 6.9%、3dp 8.2%、4dp 9.2%、6dp 10.8%、8dp 11.9%、12dp 13.5%、16dp 14.8%、24dp 16.5%。
- 深空黑阶梯（L\* 差 3–5 才可辨，本稿实测）：`#05070D`(L\*1.9) → `#0B0F18`(4.3) → `#131824`(8.3) → `#1B2230`(13.2) → `#232C3C`(17.9)。HUD 只用 3 层，步进 ΔL\*≈4–5。
- 需要 3:1 的分隔线/控件边框：≥ `#5F6D8B`（#131824 上 3.42:1）；更弱的装饰描边可降到 1.5–2:1（非承载信息）。

## 3. 辉光克制（含经验值，非硬标准）
- 原理（Bloom）：亮度阈值提取 → 高斯模糊 → **加法混合**。多个发光体重叠时加法饱和成白团，主次信息一起丢。
- 半径：CSS blur radius 的定义即"从完整色到全透明的过渡带长度"（MDN）→ 半径≈可见光晕宽度。经验值：半径 ≈ 元素短边的 1/4–1/2，且不超过元素自身尺寸；HUD 小元素 ≤12–16px 半径。
- 不透明度：单层 ≤0.35、总叠加 ≤0.5（经验值）。>0.3 的白光晕已能把 12px 字吞掉（第 1 节实测）。
- 数量：Von Restorff（孤立效应）"强调要克制，避免显著元素互抢"。实操建议：每屏 ≤1 个强辉光（大 σ）＋ ≤3 个弱辉光，其余靠亮度/字重分层。
- 去廉价霓虹感：饱和度过高（HSL S>85%）、纯 #00FFFF/#FF00FF、半径大于元素、多层异色叠光、全屏发光。做法：降饱和（混 15–25% 白/灰）、缩半径、只在关键点发光（指针、当前值、扫描线端点）。
- 动效安全：WCAG 2.3.1 每秒闪烁 ≤3 次，或闪烁面积 <0.006 sr（≈341×256 CSS px 的 10° 视场）。脉冲周期 ≥1.5s、透明度振幅 ≤15%。

## 4. 颜色选择
- 暗底强调色：HSL 大致 S 60–80%、L 55–75%（相对亮度别贴白）。`#4DA3FF` 在 #05070D 上 7.67:1；`#7FE3F0` 13.6:1（偏亮，宜做文字/描边，做填充面要压暗到 `#3DF0E0` 级）。
- 蓝青同用：色相差 ≥25–35°（蓝 ≈212°，青 ≈175°），并错开明度（蓝 L 60%／青 L 75%），避免同明度相邻 → 糊成一片；青只做点缀（≤10% 面积）。
- 灰阶：纯中性灰适合中性/数据密集场景（Carbon gray `#161616/#262626/#393939/#525252`）；冷灰（Carbon coolGray `#121619/#21272A/#343A3F/#4D5358`）与深空蓝底同色温、无跳色，本方案用冷灰。Carbon 同时发行 gray / coolGray / warmGray 三套并列 token，是"按场景选灰"的范例。

## 5. 浅色主题一致性
- 同名强调色在浅底失效：`#4DA3FF` on #F7F9FC 仅 2.49:1，`#7FE3F0` 1.41:1 → 必须降明度、提饱和：`#0B63CE` 5.4:1、`#0A57B8` 6.5:1、青 `#0E6E7A` 5.6:1（浅底强调色 L≈35–45%，文本 ≥4.5:1，图形 ≥3:1）。
- token 三层：raw（`--blue-400:#4DA3FF`）→ semantic（`--accent-primary`）→ theme binding（`[data-theme=light]` 重绑 semantic）。组件只消费语义 token，禁止写死 hex；与 Apple HIG"避免硬编码颜色，用能自适应外观的颜色"一致。

## 6. HUD 小字/大字距
- 字距：Carbon label-01 = 12px / ls 0.32px(0.027em)，label-02 = 14px / 0.16px；M3 label-small = 11px / tracking 0.5px(0.045em) / weight 500。全大写再加 0.04–0.06em：**11–12px 全大写用 0.08–0.12em**（WCAG 1.4.12 规定 0.12em 字距下内容不得丢失，可视为上限参照）。
- 全大写标签最小 11px（11px 以下在暗底＋辉光下不可靠），且目标对比 ≥7:1 而非 4.5:1（全大写失去 x-height 优势）。装饰性读数大字（≥24px）可到 3:1，但信息性文字仍建议 ≥4.5:1。
- 数字/坐标用等宽或 `font-variant-numeric: tabular-nums` 防跳动；行高 1.25–1.35（Carbon 小字 1.33）。

## 7. 十个最容易做丑/做糊的错误
1. `#000` 底 + `#FFF` 字满对比（halation、散光用户看不清）。
2. 用黑色 `box-shadow` 表达层级（暗底不可见，只留脏灰边）。
3. overlay 步进 <ΔL\*3 或 >17%，层级糊成一片或整块发灰。
4. 辉光半径大于元素尺寸 → 光团吞掉形状与轮廓。
5. 一屏 >6 个发光体 → 加法饱和成白团，视觉层级全失。
6. 高饱和纯青/品红（#00FFFF、#FF00FF）＋大半径 → 廉价霓虹。
7. 辉光/投影加在正文或小字上 → 局部对比跌破 4.5:1。
8. 全大写小标签字距为 0 → 笔画黏连成条。
9. 浅色主题直接复用暗色强调色（#4DA3FF 在浅底 2.5:1）。
10. 忽略动效阈值：全屏脉冲 >3Hz 或大幅亮度闪变（违反 2.3.1）；另有半透明玻璃面板叠在发光上造成二次降对比。

## 暗色 token 表（直接可用）
```css
:root, [data-theme="dark"] {
  /* surfaces: L* 1.9 → 4.3 → 8.3 → 13.2 ，对应 Material overlay 0/5/7/9% */
  --bg-void:#05070D; --surface-1:#0B0F18; --surface-2:#131824; --surface-3:#1B2230;
  --border-subtle:rgba(167,176,192,.14); --border-strong:#5F6D8B;   /* 3:1 */
  /* text: 16.7 / 9.2 / 6.7 : 1 on --bg-void */
  --text-primary:#E6EAF2; --text-secondary:#A7B0C0; --text-muted:#8B96A8;
  --accent-blue:#4DA3FF; --accent-cyan:#7FE3F0; --accent-ice:#A9E8F5;
  --ring-focus:#A9E8F5;                       /* ≥3:1 焦点环 */
  /* glow: 单层 ≤.35，总和不超 .5 */
  --glow-blue:0 0 12px rgba(77,163,255,.28),0 0 32px rgba(77,163,255,.12);
  --glow-cyan:0 0 8px rgba(127,227,240,.28);
  --text-glow:0 0 6px rgba(127,227,240,.20);  /* 仅用于 ≥24px 大字 */
  --dur-pulse:2.4s; --pulse-amp:.12;
}
[data-theme="light"] {
  --bg-void:#F7F9FC; --surface-1:#FFFFFF; --surface-2:#EEF2F8;
  --border-strong:#5A6478;                    /* 5.95:1 on #FFF */
  --text-primary:#10141C; --text-secondary:#4A5468; --text-muted:#5A6478;
  --accent-blue:#0B63CE; --accent-cyan:#0E6E7A; --accent-ice:#08427F;
  --glow-blue:none; --glow-cyan:none; --text-glow:none;  /* 浅色不用辉光 */
}
```

## 出处
- [WCAG 2.2 SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)｜[SC 1.4.6 Contrast (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html)｜[SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)｜[SC 1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)｜[SC 2.3.1 Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)
- [Apple HIG — Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)（4.5:1 最低、小字 7:1、base/elevated、避免硬编码颜色、"防止白底发光"）
- [Material Components for Android — ElevationOverlayProvider.java](https://github.com/material-components/material-components-android/blob/master/lib/java/com/google/android/material/elevation/ElevationOverlayProvider.java)（overlay alpha 公式与 2% accent）｜[Material Design 2 — Dark theme](https://m2.material.io/design/color/dark-theme.html)
- [Material Web — md.sys.typescale tokens](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-typescale.scss)（label-small 11px/500/tracking 0.5px）
- [IBM Carbon — color tokens 源文件](https://github.com/carbon-design-system/carbon/blob/main/packages/colors/tokens/colors.tokens.json)（gray / coolGray / warmGray 全量色值）｜[Carbon type styles](https://github.com/carbon-design-system/carbon/blob/main/packages/type/src/styles.ts)（label-01 12px/ls 0.32px 等）
- [NN/g — Dark Mode vs. Light Mode](https://www.nngroup.com/articles/dark-mode/)（小字号下浅色模式优势最大）｜[NN/g — Dark Mode: How Users Think About It and Issues to Avoid](https://www.nngroup.com/articles/dark-mode-users-issues/)
- [Smashing — Inclusive Dark Mode](https://www.smashingmagazine.com/2025/04/inclusive-dark-mode-designing-accessible-dark-themes/)（暗色抗锯齿 halo/光晕、避免纯黑与过饱和）｜[Level Access — Astigmatism and Web Accessibility](https://www.levelaccess.com/blog/accessibility-for-people-with-astigmatism/)
- [LearnOpenGL — Bloom](https://learnopengl.com/Advanced-Lighting/Bloom)（阈值提取＋高斯模糊＋加法混合，过量即"过曝白团"）｜[MDN — box-shadow](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-shadow)（blur radius＝过渡带长度）｜[Laws of UX — Von Restorff Effect](https://lawsofux.com/von-restorff-effect/)（强调需克制，避免显著元素互抢）

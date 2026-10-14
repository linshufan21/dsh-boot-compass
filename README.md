# dsh-boot-compass

**开机那 3 秒，也值得设计一下。**

DSH 启动时会先画一张「HARNESS 正在加载插件…」的卡。这个插件在它出现之前就接住画面，
放一段七拍的罗盘序列，播完再交给主界面。纯代码，零视频资源。

![七段分镜](assets/screenshot-1.png)

## 七拍

```
引导 ── 扫描 ── 装载 ── 锁定 ── 静止 ── 释放 ── 退场
```

一台罗盘从**绷紧**开始：指针被反向压住。

然后一段亮弧绕着盘面走完一周读刻度，像在扫什么。

接着指针被放开 —— 甩过正北、过冲、回摆、停住。
**停住那一下是故意的**：一直动的东西读起来是"还在忙"，停一下才像"到位了"。

最后冲击波向外投出，整个画面穿过镜头离开，主界面从里面长出来。

嫌 3 秒长？**点一下屏幕就直接进主界面**，仍然走完释放和交接，约 0.6 秒。
`Esc` / `空格` / `Enter` 也行。

## 装

桌面客户端的 `desktop` profile 由客户端独占，`dsh plugin` 会拒绝它，
所以走 **设置 → 插件**，装完重启客户端。

```bash
npm pack        # 产出 dsh-boot-compass-0.1.0.tgz
```

其它 profile 可以用命令行：

```bash
dsh plugin --profile <name> add dsh-boot-compass
```

## 三个开关

都在 localStorage 里，改完刷新即可：

```js
localStorage.setItem('dsh-boot-compass:mode', 'off')     // 整个关掉，直接进 DSH
localStorage.setItem('dsh-boot-compass:theme', 'light')  // 强制浅色；默认跟随系统
localStorage.setItem('dsh-boot-compass:total', 2000)     // 全片时长，800–12000 毫秒
```

系统开了「减弱动效」时会自动降级：不保留任何位移和旋转，只留一次交叉淡入，
但进度指示仍然保留 —— 那是功能，不是装饰。

## 想先看看？

双击 [`tools/preview.html`](tools/preview.html)。

单文件、零依赖，里面就是宿主侧真实注入的那两行，一个字没改。
点一下就能试跳过。

## 为什么非得做成宿主侧插件

因为那张加载卡画得比任何插件都早。只在客户端 JS 里画动画的话，
无论 z-index 堆多高，它都会在屏幕上待几百毫秒。

唯一比它更早的东西是**被服务的文档本身**。DSH 开放了 `webserver/index-inject`，
所以这个插件的首帧是一条纯 CSS 覆盖层 —— 样式行一被解析就已经在玻璃上了，
那张卡从头到尾没机会出现。

实现细节（就绪 gate 为什么卡在 0.76、为什么挂在 shadow root 里、
为什么资产要拼进同一个 script 行、性能与可合成属性清单）
都在 [docs/internals.md](docs/internals.md)。

## License

MIT
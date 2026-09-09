---
title: 实验5：鸿蒙开发入门及计算器开发
published: 2026-09-08
description: 用 ArkTS 在鸿蒙上开发「玄青符算」计算器，自研词法分析 + 递归下降表达式引擎，支持科学函数、隐式乘法、实时预览、历史记录与周易卦象彩蛋，深浅双主题完整实现。
image: /images/exp5/exp5-1-hexagram.png
tags: [鸿蒙, ArkTS, 移动软件开发, 实验记录]
category: 移动软件开发
draft: false
lang: zh_CN
---

<center>姓名：池晋原  学号：24020007016</center>

| 姓名和学号？         | 池晋原，24020007016                                          |
| -------------------- | ------------------------------------------------------------ |
| 本实验属于哪门课程？ | 中国海洋大学26夏《移动软件开发》                             |
| 实验名称？           | 实验5：鸿蒙开发入门及计算器开发                              |
| 博客地址？           | https://www.half-awake.top/                                  |
| 代码仓库地址？       | https://github.com/HalfAwake-destiny/Mobile-software-development |

## 一、实验内容

本次实验的主要内容是使用 ArkTS 语言在 HarmonyOS（鸿蒙）平台上开发一款「玄青符算」主题计算器应用。应用采用 Stage 模型，单页面 `Index` 承载全部 UI 与逻辑：顶部为标题栏和状态芯片，中间是带符文装饰的显示卡片（实时表达式输入与结果预览），下方是科学/标准双模式键盘网格。核心功能包括四则运算、幂运算、三角函数（sin / cos / tan）、对数（ln / log）、开方、常量 π / e、括号嵌套、隐式乘法、角度 / 弧度切换、计算历史（最近 5 条）、以及基于结果的周易卦象彩蛋。通过本次实验，掌握了 HarmonyOS 工程结构、ArkTS 声明式 UI、`@State` 响应式状态管理、`@Builder` 组件复用、自定义表达式词法分析与递归下降求值引擎、以及深浅双主题的完整实现。

### 1. 搭建鸿蒙工程结构与入口配置

使用 DevEco Studio 创建 Stage 模型工程 `calculator`，主模块名为 `entry`，设备类型选择 `phone`。工程采用标准的鸿蒙目录结构：

```
entry/src/main/
├── ets/
│   ├── entryability/EntryAbility.ets    # 应用生命周期入口
│   ├── entrybackupability/EntryBackupAbility.ets
│   ├── pages/Index.ets                  # 唯一页面（计算器主界面）
│   ├── common/constants/                # 全局常量
│   │   ├── CommonConstants.ets          # 按键数据集、状态文案、业务阈值
│   │   └── ThemeConstants.ets           # 深色/浅色主题色板
│   ├── common/util/
│   │   └── CalculateUtil.ets            # 表达式引擎（词法分析 + 递归下降求值）
│   └── viewmodel/
│       ├── PressKeysItem.ets            # 按键条目数据模型
│       └── PresskeysViewModel.ets       # 按键数据集组装
├── resources/base/media/                # 图片资源（背景、符文、吉祥物等）
├── resources/base/profile/main_pages.json
├── module.json5                         # 模块清单（能力注册）
```

`module.json5` 中将 `EntryAbility` 注册为主能力，图标使用分层图像 `$media:layered_image`，启动窗口图标设为 `$media:startIcon`：

```json5
{
  module: {
    name: 'entry',
    type: 'entry',
    mainElement: 'EntryAbility',
    deviceTypes: ['phone'],
    abilities: [{
      name: 'EntryAbility',
      srcEntry: './ets/entryability/EntryAbility.ets',
      icon: '$media:layered_image',
      label: '$string:EntryAbility_label',
      startWindowIcon: '$media:startIcon'
    }]
  }
}
```

`main_pages.json` 配置路由表，当前只有 `'pages/Index'` 一个页面。`EntryAbility.ets` 在 `onWindowStageCreate` 中调用 `windowStage.loadContent('pages/Index')` 加载主页。

### 2. 设计主题色板与按键数据模型

所有颜色定义集中在 `ThemeConstants.ets` 的 `ThemePalette` 接口中，分别导出 `THEME_DARK`（玄青霓虹）和 `THEME_LIGHT`（月白青瓷）两套色板，包含 28 个语义化字段（bg / card / neon / crimson / gold / text / border 等），确保深浅模式切换时只需替换引用对象而不改动任何组件代码。

`CommonConstants.ets` 定义基础按键数组 `KEYS_BASIC`（18 个：AC / ⌫ / % / ÷ / 7–9 × / 4–6 − / 1–3 + / 0 . =）和科学按键数组 `KEYS_SCIENCE`（12 个：sin cos tan ln log √ / x² xʸ π e ( )），以及四条状态文案（灵力稳定 / 术式输入中 / 符阵已闭合 / 术式失效）和历史上限 5 条、灵力满格长度 24。

`PressKeysItem.ets` 是轻量数据模型，每个条目携带 `label`（显示文本）、`span`（跨列数，仅 `'0'` 为 2）、`isEquals`（是否等号，决定字号）。`PresskeysViewModel.ets` 从常量中读取并组装成 `PressKeysItem[]`，供 UI 层直接消费：

```typescript
static getBasicKeys(): PressKeysItem[] {
  return CommonConstants.KEYS_BASIC.map((label: string) =>
    new PressKeysItem(label, label === '0' ? 2 : 1, label === '=')
  )
}
```

### 3. 实现表达式引擎 CalculateUtil

`CalculateUtil.ets` 是整个计算器的核心——一个不依赖任何 UI 框架的纯逻辑类，负责将用户输入的字符串表达式解析并求值。整体流程分为三步：**词法分析 → 递归下降语法分析 → 格式化输出**。

**词法分析** `tokenize` 将输入串拆分为 token 数组，识别数字（含小数）、标识符（函数名 / 常量 pi / e）、运算符（`+ - * / ^ %`）和括号，遇到非法字符直接抛异常：

```typescript
private static tokenize(input: string): string[] {
  const tokens: string[] = []
  let i: number = 0
  while (i < input.length) {
    const c = input[i]
    if (c === ' ') { i++; continue }
    const isDigit = (c >= '0' && c <= '9') || c === '.'
    const isLetter = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
    if (isDigit || isLetter) {
      let s = ''
      while (i < input.length) { /* 贪婪匹配数字或字母 */ }
      tokens.push(s); continue
    }
    if ('+-*/^()%'.indexOf(c) >= 0) { tokens.push(c); i++; continue }
    throw new Error('char:' + c)
  }
  return tokens
}
```

**递归下降求值** `evaluate` 先将显示符号（× ÷ −）归一化为 ASCII（* / -），再按以下优先级从低到高构建语法树：

| 优先级 | 规则 | 说明 |
|--------|------|------|
| 最低 | `parseExpr` | 加减（+ −），百分数以上一累计值为基数 |
| | `parseTerm` | 乘除（* /），含除零保护 |
| | `parsePower` | 幂（^），**右结合**，指数允许一元符号（如 `2^-1 = 0.5`） |
| | `parseUnary` | 一元正负号（优先级低于幂，故 `-2^2 = -4`） |
| | `parsePostfix` | 百分后缀（`200% = 2`） |
| 最高 | `parseAtom` | 数字 / 常量（pi, e） / 函数调用（sin/cos/tan/ln/log/sqrt，支持任意层嵌套括号） / 括号子表达式 |

三角函数通过 `mul` 参数控制角度 / 弧度转换：`radian ? 1 : Math.PI / 180`。`applyFunc` 对非法参数（`ln(0)`、`sqrt(-1)`、`tan(90°)`）返回 `NaN`，由外层 `isFinite` 校验统一转为「术式失效」错误。

**自动补全与合法性判断**：`completeForEvaluation` 在求值前检查末尾是否需要补齐缺失的右括号（如 `sin(30` → `sin(30)`），而 `isCompletable` 判断当前表达式是否已具备可求值的最小条件（末尾不是运算符且不以左括号结尾）。

**格式化** `format` 处理浮点误差：绝对值小于 `1e-12` 归零；超大或超小数用科学计数法（8 位有效数字）；其余用 `toPrecision(12)` 再转字符串以去除无意义尾零。

### 4. 构建计算器主界面 Index.ets

`Index.ets` 是唯一的页面组件，使用 `@Entry @Component` 装饰器标记。内部通过大量 `@State` 变量驱动响应式渲染：`expression`（当前输入表达式）、`result`（上次计算结果）、`preview`（实时预览值）、`history`（历史记录数组）、`scientific`（是否展开科学面板）、`radian`（角度 / 弧度）、`darkMode`（深浅主题）、`evaluated`（是否处于已计算状态）、`pressedKey`（当前按下键名，用于触控反馈动画）等。

**build() 布局**采用三层 Stack 结构：
1. **底层**：全屏背景图 `qingcalc_bg.png`（深色模式下 75% 不透明度）+ 底部角落装饰图 + 右上角吉祥物
2. **中层 Column**：从上到下依次排列
   - **标题栏**：app 图标 + 「玄青符算」标题 + 「QINGCALC · RUNE TERMINAL」副标题 + 右侧状态芯片（● ONLINE / 灵力稳定）
   - **功能行**：标准 / 科学切换按钮、DEG / RAD 切换、☾ 深色 / ☀ 浅色切换
   - **显示卡片** `displayCard()` @Builder：Stack 内层叠半透明符文 `rune_core.png`（旋转动画）+ 内容 Column（表达式大字右对齐、预览行、灵力进度条、RAD/DEG 与记录数）；长按 450ms 弹出历史下拉面板
   - **科学键盘 Grid**（条件渲染）：6 列 × 2 行，展示 sin / cos / tan 等科学函数键
   - **基础键盘 Grid**：4 列 × 5 行，'0' 键跨两列，'=' 键使用鎏金色突出
   - **页脚**：「东方幻想 UI · v3.0」

**按键绘制** `keyButton()` @Builder 是所有按钮的统一模板，根据 `key` 类型动态决定颜色（等号→鎏金、运算符→朱砂红、功能键→青灰、科学键→深青、数字键→暗青），并在按下时触发缩放 + 下移 + 阴影扩散的 70ms 按压动画，松开时 190ms 缓动回弹：

```typescript
@Builder keyButton(key: string, scienceKey: boolean) {
  Button(key)
    .fontSize(key === '=' ? 27 : (scienceKey ? 14 : 20))
    .fontColor(key === '=' || this.activeOperator === key ? '#17262A' : this.text())
    .backgroundColor(this.buttonColor(key)).borderRadius(scienceKey ? 13 : 18)
    .border({ width: this.pressedKey === key ? 2 : (this.activeOperator === key ? 1.5 : 0),
              color: this.pressedKey === key ? this.gold() : this.neon() })
    .scale({ x: this.pressedKey === key ? 0.90 : 1, y: this.pressedKey === key ? 0.90 : 1 })
    .translate({ y: this.pressedKey === key ? 3 : 0 })
    .animation({ duration: this.pressedKey === key ? 70 : 190,
                 curve: this.pressedKey === key ? Curve.EaseIn : Curve.EaseOut })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) this.pressDown(key)
      else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.pressUp(key)
    })
    .onClick(() => this.handleKey(key))
}
```

### 5. 输入处理与实时预览

`handleKey(key)` 是所有按键的统一分发入口，根据 key 类型调用对应方法：

```typescript
handleKey(key: string): void {
  if (key === 'AC') { this.clearAll(); return }
  if (key === '⌫') { this.deleteUnit(); return }
  if (key === '=') { this.calculate(); return }
  if (this.isOperator(key)) { this.appendOperator(key); return }
  if (key === '.') { this.appendDecimal(); return }
  if (key >= '0' && key <= '9') { this.appendDigit(key); return }
  // 科学函数、√、x²、xʸ、π、e、(、) → appendValue
}
```

**数字输入** `appendDigit` 处理多种边界：已计算状态下自动清空重新开始；当前段为 `"0"` 时替换而非追加；表达式尾部是 `)` / `%` / `pi` / `e` 时自动插入隐式乘号 `×`。

**运算符输入** `appendOperator` 保证连续运算符只保留最后一个（输入 `+` 后再输 `-` 会替换为 `-`）；已计算状态下将结果作为左操作数继续运算；允许表达式开头出现负号。

**隐式乘法**：当已有值（数字 / 右括号 / % / pi / e）后面紧跟 `(` / `pi` / `e` / 函数名时，自动插入 `×`，使 `2π`、`3(`、`2sin(` 等写法合法。

**实时预览**：`expression` 变量带有 `@Watch('onInputChange')` 装饰器，每次变化时触发 `updatePreview`，调用 `CalculateUtil.isCompletable` 判断是否可求值，若可以则通过 `completeForEvaluation` 补齐括号后调用 `evaluate` + `format` 得到预览结果，显示在表达式下方（如输入 `12×8+5` 即刻显示 `= 101`）。

**字号自适应** `fitSize` 根据文本长度动态缩小字号，保证长表达式不截断为省略号：基准字号下能容纳 `fitLen` 个字符，超出则线性缩小至最小字号 `min`。

### 6. 计算、历史记录与卦象系统

点击 `=` 触发 `calculate()`：先检查是否处于「连算」状态（已计算后再次按 `=`, 则用上次捕获的运算符和右操作数继续运算），然后调用 `CalculateUtil.evaluate` 求值，成功后执行一系列副作用：

1. **捕获连算信息** `captureRepeat`：从完成后的表达式中提取最后一个运算符及其右侧操作数，供下次连算使用。
2. **写入历史** `history`：将 `表达式 = 结果` 格式的条目插入数组头部，最多保留 5 条（`HISTORY_MAX`），重复结果不追加。
3. **卦象映射** `castHexagram`：将结果取绝对值乘 1000 后对 64 取模，索引到内置的 64 卦名称数组（乾为天 ~ 火水未济），显示 Unicode 卦符 + 序号 + 卦名（如结果为 3.14159 → 第 43 卦 · 夬）。
4. **结果动画** `playResultAnimation`：符文旋转 180°、结果文字先缩放到 0.72 再弹回 1.08 最后稳定于 1.0、表达式上移并淡出，形成「结算」视觉反馈。
5. **状态更新**：`evaluated` 置为 `true`，状态改为「符阵已闭合」，活跃运算符清空。

**历史下拉面板** `historyDropdown()` @Builder 以浮动卡片形式覆盖在显示卡片上方，列出最近 5 条记录（每条显示表达式和结果，结果用鎏金高亮），支持点击复用表达式重新编辑，并提供「清除全部」和关闭按钮。长按显示卡片区域 450ms 触发显示 / 隐藏切换。

### 7. 编译运行

完成后在 DevEco Studio 中使用 Previewer 预览或连接模拟器运行。启动后正确显示「玄青符算」标题栏和深色背景纹理；输入 `12×8+5` 时预览区即时显示 `= 101`；点击 `=` 后结果以霓虹青色大字呈现，符文旋转播放结算动画，下方显示对应卦象；切换「科学」按钮展开三角函数 / 对数 / 幂 / 常量面板；点击 `DEG` 切换为弧度模式后 `sin(30)` 结果从 `0.5` 变为 `-0.988`；长按显示卡片弹出历史记录下拉；点击「☀ 浅色」一键切换为月白青瓷配色；所有按键均有按压缩放反馈，运算符激活态有霓虹边框高亮。

![1.会根据结果算卦](/images/exp5/exp5-1-hexagram.png)

![2.浅色主题](/images/exp5/exp5-2-light-theme.png)

## 二、问题总结与体会

实验过程中遇到的第一个问题是**运算符优先级与一元负号的交互**。最初尝试用简单的 `split` + `reduce` 按顺序计算，导致 `2+3×4` 算成 20 而非 14。改用递归下降解析器后，又发现 `-2^2` 被算成 `(+4)` 而非 `-4`——因为一元负号的优先级如果高于幂，会先取负再平方。最终将 `parseUnary` 放在 `parsePower` 之后（优先级更低），确保 `-2^2 = -(2^2) = -4`，同时幂运算保持右结合（`2^3^2 = 2^(3^2) = 512`）。这让我深刻理解了语法分析中优先级与结合性的设计必须严谨，否则隐蔽的运算错误很难通过简单测试用例发现。

第二个问题是**隐式乘法与表达式合法性判断的边界**。用户可能输入 `2sin(30)`、`(1+2)pi`、`3e` 等写法，需要在 `appendValue` 和 `appendDigit` 中检测前一个 token 是否为「值尾」（数字 / 右括号 / % / pi / e），若是则自动插入 `×`。但自动补 `×` 后可能导致表达式以运算符结尾（如输入 `pi` 后再输 `×`），此时 `isCompletable` 必须返回 `false` 阻止预览求值。此外 `completeForEvaluation` 在求值前补齐右括号时，需要排除末尾本身就是运算符或左括号的不完整情况。这些边界条件的处理占了表达式引擎约 40% 的代码量，让我认识到一个「能用」的计算器和「健壮」的计算器之间，差距全在这些边缘 case 的防御性处理上。

第三个问题是**ArkTS 声明式 UI 的响应式刷新与性能**。最初把 `buttonColor` 直接写在 Button 的 `.backgroundColor()` 调用中，每次任意 `@State` 变化都会重绘全部 18~30 个按钮。后来将颜色计算抽取为独立的 `buttonColor(key)` 方法，并结合 `@Builder` 封装 `keyButton`，只在 `pressedKey` / `activeOperator` / `darkMode` 这几个真正影响颜色的状态变化时才触发重绘。另外，`@Watch('onInputChange')` 在每次按键时都会触发 `updatePreview` 调用完整的词法分析 + 求值链路，对于长表达式可能有感知延迟，因此加了 `isCompletable` 前置短路——当表达式以运算符结尾时直接跳过求值，避免不必要的计算开销。

通过本次实验，我完整地实现了一个具有东方幻想风格的鸿蒙原生应用。最大的体会是**视图与逻辑的彻底分离**：`CalculateUtil` 作为纯 TypeScript 类不依赖任何 ArkTS UI API，可以在 Node.js 环境中独立运行和测试（项目中 `_util_test.js` 就是用镜像逻辑写的 26 个测试用例，覆盖了正常运算、优先级、函数嵌套、错误处理等场景）；而 `Index.ets` 只负责状态管理和 UI 渲染，两者通过简单的字符串接口通信。这种架构让表达式引擎可以脱离鸿蒙环境单独验证正确性，大大降低了调试成本。其次是 ArkTS 声明式范式带来的开发效率提升——`@State` + `@Watch` + `@Builder` 的组合让复杂 UI 的状态同步变得直观，相比命令式 DOM 操作减少了大量手动刷新代码。

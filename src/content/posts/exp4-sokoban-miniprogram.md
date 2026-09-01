---
title: 实验4：推箱子游戏
published: 2026-09-01
description: 开发推箱子小游戏「小鸟推猪」，用 canvas 绘制 8×8 棋盘，支持方向键与滑动操控、撤销重玩，并按 BFS 求得的最优步数评定星级。
image: /images/exp4/exp4-2-game.png
tags: [微信小程序, 移动软件开发, 实验记录, Canvas]
category: 移动软件开发
draft: false
lang: zh_CN
---

<center>姓名：池晋原  学号：24020007016</center>

| 姓名和学号？         | 池晋原，24020007016                                          |
| -------------------- | ------------------------------------------------------------ |
| 本实验属于哪门课程？ | 中国海洋大学26夏《移动软件开发》                             |
| 实验名称？           | 实验4：推箱子游戏                                            |
| 博客地址？           | https://www.half-awake.top/                                  |
| 代码仓库地址？       | https://github.com/HalfAwake-destiny/Mobile-software-development |

## 一、实验内容

本次实验的主要内容是开发一款推箱子小游戏「小鸟推猪」，共 4 关。首页是选关界面，展示每关的最佳步数与星级；进入游戏页后，用 canvas 绘制 8×8 棋盘，玩家通过方向键或滑动屏幕操控小鸟推动小猪，把全部小猪推进草窝即可通关。通关后弹出结算弹窗，显示本次步数、星级评定和是否刷新纪录，并给出「再少 N 步可得 N 星」的提示；游戏还支持撤销、重玩、下一关，成绩用本地缓存持久化。通过本次实验，掌握了 canvas 2D 接口的初始化与 DPR 适配、二维数组地图的建模与碰撞判断、滑动手势识别、以及原生组件层级问题的处理方式。

### 1. 设计关卡数据与星级规则

所有关卡数据统一放在 `utils/data.js` 中。每关由两个 8×8 的二维数组组成：`map` 是地形层，`0` 表示空（不绘制且不可通行）、`1` 是墙、`2` 是路、`3` 是终点（草窝）、`5` 是玩家初始位置（初始化后清成路）；`box` 是箱子层，`0` 表示无、`4` 表示小猪。地形与箱子分层存放，是为了让「箱子在终点上」这一状态可以直接用 `box[r][c] === 4 && map[r][c] === 3` 判断，不必额外维护终点占用情况。

星级评定以每关最优步数为基准，最优值由 BFS 求解器离线计算得出，写死在 `optimal` 对象中。步数不超过最优的 1.3 倍评三星，不超过 1.8 倍评二星，否则一星：

```javascript
function getStars(level, steps) {
  const opt = optimal[level]
  if (!opt || !steps || steps <= 0) return 0
  if (steps <= opt * 1.3) return 3
  if (steps <= opt * 1.8) return 2
  return 1
}
```

每关最佳步数以 `sokoban_best` 为键存入本地缓存，`saveBest` 只在成绩更优时覆盖，并返回是否刷新纪录，供弹窗展示。

### 2. 实现选关首页

首页 `pages/index/index.wxml` 由头部标题、关卡卡片网格和底部说明三部分组成。关卡列表在 `loadLevels` 中组装：读出每关的最佳步数，换算出星级和 `cleared` 状态，卡片上显示第几关、最佳步数和星级字符串。点击卡片通过 `wx.navigateTo` 跳转到游戏页并带上关卡参数：

```javascript
chooseLevel(e) {
  const level = e.currentTarget.dataset.level
  wx.navigateTo({ url: '../game/game?level=' + level })
}
```

由于从游戏页返回首页不会触发 `onLoad`，星级和最佳步数的刷新放在 `onShow` 中处理，保证每次返回都能看到最新成绩。

### 3. 用 canvas 绘制游戏棋盘

游戏页使用 `canvas type="2d"` 绘制棋盘。`onReady` 时通过 `wx.createSelectorQuery` 拿到 canvas 节点和尺寸，做 DPR 适配后再获取绘图上下文，避免高分屏上画面发虚：

```javascript
const dpr = sysInfo.pixelRatio || 2
canvasNode.width = res[0].width * dpr
canvasNode.height = res[0].height * dpr
ctx.scale(dpr, dpr)
cell = res[0].width / COL
```

素材用 `canvasNode.createImage()` 预加载，共 `stone`、`pig`、`bird` 三张，全部加载完成后才设置 `imagesReady` 并首绘，同时把 `boardReady` 置为 `true` 让画布淡入显示，避免图片逐张加载时出现「分层闪现」。地板不再使用图片，改为直接自绘棋盘交错的两种草色；终点草窝用虚线圆加半透明填充表示。

`drawCanvas` 按「格子底色 → 草窝 → 小猪 → 归位动效 → 小鸟」的顺序绘制，所有图元都留出 `cell * 0.045` 的缝隙并做圆角裁剪，让像素素材呈现贴纸质感。归位的小猪会额外加金色描边和一个对勾。

### 4. 实现移动、推箱与撤销

`move(dr, dc)` 是游戏的核心逻辑。先判断目标格是否可通行（`isWalkable` 排除了越界、`0` 空地和 `1` 墙），若目标格上有小猪，则再检查小猪前方一格是否可通行且没有其它小猪，两个条件都满足才允许推动：

```javascript
move(dr, dc) {
  if (this.isWin) return
  const nr = this.row + dr
  const nc = this.col + dc
  if (!this.isWalkable(nr, nc)) return

  const before = this.doneSet()   // 必须在推箱前记录归位集合

  if (this.box[nr][nc] === 4) {
    const br = nr + dr
    const bc = nc + dc
    if (!this.isWalkable(br, bc) || this.box[br][bc] === 4) return
    this.saveHistory()
    this.box[nr][nc] = 0
    this.box[br][bc] = 4
  } else {
    this.saveHistory()
  }
  this.row = nr
  this.col = nc
  this.setData({ steps: this.data.steps + 1, boxDone: this.countDone() })
  this.drawCanvas()
  // 对比 before / after 找出本步新归位的小猪，播放动效
  this.checkWin()
}
```

撤销功能通过 `history` 栈实现：每次移动前调用 `saveHistory` 把当前玩家坐标和箱子图层深拷贝一份（`box.map(r => r.slice())`）压栈，栈上限 200 步；点「撤销」时弹栈恢复，步数减一后重绘。

### 5. 方向键与滑动手势

控制方式支持两种。方向键用四个 `.dirBtn` 分别绑定 `up` / `down` / `left` / `right`，箭头是用 CSS 边框画的三角形。滑动手势则在 `boardWrap` 上监听 `bindtouchstart` / `bindtouchend`，记录起止坐标后比较 `dx`、`dy` 的大小决定主轴方向，并设置 25px 的阈值过滤误触：

```javascript
touchEnd(e) {
  const dx = e.changedTouches[0].clientX - this.startX
  const dy = e.changedTouches[0].clientY - this.startY
  if (Math.abs(dx) < 25 && Math.abs(dy) < 25) return
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) this.move(0, 1)
    else this.move(0, -1)
  } else {
    if (dy > 0) this.move(1, 0)
    else this.move(-1, 0)
  }
}
```

小猪归位时播放金环扩散动效并调用 `wx.vibrateShort` 轻震动，动效用 `canvasNode.requestAnimationFrame` 逐帧推进，480ms 内透明度从 1 衰减到 0。

### 6. 通关判定与结算

`checkWin` 在每步移动后调用，当已归位数量等于小猪总数时判定通关：先调 `saveBest` 写入成绩并拿到是否刷新纪录，再算出星级和距离下一星的差距。由于 canvas 是原生组件、层级永远高于普通 view，弹窗会被画布遮挡，因此在弹窗弹出前先用 `wx.canvasToTempFilePath` 把当前棋盘导出成临时图片，把 canvas 换成一张 `image` 显示，从而绕过层级限制：

```javascript
this.snapshotBoard(() => {
  this.setData({
    showWin: true,
    starText: data.starText(stars),
    isNewRecord: isNewRecord,
    nextStarTip: gap > 0 ? '再少 ' + gap + ' 步可得 ' + (stars + 1) + ' 星' : ''
  })
})
```

弹窗提供「选关 / 重玩 / 下一关」三个出口，点「下一关」时直接切换 `this.level` 并重新初始化地图，最后一关通关后返回选关页并提示「全部关卡已通关」。

### 7. 编译运行

完成后在微信开发者工具中编译预览。首页正确显示 4 张关卡卡片和星级；点击进入任意关卡后，棋盘、小鸟、小猪、草窝都能正常绘制；点击方向键或在棋盘上滑动，小鸟会相应移动，遇到小猪时将其推动，撞墙或小猪后方受阻则不移动；点击「撤销」可以逐步回退，「重玩」重置本关；把所有小猪推入草窝后弹出结算弹窗，显示步数、星级和升星提示；返回首页后对应关卡的星级和最佳步数已更新。

![主页](/images/exp4/exp4-1-levels.png)

![可以按方向键或者滑动进行移动](/images/exp4/exp4-2-game.png)

![完成后会有星级和使用步数](/images/exp4/exp4-3-win.png)

## 二、问题总结与体会

实验过程中遇到的第一个问题是 canvas 遮挡通关弹窗。弹窗用 `wx:if` 渲染在最外层、z-index 也设到 9999，但真机和模拟器上都只露出弹窗边缘，中间被棋盘挡住。原因是 `canvas` 属于原生组件，层级始终高于普通视图节点，z-index 对它无效。尝试过 `cover-view` 但不支持复杂的弹窗动画，最终采用的方案是：先用 `wx.canvasToTempFilePath` 把当前帧导出为临时图片，然后在 WXML 中用 `snapshot` 控制一张 `image` 覆盖在 canvas 之上，同时给 canvas 加 `hidden` 暂时隐藏；关闭弹窗或重玩时清空 `snapshot` 让 canvas 重新可见。这让我认识到，小程序里涉及原生组件时不能只靠 z-index 解决层级问题，需要换成「截图替换」这类绕行思路。

第二个问题是撤销后步数与实际状态不同步。最初 `saveHistory` 只保存了玩家坐标，撤销时步数减一、玩家回到原位，但被推动的小猪仍留在原地，多推几次就出现「箱子越推越多」的错乱。后来改为把整个箱子图层深拷贝一份一起入栈：`this.box.map(r => r.slice())`，恢复时整体替换。另外还注意到 `doneSet()` 必须在推动小猪**之前**采集，否则本步刚刚归位的位置会被误判为「原本已归位」，导致归位动效不触发。

第三个问题是高分屏下画面发虚。canvas 的 CSS 尺寸是 690rpx，但画布像素尺寸默认等于 CSS 像素，在 `pixelRatio` 为 3 的手机上明显模糊。解决办法是读取 `wx.getWindowInfo().pixelRatio`，把 `canvasNode.width/height` 乘上 DPR，再调 `ctx.scale(dpr, dpr)`，让后续所有绘制仍然使用 CSS 像素坐标，业务代码不用改动。此外首屏还出现过图片逐张加载导致的「闪现」，于是加了 `boardReady` 开关，等三张素材全部 `onload` 后再淡入显示。

通过本次实验，我完整地实现了一个有状态的小游戏。最大的体会是数据与渲染要分离：二维数组的 `map` / `box` 是唯一数据源，所有移动、撤销、通关判定都只操作这两份数组，最后统一交给 `drawCanvas` 重绘，逻辑因此变得清晰且易于调试。其次是原生组件的限制和本地缓存的配合——canvas 的层级问题需要用截图方案绕过，`wx.setStorageSync` 则让无后端的小游戏也能保存成绩。

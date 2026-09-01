---
title: 实验3：高校新闻网
published: 2026-09-01
description: 开发高校新闻网小程序，实现首页轮播、分类筛选、搜索与日期过滤、详情页阅读设置与收藏，以及个人中心的登录与阅读历史管理。
image: /images/exp3/exp3-1-home.png
tags: [微信小程序, 移动软件开发, 实验记录]
category: 移动软件开发
draft: false
lang: zh_CN
---

<center>姓名：池晋原  学号：24020007016</center>

| 姓名和学号？         | 池晋原，24020007016                                          |
| -------------------- | ------------------------------------------------------------ |
| 本实验属于哪门课程？ | 中国海洋大学26夏《移动软件开发》                             |
| 实验名称？           | 实验3：高校新闻网                                            |
| 博客地址？           | https://www.half-awake.top/                                  |
| 代码仓库地址？       | https://github.com/HalfAwake-destiny/Mobile-software-development |

## 一、实验内容

本次实验的主要内容是开发一个高校新闻网小程序，模拟中国海洋大学新闻网。首页通过轮播头条、分类栏、搜索框、日期筛选器和新闻列表展示校园新闻；点击新闻进入详情页，可以阅读正文、查看阅读进度、调整字号和夜间模式，并收藏文章；底部自定义 tabBar 切换到「我的」页，使用微信授权登录后可管理个人资料、查看收藏夹和阅读历史。通过本次实验，掌握了自定义 tabBar、轮播与列表联动、多种筛选条件组合、本地缓存存储用户数据以及阅读偏好设置的方法。

### 1. 准备新闻数据与公共模块

为了解耦数据与页面，把全部 12 条新闻统一放到 `utils/common.js` 中维护。`common.js` 用数组 `news` 保存每条新闻的 id、分类、来源、标题、海报路径和日期，并附上首条新闻的完整正文作为默认内容；其它 11 条用模板字符串生成格式相近的占位正文，便于演示详情页布局。除了 `getNewsList`、`getNewsDetail`、`getRelatedNews` 三个数据接口外，还封装了收藏、阅读历史、字号/夜间模式、用户资料和登录态的读写函数，使用 `wx.getStorageSync` / `wx.setStorageSync` 操作本地缓存：

```javascript
const FAVORITE_PREFIX = 'favorite:'
const HISTORY_KEY = 'reading-history'
const SETTINGS_KEY = 'reading-settings'

function getFavorites() {
  const { keys = [] } = wx.getStorageInfoSync()
  return keys.filter(key => key.indexOf(FAVORITE_PREFIX) === 0)
    .map(key => wx.getStorageSync(key)).filter(item => item && item.id)
}

function addHistory(article) {
  const current = wx.getStorageSync(HISTORY_KEY) || []
  const next = [{ ...article, viewedAt: Date.now() }, ...current.filter(i => i.id !== article.id)].slice(0, 30)
  wx.setStorageSync(HISTORY_KEY, next)
}
```

每条新闻对应 `images/` 目录下的校园图片，在数据中以 `/images/campus-0x.jpg` 的相对路径引用。

### 2. 配置自定义 tabBar 与全局窗口

`app.json` 中将 `tabBar.custom` 设为 `true` 启用自定义底部栏，并声明 `pages/index/index` 和 `pages/my/my` 两个 tab 页（详情页用 `navigateTo` 跳转，不参与 tab）。`window` 部分设置导航栏标题为「中国海洋大学新闻网」、背景色为白色、页面背景为浅灰色，与首页头部深蓝色形成对比。

自定义 tabBar 放在 `custom-tab-bar/index.js` 下，通过 `Component` 定义，并预置 `selected: 0`、`list` 中的图标路径和文案。点击按钮时调用 `wx.switchTab` 切换页面，并在两个 tab 页的 `onShow` 中通过 `this.getTabBar().setData({ selected })` 同步高亮：

```javascript
// custom-tab-bar/index.js
switchTab(e) {
  const { index, path } = e.currentTarget.dataset
  if (index === this.data.selected) return
  wx.switchTab({ url: path })
}
```

### 3. 实现新闻首页

首页 `pages/index/index.wxml` 自上而下分为四部分：顶部深色报头、轮播头条、分类栏、搜索与日期筛选工具栏、新闻列表。报头使用 `masthead` 组合展示 OUC 字母标识、「海大校园新闻 / CAMPUS NEWSROOM」以及右侧带红色竖条的「今日」标签，背景 `#063f72` 与下方浅色列表形成层次。

轮播使用 `swiper` 组件，三条 `swiper-item` 绑定 `swiperImg`，图片铺满，下方用渐变蒙层显示分类标签和标题，点击任意一条触发 `goToDetail` 跳转到详情页。分类栏用 `scroll-view scroll-x` 实现横向滚动，4 个分类通过 `category--active` 高亮当前项。工具栏同时提供搜索框和 `picker mode="date"` 日期选择器，二者联动到 `applyFilters` 统一过滤；列表项 `news-item` 用左右两栏的「封面 + 标题区」卡片形式呈现，点击后 `wx.navigateTo` 跳转到 `../detail/detail?id=...`。

筛选逻辑在 `applyFilters` 中把分类、关键词、日期三个条件组合起来；关键词还会调 `getNewsDetail` 取出正文进行全文检索：

```javascript
applyFilters() {
  const { allNews, activeCategory, keyword, selectedDate } = this.data
  const query = keyword.trim().toLowerCase()
  const newsList = allNews.filter(item => {
    if (activeCategory !== '全部' && item.category !== activeCategory) return false
    if (selectedDate && item.add_date !== selectedDate) return false
    if (!query) return true
    const detail = common.getNewsDetail(item.id).news || {}
    return [item.title, item.source, item.category, detail.content]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(query))
  })
  this.setData({ newsList })
}
```

`onLoad` 时调用 `common.getNewsList()` 拿到所有新闻，前 3 条作为轮播数据，并统计出日期选择器的 `minDate` / `maxDate` 上下界，避免选择到没有新闻的日期。

### 4. 实现新闻详情页

详情页 `pages/detail/detail` 顶部有一条全屏宽度的 `progress-track`，根据滚动比例实时显示阅读进度。`onPageScroll` 通过 `wx.createSelectorQuery` 拿到 `.article` 的高度，与 `wx.getWindowInfo().windowHeight` 相减得到可滚动距离，进而计算百分比：

```javascript
onPageScroll({ scrollTop }) {
  wx.createSelectorQuery().select('.article').boundingClientRect(rect => {
    if (!rect) return
    const windowHeight = wx.getWindowInfo().windowHeight
    const scrollable = Math.max(rect.height - windowHeight, 1)
    this.setData({ progress: Math.min(100, Math.round(scrollTop / scrollable * 100)) })
  }).exec()
}
```

正文区域根据 `fontSize`（`small` / `medium` / `large`）渲染不同字号，正文容器还根据 `darkMode` 切换 `reading-page--dark` 暗色样式。

页面右下角的「阅读工具栏」包含「回到顶部 / 设置 / 收藏」三个按钮。设置面板提供小/中/大三个字号和夜间模式开关，结果通过 `common.saveReadingSettings` 持久化；收藏按钮先调用 `ensureLogin` 判断是否登录，未登录时弹出确认框并 `wx.switchTab` 跳转到「我的」页；已登录则把当前文章以 `favorite:<id>` 为键写入本地缓存。`onLoad` 时除了读取文章本体，还会取出收藏状态、设置项，并通过 `addHistory` 写入阅读历史。

详情页底部展示同分类的相关新闻，点击后通过 `wx.redirectTo` 跳转到另一篇详情，避免页面栈过深。

### 5. 实现「我的」页与微信授权登录

「我的」页 `pages/my/my` 顶部是账号卡片：未登录时显示「海」字占位头像和「使用微信登录」按钮；已登录时显示真实头像、昵称、收藏数 / 阅读历史数，并提供「编辑资料 / 退出登录」入口。

登录流程分两种情况：本地已有保存的头像和昵称时，弹出确认框让用户一键恢复；首次使用则弹窗询问是否使用微信资料，确认后弹出 `profile-editor` 编辑器。用户点击编辑器的头像选择按钮（`open-type="chooseAvatar"`）触发 `bindchooseavatar`，把临时路径 `wx.saveFile` 保存到本地，再输入昵称后调 `saveProfile` 把 `{ avatarUrl, nickName }` 写入 `user-profile` 键，并调用 `startUserSession` 写入登录态：

```javascript
saveProfile() {
  const nickName = this.data.draftNickName.trim()
  const avatarUrl = this.data.draftAvatarUrl
  if (!avatarUrl) return wx.showToast({ title: '请选择头像', icon: 'none' })
  if (!nickName) return wx.showToast({ title: '请输入昵称', icon: 'none' })
  common.saveUserProfile({ avatarUrl, nickName })
  if (this.data.profileEditorMode === 'login') {
    common.startUserSession()
    this.setData({ ...{ avatarUrl, nickName }, isLogin: true, showProfileEditor: false })
    this.refreshReadingData()
    wx.showToast({ title: '登录成功' })
  }
}
```

退出登录只清掉 `user-session` 登录态，保留头像昵称和阅读数据，下次再点登录可以直接恢复。下方 `reading-section` 通过 `switchView` 在「收藏 / 历史」两个 tab 间切换；收藏列表支持多选管理（点击「管理收藏」进入编辑态，多选后批量取消收藏），历史列表支持一键清空。

### 6. 编译运行

完成后保存全部文件，微信开发者工具点击「编译」即可预览。模拟器中首页正确显示轮播、分类、搜索、日期筛选与新闻列表；点击任意一条新闻进入详情页，滚动正文时顶部进度条随之变化；点击右下角「设置」可切换字号与夜间模式，「收藏」按钮会要求先登录；切到「我的」页点击微信登录、设置头像和昵称后，可以正常看到收藏数与历史数；退出登录后再次点击登录，会自动恢复之前的资料。整个流程覆盖了首页、详情、个人中心三个页面的主要交互。

![海大新闻主页](/images/exp3/exp3-1-home.png)

![个人页面](/images/exp3/exp3-2-my.png)

![可进行收藏和字号大小调节](/images/exp3/exp3-3-detail-reader.png)

![可以对个人资料进行编辑](/images/exp3/exp3-4-profile-editor.png)

## 二、问题总结与体会

实验过程中遇到的第一个问题是自定义 tabBar 的高亮不同步。一开始两个 tab 页切换之后，底部图标的高亮状态没有跟着切。原因是自定义 tabBar 是一个独立的 `Component`，页面切换时不会自动更新 `selected` 字段。后来在 `pages/index/index` 和 `pages/my/my` 的 `onShow` 生命周期里通过 `this.getTabBar().setData({ selected: 0/1 })` 主动同步状态，切换时高亮才恢复正常。这让我意识到，自定义 tabBar 不会监听 `wx.switchTab` 的切换，必须由各页面自行在 `onShow` 中更新。

第二个问题是详情页阅读进度的计算。最初直接把 `scrollTop / 页高` 当作进度，结果在文章很短时进度条会瞬间到 100%，体验很差。后来改为 `scrollTop / (文章高度 - 视口高度)`，再用 `Math.min(100, ...)` 截断到 100 以内；并对 `scrollable` 做 `Math.max(..., 1)` 处理，避免文章短于视口时除以 0 出现 NaN。`onPageScroll` 中使用 `wx.createSelectorQuery` 在每次滚动时同步测量元素高度，所以要避免在回调里做太重的操作。

第三个问题是「先登录再收藏」的状态判断。收藏功能直接读不到当前是否处于登录态，需要结合 `user-profile` 和 `user-session` 两个本地键进行判断。`isUserLoggedIn` 优先读 session；若 session 字段不存在但已有保存的资料，则视为兼容旧版本的「已登录」并自动补写 session，从而避免老用户升级后突然变成未登录。收藏按钮在未登录时先弹模态框让用户确认跳转 `wx.switchTab` 到「我的」页，等登录完成后再回到详情页继续操作。

通过本次实验，我对小程序的多页面应用有了更完整的认识：自定义 tabBar 让底部栏的视觉设计与原生组件解耦，可以更自由地表达产品风格；本地缓存则是替代后端的轻量方案，通过统一的 `utils/common.js` 把读写逻辑封装在一起，页面只需要关心展示；详情页和「我的」页之间通过登录态和收藏数据形成耦合，让我体会到「数据来源单一、读写分离」在小程序这种无后端场景下的重要性。

---
title: 实验6：微信小程序云开发
published: 2026-09-08
description: 使用微信小程序云开发实现「图享社区」图片分享应用：云数据库、云存储、云函数三件套，支持双通道登录、多账号数据隔离、多图上传、收藏与分享，全程无需自建后端。
image: /images/exp6/exp6-1-homepage.png
tags: [微信小程序, 云开发, 移动软件开发, 实验记录]
category: 移动软件开发
draft: false
lang: zh_CN
---

<center>姓名：池晋原  学号：24020007016</center>

| 姓名和学号？         | 池晋原，24020007016                                          |
| -------------------- | ------------------------------------------------------------ |
| 本实验属于哪门课程？ | 中国海洋大学26夏《移动软件开发》                             |
| 实验名称？           | 实验6：微信小程序云开发                                      |
| 博客地址？           | https://www.half-awake.top/                                  |
| 代码仓库地址？       | https://github.com/HalfAwake-destiny/Mobile-software-development |

## 一、实验内容

本次实验的主要内容是使用微信小程序云开发（CloudBase）实现一款「图享社区」图片分享应用。应用不依赖任何自建后端，全部数据能力由云开发三件套提供：**云数据库**（photos / users / favorites 三个集合）、**云存储**（photos / avatars 两个目录）和**云函数**（获取 openid）。应用共七个页面：社区首页（照片瀑布流）、上传页（多图上传 + 历史记录）、图片详情页（下载 / 收藏 / 分享 / 删除）、个人中心（我的主页）、他人主页、手机号登录页和注册页。核心功能包括微信授权登录与手机号密码登录双通道、多用户数据隔离、照片的增删查、收藏管理、转发分享。通过本次实验，掌握了云开发环境的开通与配置、`wx.cloud.*` 系列 API 的使用、云数据库权限规则的设计、`cloud://` fileID 与临时链接的转换、以及自定义组件的封装。

### 1. 搭建云开发工程结构与环境配置

在微信开发者工具中创建云开发模板工程，`project.config.json` 中通过两个字段划分前后端边界：`miniprogramRoot: "miniprogram/"` 指向小程序端代码，`cloudfunctionRoot: "cloudfunctions/"` 指向云函数代码。在开发者工具中开通云开发环境（环境 ID `cloud1-d6gkat5lc7d387014`），并创建三个集合：photos（照片）、users（用户资料）、favorites（收藏）。

`app.json` 注册全部七个页面并配置全局窗口样式，导航栏标题为「图享社区」：

```json
{
  "pages": [
    "pages/index/index",
    "pages/homepage/homepage",
    "pages/favorites/favorites",
    "pages/login/login",
    "pages/register/register",
    "pages/detail/detail",
    "pages/add/add"
  ],
  "window": {
    "navigationBarBackgroundColor": "#FFFFFF",
    "navigationBarTitleText": "图享社区"
  },
  "lazyCodeLoading": "requiredComponents"
}
```

`app.js` 在 `onLaunch` 中完成云能力初始化，环境 ID 集中放在 `globalData` 里，同时维护三个全局登录态字段：`openid`（微信/设备级身份）、`accountId`（当前登录账号 = users 集合记录的 `_id`）、`userInfo`（当前账号的资料）。`ensureLogin` 先通过云函数拿 openid，再顺带把云端「我的资料」拉下来缓存：

```javascript
onLaunch() {
  wx.cloud.init({
    env: this.globalData.env,
    traceUser: true,
  });
  this.ensureLogin();
}
```

全局样式 `app.wxss` 以 CSS 变量定义设计 tokens（主色 `--ha-primary: #45a7c8`、强调色、圆角、阴影等），并提供 `.ha-card` 通用白卡片样式，各页面统一引用，保证视觉风格一致。

### 2. 云函数与数据访问层 utils/api.js

openid 是用户在小程序里的唯一身份标识，前端拿不到，只能在云函数里通过 `cloud.getWXContext()` 获取——这是本项目中唯一必须走服务端的能力。云函数 `quickstartFunctions` 按 `event.type` 分发：

```javascript
const getOpenId = async () => {
  const wxContext = cloud.getWXContext();
  return { openid: wxContext.OPENID, appid: wxContext.APPID, unionid: wxContext.UNIONID };
};

exports.main = async (event) => {
  switch (event.type) {
    case "getOpenId":
      return await getOpenId();
    default:
      return { errMsg: "unknown type: " + event.type };
  }
};
```

前端所有数据库 / 存储操作集中在 `utils/api.js`，全部走 `wx.cloud.*`，不依赖任何自建后端，共封装二十余个方法：照片的增删查（`listPhotos` / `listMyPhotos` / `getPhoto` / `addPhoto` / `deletePhoto`）、收藏的增删查（`isFavorited` / `addFavorite` / `removeFavorite` / `listMyFavorites`）、用户资料的读写（`getMyProfile` / `saveMyProfile` / `getProfileById`）、存储上传下载（`uploadPhoto` / `uploadAvatar` / `resolveTempUrls`）以及登录注册（`loginByPhone` / `registerByPhone`）。

**云存储上传**用 `wx.cloud.uploadFile`，`cloudPath` 按目录 + 时间戳 + 随机数生成，避免同名覆盖：

```javascript
function uploadFile(filePath, folder) {
  const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
  const cloudPath = `${folder}/${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
  return wx.cloud.uploadFile({ cloudPath, filePath }).then((res) => res.fileID);
}
```

**fileID 转临时链接**：数据库里存的是 `cloud://` 开头的 fileID（永久有效但 `previewImage` / `saveImageToPhotosAlbum` 等 API 不通用），展示和下载前需要通过 `wx.cloud.getTempFileURL` 批量换成 https 临时链接。`resolveTempUrls` 同时处理照片（`photoUrl → tempUrl`）和头像（`avatarUrl → avatarTempUrl`）两类字段，列表页只需在渲染前调用一次。

### 3. 登录与注册：双通道身份体系

登录页提供两种方式。**微信授权登录**使用基础库的 `button open-type="chooseAvatar"` + `input type="nickname"` 组件拉起微信头像昵称资料，用户确认后将头像上传到云存储 avatars/ 目录，并通过 `saveMyProfile` 把资料写入 users 集合（该集合权限为「所有人可读」，因此别人才能看你主页）。**手机号密码登录**在 users 集合中按 `phone + password` 查询匹配记录（实验环境明文存储，生产环境应改为 SHA-256 或 bcrypt），校验通过后将该记录的 `_id` 记入 `globalData.accountId`。

注册页 `register.js` 做完整的表单校验（手机号 `/^1\d{10}$/`、密码至少 6 位、两次密码一致），`registerByPhone` 先查询该手机号是否已注册，不存在则向 users 集合新增一条记录并返回其 `_id`：

```javascript
registerByPhone({ phone, password, nickName }).then((user) => {
  // 注册成功 = 已写入 users 集合，accountId 必须指向新账号的记录
  app.globalData.accountId = user._id;
  app.globalData.userInfo = { nickName: user.nickName || "", loginMethod: "phone" };
});
```

这里的关键设计是**区分 openid 与 accountId 两级身份**：openid 是微信/设备级的，同一台设备换手机号登录 openid 不变；而「我的照片」「我的收藏」要按登录账号隔离，就必须用 accountId（users 记录 `_id`），否则换账号后旧账号的照片还会出现。

### 4. 社区首页与 photo-card 自定义组件

首页 `index.js` 在每次 `onShow` 时刷新数据：先 `ensureLogin`，再调用 `listPhotos` 按 `createdAt`（毫秒时间戳）倒序取前 50 条照片，`resolveTempUrls` 批量转换临时链接后渲染。支持下拉刷新（`onPullDownRefresh`），空列表时显示引导文案。

照片卡片封装为自定义组件 `photo-card`，通过 `properties` 接收数据、`triggerEvent` 向外冒泡事件：

```javascript
Component({
  options: {
    multipleSlots: true,
    // 允许 app.wxss 里的 .ha-card 全局卡片样式作用到组件内部
    styleIsolation: "apply-shared",
  },
  properties: {
    photo: { type: Object, value: {} },
    showUploader: { type: Boolean, value: true },
  },
  methods: {
    onTapImage() { this.triggerEvent("tapimage", { id: this.data.photo._id }); },
    onTapAvatar() {
      this.triggerEvent("tapavatar", {
        openid: this.data.photo._openid,
        ownerId: this.data.photo.ownerId,
      });
    },
  },
});
```

组件结构分三层：页眉（头像 + 昵称 + 所在地）、主体（`widthFix` 模式的照片，点击进详情）、页脚（上传日期）。`styleIsolation: "apply-shared"` 让全局卡片样式能穿透进组件，省去重复定义。

首页底部是浮动按钮组：左侧「我的」按钮显示当前登录用户的头像和昵称，点击进个人中心；右侧「+ 上传」按钮跳转上传页。点击卡片头像时，页面向 `homepage` 传递 `ownerId` 参数（旧数据没有该字段时退回按 `openid` 区分），点自己则进个人中心、点别人进 TA 的主页。

### 5. 上传页：多图上传与历史记录

上传页 `add.js` 顶部显示登录状态条（未登录则提供「去登录」入口），中间是大号上传热区，底部是「已上传图片历史记录」宫格。点击上传热区触发 `wx.chooseImage` 选择最多 9 张图，随后对每张图并行执行「上传云存储 → 写数据库记录」两步：

```javascript
uploadPhoto(filePath)
  .then((fileID) => addPhoto({
    photoUrl: fileID,
    ownerId: app.globalData.accountId,
    avatarUrl: u.avatarUrl || "",      // 存 cloud:// fileID，临时链接会过期
    nickName: u.nickName || "匿名",
    addDate: formatDate(new Date()),
    createdAt: Date.now(),             // 毫秒时间戳，用于排序
  }))
```

多张上传用 `Promise.allSettled` 汇总结果，期间通过 `wx.showLoading` 实时显示进度（「上传中 2/3」），完成后按成功/失败数量分别提示并刷新历史宫格。`addPhoto` 写库时云开发会自动向记录写入 `_openid` 字段，配合集合「仅创建者可写」的权限规则，天然实现了「只有上传者本人能修改/删除自己的照片」。历史宫格中的图片点击调用 `wx.previewImage` 全屏预览。

### 6. 详情页：下载、收藏、分享与权限删除

详情页从路由参数取照片 `_id`，`getPhoto` 单条查询后展示大图、上传者信息和日期，导航栏标题动态设为「昵称的照片」。操作按钮组包含五项：

- **下载到本地**：`wx.cloud.downloadFile` 按 fileID 拉取云存储原图，再 `wx.saveImageToPhotosAlbum` 存入相册；用户拒绝授权时弹出引导弹窗。
- **收藏 / 取消收藏**：写 favorites 集合（权限「仅创建者可读写」，记录结构 `{ ownerId, photoId, addDate, createdAt }`），按钮随 `isFav` 状态在「☆ 收藏」和「★ 已收藏」间切换，并加了 `favToggling` 锁防止连点重复提交。
- **分享给好友**：`button open-type="share"` 触发，`onShareAppMessage` 返回自定义标题、直达路径（`/pages/detail/detail?id=xxx`）和封面图。
- **全屏预览**：`wx.previewImage`。
- **删除照片**：仅当 `photo.ownerId === globalData.accountId`（即本人）时渲染此按钮。点击后二次确认，先删数据库记录、再删云存储文件避免留下孤儿文件：

```javascript
deletePhoto(id) {
  const tasks = [db().collection(COLLECTION).doc(id).remove()];
  if (fileID) {
    tasks.push(wx.cloud.deleteFile({ fileList: [fileID] })
      .catch((err) => console.warn("云存储文件删除失败（记录已删）", err)));
  }
  return Promise.all(tasks);
}
```

客户端 `remove` 受集合权限约束——「仅创建者可读写」规则下删除 `_openid` 不是自己的记录会直接报 permission denied，数据库权限本身就是「上传者才能删」的兜底保证，前端隐藏按钮只是交互层的体验优化。

### 7. 个人中心、他人主页与收藏管理

`homepage` 页面用一份代码支持两种模式：**不带参数进入**是「我的个人中心」（蓝色渐变头图 + 头像昵称卡片 + 照片数 / 登录方式统计 + 我的收藏 / 编辑资料 / 退出登录三个操作按钮 + 我的照片宫格）；**带 `?ownerId=` 或 `?openid=` 参数进入**则是「TA 的主页」，隐藏所有管理操作，只展示对方资料和照片。查别人资料时优先用 `getProfileById`（精确到账号，同一设备多账号也能区分），旧数据才退回 `getProfileByOpenid`。

资料编辑弹窗复用微信头像昵称组件，保存时若本地头像是临时路径则先上传云存储，再 `saveMyProfile` 更新 users 集合并调用 `app.refreshProfile()` 刷新全局缓存。退出登录只清空 `globalData` 中的登录态，云端资料保留，下次登录继续使用。

收藏页 `favorites.js` 展示当前账号收藏的照片。由于云数据库没有 join，采用**两段查询**：先按 `ownerId` 倒序取收藏记录记住顺序，再用 `_.in(ids)` 批量取照片详情、以字典映射还原顺序；已被作者删除的照片在映射时取不到，用 `.filter(Boolean)` 自动跳过。每条收藏提供二次确认后的取消收藏操作。

### 8. 编译运行

在微信开发者工具中填入环境 ID、部署云函数、创建三个集合并配置好权限后编译运行。启动后首页正确显示「图享社区」欢迎条和照片卡片流，卡片页眉展示上传者头像、昵称与所在地，页脚显示上传日期；右上角浮动按钮组显示我的头像与「+ 上传」入口。进入个人中心，头部统计显示「3 张我的照片、微信登录」，下方宫格列出我上传的全部照片；点击他人头像进入「TA 的主页」，只展示对方资料和 TA 的 1 张照片，没有任何管理按钮，多用户隔离生效。

<img src="/images/exp6/exp6-1-homepage.png" width="300" alt="1.主页"/>

<img src="/images/exp6/exp6-2-profile.png" width="300" alt="2.个人页面"/>

<img src="/images/exp6/exp6-3-other-profile.png" width="300" alt="3.查看他人主页"/>

## 二、问题总结与体会

实验过程中遇到的第一个问题是**多账号数据隔离的口径问题**。最初的版本里「我的照片」按 `_openid` 过滤，测试时发现同一台模拟器上先用微信授权登录传了照片，再退出换成手机号账号登录，旧账号的照片依然出现在「我的照片」里——因为 openid 是设备级身份，同一台设备无论怎么换手机号登录 openid 都不变。解决方法是引入 accountId（users 集合记录的 `_id`）作为账号级身份：照片记录写入时同时带上 `ownerId` 和云开发自动写入的 `_openid`，前者用于「我的照片 / TA 的照片」的归属查询和「是否本人」判断，后者仅用于数据库权限（仅创建者可删改）。这让我理解了云开发默认权限模型的边界——它只能隔离到 openid 粒度，业务需要更细的账号体系时必须自己补一层。

第二个问题是 **`cloud://` fileID 与临时链接的时效性**。一开始把头像直接以 `wx.cloud.getTempFileURL` 换来的 https 临时链接存进了数据库，第二天再打开所有头像全部失效——临时链接有时效，不能作为持久数据存储。正确做法是数据库里只存 fileID，每次展示前再批量换临时链接。为此封装了 `resolveTempUrls`：收集列表中所有 `photoUrl` / `avatarUrl` 的 fileID，一次 `getTempFileURL` 批量转换后按映射表回填，避免逐条调用造成的请求风暴。另外详情页的下载必须用 `wx.cloud.downloadFile` 按 fileID 直接拉取，而不能拿临时链接去下载，两者能力边界不同。

第三个问题是**云数据库没有 join，收藏列表需要两段查询并处理数据一致性**。favorites 集合里只有 `photoId` 引用，取收藏列表要先查收藏记录、再按 `_id in (...)` 批量取照片详情。第一版直接按下标对齐两个结果集，结果一旦有照片被作者删除，`get` 结果数量少于收藏记录数量，后面的收藏全部错位。改成用字典（`_id → photo`）映射还原顺序后彻底解决，顺带用 `.filter(Boolean)` 把已删除照片自动剔除。取消收藏时也遇到权限问题：favorites 集合设为「仅创建者可读写」后，`where(...).remove()` 只能删自己的收藏记录，这恰好就是产品需要的行为——云开发的权限模型在正确的配置下可以替前端省掉大量防御代码。

通过本次实验，我完整体验了微信云开发「前端一站式」的开发模式：不需要买服务器、写后端接口、配 Nginx，`wx.cloud.database()` 和 `wx.cloud.uploadFile` 直接从小程序端操作数据库和存储，openid 这种敏感身份由云函数代取，数据库权限规则从数据层面兜住了「只能删自己的东西」这类安全需求，开发效率相比传统前后端分离方案有质的提升。最大的体会是**权限规则和安全边界要前置设计**——三个集合分别该用「所有人可读，仅创建者可写」还是「仅创建者可读写」，直接决定了照片能不能被社区看到、收藏会不会被别人偷走，这些决策做好后前端代码反而非常薄。此外，自定义组件（`photo-card` + `triggerEvent` 事件冒泡 + `apply-shared` 样式隔离）的封装让首页、主页、收藏页三处照片列表复用同一套卡片，切身体会到组件化在多页面小程序中的价值。

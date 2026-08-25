---
title: 实验1：第一个微信小程序
published: 2026-08-25
description: 记录微信开发者工具的安装与第一个 Hello World 小程序的创建过程，含按钮交互实现与踩坑总结。
image: /images/exp1/exp1-3-helloworld.png
tags: [微信小程序, 移动软件开发, 实验记录]
category: 移动软件开发
draft: false
lang: zh_CN
---

<center>姓名：池晋原  学号：24020007016</center>

| 姓名和学号？         | 池晋原，24020007016                                          |
| -------------------- | ------------------------------------------------------------ |
| 本实验属于哪门课程？ | 中国海洋大学26夏《移动软件开发》                             |
| 实验名称？           | 实验1：第一个微信小程序                                      |
| 博客地址？           | https://www.half-awake.top/                                  |
| 代码仓库地址？       | https://github.com/HalfAwake-destiny/Mobile-software-development |

## 一、实验内容

本次实验的主要内容是安装微信开发者工具，创建第一个微信小程序项目，并完成一个简单的 Hello World 小程序。程序能够显示一张本地图片和“Hello World”文字，单击按钮后，文字会变为“你好，微信小程序！”。通过本次实验，初步了解了 WXML、WXSS 和 JavaScript 文件在微信小程序中的作用。

### 1. 安装微信开发者工具

首先进入微信官方开发文档中的开发者工具下载页面，根据电脑的操作系统选择最新稳定版。本次实验使用的是微信开发者工具 Stable 2.02.2608040。下载完成后运行安装程序，按照提示完成安装。

![微信开发者工具稳定版下载页面](/images/exp1/exp1-1-install.png)

### 2. 创建微信小程序项目

打开微信开发者工具，选择“小程序”并新建项目。项目名称设置为“小程序测试1号”，选择准备好的本地目录并填写 AppID。后端服务选择“不使用云服务”，开发模式选择“小程序”，初始化方式选择“模板”，模板选择“不使用模板”。完成配置后，单击“创建”进入项目。

![创建微信小程序项目](/images/exp1/exp1-2-create.png)

创建完成后，项目中主要包含以下文件：

- `app.js`：小程序的全局逻辑文件；
- `app.json`：小程序的全局配置文件；
- `app.wxss`：小程序的全局样式文件；
- `pages/index/index.wxml`：首页的页面结构文件；
- `pages/index/index.wxss`：首页的样式文件；
- `pages/index/index.js`：首页的数据和交互逻辑文件；
- `pages/index/index.json`：首页的配置文件。

### 3. 编写页面结构

在 `pages/index/index.wxml` 中编写首页结构，添加图片、文本和按钮。`{{message}}` 用于显示 JavaScript 中定义的数据，`bindtap="changeText"` 用于绑定按钮的点击事件。

```xml
<image
  class="first-image"
  mode="widthFix"
  src="../../image/first.png"
></image>

<view class="container">
  <text class="message">{{message}}</text>
  <button class="action-button" bindtap="changeText">点击我</button>
</view>
```

### 4. 设置页面样式

在 `pages/index/index.wxss` 中设置图片、文字和按钮的样式。图片宽度设置为页面宽度的 100%，页面主体使用 Flex 布局，使文字和按钮纵向排列并居中显示。

```css
.first-image {
  display: block;
  width: 100%;
}

.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 32rpx;
  box-sizing: border-box;
}

.message {
  font-size: 36rpx;
  line-height: 1.5;
  color: #1f2329;
}

.action-button {
  width: 100%;
  max-width: 560rpx;
  margin-top: 40rpx;
  color: #ffffff;
  background-color: #07c160;
}

.action-button::after {
  border: none;
}
```

### 5. 实现按钮交互

在 `pages/index/index.js` 中定义页面数据和按钮事件。页面加载后，`message` 的初始值为“Hello World”。单击按钮时调用 `changeText` 方法，再通过 `setData` 将 `message` 修改为“你好，微信小程序！”，页面中的文字会随数据一起更新。

```javascript
Page({
  data: {
    message: "Hello World"
  },

  changeText() {
    this.setData({
      message: "你好，微信小程序！"
    })
  }
})
```

### 6. 编译运行

保存代码后，在微信开发者工具中重新编译。模拟器能够正常显示本地图片、“Hello World”文字和绿色按钮。单击“点击我”按钮后，页面文字变为“你好，微信小程序！”，说明按钮事件绑定和页面数据更新功能正常。

![Hello World小程序运行结果](/images/exp1/exp1-3-helloworld.png)

![点击后文字改变](/images/exp1/exp1-4-clicked.png)

## 二、问题总结与体会

实验过程中遇到的第一个问题是本地图片不能正常显示。最初使用的图片扩展名为 `.jfif`，虽然它本质上属于 JPEG 图片，但微信小程序对该扩展名的识别不稳定。后来将图片转换为 `.png` 格式，并检查图片路径与实际目录是否一致，图片便可以正常加载。

第二个问题是页面样式没有完全生效。在 WXSS 中虽然定义了 `.first-image`、`.message` 和 `.action-button`，但是最初没有在 WXML 的对应元素上添加 `class` 属性，因此图片仍然使用默认大小，按钮也没有显示绿色背景。为图片、文字和按钮补充对应的类名后，样式正常生效。这让我认识到 WXML 中的类名必须与 WXSS 中的选择器保持一致。

第三个问题是全局样式和页面样式发生了叠加。`app.wxss` 和 `index.wxss` 曾经同时定义 `.container`，全局样式中的高度、内边距和对齐方式影响了首页布局，导致部分内容的位置不符合预期。后来简化全局样式，只在页面 WXSS 中设置具体布局，解决了样式冲突问题。

通过本次实验，我掌握了微信小程序项目的基本创建和运行方法，并初步理解了 WXML、WXSS、JavaScript 和 JSON 文件的分工。WXML 负责组织页面结构，WXSS 负责控制页面外观，JavaScript 负责保存数据和处理用户操作，JSON 用于完成项目和页面配置。按钮文字切换功能还让我了解了小程序的数据绑定机制：页面使用 `{{message}}` 显示数据，事件函数通过 `setData` 修改数据后，界面会自动更新。


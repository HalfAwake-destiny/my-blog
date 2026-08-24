# 半醒观测站

在清醒与幻想之间，记录沿途的微光。

这是半醒观测站的博客源码，基于 Mizuki 6.1.0、Astro 5、Svelte 5 和 Tailwind CSS 3 重构。站点使用单列文章流，保留静态搜索、Markdown 扩展、KaTeX、Mermaid、PhotoSwipe、RSS/Atom、明暗模式和本地音乐播放器。

## 本地开发

环境要求：Node.js 22、pnpm 9.14.4。

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

创建文章：

```powershell
corepack pnpm new-post article-name
```

发布前检查：

```powershell
corepack pnpm check
corepack pnpm build
```

## 配置

站点配置位于 `src/config/`：

- `site.ts`：名称、语言、SEO 和横幅
- `navigation.ts`：主导航
- `appearance.ts`：侧栏、代码主题和许可协议
- `profile.ts`：头像、简介和个人链接
- `music.ts`：本地曲目列表
- `features.ts`：功能开关

部署到 EdgeOne Pages 时使用 Node.js 22、pnpm 9.14.4，构建命令为 `pnpm build`，输出目录为 `dist`。正式域名通过 `SITE_URL` 环境变量传入。

import type { SiteConfig } from "../types/config";

export const siteConfig: SiteConfig = {
	title: "半醒观测站",
	subtitle: "在清醒与幻想之间，记录沿途的微光。",
	keywords: ["半醒观测站", "个人博客", "Astro", "随笔", "观察记录"],
	lang: "zh_CN",
	themeColor: { hue: 200, fixed: true },
	featurePages: {
		anime: false,
		diary: false,
		friends: false,
		projects: false,
		skills: false,
		timeline: false,
		albums: false,
	},
	postListLayout: { defaultMode: "list", allowSwitch: false },
	navbarTitle: { text: "半醒观测站" },
	banner: {
		enable: true,
		src: "assets/images/halfawake/banner.webp",
		position: "center",
		carousel: { enable: false, interval: 8 },
		waves: { enable: true, performanceMode: true, mobileDisable: false },
		imageApi: { enable: false, url: "" },
		homeText: {
			enable: true,
			title: "半醒观测站",
			subtitle: [
				"在清醒与幻想之间，记录沿途的微光",
				"观察世界，也观察自己",
				"偶尔清醒，长期做梦",
				"把稍纵即逝的念头留在这里",
			],
			typewriter: { enable: true, speed: 75, deleteSpeed: 35, pauseTime: 2800 },
		},
		credit: { enable: false, text: "原创视觉", url: "" },
		navbar: { transparentMode: "semifull" },
	},
	toc: { enable: true, depth: 3 },
	generateOgImages: false,
	favicon: [
		{ src: "/favicon/halfawake-32.png", sizes: "32x32" },
		{ src: "/favicon/halfawake-192.png", sizes: "192x192" },
	],
	font: {
		zenMaruGothic: { enable: false },
		hanalei: { enable: false },
	},
	showLastModified: false,
};

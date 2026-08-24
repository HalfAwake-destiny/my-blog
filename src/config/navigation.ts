import type { NavBarConfig } from "../types/config";

export const navBarConfig: NavBarConfig = {
	links: [
		{ name: "首页", url: "/", icon: "material-symbols:home-outline-rounded" },
		{ name: "文章", url: "/posts/", icon: "material-symbols:article-outline-rounded" },
		{ name: "归档", url: "/archive/", icon: "material-symbols:archive-outline-rounded" },
		{ name: "标签", url: "/tags/", icon: "material-symbols:sell-outline" },
		{ name: "关于", url: "/about/", icon: "material-symbols:person-outline-rounded" },
	],
};

import type {
	ExpressiveCodeConfig,
	FooterConfig,
	LicenseConfig,
	SidebarLayoutConfig,
} from "../types/config";

export const expressiveCodeConfig: ExpressiveCodeConfig = { theme: "github-dark" };

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const footerConfig: FooterConfig = { enable: false };

export const sidebarLayoutConfig: SidebarLayoutConfig = {
	enable: true,
	position: "left",
	components: [
		{ type: "profile", enable: true, order: 1, position: "top" },
		{ type: "categories", enable: true, order: 2, position: "sticky" },
		{ type: "tags", enable: true, order: 3, position: "sticky", responsive: { collapseThreshold: 18 } },
	],
	defaultAnimation: { enable: true, baseDelay: 0, increment: 50 },
	responsive: {
		breakpoints: { mobile: 768, tablet: 1024, desktop: 1280 },
		layout: { mobile: "hidden", tablet: "drawer", desktop: "sidebar" },
	},
};

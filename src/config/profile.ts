import type { ProfileConfig } from "../types/config";

export const profileConfig: ProfileConfig = {
	avatar: "assets/images/halfawake/avatar.webp",
	name: "Half Awake",
	bio: "在清醒与幻想之间，记录沿途的微光。",
	typewriter: { enable: false, speed: 80 },
	links: [
		{
			name: "GitHub",
			icon: "fa6-brands:github",
			url: "https://github.com/HalfAwake-destiny",
		},
	],
};

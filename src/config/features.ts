import type { CommentConfig } from "../types/config";

export const commentConfig: CommentConfig = { enable: false };

export const featureConfig = {
	search: true,
	music: true,
	ripple: true,
	readingProgress: true,
	articleEncryption: false,
};

export const umamiConfig = {
	enabled: false,
	apiKey: import.meta.env.UMAMI_API_KEY || "",
	baseUrl: "",
	scripts: "",
} as const;

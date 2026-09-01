import { generatedMusicTracks } from "../generated/music-tracks";

export interface MusicTrack {
	id: string;
	title: string;
	artist: string;
	cover?: string;
	audio: string;
	lyric?: string;
	source?: "local" | "netease";
	sourceId?: string;
}

export const musicPlayerConfig = {
	enable: true,
	autoplay: false,
	defaultVolume: 0.65,
	tracks: generatedMusicTracks as readonly MusicTrack[],
	netease: {
		enable: true,
		apiBaseUrl:
			import.meta.env.PUBLIC_NETEASE_API_URL || "http://127.0.0.1:3000",
	},
};

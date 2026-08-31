import { generatedMusicTracks } from "../generated/music-tracks";

export interface MusicTrack {
	id: string;
	title: string;
	artist: string;
	cover?: string;
	audio: string;
	lyric?: string;
}

export const musicPlayerConfig = {
	enable: true,
	autoplay: false,
	defaultVolume: 0.65,
	tracks: generatedMusicTracks as readonly MusicTrack[],
};

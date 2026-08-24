export interface MusicTrack {
	id: string;
	title: string;
	artist: string;
	cover: string;
	url: string;
}

export const musicPlayerConfig = {
	enable: true,
	autoplay: false,
	defaultVolume: 0.65,
	tracks: [] as MusicTrack[],
};

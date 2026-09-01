<script lang="ts">
	import { onMount } from "svelte";
	import { musicPlayerConfig, type MusicTrack } from "../../config";

	let audio: HTMLAudioElement;
	let expanded = false;
	let source: "local" | "netease" = "local";
	let playing = false;
	let currentTime = 0;
	let duration = 0;
	let index = 0;
	let volume = musicPlayerConfig.defaultVolume;
	let playMode: "list" | "one" = "list";
	let playbackError = "";
	let searchKeyword = "";
	let searchResults: MusicTrack[] = [];
	let searching = false;
	let neteaseView: "library" | "search" = "library";
	let selectedNetease: MusicTrack[] = [];
	let neteasePlayRequest = 0;
	let refreshingNetease = false;
	let refreshedSourceId = "";
	let userPlaylists: Array<{ id: number; name: string; coverImgUrl?: string; trackCount: number }> = [];
	let playlistTracks: MusicTrack[] = [];
	let selectedPlaylistName = "";
	let selectedPlaylistId = "";
	let playlistsLoading = false;
	const tracks: readonly MusicTrack[] = musicPlayerConfig.tracks;
	$: track = tracks[index];
	$: activeTracks = source === "local" ? tracks : selectedNetease;
	$: activeTrack = source === "local" ? track : selectedNetease[index];

	function persist() {
		localStorage.setItem("halfawake-music", JSON.stringify({ index, volume, playMode }));
	}

	function loadTrack(nextIndex: number, resume = false, targetTracks: readonly MusicTrack[] = activeTracks) {
		if (!targetTracks.length || !audio) return;
		index = (nextIndex + targetTracks.length) % targetTracks.length;
		audio.src = targetTracks[index].audio;
		playbackError = "";
		audio.load();
		persist();
		broadcastState(targetTracks[index]);
		if (resume) playAudio();
	}

	async function playAudio() {
		if (!audio) return;
		playbackError = "";
		try {
			await audio.play();
		} catch (error) {
			playbackError = error instanceof DOMException && error.name === "NotAllowedError"
				? "浏览器阻止了播放，请再次点击播放按钮。"
				: "音频无法播放，请检查文件格式或刷新页面。";
		}
	}

	function togglePlay() {
		if (!activeTrack || !audio) return;
		if (!audio.src) loadTrack(index);
		playing ? audio.pause() : playAudio();
	}

	function seek(event: Event) {
		if (!audio) return;
		audio.currentTime = Number((event.target as HTMLInputElement).value);
	}

	function setVolume(event: Event) {
		volume = Number((event.target as HTMLInputElement).value);
		if (audio) audio.volume = volume;
		persist();
	}

	function next() { loadTrack(index + 1, playing); }
	function previous() { loadTrack(index - 1, playing); }
	function selectSource(nextSource: "local" | "netease") {
		if (nextSource === source) return;
		audio?.pause();
		source = nextSource;
		index = 0;
		searchResults = [];
		playbackError = "";
		if (source === "local") loadTrack(0, false, tracks);
		else if (selectedNetease.length) loadTrack(0, false, selectedNetease);
		else if (audio) {
			audio.removeAttribute("src");
			audio.load();
			currentTime = 0;
			duration = 0;
			broadcastState();
		}
	}
	async function searchNetease() {
		const keyword = searchKeyword.trim();
		if (!keyword || !musicPlayerConfig.netease.enable) return;
		neteaseView = "search";
		searching = true;
		playbackError = "";
		try {
			const response = await fetch(musicPlayerConfig.netease.apiBaseUrl + "/halfawake/search?keywords=" + encodeURIComponent(keyword));
			if (!response.ok) throw new Error("search");
			const payload = await response.json();
			const songs = payload?.result?.songs ?? payload?.songs ?? [];
			searchResults = songs.slice(0, 12).map(mapNeteaseSong);
		} catch {
			playbackError = "网易云 API 无法连接，请确认 api-enhanced 正在运行。";
		} finally { searching = false; }
	}
	async function playNetease(result: MusicTrack) {
		if (!result.sourceId) return;
		const requestId = ++neteasePlayRequest;
		playbackError = "";
		refreshedSourceId = "";
		try {
			const [urlResponse, lyricResponse] = await Promise.all([
				neteaseRequest("/halfawake/song/url", { id: result.sourceId, level: "standard" }),
				neteaseRequest("/halfawake/lyric", { id: result.sourceId }),
			]);
			const urlPayload = await urlResponse.json();
			const streamResult = urlPayload?.data?.[0];
			const stream = streamResult?.url;
			if (!urlResponse.ok || String(streamResult?.id) !== result.sourceId || !stream) throw new Error("unavailable");
			let lyric = "";
			if (lyricResponse.ok) {
				const lyricPayload = await lyricResponse.json();
				lyric = lyricPayload?.lrc?.lyric || "";
			}
			if (requestId !== neteasePlayRequest) return;
			const resolved = { ...result, audio: stream, lyric: lyric ? "data:text/plain;charset=utf-8," + encodeURIComponent(lyric) : "" };
			selectedNetease = [resolved, ...selectedNetease.filter((item) => item.id !== resolved.id)];
			index = 0;
			source = "netease";
			loadTrack(0, true, selectedNetease);
		} catch {
			if (requestId === neteasePlayRequest) playbackError = "这首歌暂时无法在线播放，可能受版权或 API 权限限制。";
		}
	}
	function mapNeteaseSong(song: any): MusicTrack {
		return {
			id: "netease:" + song.id,
			title: song.name || "未命名歌曲",
			artist: (song.ar || song.artists || []).map((item: any) => item.name).join(" / ") || "未知歌手",
			cover: song.al?.picUrl || song.album?.picUrl,
			audio: "",
			source: "netease",
			sourceId: String(song.id),
		};
	}
	function neteaseRequest(path: string, data: Record<string, unknown> = {}) {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(data)) params.set(key, String(value));
		const query = params.toString();
		return fetch(musicPlayerConfig.netease.apiBaseUrl + path + (query ? `?${query}` : ""));
	}
	async function loadPublicPlaylists() {
		playlistsLoading = true;
		playbackError = "";
		try {
			const response = await neteaseRequest("/halfawake/playlists");
			const payload = await response.json();
			if (!response.ok) throw new Error("playlist");
			userPlaylists = payload?.playlist ?? [];
			if (userPlaylists[0]) await loadPlaylistTracks(userPlaylists[0]);
			else playbackError = "登录账号中没有可读取的歌单。";
		} catch {
			userPlaylists = [];
			playlistTracks = [];
			playbackError = "网易云登录态不可用，请等待站长重新登录。";
		} finally {
			playlistsLoading = false;
		}
	}
	async function loadPlaylistTracks(playlist: { id: number; name: string }) {
		playlistsLoading = true;
		playbackError = "";
		try {
			const response = await neteaseRequest("/halfawake/playlist/tracks", { id: playlist.id, limit: 100 });
			const payload = await response.json();
			if (!response.ok) throw new Error("tracks");
			playlistTracks = (payload?.songs ?? []).map(mapNeteaseSong);
			selectedPlaylistName = playlist.name;
			selectedPlaylistId = String(playlist.id);
		} catch {
			playbackError = "歌单曲目加载失败，请稍后重试。";
		} finally {
			playlistsLoading = false;
		}
	}
	function selectPlaylist(event: Event) {
		const id = Number((event.target as HTMLSelectElement).value);
		const playlist = userPlaylists.find((item) => item.id === id);
		if (playlist) loadPlaylistTracks(playlist);
	}
	async function refreshNeteaseStream() {
		const current = activeTrack;
		if (refreshingNetease || source !== "netease" || !current?.sourceId) return false;
		refreshingNetease = true;
		const resumeAt = currentTime;
		try {
			const response = await neteaseRequest("/halfawake/song/url", { id: current.sourceId, level: "standard" });
			const payload = await response.json();
			const streamResult = payload?.data?.[0];
			const stream = streamResult?.url;
			if (!response.ok || String(streamResult?.id) !== current.sourceId || !stream) return false;
			selectedNetease = selectedNetease.map((item) => item.id === current.id ? { ...item, audio: stream } : item);
			audio.src = stream;
			audio.addEventListener("loadedmetadata", () => {
				audio.currentTime = Math.min(resumeAt, audio.duration || resumeAt);
			}, { once: true });
			audio.load();
			await audio.play();
			return true;
		} catch {
			return false;
		} finally {
			refreshingNetease = false;
		}
	}
	async function handleAudioError() {
		playing = false;
		if (activeTrack?.sourceId && refreshedSourceId !== activeTrack.sourceId) {
			refreshedSourceId = activeTrack.sourceId;
			if (await refreshNeteaseStream()) return;
		}
		playbackError = source === "netease"
			? "网易云播放地址已失效或当前歌曲不可用，请重新选择歌曲。"
			: "音频加载失败，请确认 MP3 文件可以正常播放。";
		broadcastState();
	}
	function toggleMode() { playMode = playMode === "list" ? "one" : "list"; persist(); }
	function formatTime(value: number) {
		if (!Number.isFinite(value)) return "0:00";
		return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
	}

	function broadcastState(trackOverride = activeTrack) {
		window.dispatchEvent(new CustomEvent("halfawake:music-state", { detail: { track: trackOverride, currentTime, duration, playing } }));
	}

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem("halfawake-music") || "{}");
			index = Math.min(Number(saved.index) || 0, Math.max(tracks.length - 1, 0));
			volume = typeof saved.volume === "number" ? saved.volume : musicPlayerConfig.defaultVolume;
			playMode = saved.playMode === "one" ? "one" : "list";
		} catch { /* keep defaults */ }
		audio.volume = volume;
		if (track) loadTrack(index);
		setTimeout(broadcastState, 0);
		const toggle = () => expanded = !expanded;
		window.addEventListener("halfawake:music-toggle", toggle);
		if (musicPlayerConfig.netease.enable) loadPublicPlaylists();
		return () => window.removeEventListener("halfawake:music-toggle", toggle);
	});
</script>

{#if musicPlayerConfig.enable}
	<div class:expanded class="music-player" aria-label="音乐播放器">
		<div class="music-compact ha-ripple">
			<button class="music-open" type="button" on:click={() => expanded = !expanded} aria-label="展开音乐播放器">
			<div class="music-cover">
				{#if activeTrack?.cover}<img src={activeTrack.cover} alt="" />{:else}<span class="music-equalizer" aria-hidden="true"><i></i><i></i><i></i></span>{/if}
			</div>
			<div class="music-summary">
				<strong>{activeTrack?.title || "待添加曲目"}</strong>
				<span>{activeTrack?.artist || (source === "netease" ? "网易云音乐" : "本地音乐")}</span>
			</div>
			</button>
			<button class="music-play" type="button" on:click|stopPropagation={togglePlay} disabled={!activeTrack} aria-label={playing ? "暂停" : "播放"}>
				<span class:pause={playing} class="music-play-shape" aria-hidden="true"></span>
			</button>
		</div>

		{#if expanded}
			<div class="music-panel">
				<div class="music-panel-head">
					<div><strong>音乐</strong><span>{source === "local" ? tracks.length + " 首本地曲目" : "网易云在线"}</span></div>
					<button class="music-close" type="button" on:click={() => expanded = false} aria-label="收起播放器"><span aria-hidden="true"></span></button>
				</div>
					<div class="music-source-tabs" role="tablist" aria-label="音乐来源"><button class:active={source === "local"} type="button" on:click={() => selectSource("local")} role="tab" aria-selected={source === "local"}>本地</button><button class:active={source === "netease"} type="button" on:click={() => selectSource("netease")} role="tab" aria-selected={source === "netease"}>网易云</button></div>
				{#if source === "netease"}
					<div class="netease-view-tabs" role="tablist" aria-label="网易云内容">
						<button class:active={neteaseView === "library"} type="button" on:click={() => neteaseView = "library"} role="tab" aria-selected={neteaseView === "library"}>我的歌单{#if playlistTracks.length}<span>{playlistTracks.length}</span>{/if}</button>
						<button class:active={neteaseView === "search"} type="button" on:click={() => neteaseView = "search"} role="tab" aria-selected={neteaseView === "search"}>搜索歌曲{#if searchResults.length}<span>{searchResults.length}</span>{/if}</button>
					</div>
					<div class="netease-view">
						{#if neteaseView === "library"}
							<div class="netease-account-line"><span>站长的网易云歌单</span><button type="button" on:click={loadPublicPlaylists} disabled={playlistsLoading}>{playlistsLoading ? "同步中" : "同步"}</button></div>
							{#if userPlaylists.length}
								<div class="netease-library">
									<label for="netease-playlist">选择歌单</label>
									<select id="netease-playlist" value={selectedPlaylistId} on:change={selectPlaylist} disabled={playlistsLoading}>
										{#each userPlaylists as playlist}<option value={playlist.id}>{playlist.name} · {playlist.trackCount}</option>{/each}
									</select>
								</div>
							{/if}
							{#if playlistTracks.length}
								<div class="netease-section-title"><span>{selectedPlaylistName}</span><small>{playlistTracks.length} 首</small></div>
								<div class="netease-results">{#each playlistTracks as result}<button type="button" class:current={activeTrack?.id === result.id} on:click={() => playNetease(result)}><span><strong>{result.title}</strong><small>{result.artist}</small></span><b>{activeTrack?.id === result.id && playing ? "播放中" : "播放"}</b></button>{/each}</div>
							{:else if playlistsLoading}
								<p class="netease-login-status">正在读取公开歌单...</p>
							{:else}
								<p class="netease-empty">读取公开歌单后，歌曲会显示在这里。</p>
							{/if}
						{:else}
							<form class="netease-search" on:submit|preventDefault={searchNetease}><input bind:value={searchKeyword} placeholder="歌曲、歌手或专辑" aria-label="搜索网易云歌曲" /><button type="submit" disabled={searching}>{searching ? "搜索中" : "搜索"}</button></form>
							{#if searchResults.length}
								<div class="netease-section-title"><span>搜索结果</span><small>{searchResults.length} 首</small></div>
								<div class="netease-results">{#each searchResults as result}<button type="button" class:current={activeTrack?.id === result.id} on:click={() => playNetease(result)}><span><strong>{result.title}</strong><small>{result.artist}</small></span><b>{activeTrack?.id === result.id && playing ? "播放中" : "播放"}</b></button>{/each}</div>
							{:else if !searching}
								<p class="netease-empty">输入关键词，查找想听的歌曲。</p>
							{/if}
						{/if}
					</div>
				{/if}
				{#if playbackError}<p class="music-error" role="status">{playbackError}</p>{/if}
				{#if activeTrack}
					<div class="music-now"><strong>{activeTrack.title}</strong><span>{activeTrack.artist}</span></div>
					<input class="music-progress" type="range" min="0" max={duration || 0} value={currentTime} on:input={seek} aria-label="播放进度" />
					<div class="music-times"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
					<div class="music-controls">
						<button class="music-repeat" class:one={playMode === "one"} type="button" on:click={toggleMode} aria-label="切换播放模式" title={playMode === "one" ? "单曲循环" : "列表循环"}><span aria-hidden="true">↻</span></button>
						<button class="music-skip previous" type="button" on:click={previous} aria-label="上一首"><span aria-hidden="true"></span></button>
						<button class="primary" type="button" on:click={togglePlay} aria-label={playing ? "暂停" : "播放"}><span class:pause={playing} class="music-play-shape" aria-hidden="true"></span></button>
						<button class="music-skip next" type="button" on:click={next} aria-label="下一首"><span aria-hidden="true"></span></button>
						<span class="volume-control"><span class="music-volume-shape" aria-hidden="true"></span><input type="range" min="0" max="1" step="0.05" value={volume} on:input={setVolume} aria-label="音量" /></span>
					</div>
				{:else if source === "local"}
					<p class="music-empty">将“歌手 - 歌曲.mp3”和同名歌词放入 <code>public/music</code>，启动或构建站点时会自动扫描。</p>
				{/if}
			</div>
		{/if}
	</div>
	<audio bind:this={audio} preload="metadata" on:play={() => { playing = true; playbackError = ""; broadcastState(); }} on:pause={() => { playing = false; broadcastState(); }} on:timeupdate={() => { currentTime = audio.currentTime; broadcastState(); }} on:durationchange={() => { duration = audio.duration || 0; broadcastState(); }} on:error={handleAudioError} on:ended={() => playMode === "one" ? playAudio() : next()}></audio>
{/if}

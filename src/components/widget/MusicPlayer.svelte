<script lang="ts">
	import { onMount } from "svelte";
	import { musicPlayerConfig, type MusicTrack } from "../../config";

	let audio: HTMLAudioElement;
	let expanded = false;
	let source: "local" | "netease" = "local";
	let viewSource: "local" | "netease" = "local";
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
	let showQueue = false;
	let queue: MusicTrack[] = [];
	let neteasePlayRequest = 0;
	let refreshingNetease = false;
	let refreshedSourceId = "";
	let userPlaylists: Array<{ id: number; name: string; coverImgUrl?: string; trackCount: number }> = [];
	let playlistTracks: MusicTrack[] = [];
	let selectedPlaylistName = "";
	let selectedPlaylistId = "";
	let playlistsLoading = false;
	const tracks: readonly MusicTrack[] = musicPlayerConfig.tracks;
	$: activeTrack = queue[index];

	function persist() {
		localStorage.setItem("halfawake-music", JSON.stringify({
			index,
			volume,
			playMode,
			queue: queue.map(({ audio, ...track }) => ({ ...track, audio: track.source === "local" ? audio : "" })),
		}));
	}

	function loadTrack(nextIndex: number, resume = false) {
		if (!queue.length || !audio) return;
		index = (nextIndex + queue.length) % queue.length;
		audio.src = queue[index].audio;
		playbackError = "";
		audio.load();
		persist();
		broadcastState(queue[index]);
		if (resume) playAudio();
	}

	function trackKey(track: MusicTrack) {
		return track.source === "netease" ? `netease:${track.sourceId || track.id}` : `local:${track.id}`;
	}

	function addToQueue(items: MusicTrack[], insertAt?: number) {
		const existing = new Set(queue.map(trackKey));
		const additions = items.filter((item) => {
			const key = trackKey(item);
			if (existing.has(key)) return false;
			existing.add(key);
			return true;
		});
		if (!additions.length) return [];
		if (insertAt === undefined) queue = [...queue, ...additions];
		else queue = [...queue.slice(0, insertAt), ...additions, ...queue.slice(insertAt)];
		persist();
		return additions;
	}

	function removeFromQueue(queueIndex: number) {
		if (queueIndex < 0 || queueIndex >= queue.length) return;
		const wasCurrent = queueIndex === index;
		queue = queue.filter((_, itemIndex) => itemIndex !== queueIndex);
		if (!queue.length) {
			index = 0;
			audio?.pause();
			audio?.removeAttribute("src");
			audio?.load();
			currentTime = 0;
			duration = 0;
		} else if (queueIndex < index) {
			index -= 1;
		} else if (wasCurrent) {
			index = Math.min(index, queue.length - 1);
			activateQueueTrack(index, playing);
		}
		persist();
		broadcastState();
	}

	function clearQueue() {
		queue = [];
		index = 0;
		playing = false;
		audio?.pause();
		audio?.removeAttribute("src");
		audio?.load();
		currentTime = 0;
		duration = 0;
		persist();
		broadcastState();
	}

	function moveQueueItem(from: number, to: number) {
		if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
		const next = [...queue];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		if (index === from) index = to;
		else if (from < index && to >= index) index -= 1;
		else if (from > index && to <= index) index += 1;
		queue = next;
		persist();
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
		if (!audio.src && activeTrack.source === "netease") {
			playNetease(activeTrack);
			return;
		}
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

	function activateQueueTrack(nextIndex: number, resume = false) {
		if (!queue.length) return;
		const targetIndex = (nextIndex + queue.length) % queue.length;
		const target = queue[targetIndex];
		if (target.source === "netease" && !target.audio) {
			index = targetIndex;
			playNetease(target, resume);
			return;
		}
		loadTrack(targetIndex, resume);
	}

	function next() { activateQueueTrack(index + 1, playing); }
	function previous() { activateQueueTrack(index - 1, playing); }
	function selectSource(nextSource: "local" | "netease") {
		// The source may already match while the queue view is open; in that case
		// the tab click still needs to return to the source browser.
		if (nextSource === viewSource && !showQueue) return;
		viewSource = nextSource;
		if (nextSource === source && !showQueue) {
			return;
		}
		if (showQueue) {
			showQueue = false;
			return;
		}
		// Switching the browser tab must not interrupt the independent queue.
		searchResults = [];
		playbackError = "";
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
	async function playNetease(result: MusicTrack, autoplay = true) {
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
			const existingIndex = queue.findIndex((item) => trackKey(item) === trackKey(result));
			if (existingIndex >= 0) {
				queue = queue.map((item, itemIndex) => itemIndex === existingIndex ? resolved : item);
				index = existingIndex;
			} else {
				queue = [...queue, resolved];
				index = queue.length - 1;
			}
			source = "netease";
			viewSource = "netease";
			showQueue = false;
			persist();
			loadTrack(index, autoplay);
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
			queue = queue.map((item) => item.id === current.id ? { ...item, audio: stream } : item);
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
	function queuePlaylist(mode: "replace" | "append") {
		const mapped = playlistTracks.map((track) => ({ ...track }));
		if (mode === "replace") {
			queue = [];
			index = 0;
		}
		addToQueue(mapped);
		if (mode === "replace" && queue[0]) playNetease(queue[0]);
		showQueue = true;
	}

	function addPlaylistTrack(track: MusicTrack, mode: "append" | "next") {
		const insertAt = mode === "next" && queue.length ? index + 1 : undefined;
		addToQueue([track], insertAt);
	}

	function playQueueTrack(queueItemIndex: number) {
		const selected = queue[queueItemIndex];
		if (!selected) return;
		index = queueItemIndex;
		source = selected.source === "netease" ? "netease" : "local";
		viewSource = source;
		activateQueueTrack(index, true);
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
		try {
			const saved = JSON.parse(localStorage.getItem("halfawake-music") || "{}");
			if (Array.isArray(saved.queue)) queue = saved.queue;
		} catch { /* keep defaults */ }
		if (!queue.length) queue = [...tracks];
		index = Math.min(index, Math.max(queue.length - 1, 0));
		if (queue.length) loadTrack(index);
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
					<span>{activeTrack?.artist || (viewSource === "netease" ? "网易云音乐" : "本地音乐")}</span>
			</div>
			</button>
			<button class="music-play" type="button" on:click|stopPropagation={togglePlay} disabled={!activeTrack} aria-label={playing ? "暂停" : "播放"}>
				<span class:pause={playing} class="music-play-shape" aria-hidden="true"></span>
			</button>
		</div>

		{#if expanded}
			<div class="music-panel">
				<div class="music-panel-head">
					<div><strong>音乐</strong><span>{viewSource === "local" ? tracks.length + " 首本地曲目" : "网易云在线"}</span></div>
					<button class="music-close" type="button" on:click={() => expanded = false} aria-label="收起播放器"><span aria-hidden="true"></span></button>
				</div>
					<div class="music-source-tabs" role="tablist" aria-label="音乐来源"><button class:active={viewSource === "local" && !showQueue} type="button" on:click={() => selectSource("local")} role="tab" aria-selected={viewSource === "local" && !showQueue}>本地</button><button class:active={viewSource === "netease" && !showQueue} type="button" on:click={() => selectSource("netease")} role="tab" aria-selected={viewSource === "netease" && !showQueue}>网易云</button><button class:active={showQueue} type="button" on:click={() => showQueue = true} role="tab" aria-selected={showQueue}>当前列表{#if queue.length}<span>{queue.length}</span>{/if}</button></div>
				{#if showQueue}
					<div class="queue-toolbar"><span>当前播放列表</span><button type="button" on:click={clearQueue} disabled={!queue.length}>清空</button></div>
					{#if queue.length}
						<div class="netease-results music-queue-list">{#each queue as result, queueItemIndex}<div class:current={index === queueItemIndex} class="music-queue-item"><button class="music-queue-main" type="button" on:click={() => playQueueTrack(queueItemIndex)}><span><strong>{result.title}</strong><small>{result.artist} · {result.source === "netease" ? "网易云" : "本地"}</small></span><b>{index === queueItemIndex && playing ? "播放中" : "播放"}</b></button><button class="music-queue-remove" type="button" on:click={() => removeFromQueue(queueItemIndex)} aria-label={`移除${result.title}`}>×</button></div>{/each}</div>
					{:else}
						<p class="netease-empty">播放列表为空，请从本地音乐或网易云歌单添加歌曲。</p>
					{/if}
				{:else if viewSource === "netease"}
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
									<div class="netease-playlist-actions"><button type="button" on:click={() => queuePlaylist("replace")} disabled={!playlistTracks.length || playlistsLoading}>立即播放</button><button type="button" on:click={() => queuePlaylist("append")} disabled={!playlistTracks.length || playlistsLoading}>加入列表</button></div>
								</div>
							{/if}
							{#if playlistTracks.length}
								<div class="netease-section-title"><span>{selectedPlaylistName}</span><small>{playlistTracks.length} 首</small></div>
								<div class="netease-results">{#each playlistTracks as result}<div class:current={activeTrack?.id === result.id} class="netease-result-item"><button class="netease-result-main" type="button" on:click={() => playNetease(result)}><span><strong>{result.title}</strong><small>{result.artist}</small></span><b>{activeTrack?.id === result.id && playing ? "播放中" : "播放"}</b></button><button class="netease-result-add" type="button" on:click={() => addPlaylistTrack(result, "append")} aria-label={`将${result.title}加入列表`}>+</button></div>{/each}</div>
							{:else if playlistsLoading}
								<p class="netease-login-status">正在读取公开歌单...</p>
							{:else}
								<p class="netease-empty">读取公开歌单后，歌曲会显示在这里。</p>
							{/if}
						{:else}
							<form class="netease-search" on:submit|preventDefault={searchNetease}><input bind:value={searchKeyword} placeholder="歌曲、歌手或专辑" aria-label="搜索网易云歌曲" /><button type="submit" disabled={searching}>{searching ? "搜索中" : "搜索"}</button></form>
							{#if searchResults.length}
								<div class="netease-section-title"><span>搜索结果</span><small>{searchResults.length} 首</small></div>
								<div class="netease-results">{#each searchResults as result}<div class:current={activeTrack?.id === result.id} class="netease-result-item"><button class="netease-result-main" type="button" on:click={() => playNetease(result)}><span><strong>{result.title}</strong><small>{result.artist}</small></span><b>{activeTrack?.id === result.id && playing ? "播放中" : "播放"}</b></button><button class="netease-result-add" type="button" on:click={() => addPlaylistTrack(result, "next")} aria-label={`将${result.title}安排为下一首`}>↥</button></div>{/each}</div>
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
				{:else if viewSource === "local"}
					{#if queue.filter((item) => item.source === "local").length}
						<div class="netease-section-title"><span>本地曲目</span><small>{queue.filter((item) => item.source === "local").length} 首</small></div>
						<div class="netease-results">{#each queue as result, queueItemIndex}{#if result.source === "local"}<div class:current={activeTrack?.id === result.id} class="netease-result-item"><button class="netease-result-main" type="button" on:click={() => playQueueTrack(queueItemIndex)}><span><strong>{result.title}</strong><small>{result.artist}</small></span><b>{activeTrack?.id === result.id && playing ? "播放中" : "播放"}</b></button></div>{/if}{/each}</div>
					{:else}
						<p class="music-empty">将“歌手 - 歌曲.mp3”和同名歌词放入 <code>public/music</code>，启动或构建站点时会自动扫描。</p>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
	<audio bind:this={audio} preload="metadata" on:play={() => { playing = true; playbackError = ""; broadcastState(); }} on:pause={() => { playing = false; broadcastState(); }} on:timeupdate={() => { currentTime = audio.currentTime; broadcastState(); }} on:durationchange={() => { duration = audio.duration || 0; broadcastState(); }} on:error={handleAudioError} on:ended={() => playMode === "one" ? playAudio() : next()}></audio>
{/if}

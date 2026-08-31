<script lang="ts">
	import { onMount } from "svelte";
	import { musicPlayerConfig, type MusicTrack } from "../../config";

	let audio: HTMLAudioElement;
	let expanded = false;
	let playing = false;
	let currentTime = 0;
	let duration = 0;
	let index = 0;
	let volume = musicPlayerConfig.defaultVolume;
	let playMode: "list" | "one" = "list";
	let playbackError = "";
	const tracks: readonly MusicTrack[] = musicPlayerConfig.tracks;
	$: track = tracks[index];

	function persist() {
		localStorage.setItem("halfawake-music", JSON.stringify({ index, volume, playMode }));
	}

	function loadTrack(nextIndex: number, resume = false) {
		if (!tracks.length || !audio) return;
		index = (nextIndex + tracks.length) % tracks.length;
		audio.src = tracks[index].audio;
		playbackError = "";
		audio.load();
		persist();
		broadcastState(tracks[index]);
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
		if (!track || !audio) return;
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
	function toggleMode() { playMode = playMode === "list" ? "one" : "list"; persist(); }
	function formatTime(value: number) {
		if (!Number.isFinite(value)) return "0:00";
		return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
	}

	function broadcastState(trackOverride = track) {
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
		return () => window.removeEventListener("halfawake:music-toggle", toggle);
	});
</script>

{#if musicPlayerConfig.enable}
	<div class:expanded class="music-player" aria-label="音乐播放器">
		<div class="music-compact ha-ripple">
			<button class="music-open" type="button" on:click={() => expanded = !expanded} aria-label="展开音乐播放器">
			<div class="music-cover">
				{#if track?.cover}<img src={track.cover} alt="" />{:else}<span class="music-equalizer" aria-hidden="true"><i></i><i></i><i></i></span>{/if}
			</div>
			<div class="music-summary">
				<strong>{track?.title || "待添加曲目"}</strong>
				<span>{track?.artist || "本地音乐"}</span>
			</div>
			</button>
			<button class="music-play" type="button" on:click|stopPropagation={togglePlay} disabled={!track} aria-label={playing ? "暂停" : "播放"}>
				<span class:pause={playing} class="music-play-shape" aria-hidden="true"></span>
			</button>
		</div>

		{#if expanded}
			<div class="music-panel">
				<div class="music-panel-head">
					<div><strong>音乐</strong><span>{tracks.length} 首本地曲目</span></div>
					<button class="music-close" type="button" on:click={() => expanded = false} aria-label="收起播放器"><span aria-hidden="true"></span></button>
				</div>
				{#if track}
					<div class="music-now"><strong>{track.title}</strong><span>{track.artist}</span></div>
					<input class="music-progress" type="range" min="0" max={duration || 0} value={currentTime} on:input={seek} aria-label="播放进度" />
					<div class="music-times"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
					{#if playbackError}<p class="music-error" role="status">{playbackError}</p>{/if}
					<div class="music-controls">
						<button class="music-repeat" class:one={playMode === "one"} type="button" on:click={toggleMode} aria-label="切换播放模式" title={playMode === "one" ? "单曲循环" : "列表循环"}><span aria-hidden="true">↻</span></button>
						<button class="music-skip previous" type="button" on:click={previous} aria-label="上一首"><span aria-hidden="true"></span></button>
						<button class="primary" type="button" on:click={togglePlay} aria-label={playing ? "暂停" : "播放"}><span class:pause={playing} class="music-play-shape" aria-hidden="true"></span></button>
						<button class="music-skip next" type="button" on:click={next} aria-label="下一首"><span aria-hidden="true"></span></button>
						<span class="volume-control"><span class="music-volume-shape" aria-hidden="true"></span><input type="range" min="0" max="1" step="0.05" value={volume} on:input={setVolume} aria-label="音量" /></span>
					</div>
				{:else}
					<p class="music-empty">将“歌手 - 歌曲.mp3”和同名歌词放入 <code>public/music</code>，启动或构建站点时会自动扫描。</p>
				{/if}
			</div>
		{/if}
	</div>
	<audio bind:this={audio} preload="metadata" on:play={() => { playing = true; playbackError = ""; broadcastState(); }} on:pause={() => { playing = false; broadcastState(); }} on:timeupdate={() => { currentTime = audio.currentTime; broadcastState(); }} on:durationchange={() => { duration = audio.duration || 0; broadcastState(); }} on:error={() => { playing = false; playbackError = "音频加载失败，请确认 MP3 文件可以正常播放。"; broadcastState(); }} on:ended={() => playMode === "one" ? playAudio() : next()}></audio>
{/if}

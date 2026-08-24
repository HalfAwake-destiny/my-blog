<script lang="ts">
	import Icon from "@iconify/svelte";
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
	const tracks: MusicTrack[] = musicPlayerConfig.tracks;
	$: track = tracks[index];

	function persist() {
		localStorage.setItem("halfawake-music", JSON.stringify({ index, volume, playMode }));
	}

	function loadTrack(nextIndex: number, resume = false) {
		if (!tracks.length || !audio) return;
		index = (nextIndex + tracks.length) % tracks.length;
		audio.src = tracks[index].url;
		audio.load();
		persist();
		if (resume) audio.play().catch(() => undefined);
	}

	function togglePlay() {
		if (!track || !audio) return;
		if (!audio.src) loadTrack(index);
		playing ? audio.pause() : audio.play().catch(() => undefined);
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

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem("halfawake-music") || "{}");
			index = Math.min(Number(saved.index) || 0, Math.max(tracks.length - 1, 0));
			volume = typeof saved.volume === "number" ? saved.volume : musicPlayerConfig.defaultVolume;
			playMode = saved.playMode === "one" ? "one" : "list";
		} catch { /* keep defaults */ }
		audio.volume = volume;
		if (track) loadTrack(index);
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
				{#if track?.cover}<img src={track.cover} alt="" />{:else}<Icon icon="material-symbols:graphic-eq-rounded" />{/if}
			</div>
			<div class="music-summary">
				<strong>{track?.title || "待添加曲目"}</strong>
				<span>{track?.artist || "本地音乐"}</span>
			</div>
			</button>
			<button class="music-play" type="button" on:click|stopPropagation={togglePlay} disabled={!track} aria-label={playing ? "暂停" : "播放"}>
				<Icon icon={playing ? "material-symbols:pause-rounded" : "material-symbols:play-arrow-rounded"} />
			</button>
		</div>

		{#if expanded}
			<div class="music-panel">
				<div class="music-panel-head">
					<div><strong>音乐</strong><span>{tracks.length} 首本地曲目</span></div>
					<button type="button" on:click={() => expanded = false} aria-label="收起播放器"><Icon icon="material-symbols:close-rounded" /></button>
				</div>
				{#if track}
					<div class="music-now"><strong>{track.title}</strong><span>{track.artist}</span></div>
					<input class="music-progress" type="range" min="0" max={duration || 0} value={currentTime} on:input={seek} aria-label="播放进度" />
					<div class="music-times"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
					<div class="music-controls">
						<button type="button" on:click={toggleMode} aria-label="切换播放模式" title={playMode === "one" ? "单曲循环" : "列表循环"}><Icon icon={playMode === "one" ? "material-symbols:repeat-one-rounded" : "material-symbols:repeat-rounded"} /></button>
						<button type="button" on:click={previous} aria-label="上一首"><Icon icon="material-symbols:skip-previous-rounded" /></button>
						<button class="primary" type="button" on:click={togglePlay} aria-label={playing ? "暂停" : "播放"}><Icon icon={playing ? "material-symbols:pause-rounded" : "material-symbols:play-arrow-rounded"} /></button>
						<button type="button" on:click={next} aria-label="下一首"><Icon icon="material-symbols:skip-next-rounded" /></button>
						<span class="volume-control"><Icon icon="material-symbols:volume-up-rounded" /><input type="range" min="0" max="1" step="0.05" value={volume} on:input={setVolume} aria-label="音量" /></span>
					</div>
				{:else}
					<p class="music-empty">将已获授权的音频放入 <code>public/music</code>，并在 <code>src/config/music.ts</code> 中添加曲目。</p>
				{/if}
			</div>
		{/if}
	</div>
	<audio bind:this={audio} preload="metadata" on:play={() => playing = true} on:pause={() => playing = false} on:timeupdate={() => currentTime = audio.currentTime} on:durationchange={() => duration = audio.duration || 0} on:ended={() => playMode === "one" ? audio.play() : next()}></audio>
{/if}

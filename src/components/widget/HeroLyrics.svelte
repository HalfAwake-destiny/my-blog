<script lang="ts">
	import { onMount } from "svelte";
	import { parseLrc, type LyricLine } from "../../utils/lyrics";

	type MusicState = { track?: { id: string; title: string; artist: string; lyric?: string }; currentTime: number; duration: number; playing: boolean };
	let state: MusicState | null = null;
	let lines: LyricLine[] = [];
	let lineIndex = -1;
	let loadToken = 0;
	$: current = lineIndex >= 0 ? lines[lineIndex] : null;
	$: chunks = current?.text.match(/.{1,4}/g) || [];
	$: lyricProgress = current && lines[lineIndex + 1] ? Math.min(1, Math.max(0, ((state?.currentTime || 0) - current.time) / (lines[lineIndex + 1].time - current.time))) : 0;

	async function loadLyrics(path?: string) {
		const token = ++loadToken;
		lines = [];
		lineIndex = -1;
		if (!path) return;
		try {
			const response = await fetch(path);
			if (!response.ok) return;
			const parsed = parseLrc(await response.text());
			if (token === loadToken) {
				lines = parsed;
				if (state) update(state);
			}
		} catch { /* Lyrics are optional. */ }
	}

	function update(nextState: MusicState) {
		state = nextState;
		lineIndex = lines.findIndex((line, i) => line.time <= nextState.currentTime && (!lines[i + 1] || lines[i + 1].time > nextState.currentTime));
	}

	onMount(() => {
		const handleState = (event: Event) => {
			const nextState = (event as CustomEvent<MusicState>).detail;
			if (nextState.track?.id !== state?.track?.id) loadLyrics(nextState.track?.lyric);
			update(nextState);
		};
		window.addEventListener("halfawake:music-state", handleState);
		return () => window.removeEventListener("halfawake:music-state", handleState);
	});

	function formatTime(value: number) { return Number.isFinite(value) ? `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}` : "0:00"; }
</script>

{#if state?.track && lines.length && current}
	<div class="hero-lyrics" aria-live="polite">
		<div class="hero-lyrics-meta"><span>LYRIC TRACE</span><i></i><span>{state.track.title}</span><span>{String(lineIndex + 1).padStart(2, "0")} / {String(lines.length).padStart(2, "0")}</span></div>
		<svg class="hero-lyrics-rail" viewBox="0 0 2560 960" preserveAspectRatio="none" aria-hidden="true"><path d="M 28 790 C 260 790, 520 780, 790 758 C 940 746, 1030 739, 1110 731" /></svg>
		<div class="hero-lyrics-track" style={`--lyric-progress: ${lyricProgress}`}>
			{#each chunks as chunk, index}<span style={`--depth: ${index / Math.max(chunks.length - 1, 1)}`}>{chunk}</span>{/each}
		</div>
		<div class="hero-lyrics-foot"><span>{formatTime(state.currentTime)}</span><b><i style={`width: ${state.duration ? (state.currentTime / state.duration) * 100 : 0}%`}></i></b><span>{formatTime(state.duration)}</span><span>WINDOW EDGE / SYNCED</span></div>
	</div>
{/if}

<style>
	.hero-lyrics { position: absolute; z-index: 4; right: 0; bottom: 5.1rem; left: 0; min-height: 9rem; pointer-events: none; text-shadow: 0 3px 14px rgb(0 0 0 / 52%); }
	.hero-lyrics-meta, .hero-lyrics-foot { position: absolute; left: max(1.5rem, calc((100vw - 76rem) / 2 + 2rem)); display: flex; align-items: center; gap: 0.75rem; color: rgb(224 238 242 / 72%); font-family: "JetBrains Mono", monospace; font-size: 0.62rem; letter-spacing: 0.1em; }
	.hero-lyrics-meta { top: 0; color: var(--ha-primary); }.hero-lyrics-meta i { width: 1.5rem; height: 1px; background: currentColor; }
	.hero-lyrics-rail { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }.hero-lyrics-rail path { fill: none; stroke: rgb(116 200 223 / 68%); stroke-width: 2; }
	.hero-lyrics-track { position: absolute; top: 1.7rem; left: max(1.5rem, calc((100vw - 76rem) / 2 + 2rem)); display: flex; align-items: baseline; gap: clamp(0.55rem, 1.1vw, 1.3rem); transform: translateX(calc(var(--lyric-progress) * -2.6rem)) rotate(-2.1deg); transform-origin: left bottom; }
	.hero-lyrics-track span { display: inline-block; color: color-mix(in srgb, #f4fafb calc(100% - (var(--depth) * 45%)), #89adb6 calc(var(--depth) * 45%)); font-size: calc(2.9rem - (var(--depth) * 0.95rem)); font-weight: 750; line-height: 0.95; transform: translateY(calc(var(--depth) * -0.7rem)); }
	.hero-lyrics-foot { bottom: -0.25rem; }.hero-lyrics-foot b { width: 8rem; height: 2px; background: rgb(230 242 245 / 27%); }.hero-lyrics-foot b i { display: block; height: 100%; background: var(--ha-primary); }
	@media (max-width: 640px) { .hero-lyrics { bottom: 4.4rem; min-height: 7.5rem; }.hero-lyrics-meta, .hero-lyrics-foot { left: 1.25rem; right: 1.25rem; gap: 0.5rem; font-size: 0.55rem; }.hero-lyrics-track { left: 1.25rem; gap: 0.4rem; }.hero-lyrics-track span { font-size: calc(2rem - (var(--depth) * 0.55rem)); }.hero-lyrics-foot span:last-child { display: none; }.hero-lyrics-foot b { flex: 1; } }
</style>

<script lang="ts">
	import { onMount } from "svelte";
	import { parseLrc, type LyricLine } from "../../utils/lyrics";

	type MusicState = {
		track?: { id: string; title: string; artist: string; lyric?: string };
		currentTime: number;
		duration: number;
		playing: boolean;
	};

	type Glyph = {
		char: string;
		x: number;
		y: number;
		angle: number;
		fontSize: number;
		opacity: number;
		stretch: number;
		color: string;
	};

	type LyricPath = {
		start: { x: number; y: number };
		control1: { x: number; y: number };
		control2: { x: number; y: number };
		end: { x: number; y: number };
		length: number;
		data: string;
	};

	const DESKTOP_PATH: LyricPath = {
		start: { x: 18, y: 852 }, control1: { x: 260, y: 840 },
		control2: { x: 570, y: 690 }, end: { x: 980, y: 608 }, length: 995,
		data: "M 18 852 C 260 840, 570 690, 980 608",
	};
	const COMPACT_PATH: LyricPath = {
		start: { x: 780, y: 765 }, control1: { x: 980, y: 730 },
		control2: { x: 1210, y: 675 }, end: { x: 1510, y: 640 }, length: 750,
		data: "M 780 765 C 980 730, 1210 675, 1510 640",
	};

	let state: MusicState | null = null;
	let lines: LyricLine[] = [];
	let visualTime = 0;
	let loadToken = 0;
	let anchorTime = 0;
	let anchorStamp = 0;
	let frameId = 0;
	let reducedMotion = false;
	let compact = false;

	$: lyricPath = compact ? COMPACT_PATH : DESKTOP_PATH;
	$: lineIndex = findLineIndex(lines, visualTime);
	$: current = lineIndex >= 0 ? lines[lineIndex] : null;
	$: lineEnd = current ? (lines[lineIndex + 1]?.time ?? state?.duration ?? current.time + 6) : 0;
	$: lineProgress = current ? clamp((visualTime - current.time) / Math.max(lineEnd - current.time, 0.4)) : 0;
	$: currentGlyphs = current ? layoutLine(current.text, reducedMotion ? 0.35 : lineProgress, lyricPath) : [];

	async function loadLyrics(path?: string) {
		const token = ++loadToken;
		lines = [];
		if (!path) return;
		try {
			const response = await fetch(path);
			if (!response.ok) return;
			const parsed = parseLrc(await response.text());
			if (token === loadToken) lines = parsed;
		} catch { /* Lyrics are optional. */ }
	}

	function receiveState(nextState: MusicState) {
		if (nextState.track?.id !== state?.track?.id) loadLyrics(nextState.track?.lyric);
		state = nextState;
		anchorTime = nextState.currentTime;
		anchorStamp = performance.now();
		visualTime = nextState.currentTime;
	}

	function animate(now: number) {
		if (state?.playing && !reducedMotion) {
			visualTime = Math.min(state.duration || Number.POSITIVE_INFINITY, anchorTime + (now - anchorStamp) / 1000);
		}
		frameId = requestAnimationFrame(animate);
	}

	onMount(() => {
		const handleState = (event: Event) => receiveState((event as CustomEvent<MusicState>).detail);
		const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const compactQuery = window.matchMedia("(max-width: 640px)");
		const handleMediaChange = () => {
			reducedMotion = motionQuery.matches;
			compact = compactQuery.matches;
		};
		handleMediaChange();
		motionQuery.addEventListener("change", handleMediaChange);
		compactQuery.addEventListener("change", handleMediaChange);
		window.addEventListener("halfawake:music-state", handleState);
		frameId = requestAnimationFrame(animate);
		return () => {
			motionQuery.removeEventListener("change", handleMediaChange);
			compactQuery.removeEventListener("change", handleMediaChange);
			window.removeEventListener("halfawake:music-state", handleState);
			cancelAnimationFrame(frameId);
		};
	});

	function layoutLine(text: string, progress: number, path: LyricPath): Glyph[] {
		const characters = segmentText(text);
		const movement = lineMovement(progress);
		// Keep the desktop copy away from the edge while the trace remains on the sill.
		let cursor = (compact ? -120 : -70) + movement;
		const opacity = lineOpacity(progress);

		return characters.map((char) => {
			const weight = glyphWeight(char);
			const distance = cursor;
			cursor += 44 * weight;
			const depth = clamp(distance / path.length);
			const point = pointOnPath(depth, path);
			const tangent = tangentOnPath(depth, path);
			const visibility = clamp((distance + 70) / 90) * clamp((path.length + 40 - distance) / 150);
			const perspective = 1 - 0.24 * smoothstep(depth);

			return {
				char,
				x: point.x,
				y: point.y - 7,
				angle: Math.atan2(tangent.y, tangent.x) * 180 / Math.PI,
				fontSize: (compact ? 38 : 47) * perspective,
				opacity: opacity * visibility * (1 - 0.48 * depth),
				stretch: 0.94 - 0.06 * depth,
				color: glyphColor(depth),
			};
		});
	}

	function segmentText(text: string) {
		if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
			const segmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
			return [...segmenter.segment(text)].map((entry) => entry.segment);
		}
		return Array.from(text);
	}

	function glyphWeight(char: string) {
		if (/\s/.test(char)) return 0.5;
		if (/[，。！？、；：,.!?;:]/.test(char)) return 0.62;
		if (/^[\x00-\xff]$/.test(char)) return 0.68;
		return 1;
	}

	function lineMovement(progress: number) {
		if (progress < 0.14) return 220 * easeOutCubic(progress / 0.14);
		if (progress < 0.8) return 220 + 135 * ((progress - 0.14) / 0.66);
		return 355 + 65 * smoothstep((progress - 0.8) / 0.2);
	}

	function lineOpacity(progress: number) {
		if (progress < 0.08) return smoothstep(progress / 0.08);
		if (progress > 0.78) return 1 - smoothstep((progress - 0.78) / 0.22);
		return 1;
	}

	function glyphColor(depth: number) {
		const near = [232, 243, 245];
		const focus = [139, 211, 228];
		const far = [130, 153, 161];
		return depth < 0.18
			? mixColor(near, focus, smoothstep(depth / 0.18))
			: mixColor(focus, far, smoothstep((depth - 0.18) / 0.82));
	}

	function mixColor(from: number[], to: number[], amount: number) {
		return "rgb(" + from.map((value, index) => Math.round(value + (to[index] - value) * amount)).join(" ") + ")";
	}

	function pointOnPath(t: number, path: LyricPath) {
		const inverse = 1 - t;
		return {
			x: inverse ** 3 * path.start.x + 3 * inverse ** 2 * t * path.control1.x + 3 * inverse * t ** 2 * path.control2.x + t ** 3 * path.end.x,
			y: inverse ** 3 * path.start.y + 3 * inverse ** 2 * t * path.control1.y + 3 * inverse * t ** 2 * path.control2.y + t ** 3 * path.end.y,
		};
	}

	function tangentOnPath(t: number, path: LyricPath) {
		const inverse = 1 - t;
		return {
			x: 3 * inverse ** 2 * (path.control1.x - path.start.x) + 6 * inverse * t * (path.control2.x - path.control1.x) + 3 * t ** 2 * (path.end.x - path.control2.x),
			y: 3 * inverse ** 2 * (path.control1.y - path.start.y) + 6 * inverse * t * (path.control2.y - path.control1.y) + 3 * t ** 2 * (path.end.y - path.control2.y),
		};
	}

	function findLineIndex(source: LyricLine[], time: number) {
		for (let index = source.length - 1; index >= 0; index--) if (source[index].time <= time) return index;
		return -1;
	}

	function clamp(value: number, min = 0, max = 1) { return Math.min(max, Math.max(min, value)); }
	function smoothstep(value: number) { const t = clamp(value); return t * t * (3 - 2 * t); }
	function easeOutCubic(value: number) { return 1 - (1 - clamp(value)) ** 3; }
	function formatTime(value: number) { return Number.isFinite(value) ? Math.floor(value / 60) + ":" + Math.floor(value % 60).toString().padStart(2, "0") : "0:00"; }
</script>

{#if state?.track && lines.length && current}
	<div class="hero-lyrics">
		<p class="sr-only" aria-live="polite">{current.text}</p>
		<svg class="hero-lyrics-scene" viewBox="0 0 2560 960" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
			<path class="hero-lyrics-rail" d={lyricPath.data} />
			<circle class="hero-lyrics-origin" cx={lyricPath.start.x} cy={lyricPath.start.y} r="6" />
			<text class="hero-lyrics-label" x={lyricPath.start.x + 12} y={lyricPath.start.y - 28}>LYRIC TRACE / {state.track.title.toUpperCase()}</text>
			{#each currentGlyphs as glyph}
				<text class="hero-lyrics-glyph" style={"fill: " + glyph.color} x="0" y="0" font-size={glyph.fontSize} opacity={glyph.opacity} transform={"translate(" + glyph.x + " " + glyph.y + ") rotate(" + glyph.angle + ") scale(" + glyph.stretch + " 1)"}>{glyph.char}</text>
			{/each}
		</svg>
		<div class="hero-lyrics-status"><span>{formatTime(visualTime)}</span><i><b style={"width: " + (state.duration ? clamp(visualTime / state.duration) * 100 : 0) + "%"}></b></i><span>{formatTime(state.duration)}</span><span>{String(lineIndex + 1).padStart(2, "0")} / {String(lines.length).padStart(2, "0")}</span></div>
	</div>
{/if}

<style>
	.hero-lyrics { position: absolute; z-index: 4; inset: 0; overflow: hidden; pointer-events: none; }
	.hero-lyrics-scene { width: 100%; height: 100%; overflow: visible; }
	.hero-lyrics-rail { fill: none; stroke: rgb(116 200 223 / 52%); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
	.hero-lyrics-origin { fill: var(--ha-accent); }
	.hero-lyrics-label { fill: rgb(139 211 228 / 78%); font-family: "JetBrains Mono", monospace; font-size: 10px; font-weight: 500; letter-spacing: 0; paint-order: stroke; stroke: rgb(4 13 21 / 35%); stroke-width: 3px; }
	.hero-lyrics-glyph { font-family: "Roboto", "Noto Sans SC", sans-serif; font-weight: 500; paint-order: stroke; stroke: rgb(3 11 18 / 34%); stroke-linejoin: round; stroke-width: 3px; }
	.hero-lyrics-status { position: absolute; bottom: 4.5rem; left: max(1.5rem, calc((100vw - 76rem) / 2 + 2rem)); display: flex; align-items: center; gap: 0.65rem; color: rgb(224 238 242 / 66%); font-family: "JetBrains Mono", monospace; font-size: 0.58rem; letter-spacing: 0.08em; text-shadow: 0 2px 8px rgb(0 0 0 / 50%); }
	.hero-lyrics-status > i { width: 7rem; height: 1px; background: rgb(230 242 245 / 28%); }
	.hero-lyrics-status b { display: block; height: 100%; background: var(--ha-primary); }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	@media (max-width: 640px) {
		.hero-lyrics-status { bottom: 3.8rem; left: 1.25rem; right: 1.25rem; font-size: 0.53rem; }
		.hero-lyrics-status > i { flex: 1; }
	}
</style>

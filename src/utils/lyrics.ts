export interface LyricLine {
	time: number;
	text: string;
}

export function parseLrc(source: string): LyricLine[] {
	const lines: LyricLine[] = [];
	for (const rawLine of source.split(/\r?\n/)) {
		const matches = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
		const text = rawLine.replace(/(?:\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\])+/g, "").trim();
		if (!text) continue;
		for (const match of matches) {
			const fraction = Number(match[3] || 0);
			const milliseconds = match[3]?.length === 3 ? fraction : fraction * 10;
			lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + milliseconds / 1000, text });
		}
	}
	return lines.sort((a, b) => a.time - b.time);
}

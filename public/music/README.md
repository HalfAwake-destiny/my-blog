# Local music

Drop music files in this directory using NetEase-style names:

```text
Artist-Title.mp3
Artist-Title.lrc
Artist-Title.webp
```

Only the audio file is required. A same-name LRC file and cover are detected automatically.

Supported audio extensions: `.mp3`, `.flac`, `.m4a`, `.ogg`, `.wav`, and `.aac`.
Supported cover extensions: `.webp`, `.jpg`, `.jpeg`, `.png`, and `.avif`.

Run `pnpm dev` or `pnpm build` after adding files. Both commands regenerate the playlist automatically. If the development server is already running, restart it or run `pnpm music:scan`.

The first hyphen separates artist and title:

```text
Artist-Title-Live.mp3
```

This is registered as artist `Artist` and title `Title-Live`.

Encrypted `.ncm` files cannot be played by browsers and are skipped. Export or download a playable audio format first.

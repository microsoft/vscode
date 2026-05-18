# Buddy sprite sheets

Drop PNG sprite sheets into this folder. `media/buddy.css` references one file per state by name; the files in this folder are the canonical assets and must exist for the buddy to render.

## Expected files

| File          | When it shows                                                 |
| ------------- | ------------------------------------------------------------- |
| `idle.png`    | Default — nothing is happening in chat                        |
| `thinking.png`| Latest response has an active `thinking` part                 |
| `typing.png`  | Latest response has a tool call `Streaming` or `Executing`    |
| `alert.png`   | Latest response is waiting on a confirmation / post-approval  |
| `wave.png`    | One-shot played occasionally during idle and on user poke      |
| `jump.png`    | One-shot played occasionally during idle (paired with a bounce)|

## Frame layout

- Frame size: **64 × 64** logical pixels (CSS pixels). Author at 2× (128×128) for HiDPI if you want, and update the CSS `background-size` to the unscaled total.
- Layout: **horizontal strip** — `frameCount × 64` wide, 64 tall.
- Background: transparent.
- Reading order: left to right, loop continuously.

When wiring a real sprite sheet, in [buddy.css](../buddy.css):
1. Replace the matching `state-*` rule's `background-image` URL (already pointing at this folder).
2. Add an `animation` step driver, e.g. `animation: my-state-cycle 0.6s steps(6) infinite;` plus a `@keyframes` rule that translates `background-position-x` from `0` to `-(frameCount × 64)px`.

## Animation timing guidance

- Idle: ~12 frames @ 8 fps (gentle blink / breathe).
- Thinking: ~6 frames @ 10 fps (tilt head, ellipsis already comes from the bubble).
- Typing: ~4 frames @ 14 fps (hands/paws blur).
- Alert: ~6 frames @ 12 fps (wave arms, exclamation pop).
- Wave: ~8 frames @ 10 fps, plays once on user poke (use `animation-iteration-count: 1`).

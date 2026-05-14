# Buddy sprite sheets

Drop PNG sprite sheets into this folder to replace the emoji-glyph placeholder rendered by `media/buddy.css`. The widget references one file per state by name; until real assets land, the buddy renders a state-specific emoji via the `::before` content fallback, so the feature is fully functional without these files.

## Expected files

| File          | When it shows                                                 |
| ------------- | ------------------------------------------------------------- |
| `idle.png`    | Default — nothing is happening in chat                        |
| `thinking.png`| Latest response has an active `thinking` part                 |
| `typing.png`  | Latest response has a tool call `Streaming` or `Executing`    |
| `alert.png`   | Latest response is waiting on a confirmation / post-approval  |
| `wave.png`    | Played when the user clicks the buddy, or a tip is being shown |
| `jump.png`    | Reserved for a future dedicated jump cycle                    |

## Frame layout

- Frame size: **64 × 64** logical pixels (CSS pixels). Author at 2× (128×128) for HiDPI if you want, and update the CSS `background-size` to the unscaled total.
- Layout: **horizontal strip** — `frameCount × 64` wide, 64 tall.
- Background: transparent.
- Reading order: left to right, loop continuously.

When wiring a real sprite sheet, in [buddy.css](../buddy.css):
1. Replace the matching `state-*` rule's `background-image` URL (already pointing at this folder).
2. Add an `animation` step driver, e.g. `animation: my-state-cycle 0.6s steps(6) infinite;` plus a `@keyframes` rule that translates `background-position-x` from `0` to `-(frameCount × 64)px`.
3. Remove or override the `::before { content: var(--buddy-glyph) }` rule for that state if you don't want the emoji fallback to render underneath.

## Animation timing guidance

- Idle: ~12 frames @ 8 fps (gentle blink / breathe).
- Thinking: ~6 frames @ 10 fps (tilt head, ellipsis already comes from the bubble).
- Typing: ~4 frames @ 14 fps (hands/paws blur).
- Alert: ~6 frames @ 12 fps (wave arms, exclamation pop).
- Wave: ~8 frames @ 10 fps, plays once on user poke (use `animation-iteration-count: 1`).

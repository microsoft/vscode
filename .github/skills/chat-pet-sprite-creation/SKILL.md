---
name: chat-pet-sprite-creation
description: Use when creating or changing VS Code chat pet sprite art, sprite sheets, state animations, eye treatments, Stable/Insiders variants, or pet transitions under src/vs/workbench/contrib/chat/browser/widget/media/chatPet.
---

# Chat Pet Sprite Creation

Create pet sprites that feel like one continuous character rather than separate drawings. Start from the current pet body, preserve its visual anchor, and make every difference intentional.

## Source of truth

- Sprite art: `src/vs/workbench/contrib/chat/browser/widget/media/chatPet/`
- Runtime states, dimensions, timing, and transitions: `src/vs/workbench/contrib/chat/browser/widget/chatPetWidget.ts`
- Eye geometry, facing, clipping, and motion CSS: `src/vs/workbench/contrib/chat/browser/widget/media/chatPet.css`
- Unit tests: `src/vs/workbench/contrib/chat/test/browser/widget/chatPetWidget.test.ts`

Read the current implementation before drawing. Existing dimensions and timings may have changed since this skill was written.

## PR precedence and lineage

This skill distills the complete pet PR history. When rules conflict, use this precedence:

1. Current code and tests
2. The newest relevant open PR
3. Newer merged PRs
4. Older historical behavior

In particular, animation cleanup PR #330399 supersedes the old revive-sign flow and several earlier sprite/timing assumptions.

| PR | Durable learning |
|---|---|
| #327063 | The pet is one semantic button; sprite canvases, images, eyes, and effects are visual-only and `aria-hidden`. Resolve asset URLs through `FileAccess`. |
| #327412 | Model reactions as explicit states. Do not immediately repeat ordinary random reactions; sample rare transformations separately. |
| #327588 | Double-buffer sprite images and swap only after the pending image loads. Never blank the active sprite while a new source is loading. |
| #327696 | Stable/Insiders is a typed, persisted appearance choice. Keep variant naming and geometry systematic. |
| #327714 | Animated art is a horizontal sprite sheet plus a deliberate static reduced-motion PNG. Timing is runtime data, not image metadata. |
| #328334 | Persistent behavior such as “on the run” belongs in service state. Multi-phase animations advance from completion signals, not guessed delays. |
| #328480 | A drag release must not also trigger a click reaction. Gestures that share pointer events need explicit suppression/ownership. |
| #328530 | Waking consumes the interaction that woke the pet; it must not also trigger a random reaction. Reduced motion may skip the wake transition. |
| #329121 | Coalesce gaze updates, pause sprite timers while the document is hidden, and resume from elapsed time rather than replaying missed frames. |
| #329347 | Keep pixel-art pose changes in sprite frames and spatial motion in layout/CSS/physics. Complete falls from transition signals. |
| #329729 | Face the interaction before starting a reaction. Give each transient state an explicit lifetime and use real completion events for chained phases. |
| #329852 | Pointer and keyboard gestures need equivalent outcomes. Reduced motion preserves the state change while removing the travel animation. |
| #329867 | Attention animations are bounded; clapping stops after the confirmation-attention window even if the confirmation remains pending. |
| #330160 | Eyes are a composited runtime layer with tracking/blinking modes. Rapid facing changes can trigger a separate dizzy state. Wide art must respect live bounds. |
| #330275 | Physics uses the body footprint, bounded frame steps, and explicit impact moments. Recompute geometry when layout changes during flight. |
| #330399 | Latest animation contract: wide sleep/wake art, frame-aware blink composition, fixed-orientation decorations, and reverse despawn → forward respawn using one effect sheet. |

## The logical pixel

The canonical art unit is one **logical pixel**:

- `8×8` source pixels
- `4×4` CSS pixels at the standard `96×96` source → `48×48` display scale

Core silhouettes, facial features, props, and repeated details must use the same logical-pixel scale. Do not make a new object from smaller or larger blocks simply to fit more detail.

Effects may deliberately subdivide the logical pixel—for example, small stars, bubbles, or curved motion—but the subdivision must:

1. Serve a specific effect that cannot read on the core grid.
2. Stay consistent throughout that effect.
3. Never come from antialiasing or resampling.

Use nearest-neighbor rendering only. Keep transparent backgrounds and hard pixel edges. Do not introduce blur, feathered alpha, color interpolation, or accidental off-grid scaling.

## Start from a baseline

Never redraw the pet body from memory.

- Use the current **idle** sprite as the baseline for resting, pointer-driven, or playful states.
- Use the current **rendering** sprite as the baseline for request/processing states.
- Copy the complete body first, then alter only the parts required by the new state.

This preserves:

- Body width and height
- Bottom baseline
- Antenna roots and spacing
- Highlight and shadow ramps
- Eye sockets
- Collision/interaction footprint

The first and last key poses must transition cleanly to idle or rendering without a body-position, silhouette, baseline, or scale pop.

## Canvas and anchoring

The default source canvas is `96×96`, or `12×12` logical pixels.

Use a larger canvas only when content intentionally extends outside the canonical body box:

- A terminal or button may need extra width.
- A note, star, or bubble may need extra height.
- The body must remain anchored exactly where it sits in the baseline sprite.

Do not center the body inside a wider frame. Keep the body in the canonical `96×96` region and let the prop/effect overhang. Declare every nonstandard source dimension in `chatPetWidget.ts` and update wide-sprite boundary handling.

The runtime collision and movement box belongs to the pet body, not to a decorative overhang.

## Eyes

The standard open eye is **`1×2` logical pixels**:

- `8×16` source pixels
- `4×8` CSS pixels

Use a different eye shape only when the state communicates a special expression, such as sleep, dizzy, love, worry, or impact.

### DOM eye layer

The DOM eye layer has two independent modes:

- **Tracking** supplies gaze, facing, blink, and drag expressions.
- **Blinking** can temporarily show DOM eyes for a non-tracking state and can vary by sprite frame.

States that use runtime gaze must use eye-less `*-tracking-96` assets. States that use DOM blinking, such as typing, button press, or love in PR #330399, must also leave the corresponding pupil area available for the overlay.

When adding or changing a DOM-eye state:

1. Keep the sprite eye sockets empty.
2. Add cursor behavior to `doesChatPetStateTrackCursor` when appropriate.
3. Add blink behavior to `doesChatPetStateBlink(state, frameIndex)` when appropriate.
4. Verify the tall-eye blink, state-specific eye height, and pointer offsets in both facing directions.
5. Verify frames that intentionally stop blinking, such as a held terminal pose.

Never combine baked pupils with the runtime eye overlay.

### Baked-eye states

States with a fixed expression should bake the eyes into the art and opt out of cursor tracking. Preserve the standard eye position unless the expression intentionally changes it.

## Stable and Insiders parity

Stable and Insiders are palette variants of the same animation.

They must have identical:

- Canvas dimensions
- Frame count and ordering
- Alpha mask and geometry
- Body anchor and overhang
- Static fallback pose
- Timing and iteration behavior

Create one geometry master and apply the two established palettes. Do not redraw variants independently.

Review the two variants side by side. Any shape difference is a bug unless the product explicitly requires it.

## Facing and mirroring

Author one canonical facing direction and let the runtime mirror it for the other direction.

Test both directions because mirroring also changes where wide sprites overhang. Keep enough room for boundary correction near the left and right edges.

Decorations that must retain their screen orientation—such as text, musical notation, or directional symbols—must not be baked into a layer that the runtime mirrors. Model them as fixed-orientation decorations or render them separately.

## Static asset and sprite sheet

Each animated state needs both variants of:

- A static PNG for reduced motion: `buddy-<state>-<variant>-<height>.png`
- A horizontal sprite sheet: `buddy-<state>-<variant>-<height>.spritesheet.png`

The sprite sheet contract is:

```text
sheet width = frame width × frame count
sheet height = frame height
```

Every frame uses the same rectangle. Never shift frame boundaries or add per-frame padding.

Choose a meaningful static pose that communicates the state without motion. Do not assume the first animation frame is automatically the best reduced-motion fallback.

## Animation design

Animate key poses, not noise.

- The trigger should be readable.
- The action should have a clear apex or strongest pose.
- The result should be readable before returning to the baseline.
- Holds are useful; duplicate motion is not.

Frame duration is part of the art. Define it in the matching `*_FRAME_DURATIONS` array in `chatPetWidget.ts`; do not encode or infer timing from the PNG.

Keep the transient-state duration consistent with the intended loops or one-shot playback. Explicitly choose whether the sheet:

- Plays once and holds its final pose
- Loops until the transient state ends
- Plays in reverse as part of another transition

### Reversible effects

If one sheet is reused in reverse, as with respawn → despawn:

- Design both endpoints to work as starts and finishes.
- Check the effect in both directions.
- Avoid one-way visual cues that become nonsensical backward.
- Verify the reverse effect at its actual destination, not only on a neutral canvas.

PR #330399 is the reference pattern: the respawn burst plays backward to despawn at the bottom, then forward to respawn at the top. The old revive-sign interstitial is superseded.

### Separate pose animation from spatial motion

Use sprite frames for changes to the pet or prop silhouette. Use CSS transforms or the physics loop for:

- Translation
- Rotation
- Enter/exit motion
- Drag resistance
- Search reveal/hide
- Falls, throws, rebounds, and impacts

Do not redraw every translated/rotated pose into the sheet. Conversely, do not use a CSS transform to fake a body deformation that should be readable in the pixel art.

Advance multi-phase behavior from deterministic completion signals:

- Sprite completion for one-shot sheets
- `animationend` for CSS keyframes
- `transitionend`/`transitioncancel` for falls
- Physics settlement for throws

Do not guess a completion time with an unrelated timeout.

### Frame scheduling and restart behavior

Sprite timing uses elapsed-time scheduling at frame boundaries, not a display-refresh polling loop. A late callback recalculates the correct frame and shortens the next delay.

- Pause frame timers while the document is hidden.
- On visibility return, recompute from elapsed time.
- Finite animations hold their terminal frame.
- Reverse playback must use the reversed frame durations, not only reversed frame indices.
- Restart a loaded state without forcing a redundant image fetch.
- Force a style flush before re-adding a CSS animation class when a blink or motion must restart.

## Environment and layering

Review the sprite in the same environment where it runs:

- Platform/input edge
- Transparent background
- Left and right workbench boundaries
- Platform clipping and occlusion
- Drag, fall, throw, and respawn motion
- Any speech bubble or fixed decoration

Pixels intended to pass behind the platform must be clipped or layered behind it. Do not leave body/effect pixels visible below an occluding platform.

Movement should preserve the body anchor until physics intentionally moves the whole pet. Decorative frame size must not change the physics target.

## State and gesture ownership

The rendered state has a deliberate priority. Busy/task states must not be accidentally hidden by decorative reactions. Preserve the current order in `getChatPetBaseState` and the transient-state guards in `getChatPetRenderedState`.

Interaction rules:

- Dragging owns the pointer until release and suppresses the following click.
- A wake interaction wakes only.
- Yapping or other idle-only reactions yield to non-idle base states.
- Keyboard interaction is disabled while the pet is dead, pointer-controlled, airborne, or on the run.
- Dizzy consumes the direction-change gesture that triggered it.
- Confirmation clapping is an attention cue, not a permanent pending-state animation.

Rare interactions should be sampled independently from the ordinary non-repeating pool so adding a common reaction does not silently change an easter egg's probability.

## Rendering and performance

Keep the current rendering architecture:

- Two sprite elements provide load-time double buffering.
- Compare an image's original source with `getAttribute('src')`; `.src` may normalize VS Code resource URLs.
- Size the canvas at source-native frame dimensions and the CSS box at display dimensions.
- Keep `imageSmoothingEnabled = false` and `image-rendering: pixelated`.
- Cache resolved sprite source descriptors per variant.
- Coalesce pointer gaze updates to one animation frame.
- Use `requestAnimationFrame` for physics, but cap integration steps to prevent tunneling after a slow frame.
- Re-read throw geometry when layout changes during flight.

## Runtime wiring

When adding a state, update every applicable surface:

1. Add the state to `ChatPetState`.
2. Map the filename in `getChatPetSpriteName`.
3. Add frame durations in `getChatPetFrameDurations`.
4. Declare nonstandard source width/height constants.
5. Register animated and reduced-motion sources in `getSpriteSources`.
6. Choose cursor-tracking and frame-aware blinking behavior.
7. Choose one-shot, loop, reverse, or static iteration behavior.
8. Add the transient-state duration and trigger.
9. Add deterministic completion transitions for multi-phase states.
10. Add facing, overhang, fixed-decoration, clipping, or CSS treatment.
11. Add a localized ARIA status announcement for user-triggered interactions.
12. Update accessible help when the gesture is discoverable/useful.
13. Update focused unit tests.

Do not add art without completing the runtime contract.

Keep the visuals silent: images, canvases, eyes, and effects use empty alt text and `aria-hidden`. The button owns the accessible label, focusability, and localized `status()` announcements. Hidden, dead, or non-interactive states must leave the tab order.

## Validation checklist

### Art

- [ ] Core art uses the same `8×8` source-pixel logical unit.
- [ ] Body derives from current idle or rendering art.
- [ ] Body baseline and canonical anchor stay fixed.
- [ ] Standard eyes are `1×2` logical pixels.
- [ ] DOM-eye sprites contain no baked pupils under the overlay.
- [ ] Stable and Insiders geometry/alpha masks match.
- [ ] Transparent regions stay fully transparent.
- [ ] No interpolation or antialiasing appears.

### Animation

- [ ] First and last poses transition without popping.
- [ ] Static reduced-motion pose communicates the state.
- [ ] Frame dimensions and count match both variants.
- [ ] Timing arrays match the intended holds and loops.
- [ ] Reverse playback reads correctly when used.
- [ ] Both facing directions read correctly.
- [ ] Multi-phase transitions use completion signals, not guessed delays.
- [ ] The static fallback communicates the same outcome under reduced motion.

### Integration

- [ ] Wide/tall source constants and boundary logic are updated.
- [ ] Platform clipping and layering are correct.
- [ ] Interaction/collision geometry remains body-based.
- [ ] Drag/click, wake/click, and pointer/keyboard gesture ownership is unambiguous.
- [ ] User-triggered behavior has localized screen-reader output.
- [ ] Visual children are `aria-hidden`; the button owns semantics and tab order.
- [ ] `ChatPetWidget` tests cover state names, exact timings, geometry, state priority, and reduced motion.

Run the focused unit tests using the repository's `unit-tests` skill. At minimum, run the `ChatPetWidget` test suite.

Prefer exporting pure helpers for timing, geometry, random selection, and state precedence, then test them directly. Use fake timers for scheduler behavior. Assert exact frame-duration arrays so art and runtime timing cannot drift independently.

## Optional public-preview update

The public showcase lives in the sibling `vscode-chat-pet` repository. Use its `update-pet-previews` skill after production sprites are final.

When replacing an existing APNG, prefer a new versioned filename in the README so GitHub and browser caches cannot keep showing the previous animation.

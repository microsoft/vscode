# Motion chapter

The chapter moves from purpose and restraint to complete product patterns, then timing, implementation, accessibility, and evaluation. Examples are selected for the decision they explain, not to inventory every animated component.

## Principles in practice

The [shared philosophy](../principles.design.md) owns the principles. Apply them to motion rather than introducing another value system:

| Shared principle | Motion-specific application |
| --- | --- |
| Delight earns its keep | Compare the effect with stillness; retain only a useful improvement |
| One thing leads | Keep reading anchors stable and let one cue lead per operation |
| Sameness signals sameness | Reuse behavior for equivalent interactions, with component-owned geometry |

Immediate input, interruption, reduced motion, and static status are constraints on every pattern below, not optional effects.

## Product patterns

Choose the situation, then compare moving and still alternatives. A product example explains an interaction; a timing study explains a parameter, not applicability to every surface.

## Feedback

Use a persistent indicator to connect previous and new choices when that relationship matters. Selection commits immediately; only the indicator travels.

Keep labels, hit targets, and keyboard focus still. Repeated actions or obvious changes may need no animation; do not extend indicator travel to buttons or focus rings.

**Evaluate:** change selection again before it settles. The newest choice must win without a jump back or queued playback. With reduced motion, the selected state must be equally clear.

## Selection caption

The selection indicator connects the old and new choices; labels and hit targets remain stable.

## Appear and dismiss

Use one bounded arrival when a deliberately opened popup needs to establish its trigger relationship. The menu then stays settled during interaction.

**Keep immediate:** keyboard focus, available actions, Escape, and dismissal. Use a quieter, shorter departure; the person already knows what is closing. Typing, filtering, and updates to an open popup must not replay its entrance.

**Evaluate:** open, close, and reopen before the exit finishes. The reopened menu must remain visible and correctly anchored. Reduced motion removes the entrance without changing focus or dismissal.

## Menu caption

The menu establishes its anchor once, then rests while its actions are used.

## Layout transitions

Use disclosure when expanding detail needs to preserve a visible connection to its heading. Keep that heading as the reading anchor.

**Keep still:** text size and the heading's position. Use no transition for sash dragging, window resizing, startup restoration, or rapid tree navigation. A disclosure pattern is not permission to animate workbench layout.

**Evaluate:** reverse expansion halfway through, and use the header by keyboard. Collapsed content must leave the focus order immediately. If reflow causes poor frame pacing or loses the reading anchor, prefer the immediate disclosure.

## Disclosure caption

Supporting detail expands from its heading without scaling the text.

## Content transitions

Reveal usable content on first arrival or new results after explicit refresh. In the sessions example, readable content stays available while only new results arrive.

**Keep still:** retained rows, the outer frame, navigation, focus, and scroll position. Show local pending status immediately; ready content never waits for a spinner or animation. Reveal new results together in place, not one row at a time.

Compare Fast, Slow, and Failure: fast work avoids flashing indicators, slow work retains usable rows, and failure preserves content with recovery.

An unchanged refresh, background update, filtering, or streaming needs no result entrance.

## Waiting caption

Retained rows remain usable during refresh. New results reveal in place; failure preserves the previous content.

## Progress

Choose the information, not an animation style. Unknown work needs an honest activity status; measured progress needs a meaningful total. In both cases, keep cancellation, recovery, and a stable text description available.

Use a conventional spinner for generic inline waiting and a track for region-level waiting. Agent work uses the established matrix, not a second spinner for the same operation. The two examples below teach different contracts: ongoing activity and reported amount.

## Agent status

**Use when:** an agent is actively working, such as reasoning or running tools. The matrix accompanies a stable status label; it does not estimate completion.

**Stop when:** work completes, fails, pauses, is cancelled, or needs input. Input-needed uses a static question-mark icon and an actionable label. Hidden or disposed components must not keep decorative drawing alive.

**Evaluate:** also inspect concurrent sessions and split chats. One locally restrained indicator can still contribute to a noisy window; let one cue lead for each operation.

## Patterned caption

The matrix identifies active agent work, not the amount of work remaining.

## Measured progress

**Use when:** the producer reports a meaningful amount and total. Update the accessible value immediately and interpolate the visible fill only toward the latest report.

**Do not:** animate toward an invented future amount, predict a finish time, or borrow a spring from a surface entrance. Sparse updates are an information gap, not a motion style.

**Evaluate:** complete, cancel, and replace the operation while the fill is moving. An old completion must not hide a new operation. Reduced motion retains the amount and outcome without interpolation.

## Known progress caption

The fill follows reported values at a constant rate; it never invents progress.

## Attention

Make relevant information noticeable once, then let its content carry the meaning. Contextual information should remain near its target; new events may use a notification. Errors and input-needed states require clear content and actions, not repeated shaking, flashing, or zooming.

## Notification guidance

Use one arrival when a new non-blocking event needs awareness without taking focus. The notice then rests while the primary task continues.

**Keep separate:** arrival duration, reading time, and persistence. Routine notices retain their normal auto-hide behavior, paused during interaction. Persistent work or required attention needs the appropriate notification lifecycle, not a longer animation.

**Evaluate:** continue typing as the notice arrives, then interact with its actions. It must not steal focus or repeatedly demand attention. Reduced motion keeps the same information, actions, and notification history.

## Notification caption

One arrival draws attention. The notice then rests while its information and actions remain available.

## Expression

Expression is a deliberately different style for an occasional meaningful moment, not a slower version of ordinary feedback. Reuse a complete, established composition with one focal point. Character and illustration choices belong with Illustration; they are not extra loading or easing variants.

The completion example tests the important boundary: a pending request is not success. Do not add a celebration to routine saves, every generated message, or each progress update.

## Completion guidance

**Use when:** a meaningful milestone is confirmed. Show pending feedback immediately, but celebrate only after success; preserve an actionable failure state.

**Keep still:** the action target and completed result. Reduced motion omits particles and retains the outcome. Leaving the view or changing the preference stops the effect; returning must not replay a past milestone.

**Evaluate:** compare Success and Failure. If the effect does not add useful acknowledgment beyond the still result, omit it.

## Completion caption

Pending, success, and failure remain distinct. Celebration follows confirmed success only.

## Foundations

Timing and properties support the pattern; they do not choose it. Reuse an existing component's complete behavior first. Use these studies to diagnose pacing or design a genuinely missing behavior, not to retime every widget.

## Duration

Duration is how long the visual change takes, not how long someone waits for a response. Focus, typing, direct manipulation, and the next action stay immediate. Use the shortest duration that makes the change legible at its actual frequency and travel.

## Interaction timing

These three samples compare brief, moderate, and longer timing with identical geometry and linear pacing. Only duration changes. They are a timing study, not three prescribed product styles or proof that linear pacing fits a control.

## Brief duration

Brief timing suits frequently repeated tactile acknowledgment. Segmented selection's press response uses this base duration. A quick response should feel connected to input, not turn every click into a miniature event.

## Moderate duration

Moderate timing can make a bounded change readable between updates. Measured progress uses this base duration for interpolation between real reports; its semantic value changes immediately.

## Longer duration

More time is justified only when a shorter response is too abrupt to understand in context. More distance or visual weight may warrant it, but a larger element does not automatically deserve slower motion. Compare with the immediate alternative and reject a lingering response that adds no clarity.

## Use duration in context

For product work, prefer the component's semantic pair over selecting a number from the [base scale](?section=tokens#tokens-motion). Do not snap established timing to base steps.

Sampled response experiments are authoring candidates, not shared defaults. Compare visible settling with the established component before considering reuse.

Loading delays, activity cycles, reading time, and expressive choreography remain separate decisions.

## Easing

Choose duration and speed profile together. State feedback retains the switch's `ease` pair; selection, popup presence, and disclosure retain their established Bézier pairs.

Linear pacing suits opacity reveals and measured progress. A shared role does not require every component to use a spring or the same curve.

## Curve illustration

The axes show elapsed time and progress toward a destination. Response timing illustrates prompt change followed by settling; linear timing illustrates constant-rate interpolation.

Inspect product behavior at normal speed before deciding either fits.

## Local response

Use the established state-feedback pair to acknowledge input promptly without moving its target. Popup presence uses a different, anchored arrival pair and a shorter departure. Preserve the relevant component's duration and curve together instead of substituting a generated response solely because it is smooth.

## Continuous use

Use linear pacing between reported progress values or for an established constant-rate activity. It communicates neither acceleration toward a finish nor a promise about completion time. It is not a default for menus, presses, or direct manipulation.

## Property choices

Choose the least change that explains the relationship. Multiple properties are justified only when each contributes, not because a preset or animation API makes them available.

| Property | Useful contribution | Boundary |
| --- | --- | --- |
| Opacity | Reveal supporting or newly ready content in place | Do not blank readable content, delay access, or use opacity alone to hide focusable controls |
| Position | Connect an indicator to its previous and next location | Keep labels and hit targets steady; derive travel from the component, not a global distance |
| Scale | Establish depth at a fixed origin or provide a contained press response | Do not zoom the reading surface, stretch text, or move the hit target |
| Color | Reinforce an existing state while contents stay steady | Keep a non-color distinction; use theme tokens and preserve contrast |
| Layout | Make the relationship to expanding detail understandable | Preserve the reading anchor and measure reflow cost; direct resizing stays immediate |

Judge properties together in the product pattern: a smooth isolated effect can still obscure content or move the wrong target.

## Implementation choices

Use one entry point for the decision you are making. A product pattern is guidance; a preset is reusable behavior; a response supplies paired timing; a token is a parameter. They are not four interchangeable catalogs.

## Evaluation

Start with the complete task, including its still alternative. Keep a change only when it improves recognition, orientation, or confidence without delaying action, obscuring content, adding competing signals, or doing unnecessary work.

## Review questions

| Symptom | Diagnose before tuning | Preferred correction |
| --- | --- | --- |
| The UI feels busy | Repetition, concurrent indicators, or several effects for one event | Remove redundant motion; let one cue and stable text carry the state |
| The UI feels slow | Input gating, queued feedback, a long visible tail, or delayed ready content | Commit state now; replace old motion; shorten or remove the effect |
| Content jumps or disappears | Lost anchors, whole-region fades, stale exit completions | Retain readable content and stable geometry; cancel stale work |
| Similar controls feel unrelated | Different presets or component overrides for the same purpose | Reuse the owning component and shared behavior rather than adding an alias |
| Reduced motion is ambiguous | A frozen spinner, missing status, or hidden recovery | Provide distinct static states and the same actions |
| One example is smooth but the workbench is not | Concurrent rendering, layout cost, or hidden activity | Measure in the intended host and stop unnecessary work |

## Review steps

1. **Name the benefit and the alternative.** Explain what would be harder to understand without motion. If nothing would, choose stillness.
2. **Choose the closest product pattern.** Identify its constraints and the next user action. Reuse the existing component before composing a new effect.
3. **Protect state and geometry.** Keep focus, input, labels, hit targets, and reading anchors correct during repeated input and reversal.
4. **Bind one timing decision.** Use the semantic preset or deliberate existing component cadence. Do not create a new token to fix a local anchor or lifecycle bug.
5. **Validate the whole state sequence.** Check pending, working, paused, cancelled, input-needed, failure, and success where applicable. Include fast, slow, overlapping, and failed requests.
6. Compare normal and reduced motion across access, theme, layout, and concurrent-work conditions. Check rendering stops after hiding or disposal.

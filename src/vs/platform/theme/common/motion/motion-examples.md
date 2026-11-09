# Motion chapter

## Foundations

Choose how long a change needs, how it should unfold, and which properties explain it. Then combine those choices for transitions, ongoing work, awareness, or expression. In every case, keep input and the next action immediate.

## Duration

Match the time to the job. Frequent feedback needs less time than a change someone must deliberately follow. Choose the shortest duration that makes the result legible. Focus, typing, and direct manipulation stay immediate; an animation must never postpone state, access, or the next action.

## Interaction timing

Compare the durations at normal speed. Each band makes exactly the same change with the same linear pacing; only the time differs. These are timing studies, not product previews. The uses below explain where to start when designing a missing behavior, not new timing assignments for existing components.

## Brief duration

Use the briefest animated response for tactile feedback that may repeat with every click. Segmented selection's press response uses this duration: acknowledge contact without making a frequently used control feel heavy.

## Short duration

Give a local highlight or visibility change slightly more time when a press-length response would be too easy to miss. For example, a newly designed inline action reveal can use this as a starting point. Do not slow keyboard focus or add a delay before the action is available.

## Moderate duration

Use a moderate duration when the amount of change needs to remain readable between updates. Measured progress uses this duration to smooth the fill between reported values. The reported amount changes immediately; the animation adds no estimate of remaining work.

## Gentle duration

Allow a little more time for an occasional, more noticeable change. When designing a new contextual reveal, compare this with the moderate duration: keep the extra time only if it makes the information easier to notice. Repeated hover or press feedback rarely benefits.

## Longer duration

Reserve the longer end of everyday timing for a substantial change that is otherwise hard to follow. A new workspace-level reveal is a candidate only if the shorter choices feel abrupt in context. This is not a default for large elements, a reason to animate editor navigation, or a recommendation to slow existing surfaces.

## Use duration in context

For an existing behavior, keep its semantic preset's paired duration and easing. The switch and menu examples elsewhere use generated responses, not the base timings in this study. A response's quiet settling tail is not an input delay; compare when feedback becomes apparent as well as when it finishes.

Long expressive sequences have their own choreography; they are not another everyday speed. Loading time, activity cycles, hover intent delays, and reading time are not transition durations. Use [Design tokens](?section=tokens#tokens-motion) for the complete reference.

## Immediate feedback

Use no transition for keyboard focus, typing, direct resizing, and rapid navigation. These changes already have a clear cause; animation would put feedback behind the action.

## Focus caption

The focus indicator appears immediately; it does not fade or travel.

## Easing

Easing distributes change over time. Choose a speed profile that explains the interaction, paired with its duration. A local acknowledgment should become apparent promptly; an arrival should settle into its destination; an ongoing activity should not imply a finish time. Do not add a curve because its graph looks interesting.

## Curve illustration

Read each curve with its scenario: the horizontal axis is elapsed time and the vertical axis is progress toward the destination. The diagrams play the paired timing at normal speed; use the product examples to judge whether that response suits the interaction.

## Arrival use

A prompt arrival followed by a quiet settle establishes a surface without holding up its actions. The [menu example](#motion-example-anchored-menu) shows this anchored arrival and its shorter departure. Use this pair for surface presence, not a long introductory flourish.

## Departure use

Departures should be quieter and shorter than arrivals. Release interaction immediately. Do not introduce a separate acceleration family until a real departure demonstrates a need that the existing presence preset cannot meet.

## Local response

Frequent changes should become apparent promptly and settle without overshoot. The [switch example](#motion-example-control) uses the responsive pair for contained acknowledgment, not a loading delay or a gesture simulation.

## Change in place use

A gentle start and finish can connect two persistent visual states. The [listening boundary](#motion-example-listening-color) uses a color crossfade while the input stays still. Do not apply this pacing to direct manipulation, typing, or repetitive whole-view fades.

## Continuous use

A constant rate suits interpolation between reported progress values. In [measured progress](#motion-example-progress), the fill moves only toward the latest reported amount. The curve must not manufacture progress or suggest acceleration toward an unknown completion time.

## Visual changes

Choose the property that explains the change. Combine properties only when each contributes useful information; keep unrelated content steady.

## Fade

Change visibility without implying movement. A soft reveal introduces supporting information in an already understood location, keeping the primary task steady. It supports **Purposeful** awareness and **Natural** continuity; it must not postpone readable content or access.

## Scale

A contained scale change can make a press feel tactile without moving its target or neighbors. The study below isolates the brief press response used by segmented selection. For surface presence, combine scale with opacity around a fixed origin, as in the [menu example](#motion-example-anchored-menu). Keep text crisp, allow rapid reversal, and remove nonessential zoom for reduced motion. Never zoom an entire view or stretch text to reveal content.

## Position

Connect a visible origin and destination. A selection indicator travels between choices while labels and hit targets stay steady. This preserves the relationship between old and new state (**Purposeful**) and makes the transition continuous (**Natural**) without delaying selection (**Responsive**). Reuse this pattern wherever a persistent indicator represents a change in place.

## Color

Reinforce a state while content stays in place. Color can support feedback or ongoing activity, but it must not be the only way to distinguish states.

## Hover caption

Supporting information becomes visible without moving the task or its target.

## Selection caption

Only the selection indicator travels; labels and hit targets remain stable.

## Listening caption

A changing boundary conveys active listening while the input content remains steady.

## Best practices

Start with intent, not an effect. Motion earns its place only when it helps someone understand or act; tokens make that decision consistent, but do not make it purposeful.

## Best-practice steps

1. **Name the benefit.** What needs acknowledgment, orientation, awareness, or expression? If no change becomes clearer, choose stillness.
2. **Protect the task.** Identify what stays immediate and steady: state, focus, input, hit targets, and reading anchors.
3. **Reuse the smallest fitting pattern.** Choose the relevant foundation and semantic preset before inventing a new curve or composition. Each animated property must contribute to the intent.
4. **Respond before waiting.** Show pending work locally; keep useful content available. Reveal results when ready, never after a decorative delay. Motion can improve perceived performance, not shorten the operation or prove success.
5. **Check the complete interaction.** At normal speed, try repeated input, interruption, failures, narrow layouts, and concurrent activity. Verify reduced motion, keyboard access, and cleanup. A smooth single playback is not enough.
6. **Share only an earned difference.** If a missing behavior needs new timing, validate it in a real component first. Promote a token or preset only with an explicit purpose and applicability.

## Feedback

Confirm the changed state close to the action. Keep selection, hover, and keyboard focus distinct. The visual response may settle, but the setting itself changes immediately.

## Appear and dismiss

Introduce a surface from a meaningful origin and let it settle into place. On dismissal, release interaction immediately and use a shorter, quieter departure. Reopening should interrupt the exit, not queue behind it.

The menu below demonstrates both phases. Keep that relationship intact when combining opacity and scale; do not animate an already open surface again when its contents update.

## Transitions

Combine timing and properties to explain how a surface arrives, related content expands, or a result replaces what was there. Keep each transition tied to its origin and destination rather than applying a generic entrance to every update.

## Layout transitions

Use expansion when related detail needs to stay connected to its heading. Let surrounding content reflow while preserving the reading anchor, as in the disclosure below. Choose layout change rather than scaling text or floating detail over content that needs to move.

## Content transitions

Make waiting and arrival legible without interrupting the task. Acknowledge the request immediately and retain useful content while work continues; show activity only if the wait persists. When results are rendered, use a short opacity reveal in place for the first content or newly added results after an explicit refresh. Keep retained content fully visible, with its focus and reading position unchanged. This supports **Responsive** feedback and **Natural** continuity without animating the entire reading surface.

Ready content is available immediately, even while its reveal settles. Never fade existing content to an empty frame, stagger a list's results, or replay entrances for streaming, filtering, and background updates. An unchanged result needs no animation. On failure, retain content and expose recovery rather than playing a success transition.

## Reduced motion

Keep the same content, state, and available actions with less movement. Remove nonessential travel, zoom, and repetition. Apply preference changes while motion is running, not only the next time a component opens.

## Visibility change

Reveal supplementary information on hover or keyboard focus without moving the primary task. Keep the target discoverable and ensure the information is available without precise pointer movement.

## Toggle caption

The state changes immediately; subtle thumb and color feedback make the acknowledgment easier to follow.

## Menu caption

An anchored surface establishes its relationship to the trigger and stays settled during interaction.

## Disclosure caption

Related detail expands from its heading while the reading anchor stays stable.

## Waiting caption

Retained rows stay readable and usable while the request runs. Newly added results reveal in place; the frame and navigation stay still. Fast responses skip the activity indicator, and failure keeps the previous content.

## Notification caption

A single arrival draws attention; the notice rests afterward.

## Notification guidance

Use one bounded arrival to make new information noticeable without taking focus. Keep the notice still while it is read; repeated emphasis would compete with the task. Routine notifications keep their normal auto-hide behavior, paused during interaction. Reading time is not part of the entrance duration.

## Attention

Draw attention once when relevant information arrives, then let its content carry the message. Use the [hover reveal](#motion-example-fade) for contextual information and a notification for a new event. Neither should repeatedly animate to remain noticeable.

## Progress

Choose by what the operation knows. Use a compact activity cue for local work with an unknown total, a track for region-level work, and measured progress only when a meaningful total is available. These are ongoing signals, not longer entrance animations. Stop them when work finishes, fails, or needs input.

## Activity caption

A small activity cue answers whether work is ongoing; stable text carries the status.

## Generic loading

Use a spinner for generic loading, waiting, and refreshing when the amount of work is unknown. Keep it close to the resource or status it describes.

## Agent status

Use the dot matrix for an agent that is working, such as reasoning or running tools. Keep a text status alongside it; this is not a measurement of completion.

## Patterned caption

The matrix and ring are two established treatments of the same working status.

## Known progress caption

The fill interpolates between reported values; the completed state remains visible.

## Measured progress

Use measured progress when the operation supplies a meaningful total. Smooth the displayed fill between reports, but do not predict a completion time or animate toward work that has not been reported.

## Region loading

Use a track for waiting that belongs to a whole region; use a compact spinner for inline waiting. A moving segment communicates activity, not a percentage complete.

## Unknown progress caption

A constant-size segment passes through the track while the amount of remaining work is unknown.

## Completion caption

The target stays still through pending, success, and failure.

## Completion guidance

Reserve celebration for a meaningful, confirmed milestone. Acknowledge pending work immediately, but do not celebrate until the action succeeds. On failure, keep an actionable state instead. Reduced motion preserves the outcome without particles.

## Expression

Use expression for an occasional welcome, a primary creative working moment, or a meaningful milestone. Choose one focal point and reuse the complete choreography. These scoped product examples are not timing defaults for routine controls; omit the effect when it would compete with the task.

## Working illustration caption

The illustration moves while its status message stays steady.

## Working illustration guidance

Use the established working illustration when one expressive cue can carry the primary agent-working state. Reuse its complete choreography; do not add a competing spinner for the same work or borrow its timing for ordinary controls.

## Image creation caption

The effect stays inside the future result area.

## Image creation guidance

For a visual creation task, an expressive preview can establish where the result will appear. Keep it contained in that destination and replace it when the result is ready. Its cadence indicates ongoing work, never how much work remains.

## Character caption

The character's movement is contained within its own space.

## Character guidance

Use character animation only in its established welcome or companion experience. Keep movement occasional and subordinate to the task, with a still alternative. Do not turn character choreography into a generic hover or loading treatment.

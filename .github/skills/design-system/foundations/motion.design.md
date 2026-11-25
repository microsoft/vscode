---
title: "Motion"
kind: "foundation"
isDraft: true
order: 16
references:
  - title: "WCAG 2.2: Animation from Interactions"
    url: "https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html"
    description: "Clarifies the AAA essential-motion exception and distinguishes interaction-triggered animation from automatic animation when evaluating reduced-motion behavior."
  - title: "Fluent 2 motion"
    url: "https://fluent2.microsoft.design/motion"
    description: "Functional movement, physical continuity, and transitions in productivity interfaces."
  - title: "Atlassian: applying motion"
    url: "https://atlassian.design/foundations/motion/applying-motion"
    description: "Context-specific timing and asymmetric entrances and exits, moving from fundamentals to decisions."
  - title: "Carbon motion"
    url: "https://carbondesignsystem.com/elements/motion/overview/"
    description: "Productive and expressive styles, usage-led timing, and evaluation against the task. These references inform the decision structure, not VS Code values or a mandate to animate."
---

# Motion

## Introduction

Help people understand a change without delaying reading, input, or the next action. Use motion only when it improves on an immediate, still response.

## Choose by intent

### When to use motion

Ask whether the change would be harder to understand without motion. If not, use an immediate state change, label, icon, or updated content.

If motion helps, choose the smallest fitting [product pattern](#product-usage). Keep state, input, focus, reading, and the next action immediate.

Use one cue per operation, an equivalent reduced response, and lightweight rendering during realistic concurrent work. If these conditions cannot hold, choose stillness.

| Intent | What motion contributes | When stillness is clearer |
| --- | --- | --- |
| State acknowledgment | [Local feedback](#feedback) confirms an action without moving its target | The changed state is already clear, or repeated input would keep the feedback in flight |
| Spatial continuity | [Reveal, reflow, and replacement](#transitions) preserve an origin, a destination, or a reading anchor | There is no meaningful spatial relationship, or movement would compete with navigation |
| Attention and awareness | [A bounded arrival](#attention-and-awareness) or visibility change makes information or contextual chrome noticeable without taking focus | The information is already visible or needs a persistent status, not another emphasis |
| Ongoing activity | [A restrained cadence](#progress) distinguishes active work from an idle state | A stable label conveys enough, another cue already leads, or motion is reduced |
| Deliberate expression | [Complete choreography](#expression) gives a meaningful moment character | The action is routine or the effect competes with the work |

### Choosing no motion

Choose stillness when the change is already legible or movement would obscure the next action. Typing, focus, direct resizing, restoration, and rapid navigation must not acquire settling delays.

Keep final state, contrast, status, and access equally clear. Removing animation must not remove feedback.

## Principles

Apply [Delight earns its keep](principles.design.md#7-delight-earns-its-keep) to changes over time. The checks below apply shared principles to motion; they are not another set of product values.

### Purposeful

Name what becomes easier to recognize or follow. Use [intent selection](#choose-by-intent) to decide whether movement contributes. Cut motion with no job, and add a functional transition where an abrupt jump disorients.

### Natural

For spatial changes, keep meaningful origins and stable destinations so the relationship remains understandable. Preserve continuity during interruption rather than adding bounce to suggest smoothness.

Check the journey, not only the landing: swapping one view for another must not make a stable layout seem to bounce or resize.

### Responsive

Keep input acknowledgment and the next action immediate. This motion-specific constraint means new input redirects or cancels an effect instead of waiting behind it.

### Accessible

Follow the [accessibility contract](#accessibility) for stable targets, equivalent static feedback, and effective reduced-motion preferences.

### Consistent

Apply [Sameness signals sameness](principles.design.md#6-sameness-signals-sameness) by sharing behavior for equivalent interactions. Geometry can fit the context without giving every control separate choreography.

### Motion styles

Functional motion supports choices, anchors, context, or ongoing work. Keep it bounded, interruptible, and quiet at rest; many interactions still need no animation.

Reserve expressive motion for an occasional welcome, creative working moment, or confirmed milestone. Reuse complete established compositions with one focal point and equivalent meaning without animation.

These styles are design intentions, not runtime flags, easing families, or token scales. Neither permits delayed input, stolen focus, repeated emphasis, or unnecessary rendering.

## Timing and visual change

Choose timing and the visual change together. Duration and easing describe how a change unfolds; opacity, scale, position, color, and layout describe what changes.

### Timing

Duration and easing work together. Duration sets elapsed time; easing distributes the change within it. Choose a pace that suits the interaction, then a speed profile that explains its arrival, departure, or change in place.

### Duration

Duration measures the visual change, not the underlying operation. Choose by frequency, distance, and visual weight rather than assigning a speed to each widget type.

Use immediate changes for typing, focus, and direct manipulation. Brief feedback suits repeated input; more time is justified only when it helps people follow a relationship.

Prefer the shortest legible response, with less prominent departures. Reuse the timing an equivalent component already ships; don't retime a component merely to match a shared scale.

Keep reading time, loading delays, activity cycles, and expressive choreography separate from transition duration. Cursor blinking, smooth scrolling, gestures, drag geometry, hover intent, and timed recovery keep their own contracts.

### Visual changes

A property is what changes: opacity, transform, color, or layout. Parameters describe timing, endpoints, travel, or repetition.

Literal endpoints such as fully visible or one complete turn need no shared value. Combine effects through shared behavior rather than assigning a separate curve to every component.

#### Fade

Reveal content in place when its location is already understood. Opacity changes visibility without changing position or layout, but doesn't make a hidden control unfocusable.

#### Scale

A small scale change can establish a surface at a fixed origin. Use it only when that relationship matters; hover doesn't inherently require enlargement. Don't enlarge the hit target, resize neighbors, or zoom a whole view.

#### Position

Connect related places. Travel follows the component's bounds and destination, not a universal distance.

Transforms leave surrounding layout unchanged. Use bounded layout transitions when surrounding content must move; preserve the reading anchor and check layout cost.

#### Color

Reinforce a state while the contents stay steady. Status must remain understandable without color.

### Choreography

Choreography coordinates effects through overlap, sequencing, and repetition. Activity repeats until work changes state; expression coordinates a deliberate moment rather than a single finite response.

## Product usage

Use these patterns in their intended context.

### Acknowledge actions

Show a response before awaiting remote work. Pending means in flight, not success; retain affected content until confirmation and prevent accidental duplicate requests.

Restore an actionable failure state. Optimistic changes need owner-supported rollback and reconciliation; completion motion follows confirmed success.

### Preserve context

Keep the current task understandable while a region changes. Preserve reading anchors and navigation, retain usable content during a refresh, and avoid clearing a surface before its replacement is ready.

### Response and wait timing

Apply response and wait feedback in this order:

1. Acknowledge input immediately through a local state change.
2. Use optimism only for safe, reversible actions whose owner can reconcile failure. Otherwise show an immediate pending state.
3. Choose wait feedback using expected duration, as below.
4. For AI conversation, show immediate activity feedback while generation or tool work begins.

| Expected wait | Starting point |
| --- | --- |
| Under 1 second | Suppress animated wait feedback |
| 1–3 seconds | Concise, local indeterminate feedback |
| Beyond 3 seconds | Measured progress when available; otherwise descriptive status |

These boundaries guide scenario validation; they are not universal timing values. Check actual latency, flashing indicators, failure recovery, screen-reader feedback, concurrency, and CPU cost.

Never delay acknowledgment, ready content, or the next action to finish an animation or keep a spinner visible.

### Lifecycle and performance

Stop motion when its state ends. Pause decorative updates when hidden or offscreen, and dispose animation work when its component is removed.

Measure frame pacing, layout, paint, and CPU cost during realistic concurrent activity. If motion does not earn that cost, use a still response.

### Feedback

Keep hover, selection, and keyboard focus distinct. A moving selection fill has one owner; hover should not compete with it. Table boundary feedback must not delay direct resizing.

#### Toggle feedback

Confirm a binary choice with contained color and thumb movement. The setting changes immediately; labels and hit targets stay still.

#### Selection feedback

Connect the old and new selected positions without moving labels. Preserve the control's keyboard behavior: [Radio](../../../../src/vs/base/browser/ui/radio/radio.design.md#accessibility) selects with arrow keys by default; only its explicit focus-only mode defers selection to Enter or Space. Focus and selection changes are immediate; only the indicator animates.

### Transitions

Preserve the relationship between the changing content and its surroundings.

#### Appear and dismiss

Keep menus, Quick Picks, and code action popups consistent in how they enter and exit, while each keeps its own anchor and dismissal rules. Once open, a surface stays settled through search and content updates.

- **Menu:** Open from the trigger's anchor. Actions are available during arrival; Escape dismisses and returns focus.
- **Quick Pick:** Keep it anchored while search changes its contents; typing and filtering do not replay the entrance.
- **Code action popup:** Reveal available actions beside their code context. Selection and dismissal remain immediate; reopening cancels an unfinished departure.

#### Changes in layout

Preserve the origin and reading anchor as related content expands or collapses. Keep text at normal size and allow rapid reversal.

Measure layout cost in the intended host. Sash dragging, window resizing, rapid tree navigation, and startup restoration stay immediate.

- **Anchored disclosure:** Keep supporting information associated with its heading as detail opens or closes. The main task remains understandable without expanding it, and collapsed content is inert while the header stays available for reversal.

#### Content replacement

Change contents while navigation and the outer frame stay steady. Frequent updates, such as moving between questions, must not repeatedly blank readable text.

Reveal usable content when it first arrives in an empty or loading region. After explicit refresh, reveal only new results in place; retained rows stay visible.

Begin after results render, not when the provider starts returning data. Editor tabs, typing, search keystrokes, streaming, and background updates do not replay entrances.

Preserve selection, scroll position, and focus.

- **View transition:** Move between questions inside the existing card. Keep navigation controls in place, preserve answers when going back, and replace the question directly instead of blanking readable content for an entrance effect.

#### Waiting for content

Acknowledge the action immediately and retain useful content during refresh. A first load needs a stable destination and clear loading message.

Follow [wait timing](#response-and-wait-timing) for activity feedback and replace it as soon as results are usable. The content entrance reveals new visible results together without stagger or moving targets.

An unchanged, failed, or background refresh needs no result entrance. On failure, retain previous content and explain how to retry.

Follow [action acknowledgment](#acknowledge-actions) for optimistic updates; prevent old responses from overwriting newer input. A pending action is not confirmed success.

Establish a new conversation's or view's pending representation before clearing the initiating input. Avoid a blank interval while the provider responds.

### Attention and awareness

Make relevant new information noticeable without repeatedly pulling attention away from the task. Arrival can establish that something changed; a stable status carries its meaning afterward. Error, urgency, and input needed require clear content and available actions, not shaking or flashing.

#### Visibility change

For hover and contextual chrome such as scrollbars, reveal or withdraw in place with visibility change. Keep targets stable and available according to their normal interaction rules.

Separate hover intent delay from entrance: delay avoids accidental interruption; opacity introduces the surface. Preserve shared behavior across nearby controls without replaying entrances for content updates.

#### Notification awareness

Use a one-time arrival to make non-blocking information noticeable without interrupting the task. Let routine notices clear automatically after time to read; pause dismissal while someone is interacting with them. Avoid repeated emphasis once the information is available.

Automatic hiding clears the transient surface, not the notification history. Reserve persistent notices for work in progress or information that requires attention. Keep dismissal immediate unless an exit transition clarifies a meaningful change.

### Progress

Ongoing activity answers “is work happening?”; known progress answers “how much is done?” Choose the signal that matches the information available. Cadence belongs to the activity's repeating behavior, not to a finite spring profile.

Replace outdated activity with confirmed content, an outcome, or an input-needed state; never invent progress or success. Preserve focus and keep cancellation and recovery available. Pausing an indicator doesn't cancel the operation.

#### Compact activity

Use a small cue beside a stable status label when the amount of work is unknown.

Stop the cycle when work finishes, fails, or needs input.

Suspend decorative updates while the indicator is out of view without changing the operation's state. Returning to the view should resume the current state, not start a new operation or imply completion.

#### Patterned activity

A [dot matrix](../../../../src/vs/base/browser/ui/pixelSpinner/pixelSpinner.ts) identifies active agent work. Use the conventional spinner for generic loading, waiting, and refreshing.

Keep a status label; input-needed uses a static question-mark icon and available action instead of working motion.

#### Known progress

Fill a bounded track when the operation reports how much is done.

Update the accessible value immediately; interpolate visible width only between real reports, never toward an estimated finish. Preserve linear pacing, completion timing, and the visible completed state.

Keep the communicated amount consistent with the filled range. A newer operation must not disappear because an older operation's completion is still settling.

Sparse reports expose an information gap, not a motion variant. Improve reporting where possible; choose indeterminate activity when no meaningful total exists.

#### Unknown progress

Use a moving segment for work with no measurable total.

The loop signals activity, not how close the operation is to completion. Keep the segment's shape stable; repetition should communicate continued work rather than decorative expansion and contraction. Use a compact spinner for inline status and a progress track when the work belongs to a whole region.

#### Listening activity

Keep the listening boundary around the input surface rather than moving its contents. The rim communicates an active connection; reduced motion uses a still boundary.

<a id="expression"></a>

### Expression and delight

Reserve expressive motion for an occasional welcome, a primary working moment, or a deliberate milestone. Use one focal point and a bounded footprint; everyday interaction remains restrained.

Reuse complete choreography with its existing drawing, timing, and scope. Expression is not an interchangeable loading speed or a source for ordinary transition durations.

Apply the [design principles](principles.design.md#7-delight-earns-its-keep), including immediate task access and one leading cue. Brand and personality do not create an exception to accessibility.

Existing examples retain scoped product choreography, not a claim of system-wide consistency. Their visual languages need refinement before broader reuse.

#### Established expressive examples

These product experiences illustrate the scoped expression above, not defaults for ordinary controls.

- **Illustrated activity:** Let the [animated working logo](../../../../src/vs/workbench/contrib/chat/browser/widget/chatWorkingLogo.ts) carry the primary working state while its message stays steady. Reuse the complete illustration instead of copying phases, and don't add a competing spinner for the same task.
- **Creation in progress:** A visual creation task can use an expressive preview while the result is prepared. Keep [the generation effect](../../../../src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatImageGenerationProgressPart.ts) inside the result area; it signals activity, not how close generation is to finishing.
- **Character animation:** A character can bring personality to its established welcome or companion experience. Keep the choreography with [its character component](../../../../src/vs/workbench/contrib/chat/browser/widget/chatPetWidget.ts); don't turn it into a generic hover, loading, or surface transition.
- **Completion burst:** Celebrate a deliberate milestone once; the action target stays still and the completed state remains. Reserve [completion confetti](../../../../src/vs/base/browser/ui/animations/animations.ts) for meaningful actions, not routine saves or percentage updates. End it when motion is reduced or its context leaves view, and don't replay an acknowledged milestone.

## Accessibility

### Let one cue lead

Use one primary moving cue per operation. Add a separate indicator only for distinct work. Consider concurrent indicators across the window, not just the restraint of each one in isolation.

### Keep people in control

Keep transitions short and interruptible; new input retargets or cancels them.

Automatically moving content lasting over five seconds alongside other content needs pause, stop, or hide controls unless essential ([WCAG 2.2.2, Level A](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)). Nonessential auto-updating information also needs control; the five-second exception does not apply to updates.

### Avoid flashing and aggressive movement

Do not shake controls, repeatedly zoom a region, or sweep the reading area to demand attention. [WCAG 2.3.1, Level A](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) prohibits more than three flashes in one second unless below its defined thresholds.

Prefer no flashing rather than designing up to the limit. Reduced motion does not make unsafe flashing acceptable.

### Offer reduced motion

Remove nonessential travel, zoom, rotation, shimmer, and particles while retaining content and state. Use the resolved workbench accessibility-service preference, not the operating system alone.

`workbench.reduceMotion` follows the operating system in auto, reduces motion when on, and explicitly allows it when off. Standalone surfaces follow `prefers-reduced-motion`.

Apply preference changes during playback. [WCAG 2.3.3, Level AAA](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) requires nonessential interaction-triggered motion to be disableable.

Check JavaScript-driven effects as well as CSS. A static-looking frame should not leave an unnecessary rendering loop running. Preserve the status while stopping decorative updates.

### Preserve meaning and access

Keep focus and reading position steady. Static status must distinguish working, paused, cancelled, input-needed, failure, and completion; a frozen spinner is ambiguous.

Announce meaningful changes once through existing services, not every animation cycle. Screen-reader announcements and motion preferences are separate concerns.

Do not force a streaming surface back to the latest output after someone scrolls away. Continue the operation without moving their reading position and provide a clear return-to-latest action.

For timed actions such as Undo, retain persistent equivalent recovery or a compliant way to disable, adjust, or extend the limit. Removing countdown motion does not remove the time barrier.

### Validate the complete experience

Test enabled and reduced motion across working, paused, cancelled, input-needed, completed, and failed states. Include keyboard, screen readers, theme types, zoom, multiple sessions, split chats, and concurrent activity.

## Build and review

### Define intent

Name the [intent](#choose-by-intent), next user action, and frequency. Identify the reusable difference before adding new behavior; choose stillness when movement adds no clarity.

Reuse the owning component's animation before composing new properties; don't wrap an already animated widget in another effect.

### Set constraints

Define supported travel and content sizes, the reading anchor, interruption behavior, and the reduced alternative. State what must not move: labels, hit targets, focus, or surrounding content. Resolve competing style ownership before tuning a curve.

### Choose a motion approach

| Approach | Choose it when | Boundary |
| --- | --- | --- |
| Immediate state | Input, focus, frequent navigation, or restoration needs no spatial explanation | State and access never wait for visual settling |
| Finite response | A bounded change benefits from a predictable trajectory | Choose easing and duration together; don't assume a spring is better |
| Live retargeting | A spatial interaction genuinely needs continuous velocity through target changes | Requires a stateful runtime, declared physical parameters and initial conditions, and separate interruption validation |
| Activity cadence | Ongoing work has no measurable total | Choose readable repetition and static status, not a settling time or implied completion estimate |
| Authored choreography | A deliberate expressive moment needs coordinated phases | Keep the complete composition and its scope; don't distribute its timings as ordinary response values |

A sampled CSS spring describes a fixed trajectory, not live velocity through target changes. Restarting from the displayed position preserves position but not momentum. Require a stateful runtime and separate validation when velocity continuity is part of the contract.

### Keep behavior with the component

The component owns the anchor, endpoints, semantic state, focus, and lifetime. **Presence** is its enter and exit lifecycle, including availability during arrival and final removal after departure.

- Commit state and focus immediately; visual settling never gates input.
- Make dismissed content inert, return focus when appropriate, and prevent an old close completion from hiding a reopened surface.
- On new input, retarget from the displayed state or cancel; never queue feedback behind an obsolete transition.
- Apply reduced-motion changes without replaying an entrance.
- Dispose controllers and stop decorative rendering when hidden or removed.

### Validate the product scenario

Validate the entire interaction at normal speed in its actual host. Slow playback is for inspecting mechanics, not judging responsiveness.

- Exercise representative travel and content sizes, repeated input, reversal, and cases where motion must not run.
- Check pointer and keyboard access, theme contrast, reduced motion, preference changes during playback, and screen-reader output.
- Check overshoot beyond the destination when opening and closing; bounded controls must not borrow bounce from an unrelated expressive effect.
- Interrupt and reverse at several points, and check position and speed continuity.
- Inspect frame pacing, layout, paint, and active rendering after completion, hiding, or disposal.
- Confirm hiding or disposing an effect stops unnecessary work without changing operation state.
- For awaited content, test immediate completion, prolonged requests, overlapping providers, failure, and disposal.
- Judge whether the result improves clarity without delaying action or demanding repeated attention. A fixture establishes only the behavior it renders.

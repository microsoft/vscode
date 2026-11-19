# Motion

Help people understand a change without delaying reading, input, or the next action. Use motion only when it improves on an immediate, still response.

## Choose by intent

### When to use motion

Ask whether the change would be harder to understand without motion. If not, use an immediate state change, label, icon, or updated content.

If motion helps, choose the smallest fitting [product pattern](./motion/examples.md#product-patterns). Keep state, input, focus, reading, and the next action immediate.

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

Apply [Delight earns its keep](../skills/design-philosophy/SKILL.md#7-delight-earns-its-keep) to changes over time. The checks below apply shared principles to motion; they are not another set of product values.

### Purposeful

Name what becomes easier to recognize or follow. Use [intent selection](#choose-by-intent) to decide whether movement contributes.

### Natural

For spatial changes, keep meaningful origins and stable destinations so the relationship remains understandable. Preserve continuity during interruption rather than adding bounce to suggest smoothness.

### Responsive

Keep input acknowledgment and the next action immediate. This motion-specific constraint means new input redirects or cancels an effect instead of waiting behind it.

### Accessible

Follow the [accessibility contract](#accessibility) for stable targets, equivalent static feedback, and effective reduced-motion preferences.

### Consistent

Apply [Sameness signals sameness](../skills/design-philosophy/SKILL.md#6-sameness-signals-sameness) by sharing behavior for equivalent interactions. Geometry can fit the context without giving every control separate choreography.

### Motion styles

Functional motion supports choices, anchors, context, or ongoing work. Keep it bounded, interruptible, and quiet at rest; many interactions still need no animation.

Reserve expressive motion for an occasional welcome, creative working moment, or confirmed milestone. Reuse complete established compositions with one focal point and equivalent meaning without animation.

These styles are design intentions, not runtime flags, easing families, or token scales. Neither permits delayed input, stolen focus, repeated emphasis, or unnecessary rendering.

## Foundations

Choose timing and the visual change together. Duration and easing describe how a change unfolds; opacity, scale, position, color, and layout describe what changes.

### Timing

Duration and easing work together. Choose a pace that suits the interaction, then a speed profile that explains its arrival, departure, or change in place.

### Composition

The system separates reusable visual choices from the component behavior that executes them.

| Layer | Responsibility |
| --- | --- |
| Principles and intent | Decide what the change should clarify and whether motion helps |
| Properties and paired timing parameters | Describe what can change and how a finite response unfolds |
| Low-level primitives | Apply timing to a property change, such as a fade or transform |
| Motion presets | Compose reusable effects, timing references, phases, and reduced alternatives without depending on a component's CSS token IDs |
| Component binding | Supply geometry, semantic state, focus, presence, interruption handling, and disposal |
| Product behavior | Preserve the actual interaction, persistence, performance, and accessibility requirements |

### Visual changes

A property is what changes: opacity, transform, color, or layout. Parameters describe timing, endpoints, travel, or repetition.

Share timing through tokens and derive geometry from component bounds. Literal endpoints such as fully visible or one complete turn do not need global tokens.

### Low-level primitives

A primitive applies timing to a property change. Combine these effects in a preset rather than assigning separate curves to every component.

#### Fade

Reveal content in place when its location is already understood. Opacity changes visibility without changing position or layout, but doesn't make a hidden control unfocusable.

#### Scale

A small scale change can establish a surface at a fixed origin. Use it only when that relationship matters; hover doesn't inherently require enlargement. Don't enlarge the hit target, resize neighbors, or zoom a whole view.

#### Position

Connect related places. Travel follows the component's bounds and destination, not a universal distance.

Transforms leave surrounding layout unchanged. Use bounded layout transitions when surrounding content must move; preserve the reading anchor and check layout cost.

#### Color

Reinforce a state while the contents stay steady. Status must remain understandable without color.

### Paired timing

Duration sets elapsed time; easing distributes change within it. Resolve them as one semantic pair for the behavior.

The [motion registry](../../src/vs/platform/theme/common/motionRegistry.ts) owns product-backed pairs for state feedback, selection, surface presence, visibility, content, and disclosure. Their established behaviors need not share identical timing.

#### Generated responses

Responsive and Settled are optional authoring candidates: the same critically damped curve at different tempos. They are not shared tokens or production defaults; their sampled CSS curves are compiler output.

Before adoption, compare the candidate with existing timing at normal speed and realistic travel. Include repeated input, interruption, reduced motion, and the complete task.

Mathematical accuracy does not establish usability, and neither candidate preserves retargeting momentum. See [measured behavior](../../src/vs/platform/theme/common/motion/MOTION.md#measured-motion-behavior) for halfway time, visible settling, and exported-tail analysis.

### Duration

Duration measures the visual change, not the underlying operation. Choose by frequency, distance, and visual weight rather than assigning a speed to each widget type.

Use immediate changes for typing, focus, and direct manipulation. Brief feedback suits repeated input; more time is justified only when it helps people follow a relationship.

The [base scale](../../src/vs/platform/theme/common/motionRegistry.ts) supports immediate state, brief feedback, bounded change, and warranted spatial change. Prefer the shortest legible response, with less prominent departures.

For recurring behavior, prefer its complete product-backed semantic pair. Existing timing can fall between base steps; do not retime a component merely to match the ramp.

Keep reading time, loading delays, activity cycles, and expressive choreography separate from transition duration.

### Choreography

Choreography coordinates effects through overlap, sequencing, and repetition. Activity repeats until work changes state; expression coordinates a deliberate moment rather than a finite-response timing preset.

## Motion presets

Presets encode recurring motion as property tracks, response pairs, and phases. Reuse a definition across components with the same intent; each component retains its geometry and lifecycle.

### Choosing a preset

Select by behavior, not by the shape of an example or a duration label. Existing components already own their animation; do not wrap them in a second effect.

Presets resolve semantic timing pairs from the registry. Centralization preserves distinct switch, selection, popup, hover, notification, and disclosure timings rather than replacing them with one generated response.

| Decision | Existing preset ID | Use for | Do not apply to |
| --- | --- | --- | --- |
| Acknowledge state | `control` | Local state, color, or switch-indicator feedback | Focus movement or every repeated click |
| Follow a choice | `selection` | A persistent indicator within stable bounds | Rapid navigation or moving labels |
| Establish an anchor | `surface` | Deliberate popup opening and closing | Filtering, content updates, or restoration |
| Reveal related detail | `disclosure` | Bounded expansion beneath its heading | Workbench layout, sash dragging, or rapid tree navigation |
| Reveal ready results | `replacement` | First usable content or new results after explicit refresh | Retained rows, streaming, or background updates |
| Reveal contextual chrome | `visibility` | Hover or scrollbar visibility in place | A delay before keyboard access |
| Notice new information | `notification` | One bounded arrival without taking focus | Repeated emphasis or notification reading time |

Activity and expression retain component-owned cadence and choreography. Use the established spinner, agent matrix, progress indicator, or expressive component rather than a finite-response preset.

### Token roles and naming

Promote values only for reusable decisions across realistic product uses. Chapter examples do not qualify a token; prefer component behavior over catalogs of internal numbers.

| Layer | Names | Responsibility |
| --- | --- | --- |
| Base parameters | `motion.duration.{none,short,medium,long}`, `motion.easing.{linear,decelerate}` | A small vocabulary for deliberate composition; not the default entry point |
| Semantic timing and effects | `motion.<behavior>.<phase-or-track>.<parameter>` | Pair duration and easing for a named behavior; retain distinct geometry or content tracks when their jobs differ |
| Shared activity | `motion.spinner.cycle.*`, `motion.progress.cycle.*`, `motion.progress.update.*` | Keep generic activity cadence separate from measured-progress interpolation |

Use behavior names rather than visual-effect names or consumer anatomy. Resolve current prefixes from the [registry](../../src/vs/platform/theme/common/motionRegistry.ts); duration and easing share a prefix.

Disclosure separates geometry and content tracks because they settle at different times. A `.transition` composite is executable composition, not another scalar parameter.

Choose a preset by stable ID, or consume a complete semantic pair for a simple change. API IDs and parameter namespaces serve different purposes.

For example, `control` binds to `motion.state.change.*`; `replacement` binds to `motion.content.enter.*`. Do not borrow activity cadence as transition speed or choose a spring merely because it exists.

Keep component choreography and override hooks local, including matrix sequencing, voice breathing, logo drawing, and confetti. Their parameters are not additional system-wide tokens.

Theme-owned colors remain theme tokens. Renaming an adopted contract requires an explicit compatibility plan rather than parallel naming families.

The registry owns values and aliases; presets reference its pairs, bindings validate them, and recipes adapt them for execution. Generated candidates stay outside this runtime path.

### Product-led reuse

| Product behavior | Shared decision | What remains owned by the product |
| --- | --- | --- |
| [Sash feedback](../../src/vs/base/browser/ui/sash/sash.css) and [diff-region resize handles](../../src/vs/editor/browser/widget/diffEditor/style.css) | `motion.hover.change.*` preserves their existing short decelerating highlight | Hit regions, pointer acquisition, active state, and direct resizing |
| [Switch state](../../src/vs/base/browser/ui/toggle/switch.css) and [selection](../../src/vs/base/browser/ui/radio/radio.css) | Their distinct existing compact timing pairs; independent press feedback | State commits, labels, focus, bounds, and interruption; table-boundary feedback keeps its own established timing |
| [Quick Pick](../../src/vs/platform/quickinput/browser/media/quickInput.css), [action popups](../../src/vs/platform/actionWidget/browser/actionWidget.css), and [context menus](../../src/vs/platform/contextview/browser/contextMenuHandler.ts) | The same surface enter/exit pairs | Anchor, presence, availability, and dismissal |
| [Hovers](../../src/vs/base/browser/ui/hover/hoverWidget.css) and [scrollbar departure](../../src/vs/base/browser/ui/scrollbar/media/scrollbars.css) | Brief hover arrival and immediate contextual withdrawal; not a universal long fade | Intent and inactivity delays; scrollbars keep their established local departure cadence |
| [Content arrival](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsControl.ts) and [disclosures](../../src/vs/workbench/contrib/chat/browser/widget/chatContentParts/media/chatCollapsibleContentPart.css) | Content entrance and distinct disclosure tracks | Which content is new, retained reading anchors, focus, and reflow cost |
| [Progress bars](../../src/vs/base/browser/ui/progressbar/progressbar.css) and [loading icons](../../src/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css) | Measured updates, indeterminate track cycles, and compact spinner cycles stay distinct | Progress values, work lifecycle, cancellation, visibility, and CPU-saving update policy |

Cursor blinking, smooth scrolling, gestures, drag geometry, hover intent, and timed recovery retain separate contracts. Do not change their pacing merely to increase token adoption.

Promote further uses only after checking complete behavior and reduced-motion alternatives.

### Component binding

The component owns the anchor, endpoints, semantic state, focus, and lifetime. **Presence** is its enter/exit lifecycle, including availability during arrival and final removal after departure.

- Commit state and focus immediately; visual settling never gates input.
- Make dismissed content inert, return focus when appropriate, and prevent an old close completion from hiding a reopened surface.
- On new input, retarget from the displayed state or cancel; never queue feedback behind an obsolete transition.
- Apply reduced-motion changes without replaying an entrance.
- Dispose controllers and stop decorative rendering when hidden or removed.

## Product usage

Use these patterns in their intended context. Each live example renders the product component or its owned rendering helper.

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

These boundaries guide scenario validation; they are not universal timing tokens. Check actual latency, flashing indicators, failure recovery, screen-reader feedback, concurrency, and CPU cost.

Never delay acknowledgment, ready content, or the next action to finish an animation or keep a spinner visible.

### Lifecycle and performance

Stop motion when its state ends. Pause decorative updates when hidden or offscreen, and dispose animation work when its component is removed.

Measure frame pacing, layout, paint, and CPU cost during realistic concurrent activity. If motion does not earn that cost, use a still response.

### Feedback

Keep hover, selection, and keyboard focus distinct. A moving selection fill has one owner; hover should not compete with it. Table boundary feedback must not delay direct resizing.

#### Toggle feedback

Confirm a binary choice with contained color and thumb movement. The setting changes immediately; labels and hit targets stay still.

#### Selection feedback

Connect the old and new selected positions without moving labels. Arrow keys move focus; Enter or Space selects. The focus indicator never trails behind navigation.

### Transitions

Preserve the relationship between the changing content and its surroundings.

#### Appear and dismiss

Menu, Quick Pick, and code action popups share surface presence while retaining their own anchors and dismissal rules. Once open, a surface stays settled through search and content updates.

##### Menu transition

Open from the trigger's anchor. Actions are available during arrival; Escape dismisses and returns focus.

##### Surface transition

Keep the picker anchored while search changes its contents. Typing and filtering do not replay the entrance.

##### Code action popup

Reveal available actions beside their code context. Selection and dismissal remain immediate; reopening cancels an unfinished departure.

#### Changes in layout

Preserve the origin and reading anchor as related content expands or collapses. Keep text at normal size and allow rapid reversal.

Measure layout cost in the intended host. Sash dragging, window resizing, rapid tree navigation, and startup restoration stay immediate.

##### Anchored disclosure

Keep supporting information associated with its heading as detail opens or closes. The main task remains understandable without expanding it.

Collapsed content is inert; the header remains available for reversal.

#### Content replacement

Change contents while navigation and the outer frame stay steady. Frequent updates, such as moving between questions, must not repeatedly blank readable text.

Reveal usable content when it first arrives in an empty or loading region. After explicit refresh, reveal only new results in place; retained rows stay visible.

Begin after results render, not when the provider starts returning data. Editor tabs, typing, search keystrokes, streaming, and background updates do not replay entrances.

Preserve selection, scroll position, and focus.

##### View transition

Move between questions inside the existing card. Keep navigation controls in place and preserve answers when going back. Replace the question directly instead of blanking readable content for an entrance effect.

##### Waiting for content

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

A [dot matrix](../../src/vs/base/browser/ui/pixelSpinner/pixelSpinner.ts) identifies active agent work. Use the conventional spinner for generic loading, waiting, and refreshing.

Keep a status label; input-needed uses a static question-mark icon and available action instead of working motion. The retired ring treatment must not gain new uses.

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

Apply the [shared design philosophy](../skills/design-philosophy/SKILL.md#7-delight-earns-its-keep), including immediate task access and one leading cue. Brand and personality do not create an exception to accessibility.

Existing examples retain scoped product choreography, not a claim of system-wide consistency. Their visual languages need refinement before broader reuse.

### Established expressive examples

These product experiences illustrate the scoped expression described above, not additional defaults for ordinary controls.

#### Illustrated activity

An [animated working logo](../../src/vs/workbench/contrib/chat/browser/widget/chatWorkingLogo.ts) can carry the primary working state while its message stays steady.

Reuse the complete illustration instead of copying individual phases. Don't add a competing spinner for the same task.

#### Creation in progress

A visual creation task can use an expressive preview while the result is being prepared.

Keep [the generation effect](../../src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatImageGenerationProgressPart.ts) inside the result area. The animation indicates activity, not how close generation is to finishing.

#### Character animation

A character can bring personality to its established welcome or companion experience.

Keep this choreography with [its character component](../../src/vs/workbench/contrib/chat/browser/widget/chatPetWidget.ts). Don't turn it into a generic hover, loading, or surface transition.

#### Completion burst

Celebrate a successful, deliberate milestone once. The action target stays still and the completed state remains.

Reserve [completion confetti](../../src/vs/base/browser/ui/animations/animations.ts) for meaningful actions, not routine saves or percentage updates. Reduced motion omits particles and preserves the completed state.

End the celebration when motion is reduced or its context leaves view. Restoring motion should not replay a milestone that has already been acknowledged.

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

## Authoring and validation

Use the [chapter examples](./motion/examples.md) for scenario guidance and [MOTION.md](../../src/vs/platform/theme/common/motion/MOTION.md) for integration contracts. Reuse an existing preset before defining and validating missing behavior.

### Define intent

Name the [intent](#choose-by-intent), next user action, and frequency. Identify the reusable difference before adding a preset; choose stillness when movement adds no clarity.

### Set constraints

Define supported travel and content sizes, the reading anchor, interruption behavior, and the reduced alternative. State what must not move: labels, hit targets, focus, or surrounding content. Resolve competing style ownership before tuning a curve.

### Choose a motion approach

| Approach | Choose it when | Boundary |
| --- | --- | --- |
| Immediate state | Input, focus, frequent navigation, or restoration needs no spatial explanation | State and access never wait for visual settling |
| Finite response | A bounded change benefits from a predictable trajectory | Choose a generated pair or deliberate easing; don't separate curve from duration or assume a spring is better |
| Live retargeting | A spatial interaction genuinely needs continuous velocity through target changes | Requires a stateful runtime, declared physical parameters and initial conditions, and separate interruption validation |
| Activity cadence | Ongoing work has no measurable total | Choose readable repetition and static status, not a settling time or implied completion estimate |
| Authored choreography | A deliberate expressive moment needs coordinated phases | Keep the complete composition and its scope; don't distribute its timings as ordinary response tokens |

A sampled CSS spring describes a fixed trajectory, not live velocity through target changes. [MotionController](../../src/vs/base/browser/ui/animations/motion.ts) snapshots opacity and transform, preserving position rather than spring momentum.

Require a stateful runtime and separate validation when velocity continuity is part of the contract.

### Design references

- [VS Code design philosophy](../skills/design-philosophy/SKILL.md): purposeful delight, clear hierarchy, quiet resting states, and consistent behavior.
- [Fluent 2 motion](https://fluent2.microsoft.design/motion): functional movement, physical continuity, and transitions in productivity interfaces.
- [Fluent motion](https://storybooks.fluentui.dev/react/?path=/docs/motion-components-preview-introduction--docs): composable effects, presence, and choreography.
- [Atlassian motion foundations](https://atlassian.design/foundations/motion) and [applying motion](https://atlassian.design/foundations/motion/applying-motion): progression from fundamentals to decisions, context-specific timing, and asymmetric entrances and exits.
- [Carbon motion](https://carbondesignsystem.com/elements/motion/overview/): productive and expressive styles, usage-led timing, and evaluation against the task. These references inform the decision structure, not VS Code token values or a mandate to animate.
- [Windows directionality](https://learn.microsoft.com/en-us/windows/apps/design/motion/directionality-and-gravity): origins and spatial relationships.
- [VS Code accessibility audit](https://oliviatyu.github.io/vscode-motion-audit/?view=accessibility): motion across product contexts.

Response provenance and the pinned Feel seed parameters live with the [authoritative input](../../src/vs/platform/theme/common/motion/motionResponsePresets.json).

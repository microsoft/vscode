# Motion

Motion helps people acknowledge a change, follow a relationship, notice useful information, or understand ongoing work. In an editor, reading, input, and the next action take priority. Choose the intent before the effect; sometimes the clearest response is no motion.

Start with the still alternative, choose a product pattern only when motion improves understanding, then reuse its component and timing. Functional motion is the everyday style; expression is an occasional, scoped exception. Use the [chapter examples](./motion-examples.md) for scenario guidance and the [implementation reference](./MOTION.md) for source contracts.

## Principles

### Purposeful

Make changes easier to understand. Use motion to connect an action with its result, reveal where new content belongs, or show that work is continuing. The benefit is better orientation, not simply more movement.

### Natural

Let elements start, travel, and settle without unexplained jumps. Keep a meaningful origin and a stable destination. Smoothness comes from coherent timing, geometry, and interruption behavior, not from adding bounce.

### Responsive

Acknowledge input immediately and let the next action proceed while the visual change settles. Frequent interactions need shorter, quieter feedback than a substantial change of context. New input should redirect motion, not wait behind it.

### Accessible

Preserve understanding, comfort, and control. Keep targets and reading anchors stable, provide equivalent static feedback, and honor reduced-motion preferences.

### Consistent

Use the same behavior for the same purpose so people do not need to relearn each component. Share presets across equivalent interactions; vary geometry to fit the context, not to give every control its own personality.

### Motion styles

**Functional motion** is restrained support for the task: acknowledge a choice, establish a popup's anchor, preserve context, or make ongoing work understandable. It is bounded, interruptible, and quiet at rest. Most VS Code interactions belong here, and many need no animation.

**Expressive motion** gives an occasional welcome, creative working moment, or confirmed milestone character. Reuse the complete established composition, keep one focal point, and make it optional without losing meaning. Do not use expression to make routine actions feel important.

These are design intentions, not runtime flags, easing families, or separate token scales. Both must be purposeful, responsive, natural, consistent, and accessible. Neither justifies delaying input, taking focus, repeated emphasis, or unnecessary rendering.

## Foundations

Choose timing and the visual change together. Duration and easing describe how a change unfolds; opacity, scale, position, color, and layout describe what changes.

### Timing

Duration and easing work together. Choose a pace that suits the interaction, then a speed profile that explains its arrival, departure, or change in place.

### Choose by intent

| Intent | What motion contributes | When stillness is clearer |
| --- | --- | --- |
| State acknowledgment | [Local feedback](#feedback) confirms an action without moving its target | The changed state is already clear, or repeated input would keep the feedback in flight |
| Spatial continuity | [Reveal, reflow, and replacement](#transitions) preserve an origin, a destination, or a reading anchor | There is no meaningful spatial relationship, or movement would compete with navigation |
| Attention and awareness | [A bounded arrival](#attention-and-awareness) or visibility change makes information or contextual chrome noticeable without taking focus | The information is already visible or needs a persistent status, not another emphasis |
| Ongoing activity | [A restrained cadence](#progress) distinguishes active work from an idle state | A stable label conveys enough, another cue already leads, or motion is reduced |
| Deliberate expression | [Complete choreography](#expression) gives a meaningful moment character | The action is routine or the effect competes with the work |

### Choosing no motion

Stillness is an intentional design choice, not a missing implementation. Use it when the state change is already legible, no relationship needs explaining, or motion would obscure the next action. Typing, keyboard focus, direct resizing, restoration, and rapid navigation should not acquire a settling delay.

If motion doesn't improve recognition or orientation, use an immediate change. Keep the final state, contrast, status, and access equally clear; removing animation must not remove feedback.

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

A property is what changes: opacity, transform, color, or layout. A parameter describes how: timing, endpoints, travel, or repetition. Share timing through tokens; derive geometry from the component's bounds. Literal endpoints such as fully visible or one complete turn don't need global tokens.

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

A finite response describes progress toward a destination. Duration sets the elapsed time; easing distributes change within it. They form one choice. Resolve the semantic pair for the behavior rather than assembling unrelated timing values.

The [motion registry](../motionRegistry.ts) owns compact, product-backed pairs for state feedback, selection, surface presence, visibility, content, and disclosure. Presets reference those semantic pairs directly. Their timings need not be equal: a switch, a persistent selection indicator, and an opening popup have different established behavior.

#### Generated responses

**Responsive** and **Settled** are optional authoring candidates derived from the same critically damped curve at different tempos. They are not shared design tokens or production preset defaults. Their long sampled CSS curves are compiler output, not values contributors should choose or maintain by hand.

Mathematical accuracy does not establish a usability benefit. Before adopting a generated candidate, compare it with the component's existing timing at normal speed and realistic travel; include repeated input, interruption, reduced motion, and the complete task. Inspect time to halfway, visible settling, and the exported tail separately. Neither candidate preserves momentum through retargeting. See [derivation and measurements](./MOTION.md#measured-motion-behavior) for technical analysis.

### Duration

Duration is the time a visual change takes, not the time the underlying operation takes. Choose it by frequency, distance, and visual weight: a repeated press needs less time than a region opening to reveal related information.

Use immediate changes for typing, focus, and directly controlled movement. Short durations suit hover and press feedback. Allow more time for a surface or layout transition when it helps people follow the change, and make departures less prominent than arrivals.

The [base duration scale](../motionRegistry.ts) has four choices: none, short, medium, and long. It supports immediate state, brief local feedback, readable bounded change, and longer spatial change when warranted. It is not a catalog of widget types. Use the shortest duration that makes the relationship legible; longer travel or a larger element only justifies more time when orientation actually benefits.

Prefer the complete product-backed semantic pair when implementing a recurring behavior. Existing timings can sit between base scale steps; do not retime a component merely to place it on the ramp. Generated authoring candidates require a demonstrated benefit before adoption. Reading time, loading delays, repeating activity cycles, and expressive choreography do not belong on the transition-duration scale.

### Choreography

Choreography coordinates effects through overlap, sequencing, and repetition. A finite transition reaches a destination; activity repeats until work changes state; expression coordinates an intentional moment. Keep activity cycles and expressive phases separate from finite-response timing.

## Motion presets

Presets encode recurring motion as property tracks, response pairs, and phases. Reuse a definition across components with the same intent; each component retains its geometry and lifecycle.

### Choosing a preset

Select by behavior, not by the shape of an example or a duration label. Existing components already own their animation; do not wrap them in a second effect.

The preset resolves its compact semantic timing pair from the registry. Existing switch, segmented-selection, popup, hover, notification, and chat-disclosure timings remain distinct; centralization is not a reason to replace them all with one generated response.

| Decision | Existing preset ID | Use for | Do not apply to |
| --- | --- | --- | --- |
| Acknowledge state | `control` | Local state, color, or switch-indicator feedback | Focus movement or every repeated click |
| Follow a choice | `selection` | A persistent indicator within stable bounds | Rapid navigation or moving labels |
| Establish an anchor | `surface` | Deliberate popup opening and closing | Filtering, content updates, or restoration |
| Reveal related detail | `disclosure` | Bounded expansion beneath its heading | Workbench layout, sash dragging, or rapid tree navigation |
| Reveal ready results | `replacement` | First usable content or new results after explicit refresh | Retained rows, streaming, or background updates |
| Reveal contextual chrome | `visibility` | Hover or scrollbar visibility in place | A delay before keyboard access |
| Notice new information | `notification` | One bounded arrival without taking focus | Repeated emphasis or notification reading time |

Activity and expression are not missing entries in this table. Their components own cadence and choreography; use the established spinner, agent matrix, measured progress, or scoped expressive component rather than forcing them through a finite-response preset.

### Token roles and naming

Promote a value only when it represents a reusable decision across realistic product uses. The chapter's examples illustrate guidance; they do not qualify a token. Prefer the owning component's behavior to a new collection of its internal numbers.

| Layer | Names | Responsibility |
| --- | --- | --- |
| Base parameters | `motion.duration.{none,short,medium,long}`, `motion.easing.{linear,decelerate}` | A small vocabulary for deliberate composition; not the default entry point |
| Semantic timing and effects | `motion.<behavior>.<phase-or-track>.<parameter>` | Pair duration and easing for a named behavior; retain distinct geometry or content tracks when their jobs differ |
| Shared activity | `motion.spinner.cycle.*`, `motion.progress.cycle.*`, `motion.progress.update.*` | Keep generic activity cadence separate from measured-progress interpolation |

Use behavior names rather than visual-effect names or one consumer's anatomy: `state.change`, `selection.change`, `press.change`, `hover.change`, `surface.enter` / `surface.exit`, `visibility.enter` / `visibility.exit`, `content.enter`, and `notification.enter`. Use the same prefix for each duration-and-easing pair. Disclosure has `geometry` and `content` tracks because they settle at different times. A CSS transition composite ends in `.transition`; it is executable composition, not another scalar parameter.

Choose an existing preset by its stable ID, or consume a complete semantic pair for a simple property change. For example, preset `control` binds to `motion.state.change.*`; `replacement` binds to `motion.content.enter.*`. The API ID and its parameter namespace have different responsibilities. Do not select a spring merely because a preset exists, or borrow an activity cycle as a transition speed.

Component choreography stays local. Matrix sequencing, voice breathing, logo drawing, find-option signaling, and confetti particles do not define additional system-wide durations, curves, distances, or stagger values. Existing component-local override hooks and typed options remain with those components; their existence does not make them design tokens. Theme-owned colors remain theme tokens.

This draft replaces the earlier inconsistent names and migrates its in-tree consumers together, rather than retaining parallel naming families. A future rename of an adopted contract requires an explicit compatibility plan. The registry owns exact values and alias relationships; Design tokens projects that source rather than keeping a second catalog.

The registry owns the duration and easing values. Presets define applicability, phases, and property tracks by referencing a semantic token prefix. Bindings validate and project that same pair; recipes adapt it to executable tracks or effects. No layer independently chooses another curve. Generated candidate data stays outside this runtime path.

### Product-led reuse

| Product behavior | Shared decision | What remains owned by the product |
| --- | --- | --- |
| [Sash feedback](../../../../base/browser/ui/sash/sash.css) and [diff-region resize handles](../../../../editor/browser/widget/diffEditor/style.css) | `motion.hover.change.*` preserves their existing short decelerating highlight | Hit regions, pointer acquisition, active state, and direct resizing |
| [Switch state](../../../../base/browser/ui/toggle/switch.css) and [selection](../../../../base/browser/ui/radio/radio.css) | Their distinct existing compact timing pairs; independent press feedback | State commits, labels, focus, bounds, and interruption; table-boundary feedback keeps its own established timing |
| [Quick Pick](../../../quickinput/browser/media/quickInput.css), [action popups](../../../actionWidget/browser/actionWidget.css), and [context menus](../../../contextview/browser/contextMenuHandler.ts) | The same surface enter/exit pairs | Anchor, presence, availability, and dismissal |
| [Hovers](../../../../base/browser/ui/hover/hoverWidget.css) and [scrollbar departure](../../../../base/browser/ui/scrollbar/media/scrollbars.css) | Brief hover arrival and immediate contextual withdrawal; not a universal long fade | Intent and inactivity delays; scrollbars keep their established local departure cadence |
| [Content arrival](../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsControl.ts) and [disclosures](../../../../workbench/contrib/chat/browser/widget/chatContentParts/media/chatCollapsibleContentPart.css) | Content entrance and distinct disclosure tracks | Which content is new, retained reading anchors, focus, and reflow cost |
| [Progress bars](../../../../base/browser/ui/progressbar/progressbar.css) and [loading icons](../../../../base/browser/ui/codicons/codicon/codicon-modifiers.css) | Measured updates, indeterminate track cycles, and compact spinner cycles stay distinct | Progress values, work lifecycle, cancellation, visibility, and CPU-saving update policy |

Centralizing these roles does not normalize every occurrence of the same number. Cursor blinking, smooth scrolling, gesture tracking, drag-target geometry, hover intent, and timed recovery have different contracts. Do not change their pacing merely to increase token adoption. Promote further uses only after checking their complete behavior and reduced-motion alternative.

### Component binding

The component owns the anchor, endpoints, semantic state, focus, and lifetime. **Presence** is its enter/exit lifecycle, including availability during arrival and final removal after departure.

- Commit state and focus immediately; visual settling never gates input.
- Make dismissed content inert, return focus when appropriate, and prevent an old close completion from hiding a reopened surface.
- On new input, retarget from the displayed state or cancel; never queue feedback behind an obsolete transition.
- Apply reduced-motion changes without replaying an entrance. Dispose controllers and stop decorative rendering when hidden or removed.

## Product usage

Use these patterns in their intended context. Each live example renders the product component or its owned rendering helper.

### When to use motion

Start with one question: **Would the change be harder to understand without motion?**

- **Yes: add the smallest fitting motion.** Use it only if state, input, focus, reading, and the next action stay immediate; it does not duplicate another cue; it remains lightweight during realistic concurrent use; and it has an equivalent reduced-motion response.
- **No: do not add motion.** Use an immediate still response such as a state change, icon, label, focus indicator, or updated content.

If any constraint fails, do not add motion. Motion must earn its attention and CPU cost; it is not a default treatment for change.

### Acknowledge actions

Make the response to an action visible before awaiting remote work. A pending state means the request is in flight, not that it has succeeded. Keep the affected content available until confirmation, prevent accidental duplicate requests, and restore an actionable state when the operation fails.

Use completion motion after confirmation, not as a substitute for pending feedback. For optimistic changes, the operation owner must support rollback and reconciliation; an animation cannot make an unconfirmed outcome true.

### Preserve context

Keep the current task understandable while a region changes. Preserve reading anchors and navigation, retain usable content during a refresh, and avoid clearing a surface before its replacement is ready.

### Response and wait timing

Apply response and wait feedback in this order:

1. **Acknowledge input immediately.** Add no intentional delay before showing a local state change.
2. **Choose optimistic or pending behavior by risk.** Update safe, reversible actions optimistically only when the owner can reconcile failure. Show an immediate pending state for unsafe actions or results with dependencies.
3. **Choose wait feedback by expected duration.** Suppress animated wait feedback for work expected to finish in under 1 second. Use concise local indeterminate feedback for work expected to take 1–3 seconds. Beyond 3 seconds, show measured progress when available or a descriptive status that explains what is happening.
4. **Treat AI conversation as a continuous interaction.** Show immediate activity feedback so the conversation never appears unresponsive while generation or tool work begins.

The 1-second and 3-second boundaries are starting points for scenario validation, not universal VS Code timing tokens. Validate actual latency distributions, animation flashes, failure recovery, screen-reader feedback, concurrent indicators, and CPU cost before adopting them for a component. Never delay acknowledgment, usable results, or the next action to keep a spinner visible or complete an animation.

### Lifecycle and performance

Stop motion when its state ends. Pause decorative updates when hidden or offscreen, and dispose animation work when its component is removed.

Test realistic concurrent activity, not only one isolated example. Measure frame pacing, layout, paint, and CPU cost alongside clarity and accessibility. If motion does not earn that cost, use a still response.

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

Expansion and collapse reveal or withdraw related content while preserving its origin and the reading anchor. Keep text at its normal size and allow rapid reversal. Layout transitions need host-specific cost checks; sash dragging, window resizing, rapid tree navigation, and startup restoration stay immediate.

##### Anchored disclosure

Use anchored disclosure for supporting information that should stay associated with its context. Preserve orientation as detail is revealed or hidden, and keep the main task understandable without opening it.

Collapsed content is inert; the header remains available for reversal.

#### Content replacement

Change the contents, not the container. Keep navigation and the outer frame steady. Frequent updates such as moving between questions should keep text readable rather than repeatedly fading the whole region to zero.

Use a content reveal when usable content first arrives in an empty or loading region. After an explicit refresh, reveal only newly added results in place: retained rows, labels, and controls stay fully visible. Begin after the component has rendered the results, not when the provider merely starts returning data. Editor tabs, typing, search keystrokes, and streaming remain immediate. Background updates don't replay result entrances. Preserve each view's selection and scroll state; don't move focus automatically.

##### View transition

Move between questions inside the existing card. Keep navigation controls in place and preserve answers when going back. Replace the question directly instead of blanking readable content for an entrance effect.

##### Waiting for content

Acknowledge the action immediately. Keep useful existing content visible and interactive while refreshing; don't fade it out to expose an empty surface. A first load needs a stable destination and a clear loading message.

Show an activity indicator only when the wait persists. Replace it as soon as the result is usable—never hold ready content to complete an animation or a minimum spinner duration. Use the shared responsive opacity response to connect waiting with ready content without suggesting travel or moving hit targets. Reveal an initial result together; after a deliberate refresh, reveal only the new visible results together, without stagger or an entrance for every background update. An unchanged or failed refresh needs no result animation.

On failure, retain existing content and explain how to retry. For a reversible action such as rename or archive, update the local presentation optimistically only when its owner can reconcile success, restore failure, and prevent an older response from overwriting newer input. A pending action is not confirmed success; celebration follows confirmation.

When starting a new conversation or view, establish its local pending representation before clearing the initiating input. A quiet but visible destination is better than a blank interval while the provider responds.

### Attention and awareness

Make relevant new information noticeable without repeatedly pulling attention away from the task. Arrival can establish that something changed; a stable status carries its meaning afterward. Error, urgency, and input needed require clear content and available actions, not shaking or flashing.

#### Visibility change

For hover and contextual chrome such as scrollbars, reveal or withdraw in place with visibility change. Keep targets stable and available according to their normal interaction rules.

For hovers, distinguish the intent delay from the entrance: the delay avoids accidental interruption, then a soft opacity reveal introduces the surface. Keep existing shared-hover behavior across nearby controls, and do not replay an entrance for updates to an already visible hover.

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

A [dot matrix](../../../../base/browser/ui/pixelSpinner/pixelSpinner.ts) indicates agent working status in agent experiences. Use the conventional spinner for generic loading, waiting, and refreshing. This distinguishes the agent's ongoing work from a resource that is loading.

Keep an accompanying status label. Use the matrix for active agent work. When input is needed, stop the working motion and use a static question-mark icon with a clear label and available action. The ring treatment is being retired; do not introduce new uses.

#### Known progress

Fill a bounded track when the operation reports how much is done.

Update the accessible value immediately and interpolate only the visible width between real updates, not an estimated finish time. Determinate progress keeps its deliberately linear pacing and completion timing; frequent updates don't require a spring. The completed state stays visible.

Keep the communicated amount consistent with the filled range. A newer operation must not disappear because an older operation's completion is still settling.

Frequent reports can produce continuous movement. Sparse reports expose an information gap, not a recommended motion variant. Improve the producer's reporting where possible; when no meaningful total is available, choose indeterminate activity instead of animating toward an invented future value.

#### Unknown progress

Use a moving segment for work with no measurable total.

The loop signals activity, not how close the operation is to completion. Keep the segment's shape stable; repetition should communicate continued work rather than decorative expansion and contraction. Use a compact spinner for inline status and a progress track when the work belongs to a whole region.

#### Listening activity

Keep the listening boundary around the input surface rather than moving its contents. The rim communicates an active connection; reduced motion uses a still boundary.

<a id="expression"></a>

### Expression and delight

Reserve expressive motion for an occasional welcome, a primary working moment, or a deliberate milestone. Use one focal point and a bounded footprint; everyday interaction remains restrained.

Reuse complete choreography. These components keep their own drawing and timing; they aren't interchangeable loading speeds or sources for ordinary transition durations. Expression has its own applicability, even when it also indicates activity. Brand and personality must still be **Purposeful**, **Responsive**, **Natural**, **Accessible**, and **Consistent**: a recognizable composition can welcome, sustain confidence during creative work, or acknowledge a meaningful milestone, but it must not delay the task or compete with another cue.

The current examples retain established product choreography, not a claim of system-wide consistency. Their different visual languages need refinement before broader reuse. Keep everyday motion restrained and share expressive compositions only when their purpose and frequency earn the difference.

### Established expressive examples

These product experiences illustrate the scoped expression described above, not additional defaults for ordinary controls.

#### Illustrated activity

An [animated working logo](../../../../workbench/contrib/chat/browser/widget/chatWorkingLogo.ts) can carry the primary working state while its message stays steady.

Reuse the complete illustration instead of copying individual phases. Don't add a competing spinner for the same task.

#### Creation in progress

A visual creation task can use an expressive preview while the result is being prepared.

Keep [the generation effect](../../../../workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatImageGenerationProgressPart.ts) inside the result area. The animation indicates activity, not how close generation is to finishing.

#### Character animation

A character can bring personality to its established welcome or companion experience.

Keep this choreography with [its character component](../../../../workbench/contrib/chat/browser/widget/chatPetWidget.ts). Don't turn it into a generic hover, loading, or surface transition.

#### Completion burst

Celebrate a successful, deliberate milestone once. The action target stays still and the completed state remains.

Reserve [completion confetti](../../../../base/browser/ui/animations/animations.ts) for meaningful actions, not routine saves or percentage updates. Reduced motion omits particles and preserves the completed state.

End the celebration when motion is reduced or its context leaves view. Restoring motion should not replay a milestone that has already been acknowledged.

## Accessibility

### Let one cue lead

Use one primary moving cue per operation. Add a separate indicator only for distinct work. Consider concurrent indicators across the window, not just the restraint of each one in isolation.

### Keep people in control

Keep transitions short and interruptible. New input retargets or cancels the current transition, never queues behind it. Automatically moving content lasting more than five seconds alongside other content needs pause, stop, or hide controls unless essential ([WCAG 2.2.2, Level A](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)). Nonessential auto-updating information also needs control; the five-second exception does not apply to updates.

### Avoid flashing and aggressive movement

Don't shake controls, repeatedly zoom a region, or sweep the reading area to demand attention. [WCAG 2.3.1, Level A](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) prohibits more than three flashes in any one-second period unless below the defined flash thresholds. Prefer no flashing rather than designing up to the limit; reduced motion doesn't make unsafe flashing acceptable.

### Offer reduced motion

Remove nonessential travel, zoom, rotation, shimmer, and particles while retaining content and state. `workbench.reduceMotion` resolves the workbench preference: auto follows the operating system, on reduces motion, and off explicitly allows it. In workbench integrations, use the resolved accessibility-service preference rather than consulting only the operating system. Standalone surfaces follow `prefers-reduced-motion`. Apply preference changes during playback. [WCAG 2.3.3, Level AAA](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) requires nonessential interaction-triggered motion to be disableable.

Check JavaScript-driven effects as well as CSS. A static-looking frame should not leave an unnecessary rendering loop running. Preserve the status while stopping decorative updates.

### Preserve meaning and access

Keep focus and reading position steady. Static status must distinguish working, paused, cancelled, needs input or approval, failure, and completion; a frozen spinner alone is ambiguous. Announce meaningful changes once through existing accessibility services, not every animation cycle. Screen-reader announcements and motion preferences are separate concerns.

Do not force a streaming surface back to the latest output after someone scrolls away. Continue the operation without moving their reading position and provide a clear return-to-latest action.

For Undo countdowns and other timed actions, keep an equivalent persistent recovery route or provide a compliant way to turn off, adjust, or extend the time limit. Removing countdown motion does not remove the time barrier.

### Validate the complete experience

Test motion enabled and reduced across working, paused, cancelled, needs-input, completed, and failed states. Include keyboard and screen-reader use, dark, light, and high-contrast themes, enlarged UI, multiple sessions, split chats, and concurrent activity.

## Authoring and validation

Reuse an existing preset before creating another. Extend the system by defining the missing behavior, deriving its timing, and checking the complete product interaction.

### Define intent

Name the [intent](#choose-by-intent), the next user action, and the frequency of use. If no existing preset fits, identify the reusable difference before adding a new one. Use no motion when it does not improve recognition or orientation.

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

A sampled CSS spring export describes a fixed trajectory with declared starting conditions. It doesn't carry live velocity into a new target. [MotionController](../../../../base/browser/ui/animations/motion.ts) snapshots owned opacity and transform when replacing an active effect: this preserves the current visual position, not spring momentum. Require a stateful runtime and separate validation when velocity continuity is part of the contract.

### Design references

- [VS Code design philosophy](../../../../../../.github/skills/design-philosophy/SKILL.md): purposeful delight, clear hierarchy, quiet resting states, and consistent behavior.
- [Fluent 2 motion](https://fluent2.microsoft.design/motion): functional movement, physical continuity, and transitions in productivity interfaces.
- [Fluent motion](https://storybooks.fluentui.dev/react/?path=/docs/motion-components-preview-introduction--docs): composable effects, presence, and choreography.
- [Atlassian motion foundations](https://atlassian.design/foundations/motion) and [applying motion](https://atlassian.design/foundations/motion/applying-motion): progression from fundamentals to decisions, context-specific timing, and asymmetric entrances and exits.
- [Carbon motion](https://carbondesignsystem.com/elements/motion/overview/): productive and expressive styles, usage-led timing, and evaluation against the task. These references inform the decision structure, not VS Code token values or a mandate to animate.
- [Windows directionality](https://learn.microsoft.com/en-us/windows/apps/design/motion/directionality-and-gravity): origins and spatial relationships.
- [VS Code accessibility audit](https://oliviatyu.github.io/vscode-motion-audit/?view=accessibility): motion across product contexts.

Response provenance and the pinned Feel seed parameters live with the [authoritative input](./motionResponsePresets.json).

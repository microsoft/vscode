# Motion

Motion helps people acknowledge a change, follow a relationship, notice useful information, or understand ongoing work. In an editor, reading, input, and the next action take priority. Choose the intent before the effect; sometimes the clearest response is no motion.

Use shared presets for recurring transitions, component-owned cadence for ongoing work, and complete choreography for expressive moments.

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

A finite response describes progress toward a destination. Duration sets the elapsed time; easing distributes change within it. They form one choice, so a preset refers to that pair rather than assembling unrelated timing values.

Response tokens name complete duration-and-easing pairs. Semantic tokens bind those pairs to roles such as surface entrance or selection change. The [motion registry](../motionRegistry.ts) resolves both into CSS variables; components consume the semantic role instead of copying values.

#### Generated responses

**Responsive** supports frequent local feedback. **Settled** gives a spatial relationship more time to read. They use the same critically damped curve at different tempos, with duration and easing generated together.

The table reports time to halfway, time within 2% of the destination, and the full exported duration, including its settling tail. These are trajectory measurements, not input delays. Neither response overshoots; neither preserves momentum through retargeting. See [derivation and measurements](#measured-motion-behavior) when changing their parameters.

### Duration

Duration is the time a visual change takes, not the time the underlying operation takes. Choose it by frequency, distance, and visual weight: a repeated press needs less time than a region opening to reveal related information.

Use immediate changes for typing, focus, and directly controlled movement. Short durations suit hover and press feedback. Allow more time for a surface or layout transition when it helps people follow the change, and make departures less prominent than arrivals.

The base duration scale contains several choices; it is not limited to the two generated response profiles. Its [source definitions](../motionRegistry.ts) pair each duration with an intended visual weight: immediate access, brief tactile feedback, local changes, bounded transitions, substantial spatial changes, and reserved expression. These are selection criteria, not automatic assignments by component size. Use the shortest duration that makes the relationship legible; longer travel or a larger element only justifies more time when orientation actually benefits.

Prefer a complete semantic preset when implementing a recurring behavior. Generated responses include a settling tail, so compare their visible trajectories rather than treating their full export duration as a waiting time. Reading time, loading delays, and repeating activity cycles are separate decisions. The longest base duration is reserved for deliberate choreography, never an excuse to slow routine interaction.

### Choreography

Choreography coordinates effects through overlap, sequencing, and repetition. A finite transition reaches a destination; activity repeats until work changes state; expression coordinates an intentional moment. Keep activity cycles and expressive phases separate from finite-response timing.

## Motion presets

Presets encode recurring motion as property tracks, response pairs, and phases. Reuse a definition across components with the same intent; each component retains its geometry and lifecycle.

### Choosing a preset

Select by purpose. Open the composition for timing and token bindings, or follow an example to its product usage.

### Preset contract

Each preset declares applicability, property tracks, response identities, phases, and a reduced alternative. Its requirements describe the geometry, state, focus, interruption, and lifecycle obligations of the consuming component.

Keep the definition data-only and independent of CSS IDs. A new component binding does not require a new preset; add one only for a distinct reusable behavior.

### Component binding

The component owns the anchor, endpoints, semantic state, focus, and lifetime. **Presence** is its enter/exit lifecycle, including availability during arrival and final removal after departure.

- Commit state and focus immediately; visual settling never gates input.
- Make dismissed content inert, return focus when appropriate, and prevent an old close completion from hiding a reopened surface.
- On new input, retarget from the displayed state or cancel; never queue feedback behind an obsolete transition.
- Apply reduced-motion changes without replaying an entrance. Dispose controllers and stop decorative rendering when hidden or removed.

### Applying a preset

Use the component's existing animation owner. Don't wrap an already animated widget in another effect.

| Consumer | Integration |
| --- | --- |
| CSS transition or keyframes | Consume semantic variables and transition composites from [`getMotionCssVariables`](./motionRecipes.ts). [`motionPresetBindings.ts`](./motionPresetBindings.ts) binds each phase to its duration and easing tokens |
| Web Animations | Resolve surface presence with [`resolveMotionPresetEffect`](./motionPresets.ts), supply component-owned scale, and play it through a registered [`MotionController`](../../../../base/browser/ui/animations/motion.ts). Omit scale to leave an existing transform untouched |
| Custom rendering | Use [`resolveMotionPreset`](./motionPresets.ts) for paired timing. Keep drawing, cadence, and lifecycle with the component |

Use separate phase bindings where timings differ, even if the current normalized curves match. See the [implementation reference](#implementation-reference) for CSS compositions.

## Product usage

Use these patterns in their intended context. Each live example renders the product component or its owned rendering helper.

### Acknowledge actions

Make the response to an action visible before awaiting remote work. A pending state means the request is in flight, not that it has succeeded. Keep the affected content available until confirmation, prevent accidental duplicate requests, and restore an actionable state when the operation fails.

Use completion motion after confirmation, not as a substitute for pending feedback. For optimistic changes, the operation owner must support rollback and reconciliation; an animation cannot make an unconfirmed outcome true.

### Preserve context

Keep the current task understandable while a region changes. Preserve reading anchors and navigation, retain usable content during a refresh, and avoid clearing a surface before its replacement is ready.

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

Keep an accompanying status label. Matrix and ring share the same working, input-needed, and idle meanings; the shape is not a progress value. Keep the established treatment within its host rather than switching shapes to invent new states.

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

Keep focus and reading position steady. Static status must distinguish working, input needed, failure, and completion; a frozen spinner alone is ambiguous. Announce meaningful changes once through existing accessibility services, not every animation cycle. Screen-reader announcements and motion preferences are separate concerns.

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

### Measured motion behavior

For a unit step from rest, the generated responses use `p(t) = 1 - (1 + ωt) exp(-ωt)`, with `ω = 2πf`, frequency in hertz, and time in seconds. The compiler solves the endpoint-residual limit and samples within an interpolation-error budget, including endpoint adjustment and rounding. Multiply fractional error by actual travel to evaluate its visual bound.

Edit [the response parameters](./motionResponsePresets.json) and follow the [generate-and-check workflow](../../../../../../.github/skills/motion-design/SKILL.md#generate-and-check); never hand-edit generated curves. Record metrics with their source revision, method, and units.

- **Settling:** for comparable finite transitions, use a 2%-remaining settling band. Settling is the earliest time after which displacement stays within 2% of the requested travel, not the first time it enters that band. State the analysis horizon and any separate velocity criterion. A finite export's duration, tail, or endpoint snap isn't itself proof of settling.
- **Speed:** express velocity in travel fractions per second. For progress `p(t)`, this is `dp/dt` with time in seconds; multiplying by travel in pixels gives pixels per second. A curve's slope against normalized time must also be divided by duration. Report peak and terminal speed, and treat zero travel separately. Opacity and scale rates aren't pixel speeds without a defined geometric mapping.
- **Overshoot:** report excursions beyond the destination relative to travel and in the rendered geometry. Check both opening and closing. A bounded control or disclosure must not borrow bounce from an unrelated expressive effect.
- **Derivation:** record an easing's control points and duration, or a spring's parameters and initial conditions. For an export, include sampling error, truncation, and endpoint behavior. A numerical tolerance describes approximation, not an acceptable amount of visible error at every scale. Test the analytic response and exported approximation separately; neither proves usability.
- **Interruption:** check retargeting at several points, including reversal. Record position continuity and velocity continuity separately; restarting from the displayed position can still change speed abruptly.
- **Runtime cost:** inspect frame pacing, layout, paint, and active rendering after completion, hiding, or disposal in the actual host. Compositor-friendly properties don't guarantee smooth frames; intrinsic-size disclosure and selection-width changes need layout-cost checks.

Some deliberate easing curves have an unbounded derivative at an endpoint even though their visual range is bounded. Report that limit instead of treating a finite sampling rate as a finite peak speed. Inspect the onset or departure in context; such a curve isn't a physical trajectory merely because its duration and progress can be measured. Stepped and continuous activity need cadence and lifecycle checks rather than a finite-transition settling claim.

The [composition tests](../../test/common/motionRecipes.test.ts) and [controller tests](../../../../base/test/browser/ui/animations/motion.test.ts) cover implementation behavior. They don't establish a perceptual threshold or substitute for scenario checks.

### Validate the product scenario

Validate the entire interaction at normal speed in its actual host. Slow playback is for inspecting mechanics, not judging responsiveness.

- Exercise representative travel and content sizes, repeated input, reversal, and cases where motion must not run.
- Check pointer and keyboard access, theme contrast, reduced motion, preference changes during playback, and screen-reader output.
- Confirm hiding or disposing an effect stops unnecessary work without changing the operation's state.
- Measure layout and paint cost. Correct equations and compositor-friendly properties do not guarantee smooth frames.
- Judge whether the result improves clarity without delaying action or demanding repeated attention. A fixture establishes only the behavior it renders.

For awaited content, test immediate completion, a prolonged request, overlapping providers, failure, and disposal. The sessions list retains rows during refresh, sets its busy state immediately, and delays only its progress indicator by 150 ms to avoid a flash. This feedback threshold is not an animation duration or an extra wait on data. Frequent question navigation remains immediate; the content-replacement preset serves the first usable content after loading.

### Source ownership

| Owner | Maintains |
| --- | --- |
| [Response parameters](./motionResponsePresets.json) and [compiler](../../../../../../.github/skills/motion-design/scripts/generate-motion-responses.mjs) | Physical inputs, provenance, accuracy limits, and generated timing pairs |
| [Presets](./motionPresets.ts) | Reusable definitions and applicability |
| [Bindings](./motionPresetBindings.ts), [registry](../motionRegistry.ts), and [effect adapters](./motionRecipes.ts) | Semantic token mappings, CSS variables, and executable effects |
| Product component | Geometry, state, focus, lifecycle, and owning tests |

Change a shared definition at its owner and validate the affected consumers. Keep one source for each decision rather than maintaining copies in fixtures or documentation.

### Design references

- [VS Code design philosophy](../../../../../../.github/skills/design-philosophy/SKILL.md): purposeful delight, clear hierarchy, quiet resting states, and consistent behavior.
- [Fluent 2 motion](https://fluent2.microsoft.design/motion): functional movement, physical continuity, and transitions in productivity interfaces.
- [Fluent motion](https://storybooks.fluentui.dev/react/?path=/docs/motion-components-preview-introduction--docs): composable effects, presence, and choreography.
- [Atlassian motion foundations](https://atlassian.design/foundations/motion) and [applying motion](https://atlassian.design/foundations/motion/applying-motion): progression from fundamentals to decisions, context-specific timing, and asymmetric entrances and exits.
- [Windows directionality](https://learn.microsoft.com/en-us/windows/apps/design/motion/directionality-and-gravity): origins and spatial relationships.
- [VS Code accessibility audit](https://oliviatyu.github.io/vscode-motion-audit/?view=accessibility): motion across product contexts.

Response provenance and the pinned Feel seed parameters live with the [authoritative input](./motionResponsePresets.json).

## Implementation reference

These examples show how components can bind effects to existing CSS variables. Resolve their timing from the source rather than copying values; the component remains responsible for behavior and accessibility.

### Component integration

Share only parameters that represent reusable choices. [motionRecipes.ts](./motionRecipes.ts) supports literal geometry alongside purpose-specific parameters. Components own state, accessibility, focus, interruption, and lifecycle; don't add a second animation around an effect the component already owns.

### Easing

Easing describes the distribution of change over time. Judge it with its duration and actual travel: the same normalized curve can feel very different at another speed or scale.

Start with a preset's paired timing. Use deliberate easing when it serves the intent; don't force every finite response into a spring or select a curve independently from its duration.

Inspect the static speed profile and judge responsiveness at actual speed. Optional slow playback is an inspection aid, never the default demonstration of an intended interaction.

Only retain reusable curves with a supported purpose and consumer. The generated response pairs support local acknowledgment and anchored presence; the established ease-in-out supports color crossfades, and linear supports progress interpolation and activity. Unused acceleration/deceleration strength variants are not a foundation simply because their formulas are available.

#### Linear

Use a constant rate for steady activity or interpolation between reported progress values. It avoids suggesting acceleration toward an unknown completion time. It is usually a poor fit for a surface that needs to arrive and settle.

#### Accelerate

Acceleration can make a departure less emphatic, but no independent acceleration family is currently justified by a consumer in this system. Use the existing shorter surface-exit pair. Introduce a distinct curve only after a real departure demonstrates a missing benefit, and release input and focus immediately.

#### Decelerate

Use deceleration for an arrival or a small state change that should be noticed quickly and settle gently. Preserve a clear origin, and avoid a large initial jump or a lingering tail.

#### Ease-in-out

Use a gentle start and finish when an element stays on screen while changing position or size. Both endpoints matter. Do not apply easing to directly controlled movement such as dragging a sash.

### Overlay surface composition

Start in `is-entering`, then replace it with `is-open` to reveal; remove `is-open` to close. The widget owns focus and semantic visibility. Make closing content inert immediately, and cancel a stale exit when reopened. Choose the transform origin from the actual anchor.

```css
.surface {
	opacity: 0;
	transform: scale(var(--vscode-motion-surface-exit-scale));
	transform-origin: top left;
	transition:
		opacity var(--vscode-motion-surface-exit-duration) var(--vscode-motion-surface-exit-easing),
		transform var(--vscode-motion-surface-exit-duration) var(--vscode-motion-surface-exit-easing);
}
.surface.is-open {
	opacity: 1;
	transform: scale(1);
	transition-duration: var(--vscode-motion-surface-enter-duration);
	transition-timing-function: var(--vscode-motion-surface-easing);
}
.surface.is-entering {
	transform: scale(var(--vscode-motion-surface-enter-scale));
}
.monaco-reduce-motion .surface { transition: none; }
```

### Layout expansion composition

Update `aria-expanded` and keyboard access with the state. Preserve visibility through collapse; keep focus outside content that becomes unavailable. Use this intrinsic-size composition inside a component, not around workbench layout owners that control part sizing.

```css
.details {
	display: grid;
	grid-template-rows: 0fr;
	opacity: 0;
	visibility: hidden;
	transition: var(--vscode-motion-disclosure-exit-transition);
}
.details.is-open {
	grid-template-rows: 1fr;
	opacity: 1;
	visibility: visible;
	transition: var(--vscode-motion-disclosure-transition);
}
.details > * { min-height: 0; overflow: hidden; }
.monaco-reduce-motion .details { transition: none; }
```

### Content replacement composition

Preserve each view's selection and scroll position. Commit the new content immediately; animation must not gate input or move focus automatically.

```css
.incoming-content {
	opacity: 0;
	transition: opacity var(--vscode-motion-content-duration)
		var(--vscode-motion-content-easing);
}
.incoming-content.is-ready { opacity: 1; }
.monaco-reduce-motion .incoming-content { transition: none; }
```

### Control feedback composition

Update checked or selected state immediately. Retarget an interrupted transition instead of queuing input; never animate keyboard focus from one control to another.

For movement within a fixed control, animate the indicator's transform rather than its layout position. Derive its endpoints from the control's bounds, and keep intermediate states in the same coordinate system so they can be interrupted without a jump. This avoids repeated layout during travel; it doesn't imply that speed remains continuous when direction changes.

```css
.state-control {
	transition: var(--vscode-motion-control-transition);
}
.state-control .thumb {
	transition: var(--vscode-motion-control-position-transition);
}
.segmented-control .selection {
	transition: var(--vscode-motion-selection-transition);
}
.monaco-reduce-motion .state-control,
.monaco-reduce-motion .state-control .thumb,
.monaco-reduce-motion .segmented-control .selection {
	transition: none;
}
```

### Notification arrival composition

Preserve immediate dismissal. Announce important status through the existing notification service. Keep actions available without a moving target or an animated countdown.

```css
.notification {
	opacity: 0;
	transform: translateY(100%);
}
.notification.is-arriving {
	opacity: 1;
	transform: translateY(0);
	transition: var(--vscode-motion-toast-enter-transition);
}
.monaco-reduce-motion .notification { transition: none; }
```

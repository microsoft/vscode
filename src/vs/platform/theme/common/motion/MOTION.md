# Motion implementation

For purpose, pattern selection, token roles, and accessibility, read [Motion design](../../../../../../.github/design-system/motion.design.md). This document owns integration contracts, derivation, implementation recipes, and technical validation.

## Preset contract

Each preset declares applicability, property tracks, semantic timing prefixes, phases, and a reduced alternative. Its requirements describe the geometry, state, focus, interruption, and lifecycle obligations of the consuming component.

Keep the definition data-only and independent of CSS IDs. A new component binding does not require a new preset; add one only for a distinct reusable behavior.

`resolveMotionPreset` reads the prefix's `.duration` and `.easing` values from the shared registry. For example, `motion.surface.enter` resolves the existing popup pair, not a sampled spring. The resolved `response` field is that compact pair; the field name does not imply a physical response or generated data.

## Applying a preset

Use the component's existing animation owner. Don't wrap an already animated widget in another effect.

| Consumer | Integration |
| --- | --- |
| CSS transition or keyframes | Consume semantic variables and transition composites from [`getMotionCssVariables`](./motionRecipes.ts). [`motionPresetBindings.ts`](./motionPresetBindings.ts) binds each phase to its duration and easing tokens |
| Web Animations | Resolve surface presence with [`resolveMotionPresetEffect`](./motionPresets.ts), supply component-owned scale, and play it through a registered [`MotionController`](../../../../base/browser/ui/animations/motion.ts). Omit scale to leave an existing transform untouched |
| Custom rendering | Use [`resolveMotionPreset`](./motionPresets.ts) for paired timing. Keep drawing, cadence, and lifecycle with the component |

Use separate phase bindings where timings differ, even if the current normalized curves match. See the [implementation reference](#implementation-reference) for CSS compositions.

## Measured motion behavior

The optional authoring candidates are not imported by the shared runtime registry or production presets. For a unit step from rest, they use `p(t) = 1 - (1 + ωt) exp(-ωt)`, with `ω = 2πf`, frequency in hertz, and time in seconds. The compiler solves the endpoint-residual limit and samples within an interpolation-error budget, including endpoint adjustment and rounding. Multiply fractional error by actual travel to evaluate its visual bound.

Edit [the response parameters](./motionResponsePresets.json) and follow the [generate-and-check workflow](../../../../../../.github/skills/motion-design/SKILL.md#generate-and-check); never hand-edit generated curves. Record metrics with their source revision, method, and units.

- **Settling:** for comparable finite transitions, use a 2%-remaining settling band. Settling is the earliest time after which displacement stays within 2% of the requested travel, not the first time it enters that band. State the analysis horizon and any separate velocity criterion. A finite export's duration, tail, or endpoint snap isn't itself proof of settling.
- **Speed:** express velocity in travel fractions per second. For progress `p(t)`, this is `dp/dt` with time in seconds; multiplying by travel in pixels gives pixels per second. A curve's slope against normalized time must also be divided by duration. Report peak and terminal speed, and treat zero travel separately. Opacity and scale rates aren't pixel speeds without a defined geometric mapping.
- **Overshoot:** report excursions beyond the destination relative to travel and in the rendered geometry. Check both opening and closing. A bounded control or disclosure must not borrow bounce from an unrelated expressive effect.
- **Derivation:** record an easing's control points and duration, or a spring's parameters and initial conditions. For an export, include sampling error, truncation, and endpoint behavior. A numerical tolerance describes approximation, not an acceptable amount of visible error at every scale. Test the analytic response and exported approximation separately; neither proves usability.
- **Interruption:** check retargeting at several points, including reversal. Record position continuity and velocity continuity separately; restarting from the displayed position can still change speed abruptly.
- **Runtime cost:** inspect frame pacing, layout, paint, and active rendering after completion, hiding, or disposal in the actual host. Compositor-friendly properties don't guarantee smooth frames; intrinsic-size disclosure and selection-width changes need layout-cost checks.

Some deliberate easing curves have an unbounded derivative at an endpoint even though their visual range is bounded. Report that limit instead of treating a finite sampling rate as a finite peak speed. Inspect the onset or departure in context; such a curve isn't a physical trajectory merely because its duration and progress can be measured. Stepped and continuous activity need cadence and lifecycle checks rather than a finite-transition settling claim.

The [composition tests](../../test/common/motionRecipes.test.ts) and [controller tests](../../../../base/test/browser/ui/animations/motion.test.ts) cover implementation behavior. They don't establish a perceptual threshold or substitute for scenario checks.

## Validate the product scenario

Validate the entire interaction at normal speed in its actual host. Slow playback is for inspecting mechanics, not judging responsiveness.

- Exercise representative travel and content sizes, repeated input, reversal, and cases where motion must not run.
- Check pointer and keyboard access, theme contrast, reduced motion, preference changes during playback, and screen-reader output.
- Confirm hiding or disposing an effect stops unnecessary work without changing the operation's state.
- Measure layout and paint cost. Correct equations and compositor-friendly properties do not guarantee smooth frames.
- Judge whether the result improves clarity without delaying action or demanding repeated attention. A fixture establishes only the behavior it renders.

For awaited content, test immediate completion, a prolonged request, overlapping providers, failure, and disposal. The sessions list retains rows during refresh, sets its busy state immediately, and delays only its progress indicator by 150 ms to avoid a flash. This feedback threshold is not an animation duration or an extra wait on data. Frequent question navigation remains immediate; the content-replacement preset serves the first usable content after loading.

## Source ownership

| Owner | Maintains |
| --- | --- |
| [Response parameters](./motionResponsePresets.json) and [compiler](../../../../../../.github/skills/motion-design/scripts/generate-motion-responses.mjs) | Optional authoring candidates, provenance, and accuracy limits; not product defaults |
| [Presets](./motionPresets.ts) | Reusable definitions and applicability, referencing registry-owned timing pairs |
| [Bindings](./motionPresetBindings.ts), [registry](../motionRegistry.ts), and [effect adapters](./motionRecipes.ts) | Semantic token mappings, CSS variables, and executable effects |
| Product component | Geometry, state, focus, lifecycle, and owning tests |

Change a shared definition at its owner and validate the affected consumers. Keep one source for each decision rather than maintaining copies in fixtures or documentation.

## Implementation reference

These examples show how components can bind effects to existing CSS variables. Resolve their timing from the source rather than copying values; the component remains responsible for behavior and accessibility.

### Component integration

Share only parameters that represent reusable choices. [motionRecipes.ts](./motionRecipes.ts) supports literal geometry alongside purpose-specific parameters. Components own state, accessibility, focus, interruption, and lifecycle; don't add a second animation around an effect the component already owns.

### Easing

Easing describes the distribution of change over time. Judge it with its duration and actual travel: the same normalized curve can feel very different at another speed or scale.

Start with a preset's paired timing. Use deliberate easing when it serves the intent; don't force every finite response into a spring or select a curve independently from its duration.

Inspect the static speed profile and judge responsiveness at actual speed. Optional slow playback is an inspection aid, never the default demonstration of an intended interaction.

Only retain reusable curves with a supported purpose and consumer. State and selection retain their established feedback curves; popup entrance and exit retain their paired timings; deceleration supports brief hover and press feedback; linear supports measured progress and activity. Component-owned voice crossfades and sampled authoring candidates are not global easing families. Unused acceleration/deceleration strength variants are not a foundation simply because their formulas are available.

#### Linear

Use a constant rate for steady activity or interpolation between reported progress values. It avoids suggesting acceleration toward an unknown completion time. It is usually a poor fit for a surface that needs to arrive and settle.

#### Accelerate

Acceleration can make a departure less emphatic, but no independent acceleration family is currently justified by a consumer in this system. Use the existing shorter surface-exit pair. Introduce a distinct curve only after a real departure demonstrates a missing benefit, and release input and focus immediately.

#### Decelerate

Use deceleration for an arrival or a small state change that should be noticed quickly and settle gently. Preserve a clear origin, and avoid a large initial jump or a lingering tail.

#### Ease-in-out

The current established use is a gentle color crossfade between voice states while the input remains still. It is component-specific pacing, not a second default for selection, disclosure, or other spatial feedback. Do not apply it to directly controlled movement such as dragging a sash.

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
	transition-timing-function: var(--vscode-motion-surface-enter-easing);
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
	transition: var(--vscode-motion-disclosure-collapse-transition);
}
.details.is-open {
	grid-template-rows: 1fr;
	opacity: 1;
	visibility: visible;
	transition: var(--vscode-motion-disclosure-expand-transition);
}
.details > * { min-height: 0; overflow: hidden; }
.monaco-reduce-motion .details { transition: none; }
```

### Content replacement composition

Preserve each view's selection and scroll position. Commit the new content immediately; animation must not gate input or move focus automatically.

```css
.incoming-content {
	opacity: 0;
	transition: opacity var(--vscode-motion-content-enter-duration)
		var(--vscode-motion-content-enter-easing);
}
.incoming-content.is-ready { opacity: 1; }
.monaco-reduce-motion .incoming-content { transition: none; }
```

### Control feedback composition

Update checked or selected state immediately. Retarget an interrupted transition instead of queuing input; never animate keyboard focus from one control to another.

For movement within a fixed control, animate the indicator's transform rather than its layout position. Derive its endpoints from the control's bounds, and keep intermediate states in the same coordinate system so they can be interrupted without a jump. This avoids repeated layout during travel; it doesn't imply that speed remains continuous when direction changes.

```css
.state-control {
	transition: var(--vscode-motion-state-change-transition);
}
.state-control .thumb {
	transition: var(--vscode-motion-state-indicator-transition);
}
.segmented-control .selection {
	transition: var(--vscode-motion-selection-change-transition);
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
	transition: var(--vscode-motion-notification-enter-transition);
}
.monaco-reduce-motion .notification { transition: none; }
```

# Review guidance

Judge a topic or a guidance change and return findings. Don't edit.

## Scope

- **Topic:** the owning spec, its chapter composition, examples, and captions.
- **Change:** the diff to specs, bindings, or examples, plus the UI change that prompted it, if any.

Read the complete subject and its neighbors before judging. Compare terminology and hierarchy, not a fixed template.

## Check

1. **Fit.** The opening states the job, when it applies, and its boundary, within the [author](author.md) length limits.
2. **Decisions first.** Selection guidance comes before examples and reference detail.
3. **Owners.** Each rule lives once. Principles link to [shared design philosophy](../foundations/principles.design.md); implemented values and APIs link to code.
4. **Accuracy.** Rules match the current implementation, or the gap is named as an unresolved decision. A changed rule is justified by the change, not just restated to match it.
5. **Strength.** Rules keep their original scope; local or draft guidance isn't promoted to policy.
6. **Accessibility.** Obligations are visible before the affected action; examples have text equivalents.
7. **Discovery.** Generated discovery routes to the spec, and a task-phrased search finds it.

## Phrase the finding

Describe the design rather than leading with a number. Name the feeling, surface, principle, and proposed move; include a measurement only when it clarifies the evidence.

| Less actionable | More actionable |
| --- | --- |
| "The corner should be 6px." | "This overlay uses the control radius; follow the outer-surface role." |
| "Add 2px of padding." | "This content is off the spacing scale and needs more breathing room." |
| "Make this 14px." | "This label needs the hierarchy of the `label1` role." |
| "Shrink this icon." | "This is dense secondary chrome; use the compact glyph and preserve its hit target." |
| "Change this gray." | "This surface uses the wrong theme role and disappears in high contrast." |
| "The ring shows on click." | "The focus cue should follow keyboard intent, not pointer activation." |
| "The transition is slow." | "This routine action feels delayed; keep the state change immediate." |

Name these in order: the feeling, the surface, the principle, and the proposed move. Include a measurement only when it clarifies the evidence. Keep one observation focused on one surface and principle.

Attach a screenshot or short motion clip when useful, and name the view, theme, density, and state shown. Separate multiple issues so each can be discussed and resolved on its own.

## Validate in use

- Follow the interaction beyond the resting screenshot: hover, keyboard use, focus, selection, open and close, resize, and relevant theme changes.
- Confirm that the observed state is real; synthetic events or a computed value alone may not establish the rendered behavior.
- Check the owning component and neighboring consumers before recommending a shared change.
- Check the relevant themes, density, window types, and user preferences; equivalent uses should receive the same fix unless the difference is intentional.
- For motion, compare enabled and reduced-motion behavior, repeated input, interruption, and cleanup. The task should remain understandable without movement.
- Review the final result after refinements. State what was tested and what remains unverified.

Respect existing preferences and rollout controls when proposing a new default. A screenshot of one state is not proof of keyboard behavior, theme coverage, or the complete interaction.

## Report

List findings by impact. For each, give the location, the evidence, the principle or owner it breaks, and a concrete remedy. Separate blocking issues from suggestions, and say what you didn't check.

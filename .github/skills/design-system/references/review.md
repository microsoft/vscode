# Review guidance

Judge a topic or a guidance change and return findings. Don't edit. This reviews guidance itself; it is not an extra gate for ordinary UI work.

## Scope

- **Topic:** the owning spec, examples, and captions; optional chapter composition only when it is part of the review.
- **Change:** the diff to specs, bindings, or examples, plus the UI change that prompted it, if any.

Read the complete subject and its neighbors before judging. Compare terminology and hierarchy, not a fixed template.

## Check

1. **Fit.** The opening states the job, when it applies, and its boundary, within the [author](author.md) length limits.
2. **Decisions first.** Selection guidance comes before examples and reference detail.
3. **Owners.** Each rule lives once. Design reasoning links to the [design principles](../foundations/principles.design.md); implemented values and APIs link to code.
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
| "The title looks thin." | "The heading is missing the semibold weight." |
| "Use weight 500 here." | "This weight is off the type scale; use the regular or semibold role." |
| "This border is too thick." | "Standard borders use the one registered stroke; preserve thicker focus and semantic strokes." |
| "The command center has a box around it." | "Chrome should be quiet at rest and reveal on hover." |
| "The list is cut off at the bottom." | "The surface is missing its scroll-shadow fade." |
| "The pane header has a hard edge." | "Modern UI pane headers are rounded and use a short inset separator, not a full-width rule." |

Name these in order: the feeling, the surface, the principle, and the proposed move. Include a measurement only when it clarifies the evidence. Keep one observation focused on one surface and principle.

A taste claim with no rule, or a fix with no stated feeling, fixes one spot and drifts. Name the value or principle so the fix lands everywhere.

Attach a screenshot or short motion clip when useful, and name the view, theme, density, and state shown. Separate multiple issues so each can be discussed and resolved on its own.

## Validate in use

Apply behavior and rendering checks when the review covers those changes or claims. A prose-only review needs source, editorial, and link checks, not an external viewer.

- Follow the interaction beyond the resting screenshot: hover, keyboard use, focus, selection, open and close, resize, and relevant theme changes.
- Confirm that the observed state is real; synthetic events or a computed value alone may not establish the rendered behavior. Check empty and already-open states too, and use the [rendered-state guidance](../../ux-theming/SKILL.md#testing-rendered-interaction-states) and [fixture validation](../../component-fixtures/SKILL.md#validating-fixtures) to keep that evidence honest.
- Check the owning component and neighboring consumers before recommending a shared change.
- Check the relevant themes, density, window types, and user preferences; equivalent uses should receive the same fix unless the difference is intentional.
- For motion, compare enabled and reduced-motion behavior, repeated input, interruption, and cleanup. The task should remain understandable without movement.
- Understand feedback before chasing it. Several review comments may describe one problem, or include an incorrect proposed remedy. Verify the failure and the API contract, group duplicate findings by root cause, and fix the affected consumers together. A green check may miss the experience entirely, and a passing rerun isn't an explanation.
- Spend CI time on a question. Batch the smallest checks that could disprove the fix, including affected shared consumers. Separate implementation, fixture-contract, and infrastructure failures using the failed step and logs, not the color of the check. Record the revision, commands, results, and gaps, and don't reshape the UI to chase an unrelated setup failure. Follow the [CI investigation workflow](../../fix-ci-failures/SKILL.md) when remote checks fail.
- Check the guidance itself. A reusable CSS example is an implementation others will copy: verify that its combined-state selectors express the stated precedence, including intentionally focusable disabled controls. Parse Markdown after structural edits, because a missing blank line before `---` can turn prose into a heading.
- Review the final result after refinements. State what was tested and what remains unverified.

Respect existing preferences and rollout controls when proposing a new default. A screenshot of one state is not proof of keyboard behavior, theme coverage, or the complete interaction.

## Report

List findings by impact. For each, give the location, the evidence, the principle or owner it breaks, and a concrete remedy. Separate blocking issues from suggestions, and say what you didn't check.

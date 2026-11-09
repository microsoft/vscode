---
name: motion-design
description: 'Use when designing, deriving, auditing, implementing, or validating VS Code motion, animation, transitions, easing, springs, or motion presets. Guides intent-first contracts, source-generated responses, and component validation.'
---

# Motion design

Use this workflow to design, implement, or audit motion, not merely to look up a token. Read [MOTION.md](../../../src/vs/platform/theme/common/motion/MOTION.md) before choosing values. It owns the principles, foundations, preset contract, patterns, accessibility, and validation guidance. This skill makes that method executable; it adds no runtime or external dependency.

The system moves from intent to properties and paired timing, primitives, presets, component binding, and product behavior. Motion patterns are usage guidance, not another runtime layer. Question missing intents or duplicated roles rather than treating an existing catalog or a few examples as the design brief.

## Workflow

1. **Define intent and constraints.** Establish the interaction, frequency, geometry, access, and what must remain immediate. Follow [Define intent](../../../src/vs/platform/theme/common/motion/MOTION.md#define-intent), [Set constraints](../../../src/vs/platform/theme/common/motion/MOTION.md#set-constraints), and the [preset contract](../../../src/vs/platform/theme/common/motion/MOTION.md#preset-contract). Use the [design-system book](../../design-system/README.md) to discover sources; a visible canvas isn't required.
2. **Choose and bind.** Reuse a fitting definition from [motionPresets.ts](../../../src/vs/platform/theme/common/motion/motionPresets.ts), choose stillness, or identify the missing behavior. Follow [Choose a motion approach](../../../src/vs/platform/theme/common/motion/MOTION.md#choose-a-motion-approach) and [Applying a preset](../../../src/vs/platform/theme/common/motion/MOTION.md#applying-a-preset). The component owns geometry, state, focus, presence, interruption, reduced motion, and disposal; resolving a preset doesn't enforce them.
3. **Validate in context.** Apply [Measured motion behavior](../../../src/vs/platform/theme/common/motion/MOTION.md#measured-motion-behavior) and [Validate the product scenario](../../../src/vs/platform/theme/common/motion/MOTION.md#validate-the-product-scenario). Test the changed behavior and its meaningful edge cases; reuse valid evidence for unchanged components rather than repeating an example-review cycle. Distinguish analytic response, exported approximation, and observed runtime; position continuity is not velocity continuity, and correct math doesn't certify usability.
4. **Apply to the intended uses.** Review affected consumers when changing shared defaults. Preserve deliberate immediate behavior, activity cadence, and expressive choreography; not every change needs a spring. Invoke [component-fixtures](../component-fixtures/SKILL.md) for fixture work, and use real components without duplicating examples as a validation gallery.

Keep canonical presets data-only and independent of CSS IDs. [motionPresetBindings.ts](../../../src/vs/platform/theme/common/motion/motionPresetBindings.ts) maps definitions to consumer tokens, and [motionRecipes.ts](../../../src/vs/platform/theme/common/motion/motionRecipes.ts) adapts effects for CSS and Web Animations. Neither is another design catalog. Update canonical guidance when semantics change; follow [book authoring conventions](../../design-system/authoring.md) and keep copied numerical tables out of page definitions.

## Generate and check

[motionResponsePresets.json](../../../src/vs/platform/theme/common/motion/motionResponsePresets.json) is the authoritative input for the generated responses. Edit its parameters or derivation choices, not generated [motionResponses.ts](../../../src/vs/platform/theme/common/motion/motionResponses.ts). Keep upstream identity and adaptations with the source; don't imply exact upstream CSS reproduction.

`responsive` and `settled` are two tempos of the same normalized critical response, not different physical families. Their mathematical derivation supplies paired timing and curves. Property choice, geometry, suitability, and the need for motion remain design decisions; a spring isn't mandatory.

From the repository root, generate after an authorized source change, then check reproducibility:

```sh
node .github/skills/motion-design/scripts/generate-motion-responses.mjs
node .github/skills/motion-design/scripts/generate-motion-responses.mjs --check
```

In a read-only audit, run only `--check`. Inspect generated duration-and-easing pairs together; the registry resolves named responses into product token defaults. Run the compiler's focused mathematical tests when derivation or sampling changes:

```sh
node --test .github/skills/motion-design/scripts/motion-responses.test.mjs
```

Don't implement another sampler in a document, fixture, or book adapter. Generation doesn't validate lifecycle, runtime performance, or suitability.

Finite exports don't supply live velocity continuity. If a gesture or retargeting contract needs that behavior, use the canonical approach guidance and validate the runtime separately.

## Inspect and validate

Read current definitions and calculated timing without launching the product. If the private viewer is installed in this checkout, use:

```sh
node .github/extensions/vscode-design-system/scripts/book.mjs read --topic motion --limit 24000
```

`motion-analysis` entries describe resolved source values. Confirm the preset, binding, and response identity before using them as evidence. Check `truncated` before assuming the response contains the whole catalog. Unsupported timing functions carry a reason, not substitute measurements.

For changes to the calculation or its source bindings, run the viewer's focused tests from its separate source clone, with this checkout as the working directory. Then validate the installed viewer's Motion topic:

```sh
node --test /path/to/vscode-design-system/tests/motion-analysis.test.mjs /path/to/vscode-design-system/tests/motion.test.mjs
node .github/extensions/vscode-design-system/scripts/book.mjs validate --topics motion
```

For implementation changes, run the owning component's relevant tests and inspect the actual use at normal speed. Use the same inputs when comparing alternatives; optional slow playback explains mechanics, not suitability. Include repeated input, interruption, reduced motion, preference changes, and cleanup rather than validating only a settled screenshot.

Report observed results and limitations. Don't create a parallel report or gallery by default, or describe untested behavior as verified.

# Typography

## Introduction

Help people find the main task and read its supporting information by choosing text roles before sizes. This guidance covers workbench UI, not user-configured editor content.

## Hierarchy and reading rhythm

Apply [One thing leads](../skills/design-philosophy/SKILL.md#4-one-thing-leads-the-rest-supports) through headings, reading text, and control labels. Start with the existing component's style contract.

In a new composition, identify the leading content, sustained reading, and compact context. If it feels crowded, reconsider grouping and available space before shrinking text.

## UI type roles

Choose by purpose, even when two roles share a size:

- **Headings:** use the largest heading, title, or subtitle role according to the section's place in the hierarchy.
- **Body:** use primary body for reading and secondary body for supporting text.
- **Labels:** use the section/tab, metadata, or badge role for compact identifying information.

Headings use semibold; body and labels use regular. [Registrations](../../src/vs/platform/theme/common/sizes/baseSizes.ts) own sizes and weights; this ramp does not mandate restyling existing widgets.

## Weight and emphasis

Use semibold to emphasize text without changing its role size. Ordinary text remains regular.

The shared UI ramp has no intermediate weight such as 500. Preserve inherited and relative weight expressions unless intentionally changing their behavior.

## Hierarchy in practice

The heading leads, supporting text stays readable, and compact labels identify context without competing.

## Reading metrics

Preserve the component's line-height and tracking. The registry defines no shared role-specific scale for these metrics.

The specimen shows the workbench baseline, not a prescription for every text surface.

## Font families

Retain the workbench's platform- and language-aware font choices. The specimens show native interface and monospace stacks; actual availability depends on the machine.

Editor content follows its configured family, size, weight, line-height, and letter spacing. Do not normalize these preferences to the UI ramp.

## Accessibility

- Check long translations, narrow containers, and zoom for clipped glyphs, overlapping lines, and lost labels. Preserve reading metrics rather than shrinking text.
- Follow [text-overflow guidance](../skills/ux-css-layout/SKILL.md#9-text-overflow-ellipsis) for compact labels, including access to full text. Do not apply single-line truncation indiscriminately to reading text.
- Preserve theme-aware foreground/background pairs and [check rendered contrast](./colors.design.md#preserve-component-contracts), including supporting text, in light, dark, and both high-contrast themes.
- Associate labels with controls through supported semantics; visual size and weight do not supply accessible names.
- Use supported heading semantics to expose document structure. A visual type role does not determine a semantic heading level.

## Build and review

Apply registered roles through the component's style contract and [CSS token guidance](../instructions/design-tokens.instructions.md#font-size). Keep values in [baseSizes.ts](../../src/vs/platform/theme/common/sizes/baseSizes.ts), not copied tables.

- The intended content leads; supporting information remains readable without competing.
- Equivalent text elements share roles, and strong emphasis retains its role size.
- Shared component styles and inherited behavior are preserved.
- Editor font preferences remain effective.
- Long translations, narrow containers, and zoom leave glyphs and labels readable.
- Text remains readable across theme types, including supporting descriptions.
- Control names and roles convey meaning without relying on visual hierarchy alone.
- Headings expose the intended document structure independently of their visual type roles.

Check source choices, then rendered readability and relevant screen-reader behavior. Record untested conditions; correct tokens alone do not prove readable typography.

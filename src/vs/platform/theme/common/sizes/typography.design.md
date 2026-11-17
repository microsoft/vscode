# Typography

Authored guidance for choosing UI type roles. The registrations in [baseSizes.ts](baseSizes.ts) own the implemented values; editor font configuration is a separate contract.

Sources: [design philosophy](../../../../../../.github/skills/design-philosophy/SKILL.md), [design-token guidance](../../../../../../.github/instructions/design-tokens.instructions.md), [accessibility guidance](../../../../../../.github/skills/accessibility/SKILL.md), [layout guidance](../../../../../../.github/skills/ux-css-layout/SKILL.md).

## Introduction

Type roles carry hierarchy. Choose the role before choosing a font stack. Make the main task easy to find, supporting information readable, and equivalent content consistent.

## Hierarchy and reading rhythm

Use headings, body text, and labels to distinguish the main task from supporting information. Start with the existing component or shared style contract. In a new composition, identify what should lead, what needs sustained reading, and what identifies controls or supplies compact context. If the surface feels crowded, reconsider grouping and available space before making its text smaller.

## Weight and emphasis

Strong text uses the same role size with semibold weight. The shared UI ramp has two registered weights; editor text has its own configurable font settings.

Use regular for ordinary text and semibold for headings or deliberate emphasis. Hierarchy establishes a text element's role; emphasis draws attention within that role. Do not introduce a medium UI weight such as 500 or enlarge text merely to make it strong. Preserve inherited and relative weight expressions unless their behavior is intentionally being changed.

## UI type roles

Headings use semibold; body and labels use regular. Sizes and use labels come from the current registrations.

Rank the content before choosing the role:

- **Headings:** use the largest heading, title, or subtitle role according to the section's place in the hierarchy.
- **Body:** use primary body for reading and secondary body for supporting text.
- **Labels:** use the section/tab, metadata, or badge role for compact identifying information.

Choose by purpose even when two roles have the same size today. Do not make every line equally prominent or compensate for weak hierarchy with arbitrary sizes. Reuse shared components before applying roles individually; this ramp is not a mandate to restyle every existing widget.

## Hierarchy in practice

Keep the main task readable. Use a quieter style for supporting context, and reserve strong emphasis for the information that needs to lead.

## Reading metrics

The base registry does not define a shared role-specific line-height or tracking scale. Preserve the owning component's reading metrics; the workbench baseline shown in the example is an implementation value, not a prescription for every text surface.

## Font families

Native interface and monospace stacks for each platform. Actual font availability depends on this machine.

Editor font settings are separate from the UI type ramp. Retain the workbench's platform- and language-aware family choices rather than imposing a specimen's stack on shared UI. Editor content follows its configured family, size, weight, line-height, and letter spacing; do not normalize it to the UI ramp.

## Accessibility

- **Reading space:** check longer localized text, narrow containers, and zoom for clipped glyphs, overlapping lines, and lost labels. Preserve the component's line-height and layout behavior instead of fixing crowding with smaller type.
- **Truncation:** follow the [text-overflow guidance](../../../../../../.github/skills/ux-css-layout/SKILL.md#9-text-overflow-ellipsis) for compact labels, including access to the full text. Do not apply a single-line truncation treatment indiscriminately to reading text.
- **Contrast:** supporting text must remain readable. Preserve the component's theme-aware foreground/background pairs and [check rendered contrast](../colors/colors.design.md#preserve-component-contracts) in light, dark, and both high-contrast themes.
- **Meaning:** visual size and weight do not replace accessible names and roles. Associate control labels with their controls using the supported semantics.
- **Heading structure:** visual type roles do not set semantic heading levels. Use the owning component's supported heading semantics to expose document structure; do not infer a heading level from a font token's name.

## Build and review

Use the [registered type roles and weights](baseSizes.ts) through the owning component's style contract. Keep values in the registrations, preserve editor preferences, and follow the [CSS token guidance](../../../../../../.github/instructions/design-tokens.instructions.md#font-size) for application.

- The intended content leads; supporting information remains readable without competing.
- Equivalent text elements share roles, and strong emphasis retains its role size.
- Shared component styles, inherited behavior, and editor font preferences are preserved.
- Longer localized text, narrow containers, and zoom do not produce clipped glyphs, overlapping lines, or inaccessible labels.
- Text remains readable across theme types, including supporting descriptions.
- Control names and roles convey meaning without relying on visual hierarchy alone.
- Headings expose the intended document structure independently of their visual type roles.

Check source choices first, then inspect the rendered result and relevant screen-reader experience. Record untested conditions separately; correct tokens alone do not prove readable typography.

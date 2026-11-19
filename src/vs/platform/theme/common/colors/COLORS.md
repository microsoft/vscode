# Color foundations and component aliases

For design choices, semantic feedback, and accessibility, read [Colors design](../../../../../../.github/design-system/colors.design.md). This document owns the existing alias and customization contract.

Choose a color by its intended property and purpose, not by a matching hex value. The usage-oriented registrations in [semanticColors.ts](./semanticColors.ts) form the shared foundation. Component and feature registrations remain the public theming contract for existing UI.

| Property | Purpose | Example foundation | Existing alias |
| --- | --- | --- | --- |
| Text | Default content, emphasis, links, disabled state, or failures | `color.text`, `color.text.link` | `foreground`, `textLink.foreground` |
| Icons | Neutral indicators or error, warning, information, and success states | `color.icon`, `color.icon.success` | `icon.foreground`, `testing.iconPassed` |
| Background | Main content, raised content, editable areas, accent, or feedback | `color.background.canvas`, `color.background.accent` | `editor.background`, `button.background` |
| Border | Keyboard focus, additional contrast, or feedback | `color.border.focus`, `color.border.error` | `focusBorder`, `inputValidation.errorBorder` |

Use the shared widget style APIs, such as `defaultButtonStyles` and `defaultInputBoxStyles`, when building existing controls. They preserve foreground/background pairs, interaction states, component-specific overrides, and high-contrast behavior. Use foundation roles directly for new custom content only when an existing component does not already express the interaction.

## Compatibility

Existing color identifiers are not deprecated or renamed. A component's explicit theme value or `workbench.colorCustomizations` value still wins over its default alias. Built-in theme files retain their existing overrides; moving a default into a foundation does not retheme current UI or change whether a legacy color is explicitly defined.

Keep derived defaults connected to their existing dependencies. For example, button hover still derives from `button.background`, supporting descriptions still derive from `foreground`, and high-contrast validation borders still honor `contrastBorder`. Replacing those dependencies with a parallel foundation would break existing customizations.

Aliases may retain a compatibility value where the intended foundation differs. The light-theme testing passed icon keeps its historical value, while `color.icon.success` uses the darker success color for new indicators on light surfaces.

## Usage

Follow [the component-preservation guidance](../../../../../../.github/design-system/colors.design.md#preserve-component-contracts).

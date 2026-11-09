# Color foundations and component aliases

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

- Reserve accent for a leading action. It is not a success or selection signal.
- Use semantic colors only for meaningful states, paired with text or recognizable indicators.
- Keep error text, error icons, message backgrounds, and borders separate. An icon color is not a message foreground.
- Do not replace component-specific editor, Git, terminal, or testing colors with an unrelated role because the values match.
- Keep hover, selection, and keyboard focus distinguishable. Use the owning widget's state styles.
- Verify contrast on the rendered surface, including transparency, in light, dark, and both high-contrast themes. A token name or swatch alone does not guarantee contrast.

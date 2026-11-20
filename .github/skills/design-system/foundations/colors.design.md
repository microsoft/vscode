---
title: "Colors"
kind: "foundation"
status: "stable"
order: 6
references:
  - title: "WCAG 2.2: Contrast (Minimum)"
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html"
    description: "Explains text-contrast thresholds and exceptions for large text and inactive controls, helping evaluate rendered foreground/background pairs rather than swatches."
legacyPaths:
  - ".github/design-system/colors.design.md"
  - "src/vs/platform/theme/common/colors/COLORS.md"
  - "src/vs/platform/theme/common/colors/color-guidance.md"
  - "src/vs/platform/theme/common/colors/colors.design.md"
---

# Colors

Choose color by purpose, then verify the rendered foreground/background pair. The product registrations own current values and compatibility behavior.

Sources: [baseColors.ts](../../../../src/vs/platform/theme/common/colors/baseColors.ts), [semanticColors.ts](../../../../src/vs/platform/theme/common/colors/semanticColors.ts), [defaultStyles.ts](../../../../src/vs/platform/theme/browser/defaultStyles.ts), [ux-theming implementation guidance](../../ux-theming/SKILL.md).

## Introduction

Use neutral surfaces to establish hierarchy, accent to guide action, and semantic colors to explain state. Keep foreground and background pairs theme-aware.

## Choose color by purpose

Start with what a color needs to communicate. Then choose the property, the emphasis, and the interaction state—not a feature name or a matching hex value.

Usage colors express intent. Existing component colors, such as button.background, are compatible aliases and can still be customized independently. Reuse a component’s default styles before applying individual colors.

The same color can have different values in light, dark, and high-contrast themes. Tokens with the same value today may intentionally diverge later.

## Let neutrals establish hierarchy

Keep the main task readable and the surrounding UI quieter. Use surface and foreground roles together, and distinguish supporting descriptions from unavailable actions.

## Reserve accent for the leading action

Give the next step the primary treatment and keep alternatives secondary. Accent is interactive emphasis, not a success signal or a permanent decorative fill.

Use color.background.accent with color.text.onAccent for new custom surfaces. In product UI, use defaultButtonStyles so the button-specific aliases and theme overrides remain intact.

## Use semantic color only when it has meaning

Error means a failure needs attention. Warning means caution or risk. Information provides context. Success confirms a favorable outcome.

Use color.icon.error, color.icon.warning, color.icon.info, or color.icon.success for new status indicators. Validation messages use the inputValidation aliases for their background, foreground, and border—not an icon color applied to the whole message.

Don’t use semantic colors for decoration or categories. Existing editor, Git, terminal, and testing colors remain tied to their component context.

## Keep selection separate from focus

Hover identifies a target. Selection marks chosen content. Focus shows where keyboard input goes. These states can coexist and should remain distinguishable.

Use focusBorder and the component’s selection aliases in existing widgets. New custom controls can use color.border.focus, but should not use it as a permanent accent border.

Check the rendered foreground/background pair, including transparency. Aim for WCAG AA: 4.5:1 for normal text, 3:1 for large text, and 3:1 for required UI boundaries and indicators. Color alone must never carry the meaning.

## Color reference

Usage-oriented colors come first. Include component aliases when working on an existing widget or feature. The list compares four themes without switching or reloading the article.

| Property | Purpose | Example foundation | Existing alias |
| --- | --- | --- | --- |
| Text | Default content, emphasis, links, disabled state, or failures | `color.text`, `color.text.link` | `foreground`, `textLink.foreground` |
| Icons | Neutral indicators or error, warning, information, and success states | `color.icon`, `color.icon.success` | `icon.foreground`, `testing.iconPassed` |
| Background | Main content, raised content, editable areas, accent, or feedback | `color.background.canvas`, `color.background.accent` | `editor.background`, `button.background` |
| Border | Keyboard focus, additional contrast, or feedback | `color.border.focus`, `color.border.error` | `focusBorder`, `inputValidation.errorBorder` |

Use the shared widget style APIs, such as `defaultButtonStyles` and `defaultInputBoxStyles`, when building existing controls. They preserve foreground/background pairs, interaction states, component-specific overrides, and high-contrast behavior. Use foundation roles directly for new custom content only when an existing component does not already express the interaction.

## Error feedback

Explain what went wrong and how to recover

## Warning feedback

Explain the risk before someone makes a mistake

## Information feedback

Give useful context without implying a problem

## Success feedback

Confirm what completed; don’t use green for an ordinary action

## Preserve component contracts

- Reserve accent for a leading action. It is not a success or selection signal.
- Use semantic colors only for meaningful states, paired with text or recognizable indicators.
- Keep error text, error icons, message backgrounds, and borders separate. An icon color is not a message foreground.
- Do not replace component-specific editor, Git, terminal, or testing colors with an unrelated role because the values match.
- Keep hover, selection, and keyboard focus distinguishable. Use the owning widget's state styles.
- Verify contrast on the rendered surface, including transparency, in light, dark, and both high-contrast themes. A token name or swatch alone does not guarantee contrast.

Existing color identifiers and customizations remain part of the public theming contract. An explicit theme value or `workbench.colorCustomizations` override continues to win over a default alias; built-in theme files retain their existing overrides, and changing a default must not silently retheme existing UI.

Keep derived defaults connected to their established dependencies. For example, button hover can derive from `button.background`, supporting descriptions from `foreground`, and high-contrast validation borders from `contrastBorder`. Replacing those dependencies with a parallel foundation can break existing customizations.

An alias may intentionally retain a compatibility value that differs from a foundation role. The light-theme testing-passed icon keeps its historical value, while `color.icon.success` uses the darker success color for new indicators on light surfaces. Reuse shared widget styles such as `defaultButtonStyles` and `defaultInputBoxStyles` before selecting individual colors.

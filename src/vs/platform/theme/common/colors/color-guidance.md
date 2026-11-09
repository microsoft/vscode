# Colors

Design guidance and example descriptions. Referenced registrations own the implemented values.

Sources: [COLORS.md](COLORS.md), [SKILL.md](../../../../../../.github/skills/ux-theming/SKILL.md).

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

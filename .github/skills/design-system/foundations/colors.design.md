---
title: "Colors"
kind: "foundation"
isDraft: true
order: 6
references:
  - title: "WCAG 2.2: Contrast (Minimum)"
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html"
    description: "Explains text-contrast thresholds and exceptions for large text and inactive controls, helping evaluate rendered foreground/background pairs rather than swatches."
presentation: "foundations"
specimens:
  roles:
    - - "Text and icons"
      - "Readable content, supporting information, and recognizable status"
    - - "Surfaces"
      - "Neutral structure, editable areas, and restrained accent"
    - - "Boundaries"
      - "Focus, separation, and messages that need attention"
  statusRoles:
    - - "Error"
      - $text: "Error feedback"
    - - "Warning"
      - $text: "Warning feedback"
    - - "Information"
      - $text: "Information feedback"
    - - "Success"
      - $text: "Success feedback"
  previews:
    surfaces:
      - "icon-label"
      - "Names, icons, and supporting descriptions in light and dark themes."
    accent:
      - "button"
      - "Primary, secondary, and disabled buttons. Use Tab to compare keyboard focus states."
    feedback:
      - "input"
      - "Information, warning, and error validation. Edit a field to see validation change."
    states:
      - "radio"
      - "Use Tab to focus a group and the arrow keys to change its selected option."
tokenDomain: true
sectionCopy:
  usage:
    label: "Color roles"
  surfaces:
    label: "Neutral hierarchy"
  accent:
    label: "Accent and actions"
  feedback:
    label: "Semantic feedback"
  states:
    label: "Interaction states"
---

# Colors

Choose color by purpose, then verify the rendered foreground/background pair. The product registrations own the current values.

Sources: [baseColors.ts](../../../../src/vs/platform/theme/common/colors/baseColors.ts), [defaultStyles.ts](../../../../src/vs/platform/theme/browser/defaultStyles.ts), [ux-theming implementation guidance](../../ux-theming/SKILL.md).

## Introduction

Use neutral surfaces to establish hierarchy, accent to guide action, and semantic colors to explain state. Keep foreground and background pairs theme-aware.

<a id="colors-usage"></a>
## Choose color by purpose

Start with what a color needs to communicate. Then choose the property, the emphasis, and the interaction state—not a feature name or a matching hex value.

Component colors, such as button.background, can be customized independently. Reuse a component’s default styles before applying individual colors.

The same color can have different values in light, dark, and high-contrast themes. Tokens with the same value today may intentionally diverge later.

<a id="colors-surfaces"></a>
## Let neutrals establish hierarchy

Keep the main task readable and the surrounding UI quieter. Use surface and foreground colors together, and distinguish supporting descriptions from unavailable actions.

<a id="colors-accent"></a>
## Reserve accent for the leading action

Give the next step the primary treatment and keep alternatives secondary. Accent is interactive emphasis, not a success signal or a permanent decorative fill.

In product UI, use defaultButtonStyles so the button-specific colors and theme overrides remain intact.

<a id="colors-feedback"></a>
## Use semantic color only when it has meaning

Error means a failure needs attention. Warning means caution or risk. Information provides context. Success confirms a favorable outcome.

Validation messages use the inputValidation colors for their background, foreground, and border—not an icon color applied to the whole message.

Don’t use semantic colors for decoration or categories. Existing editor, Git, terminal, and testing colors remain tied to their component context.

<a id="colors-states"></a>
## Keep selection separate from focus

Hover identifies a target. Selection marks chosen content. Focus shows where keyboard input goes. These states can coexist and should remain distinguishable.

Use focusBorder and the component’s selection colors. Do not use the focus color as a permanent accent border.

Check the rendered foreground/background pair, including transparency. Aim for WCAG AA: 4.5:1 for normal text, 3:1 for large text, and 3:1 for required UI boundaries and indicators. Color alone must never carry the meaning.

<a id="colors-palette"></a>
## Color reference

The list compares four themes without switching or reloading the article.

| Property | Purpose | Example colors |
| --- | --- | --- |
| Text | Default content, emphasis, links, disabled state, or failures | `foreground`, `textLink.foreground` |
| Icons | Neutral indicators or error, warning, information, and success states | `icon.foreground`, `testing.iconPassed` |
| Background | Main content, editable areas, accent, or feedback | `editor.background`, `button.background` |
| Border | Keyboard focus, additional contrast, or feedback | `focusBorder`, `inputValidation.errorBorder` |

Use the shared widget style APIs, such as `defaultButtonStyles` and `defaultInputBoxStyles`, when building controls. They preserve foreground/background pairs, interaction states, component-specific overrides, and high-contrast behavior.

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
- Do not replace component-specific editor, Git, terminal, or testing colors with an unrelated color because the values match.
- Keep hover, selection, and keyboard focus distinguishable. Use the owning widget's state styles.
- Verify contrast on the rendered surface, including transparency, in light, dark, and both high-contrast themes. A token name or swatch alone does not guarantee contrast.

Existing color identifiers and customizations remain part of the public theming contract. An explicit theme value or `workbench.colorCustomizations` override continues to win over a registered default; built-in theme files retain their existing overrides, and changing a default must not silently retheme existing UI.

Keep derived defaults connected to their established dependencies. For example, button hover can derive from `button.background`, supporting descriptions from `foreground`, and high-contrast validation borders from `contrastBorder`. Replacing those dependencies with unrelated colors can break existing customizations.

Reuse shared widget styles such as `defaultButtonStyles` and `defaultInputBoxStyles` before selecting individual colors.

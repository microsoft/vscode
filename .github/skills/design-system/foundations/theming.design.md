---
title: "Theming"
kind: "foundation"
isDraft: true
order: 7
presentation: "theming"
specimens:
  specimen: "Semantic roles stay the same while theme values change."
---

# Theming

## Introduction

Preserve semantic roles and readable interaction states across light, dark, and high-contrast themes. Use the [theming skill](../../ux-theming/SKILL.md) for color registration, widget styles, and implementation checks.

<a id="theming-guidance"></a>
## Keep meaning in high contrast

Use solid backgrounds, explicit contrast borders, and visible focus indicators. Do not rely on shadows or color alone.

<a id="theming-comparison"></a>
## Theme comparisons

For every UI or color change, verify the affected surfaces in these four built-in themes with their out-of-box defaults:

- Light 2026
- Dark 2026
- Dark High Contrast (HC Dark)
- Light High Contrast (HC Light)

These are required accessibility checks, not a requirement to retest the whole workbench. Do not rely on user color overrides to make the changed UI readable.

### Contrast and focus requirements

- Normal-size text, including placeholders, must reach **4.5:1** against its rendered background.
- Essential icons, control boundaries, and state indicators must reach **3:1** against adjacent colors.
- Keyboard focus must remain visible, with its indicator reaching **3:1** against adjacent colors, including when hover or selection is also active.

These minimums also apply in both HC themes. Aim for **7:1** normal-text contrast there when practical; that is the [enhanced AAA text target](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html), not an automatic consequence of selecting HC.

Use the [contrast and interaction-state guidance](../../ux-theming/SKILL.md#contrast-and-interaction-states) for composited backgrounds and disabled or decorative exceptions. The thresholds follow [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) requirements.

### Keep validation proportional

Check the changed UI in its relevant resting, hover, keyboard-focus, selected, and open states. Include combined states when they compete for the same foreground, background, or boundary.

Other built-in themes are best-effort compatibility coverage, not additional contrast or screenshot gates. Improve contrast where practical without making every change an all-theme sweep.

### Example: changing an action's background

When an action gains a background, check its text, icon, and focus indicator against that surface in all four required themes. Include hover and selected states if the action supports them.

If the pair fails, use the owning control's foreground/background palette rather than changing only the text to a color that works in one theme. In HC, preserve the explicit boundary instead of relying on a shadow.

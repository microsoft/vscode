---
title: "Illustration"
kind: "foundation"
status: "stable"
order: 15
aliases:
  - "illustrations"
  - "artwork"
legacyPaths:
  - ".github/design-system/guidance/illustration.design.md"
  - ".github/design-system/guidance/illustration.md"
  - ".github/design-system/illustration.design.md"
---

# Illustration

## Introduction

Use a simplified picture of VS Code when it explains a concept faster than text alone. Illustration supports onboarding and feature discovery, not controls, status, or error reporting.

## Usage

### When to use

| Moment | Use | Why |
| --- | --- | --- |
| Onboarding and walkthroughs | Yes | Shows a new concept faster than text. |
| Feature introductions | Yes | Explains what the feature helps people do. |
| Empty view where the user can act | Optional | Points to the next step. Drop it in narrow or busy views. |
| Errors, warnings, offline, blocked by policy | No. Use a Codicon. | Problems need clarity, not personality. |
| Lists, trees, toolbars, menus, hovers, notifications | No. Use Codicons. | Dense, repeated UI. |
| Loading and progress | No. Use the progress indicator. | Progress already shows that work is happening. |

Use [Codicons](iconography.design.md) for small control glyphs, not larger explanatory pictures.

In an empty state, the title, sentence, and action carry the meaning. The screen must still work if the art is removed.

### Product context

Draw the UI parts of the window where the idea happens. The illustration rules remain the same.

| Window | Kit parts |
| --- | --- |
| **Editor window** | Explorer, editor, tabs, and cursor |
| **Agents window** | Session list, chat, and composer |

Reuse kit parts instead of redrawing a window for each illustration.

## Principles

Apply [One thing leads](principles.design.md#4-one-thing-leads-the-rest-supports) within the picture: show one idea with one accent. Keep supporting shapes quiet without reducing meaningful contrast.

Reuse shared UI parts to apply [Sameness signals sameness](principles.design.md#6-sameness-signals-sameness). These are illustration-specific applications, not a separate set of design values.

## Visual style

| Property | Rule |
| --- | --- |
| **Subject** | Simplified VS Code UI: windows, panels, rows, and cursors. No people, hands, faces, or mascots. |
| **Fidelity** | Low to mid: recognizable product structure without pixel-perfect controls that could be mistaken for interactive UI. |
| **Text** | Use real words only for labels the idea depends on, such as a window or project name. Show all other content, such as code and messages, as rounded bars. |
| **Labels** | Short, localized, and in the workbench font. Leave room for longer translations. |
| **Structure** | Keep only relevant UI parts; derive depth from the window, panel, and row relationships, not added layers. |
| **One accent** | One accent element per illustration, such as the cursor, the active row, or the action. It shows where to look. |
| **Stroke** | 1 px, matching `strokeThickness`. Use `vector-effect="non-scaling-stroke"` if the art can scale. |
| **Spacing** | Use [spacing tokens](../../../../src/vs/platform/theme/common/sizes/baseSizes.ts). Align shapes to whole pixels and 1 px strokes to half pixels for sharp rendering. |
| **Corners** | Use `cornerRadius.xSmall` for bars, `cornerRadius.small` for inner panels, and `cornerRadius.medium` for illustrated windows. |
| **Fills** | Every shape has a solid fill or a stroke, so it stays visible in every theme. |
| **Empty or placeholder** | A dashed outline means "nothing here yet". |
| **Not allowed** | Gradients, drop shadows, textures, 3D, and visual filter effects such as blur, glow, or noise. |

These simplified shapes describe illustration artwork, not geometry for real controls or windows. Keep real labels short, localized, and limited to meaning the picture depends on.

### Color and theming

Illustrations are SVG. Every fill and stroke uses a VS Code color token, so the art follows the active theme, including custom themes.

| Shape | Token | High contrast |
| --- | --- | --- |
| Window, canvas | `editor.background` | Theme value |
| Side panel | `sideBar.background` | Theme value, separated by an outline |
| Raised part, such as a card or input | `editorWidget.background` | Theme value |
| Outline, divider | `panel.border` | `contrastBorder` |
| Text bars, placeholder content | `disabledForeground` | Theme value |
| Accent | `button.background` | `contrastActiveBorder` |
| Status, such as added or removed | `charts.green`, `charts.red` | Theme value |

- Use existing tokens first. If none fits, register a feature token with dark, light, high-contrast dark, and high-contrast light values.
- **No hex values** in shipped SVGs, including fallbacks. A fallback hides a missing token.
- **Status colors only for status**, never for decoration.
- **High contrast:** outline structure with `contrastBorder`, drop tints, and raise meaningful parts to full opacity.
- Check dark, light, high-contrast dark, and high-contrast light themes. Include one popular custom theme to expose unexpected token combinations.

### Animation

Keep illustrations static unless movement explains the idea. Follow [Motion](motion.design.md) for timing, reduced motion, and rendering cost.

- Animate only when the change is the idea, such as a before and after.
- Move the accent, not the whole scene.
- Play once. The final frame must explain the idea on its own, and is also the reduced-motion version.

## Accessibility

| Type | Markup | Example |
| --- | --- | --- |
| **Decorative** (default) | `aria-hidden="true"` and `focusable="false"` | Art above an empty-state title |
| **Informative** | `role="img"` with an `aria-label` describing the meaning, not the shapes | Walkthrough media |

- Never make an illustration the only way to understand a state or an error.
- Meaningful shapes need 3:1 contrast against the background.
- Use culturally neutral metaphors. Avoid gestures, hand signs, and region-specific symbols.

## Build and review

### Build and ship

| Topic | Rule |
| --- | --- |
| **Format** | Optimized SVG. No embedded images, fonts, or filter effects. |
| **Rendering** | Inline SVG so document `var(--vscode-*)` values resolve; these values do not reach an external `<img>` or CSS background image. |
| **Naming** | Lowercase kebab-case that names the subject, such as `empty-sessions.svg`. |
| **Location** | Next to the feature that uses it, in its `browser/media/` folder. Shared kit parts live in one common folder. |
| **Source of truth** | Code. SVGs and color tokens live in this repository, and this book reads them from code. |

### Review checklist

- The picture helps explain the concept; the screen remains understandable without it.
- One accent leads within recognizable, simplified product UI.
- Necessary labels remain readable after localization.
- Token-driven shapes remain distinguishable in all four theme types and a custom theme.
- Decorative art is hidden from screen readers; informative art has a meaningful label.
- Any animation explains a change and has a meaningful static alternative.

Check asset format and token registration in source, then inspect the illustration in context. A valid SVG alone does not establish clarity or contrast.

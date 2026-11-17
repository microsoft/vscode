# Illustration

## Introduction

Illustrations in VS Code are simplified pictures of the product UI. They explain an idea faster than text, follow the active theme through color tokens, and are never the only way to understand a screen.

## Principles

- **Calm:** few shapes, low contrast, one accent. The art sits back so the task stays in front.
- **Focused:** one idea per illustration. If the art needs a caption to make sense, simplify it.
- **Consistent:** one shared kit of UI parts and tokens, so every illustration looks like the same family.
- **Delightful:** delight comes from clarity and craft, not decoration.

## Usage

### When to use

| Moment | Use | Why |
| --- | --- | --- |
| Onboarding and walkthroughs | Yes | Shows a new concept faster than text. |
| Feature introductions | Yes | Shows the value before the user commits. |
| Empty view where the user can act | Optional | Points to the next step. Drop it in narrow or busy views. |
| Errors, warnings, offline, blocked by policy | No. Use a Codicon. | Problems need clarity, not personality. |
| Lists, trees, toolbars, menus, hovers, notifications | No. Use Codicons. | Dense, repeated UI. |
| Loading and progress | No. Use the progress indicator. | Progress already shows that work is happening. |

Codicons are small, single-color glyphs for controls. Illustrations are larger pictures that explain an idea. Don't use one in place of the other.

In an empty state, the title, sentence, and action carry the meaning. The screen must still work if the art is removed.

### Product context

Both windows follow the same rules. Only the subject changes: draw the UI parts of the window the idea happens in.

| Window | Kit parts |
| --- | --- |
| **Editor window** | Explorer, editor, tabs, and cursor |
| **Agents window** | Session list, chat, and composer |

Reuse kit parts instead of redrawing a window for each illustration.

## Visual style

| Property | Rule |
| --- | --- |
| **Subject** | Simplified VS Code UI: windows, panels, rows, and cursors. No people, hands, faces, or mascots. |
| **Fidelity** | Low to mid. Use blocks, bars, and only the icons or labels the idea needs, not pixel-perfect UI. This keeps the art from being mistaken for real UI and keeps it accurate as the product changes. It must still be easy to tell which part of VS Code it shows. |
| **Text** | Use real words only for labels the idea depends on, such as a window or project name. Show all other content, such as code and messages, as rounded bars. |
| **Labels** | Short, localized, and in the workbench font. Leave room for longer translations. |
| **Simplify the real UI** | Keep only the UI parts the idea needs, and drop the rest. Depth comes from the UI's own structure (window, panel, row), not from added layers. |
| **One accent** | One accent element per illustration, such as the cursor, the active row, or the action. It shows where to look. |
| **Stroke** | 1 px, matching `strokeThickness`. Use `vector-effect="non-scaling-stroke"` if the art can scale. |
| **Spacing** | Spacing tokens only, such as `spacing.size40` (4) and `spacing.size80` (8). Place shapes on whole pixels and 1 px strokes on half pixels so they render sharp. |
| **Corners** | Corner radius tokens only: `cornerRadius.xSmall` (2) for bars, `cornerRadius.small` (4) for inner panels, `cornerRadius.medium` (6) for windows. |
| **Fills** | Every shape has a solid fill or a stroke, so it stays visible in every theme. |
| **Empty or placeholder** | A dashed outline means "nothing here yet". |
| **Not allowed** | Gradients, drop shadows, textures, 3D, and visual filter effects such as blur, glow, or noise. |

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

- **Existing tokens first.** If none fits, register a feature token in code with dark, light, high contrast dark, and high contrast light values.
- **No hex values** in shipped SVGs, including fallbacks. A fallback hides a missing token.
- **Status colors only for status**, never for decoration.
- **High contrast:** outline structure with `contrastBorder`, drop tints, and raise meaningful parts to full opacity.
- **Check themes by type, not one by one.** Themes are unlimited. Check dark, light, high contrast dark, and high contrast light, plus one popular custom theme to catch tokens that a theme changes in surprising ways.

### Animation

Illustrations are static by default. This section covers only when an illustration itself moves. For timing, easing, reduced motion, and CPU cost, follow the [Motion](../../../src/vs/platform/theme/common/motion/MOTION.md) page.

- Animate only when the change is the idea, such as a before and after.
- Move the accent, not the whole scene.
- Play once. The final frame must explain the idea on its own, and is also the reduced-motion version.

## Accessibility

| Type | Markup | Example |
| --- | --- | --- |
| **Decorative** (default) | `aria-hidden="true"` and `focusable="false"` | Art above an empty-state title |
| **Informative** | `role="img"` and an `aria-label` that describes the meaning, not the shapes | Walkthrough media |

- Never make an illustration the only way to understand a state or an error.
- Meaningful shapes need 3:1 contrast against the background.
- Use culturally neutral metaphors. Avoid gestures, hand signs, and region-specific symbols.

## Build and review

### Build and ship

| Topic | Rule |
| --- | --- |
| **Format** | Optimized SVG. No embedded images, fonts, or filter effects. |
| **Rendering** | Inline the SVG in the DOM so `var(--vscode-*)` resolves. Tokens don't resolve inside an `<img>` or a CSS background image. |
| **Naming** | Lowercase kebab-case that names the subject, such as `empty-sessions.svg`. |
| **Location** | Next to the feature that uses it, in its `browser/media/` folder. Shared kit parts live in one common folder. |
| **Source of truth** | Code. SVGs and color tokens live in this repository, and this book reads them from code. |

### Review checklist

- Illustration is needed here, and the screen still works without it.
- Shows one idea with one accent, using only the UI parts the idea needs.
- Low to mid fidelity, and it's still clear which part of VS Code it shows.
- Real words only for labels the idea depends on, and they are localized.
- No people, gradients, shadows, textures, 3D, or visual filter effects.
- Every fill and stroke uses an existing `--vscode-*` token, with no hex values.
- Any new token is registered in code with all four theme values.
- Checked in all four theme types and one popular custom theme.
- Decorative art is hidden from screen readers. Informative art has a meaningful label.
- Static, or the animation explains a change and follows the Motion page.

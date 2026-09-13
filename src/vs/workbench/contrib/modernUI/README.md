# Modern UI theming

CSS selector performance requirements, audit scope, and the repeatable workbench
benchmark are documented in [CSS_PERFORMANCE.md](./CSS_PERFORMANCE.md).

Modern UI uses the standard workbench color theme system. Theme authors can use these color IDs in a theme's `colors` object, and users can use them in `workbench.colorCustomizations`.

The Modern UI colors below are experimental and require a build that supports them. Enable `workbench.experimental.modernUI` to use them in the main workbench. The shared `modernTab.*` and `modernEditorTab.*` colors also apply to the modern tab style in the Agents window. `statusBar.inactiveBackground` works in both classic and Modern UI layouts.

## Editor tab style

`workbench.experimental.modernUIEditorTabStyle` chooses the editor tab treatment when `workbench.experimental.modernUI` is enabled:

- `connected` (default): the bottom tab row spans the strip height without gaps. Its active tab joins the editor surface with an outside stroke and curved shoulders, and the first tab has a straight left edge. Upper wrapped rows and a separate pinned row retain the original rounded pills.
- `pill`: separate rounded tabs, without the connected stroke or shoulders.

Changes apply immediately, including in auxiliary editor windows. This setting does not enable Modern UI by itself and does not change the Agents window's pill tabs.

Connected tabs preserve at least the first basename character, an ellipsis, the extension, any decoration badge, and the action column when shrinking. File icons collapse first and return when the editor is widened; full names remain available in the hover and accessible label. Default `fit` sizing remains content-sized: the measured minimum is a compression safeguard, not a preferred tab width. Active close actions and dirty indicators remain visible, while clean inactive close actions appear on hover or keyboard focus. The final tab and the right viewport boundary keep an inset curved shoulder instead of a straight clipped edge. Explicit compact pinned tabs retain their icon-only sizing.

The top cap and bottom shoulders share the same control radius plus the outside stroke (5px with the default tokens), including at clipped viewport edges. Upper-row pills retain the original control radius. Wrapped fills occupy equal-height row hit boxes (28px normally, 24px compact), with spacing only between rows and no extra gutter below the final row. Hover does not change their geometry.

Automatic reveal includes the complete shoulder and rounds fractional layout bounds outward so the selected action is not clipped. Manual scrolling can still move part of the selected tab, including its action, offscreen. In that case a stationary cap and shoulder finish the visible outline; their stroke is aligned with the document separator, and the clipping mask falls back to `editor.background` when the theme does not define a tab-strip background.

The connected design uses `editor.background` for the active tab on every row, its action area, outside stroke, both shoulders, and the strip separator so the selected tab and editor body read as one document well. Upper wrapped and separate pinned rows change only the tab shape, not its selected background. The strip and inactive tabs use `editorGroupHeader.tabsBackground`, and their hover fill is derived from `foreground` over that background. Existing tab foreground customizations continue to apply. `modernEditorTab.activeBackground` remains available to the pill style.

The default palettes give `editorGroupHeader.tabsBackground` a restrained neutral fill using existing palette colors: Dark 2026 uses `#202122`, Light 2026 uses `#EAEAEA`, Dark Modern uses `#2B2B2B`, Light Modern uses `#E5E5E5`, the classic dark themes use `#303031`, and the classic light themes use `#E8E8E8`. `tab.inactiveBackground` matches the strip. These are theme-level values, so classic tabs also receive the updated inactive fill. Dark+/Light+ inherit the change from their Visual Studio base themes; HC and the other bundled background palettes are unchanged. No new color ID or cross-component token dependency is introduced.

Connected tabs use `tab.inactiveForeground` rather than dimming the general foreground to 50% opacity. The default palettes pair these fills with readable inactive text (at least 4.5:1), including in inactive editor groups. Light Modern and the classic light themes use the existing neutral `#616161`; the classic dark themes use `#A6A6A6`. Explicit legacy foreground customizations still take precedence. HC styling and the original pill label defaults are unchanged.

In high contrast, the connected boundary uses `focusBorder` for the active editor group and `contrastBorder` for other groups. It follows the selected tab and continues around the breadcrumbs and document body, rather than outlining only the tab. With multiple tabs, the surrounding editor-area card stroke is transparent in HC, including compact-layout corner strokes, so it does not create a second frame. Single and hidden-tab modes retain their original editor-card outline. Keyboard focus and multi-selection indicators remain visible. The same one-stroke geometry is present in all themes: the body frame is transparent in standard themes, and its inside paint layer does not change editor dimensions when switching themes or active groups.

## Colors

| Color ID | Purpose | Default |
| --- | --- | --- |
| `modernUI.shellBackground` | Background of the shell gutters around floating workbench surfaces in an active window | `titleBar.activeBackground` |
| `modernUI.inactiveShellBackground` | Background of the shell gutters in an inactive window | `titleBar.inactiveBackground` |
| `surface.background` | Background of framed container surfaces used by the modern layout | `sideBar.background` in dark and high contrast themes; `editor.background` in light themes |
| `surface.foreground` | Foreground of framed container surfaces | `sideBar.foreground` |
| `surface.border` | Shared frame border and default for region-specific frame borders | `foreground` at 15% alpha composited over `surface.background`, producing an opaque color in dark and light themes; `contrastBorder` in high contrast themes |
| `editor.border` | Border of the editor surface in the modern layout | `surface.border` |
| `modernPanel.border` | Outer border of the floating panel surface | `surface.border` |
| `modernSash.gripForeground` | Color of the resting resize grip dots between top-level workbench parts | `foreground` at 40% alpha in dark and light themes; opaque `foreground` in high contrast themes |
| `modernTab.activeBackground` | Background of active Modern UI tabs | `list.inactiveSelectionBackground` |
| `modernTab.activeForeground` | Foreground of active Modern UI tabs | `list.inactiveSelectionForeground`, then `foreground` |
| `modernTab.hoverBackground` | Background of hovered Modern UI tabs | `list.hoverBackground` |
| `modernTab.hoverForeground` | Foreground of hovered Modern UI tabs | `list.hoverForeground`, then `foreground` |
| `modernEditorTab.activeBackground` | Background of active Modern UI editor tabs | `modernTab.activeBackground` |
| `modernEditorTab.activeActionBackground` | Opaque background of actions on active Modern UI editor tabs | `modernEditorTab.activeBackground` composited over `editor.background` |
| `modernEditorTab.activeForeground` | Foreground of active Modern UI editor tabs | `modernTab.activeForeground` |
| `modernEditorTab.activeHoverBackground` | Background of active Modern UI editor tabs when hovered | `modernEditorTab.hoverBackground` |
| `modernEditorTab.activeHoverActionBackground` | Opaque background of actions on active Modern UI editor tabs when hovered | `modernEditorTab.activeHoverBackground` composited over `editor.background` |
| `modernEditorTab.inactiveBackground` | Background of inactive Modern UI editor tabs | Transparent |
| `modernEditorTab.hoverBackground` | Background of hovered Modern UI editor tabs | `modernTab.hoverBackground` |
| `modernEditorTab.hoverActionBackground` | Opaque background of actions on hovered Modern UI editor tabs | `modernEditorTab.hoverBackground` composited over `editor.background` |
| `modernEditorTab.hoverForeground` | Foreground of hovered Modern UI editor tabs | `modernTab.hoverForeground` |
| `modernEditorTab.selectedActionBackground` | Opaque background of actions on selected Modern UI editor tabs | `tab.selectedBackground` composited over `editor.background` |
| `modernActivityBar.background` | Background of the Modern UI activity bar in the default side position | `activityBar.background` |
| `modernActivityBar.inactiveBackground` | Background of the Modern UI activity bar in the default side position in an inactive window | `modernActivityBar.background` |
| `modernActivityBar.border` | Frame border of the Modern UI activity bar in the default side position | `surface.border` |
| `modernActivityBarItem.activeBackground` | Background of active Modern UI activity bar items in the default side position | `modernTab.activeBackground` |
| `modernActivityBarItem.activeForeground` | Foreground of active Modern UI activity bar items in the default side position | `modernTab.activeForeground` |
| `modernActivityBarItem.hoverBackground` | Background of hovered Modern UI activity bar items in the default side position | `modernTab.hoverBackground` |
| `modernActivityBarItem.hoverForeground` | Foreground of hovered Modern UI activity bar items in the default side position | `modernTab.hoverForeground` |
| `statusBar.inactiveBackground` | Resting status bar background in an inactive window with a workspace or folder open | Unset (`null`), retaining `statusBar.background` |

## Roles and precedence

Customize both shell colors when changing the shell palette. `modernUI.inactiveShellBackground` defaults to `titleBar.inactiveBackground`, not to `modernUI.shellBackground`. Only when the inactive shell color resolves to no value does the active shell color take over.

Shell colors with alpha are composited over the workbench background to produce an opaque backdrop. The title bar itself continues to use `titleBar.*`, falling back to `titleBar.activeBackground` when its inactive background is absent.

The `surface.*` colors provide shared framing defaults, not a replacement for every region's semantic colors. Side bars, the panel, and the editor retain `sideBar.background`, `panel.background`, and `editor.background`. Override `editor.border`, `modernPanel.border`, or `modernActivityBar.border` to distinguish a frame from the shared `surface.border`.

Inside the panel, the existing `panelSection.border` separates horizontally arranged views and `panelSectionHeader.border` separates vertically stacked views. Neither controls the outer floating frame. Side bar section dividers use `sideBarSectionHeader.border`. High contrast border defaults use `contrastBorder`, but explicit theme overrides remain effective.

Resize grip dots mark only boundaries between top-level parts, not editor splits or view resizers. They appear with `window.density.layout` set to `default` and are hidden in `compact` density. On hover or drag, the dots yield to the sash highlight controlled by `sash.hoverBorder`.

Activity bar items in non-default top or bottom positions use the `modernTab.*` colors because they share the pane tab presentation.

`statusBar.inactiveBackground` only changes the resting background in an inactive window with a workspace or folder open. Debugging and other status bar background overrides take precedence. Empty windows continue to use `statusBar.noFolderBackground`. Leaving the inactive color unset preserves the existing status bar behavior.

## Examples

Use hexadecimal color values, not color ID strings. The defaults in the table describe fallback relationships, not valid JSON values.

In a color theme file:

```json
{
  "colors": {
    "modernUI.shellBackground": "#181818",
    "modernUI.inactiveShellBackground": "#202020",
    "surface.background": "#181818",
    "surface.foreground": "#cccccc",
    "surface.border": "#3a3a3a",
    "editor.border": "#505050",
    "modernPanel.border": "#505050",
    "modernSash.gripForeground": "#cccccc66",
    "modernTab.activeBackground": "#3d3d3d",
    "modernTab.activeForeground": "#f0f0f0",
    "modernTab.hoverBackground": "#292929",
    "modernTab.hoverForeground": "#f0f0f0",
    "modernEditorTab.activeBackground": "#454545",
    "modernEditorTab.activeActionBackground": "#454545",
    "modernEditorTab.activeForeground": "#ffffff",
    "modernEditorTab.activeHoverBackground": "#505050",
    "modernEditorTab.activeHoverActionBackground": "#505050",
    "modernEditorTab.inactiveBackground": "#242424",
    "modernEditorTab.hoverBackground": "#323232",
    "modernEditorTab.hoverActionBackground": "#323232",
    "modernEditorTab.hoverForeground": "#ffffff",
    "modernEditorTab.selectedActionBackground": "#454545",
    "modernActivityBar.background": "#181818",
    "modernActivityBar.inactiveBackground": "#202020",
    "modernActivityBar.border": "#3a3a3a",
    "modernActivityBarItem.activeBackground": "#3d3d3d",
    "modernActivityBarItem.activeForeground": "#f0f0f0",
    "modernActivityBarItem.hoverBackground": "#292929",
    "modernActivityBarItem.hoverForeground": "#f0f0f0",
    "statusBar.inactiveBackground": "#202020"
  }
}
```

To try a smaller set of overrides in `settings.json`:

```json
{
  "workbench.experimental.modernUI": true,
  "window.density.layout": "default",
  "workbench.colorCustomizations": {
    "modernUI.shellBackground": "#181818",
    "modernUI.inactiveShellBackground": "#202020",
    "modernPanel.border": "#505050",
    "modernSash.gripForeground": "#cccccc66",
    "statusBar.inactiveBackground": "#202020"
  }
}
```

CSS custom properties prefixed with `--modern-ui-` are internal implementation details, not public theme APIs. Use the registered color IDs above instead.

The color registrations and canonical descriptions are defined in `src/vs/workbench/common/theme.ts`.

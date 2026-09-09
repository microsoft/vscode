# Modern UI theming

CSS selector performance requirements, audit scope, and the repeatable workbench
benchmark are documented in [CSS_PERFORMANCE.md](./CSS_PERFORMANCE.md).

Modern UI uses the standard workbench color theme system. Theme authors can use these color IDs in a theme's `colors` object, and users can use them in `workbench.colorCustomizations`.

The Modern UI colors below are experimental and require a build that supports them. Enable `workbench.experimental.modernUI` to use them in the main workbench. The shared `modernTab.*` and `modernEditorTab.*` colors also apply to the modern tab style in the Agents window. `statusBar.inactiveBackground` works in both classic and Modern UI layouts.

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

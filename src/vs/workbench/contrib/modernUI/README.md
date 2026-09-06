# Modern UI theming

CSS selector performance requirements, audit scope, and the repeatable workbench
benchmark are documented in [CSS_PERFORMANCE.md](./CSS_PERFORMANCE.md).

Modern UI uses the standard workbench color theme system. Theme authors can use these color IDs in a theme's `colors` object, and users can use them in `workbench.colorCustomizations`.

| Color ID | Purpose | Default |
| --- | --- | --- |
| `surface.background` | Background of framed container surfaces used by the modern layout | `sideBar.background` in dark and high contrast themes; `editor.background` in light themes |
| `surface.foreground` | Foreground of framed container surfaces | `sideBar.foreground` |
| `surface.border` | Border shared by floating side bars and panels | A translucent `foreground` in dark and light themes; `contrastBorder` in high contrast themes |
| `editor.border` | Border of the editor surface in the modern layout | `surface.border` |
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
| `modernActivityBar.background` | Background of the Modern UI activity bar | `activityBar.background` |
| `modernActivityBar.inactiveBackground` | Background of the Modern UI activity bar in an inactive window | `modernActivityBar.background` |
| `modernActivityBarItem.activeBackground` | Background of active Modern UI activity bar items in the default side position | `modernTab.activeBackground` |
| `modernActivityBarItem.activeForeground` | Foreground of active Modern UI activity bar items in the default side position | `modernTab.activeForeground` |
| `modernActivityBarItem.hoverBackground` | Background of hovered Modern UI activity bar items in the default side position | `modernTab.hoverBackground` |
| `modernActivityBarItem.hoverForeground` | Foreground of hovered Modern UI activity bar items in the default side position | `modernTab.hoverForeground` |

Specific workbench regions continue to use their existing semantic colors. For example, the panel and editor retain `panel.background` and `editor.background`, while the shell gutters use the active or inactive `titleBar.*` background. The `surface.*` colors provide the shared framing treatment around those regions rather than replacing all existing workbench colors.

Activity bar items in non-default top or bottom positions use the `modernTab.*` colors because they share the pane tab presentation.

```json
{
  "colors": {
    "surface.background": "#181818",
    "surface.foreground": "#cccccc",
    "surface.border": "#3a3a3a",
    "editor.border": "#505050",
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
    "modernActivityBarItem.activeBackground": "#3d3d3d",
    "modernActivityBarItem.activeForeground": "#f0f0f0",
    "modernActivityBarItem.hoverBackground": "#292929",
    "modernActivityBarItem.hoverForeground": "#f0f0f0"
  }
}
```

CSS custom properties prefixed with `--modern-ui-` are internal implementation details. Theme authors should use the registered `modernTab.*` and `modernEditorTab.*` colors for tab states instead.

The color registrations and canonical descriptions are defined in `src/vs/workbench/common/theme.ts`.

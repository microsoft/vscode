# Modern UI theming

Modern UI uses the standard workbench color theme system. Theme authors can use these color IDs in a theme's `colors` object, and users can use them in `workbench.colorCustomizations`.

| Color ID | Purpose | Default |
| --- | --- | --- |
| `surface.background` | Background of framed container surfaces used by the modern layout | `sideBar.background` in dark and high contrast themes; `editor.background` in light themes |
| `surface.foreground` | Foreground of framed container surfaces | `sideBar.foreground` |
| `surface.border` | Border shared by floating side bars and panels | A translucent `foreground` in dark and light themes; `contrastBorder` in high contrast themes |
| `editor.border` | Border of the editor surface in the modern layout | `surface.border` |
| `modernTab.activeBackground` | Background of active Modern UI tabs | `list.inactiveSelectionBackground` |
| `modernTab.activeActionBackground` | Opaque background of actions on active Modern UI editor tabs | `modernTab.activeBackground` composited over `editor.background` |
| `modernTab.activeForeground` | Foreground of active Modern UI tabs | `list.inactiveSelectionForeground`, then `foreground` |
| `modernTab.hoverBackground` | Background of hovered Modern UI tabs | `list.hoverBackground` |
| `modernTab.hoverActionBackground` | Opaque background of actions on hovered Modern UI editor tabs | `modernTab.hoverBackground` composited over `editor.background` |
| `modernTab.hoverForeground` | Foreground of hovered Modern UI tabs | `list.hoverForeground`, then `foreground` |
| `modernTab.selectedActionBackground` | Opaque background of actions on selected Modern UI editor tabs | `tab.selectedBackground` composited over `editor.background` |
| `modernActivityBar.activeBackground` | Background of active Modern UI activity bar items in the default side position | `modernTab.activeBackground` |
| `modernActivityBar.activeForeground` | Foreground of active Modern UI activity bar items in the default side position | `modernTab.activeForeground` |
| `modernActivityBar.hoverBackground` | Background of hovered Modern UI activity bar items in the default side position | `modernTab.hoverBackground` |
| `modernActivityBar.hoverForeground` | Foreground of hovered Modern UI activity bar items in the default side position | `modernTab.hoverForeground` |

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
    "modernTab.activeActionBackground": "#3d3d3d",
    "modernTab.activeForeground": "#f0f0f0",
    "modernTab.hoverBackground": "#292929",
    "modernTab.hoverActionBackground": "#292929",
    "modernTab.hoverForeground": "#f0f0f0",
    "modernTab.selectedActionBackground": "#3d3d3d",
    "modernActivityBar.activeBackground": "#3d3d3d",
    "modernActivityBar.activeForeground": "#f0f0f0",
    "modernActivityBar.hoverBackground": "#292929",
    "modernActivityBar.hoverForeground": "#f0f0f0"
  }
}
```

CSS custom properties prefixed with `--modern-ui-` are internal implementation details. Theme authors should use the registered `modernTab.*` colors for tab states instead.

The color registrations and canonical descriptions are defined in `src/vs/workbench/common/theme.ts`.

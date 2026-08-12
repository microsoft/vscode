# Modern UI theming

Modern UI uses the standard workbench color theme system. Theme authors can use these color IDs in a theme's `colors` object, and users can use them in `workbench.colorCustomizations`.

| Color ID | Purpose | Default |
| --- | --- | --- |
| `surface.background` | Background of framed container surfaces used by the modern layout | `sideBar.background` in dark and high contrast themes; `editor.background` in light themes |
| `surface.foreground` | Foreground of framed container surfaces | `sideBar.foreground` |
| `surface.border` | Border shared by floating side bars and panels | A translucent `foreground` in dark and light themes; `contrastBorder` in high contrast themes |
| `editor.border` | Border of the editor surface in the modern layout | `surface.border` |
| `modernTab.activeBackground` | Background of active Modern UI tabs | A blend of `foreground` over `surface.background` at 22% in dark themes and 16% in light themes; stroke-based in high contrast themes |
| `modernTab.hoverBackground` | Background of hovered Modern UI tabs | A blend of `foreground` over `surface.background` at 8% in dark themes and 6% in light themes; stroke-based in high contrast themes |
| `modernActivityBar.activeBackground` | Background of active Modern UI activity bar items | `modernTab.activeBackground` |
| `modernActivityBar.hoverBackground` | Background of hovered Modern UI activity bar items | `modernTab.hoverBackground` |

Specific workbench regions continue to use their existing semantic colors. For example, the panel and editor retain `panel.background` and `editor.background`, while the shell gutters use the active or inactive `titleBar.*` background. The `surface.*` colors provide the shared framing treatment around those regions rather than replacing all existing workbench colors.

```json
{
  "colors": {
    "surface.background": "#181818",
    "surface.foreground": "#cccccc",
    "surface.border": "#3a3a3a",
    "editor.border": "#505050",
    "modernTab.activeBackground": "#3d3d3d",
    "modernTab.hoverBackground": "#292929",
    "modernActivityBar.activeBackground": "#3d3d3d",
    "modernActivityBar.hoverBackground": "#292929"
  }
}
```

CSS custom properties prefixed with `--modern-ui-` are internal implementation details. Theme authors should use the registered `modernTab.*` colors for tab states instead.

The color registrations and canonical descriptions are defined in `src/vs/workbench/common/theme.ts`.

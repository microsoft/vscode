# Modern UI theming

Modern UI uses the standard workbench color theme system. Theme authors can use these color IDs in a theme's `colors` object, and users can use them in `workbench.colorCustomizations`.

| Color ID | Purpose | Default |
| --- | --- | --- |
| `surface.background` | Background of framed container surfaces used by the modern layout | `sideBar.background` in dark and high contrast themes; `editor.background` in light themes |
| `surface.foreground` | Foreground of framed container surfaces | `sideBar.foreground` |
| `surface.border` | Border shared by floating side bars and panels | A translucent `foreground` in dark and light themes; `contrastBorder` in high contrast themes |
| `editor.border` | Border of the editor surface in the modern layout | `surface.border` |

Specific workbench regions continue to use their existing semantic colors. For example, the panel and editor retain `panel.background` and `editor.background`, while the shell gutters use the active or inactive `titleBar.*` background. The `surface.*` colors provide the shared framing treatment around those regions rather than replacing all existing workbench colors.

```json
{
  "colors": {
    "surface.background": "#181818",
    "surface.foreground": "#cccccc",
    "surface.border": "#3a3a3a",
    "editor.border": "#505050"
  }
}
```

CSS custom properties prefixed with `--modern-ui-` are internal implementation details. They derive transient states such as tab hover and selection colors and are not part of the theme color API.

The color registrations and canonical descriptions are defined in `src/vs/workbench/common/theme.ts`.

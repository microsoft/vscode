# Theme Customization Guide

The 2026 theme supports granular customization through **variables** and **overrides** in the config files.

## Variables

Define reusable color values in the `variables` section that can be referenced throughout your entire config:

```json
{
  "variables": {
    "myBlue": "#0066DD",
    "myRed": "#DD0000",
    "sidebarBg": "#161616"
  }
}
```

Variables can be used in:
- **Config sections**: `textConfig`, `backgroundConfig`, `editorConfig`, `panelConfig`, `baseColors`
- **Overrides**: Any VS Code theme color property

## Overrides

Override any VS Code theme color property in the `overrides` section. You can use:
- Hex colors directly: `"#161616"`
- Variable references: `"${myBlue}"`

```json
{
  "overrides": {
    "sideBar.background": "${sidebarBg}",
    "activityBar.background": "#161616",
    "statusBar.background": "${myBlue}"
  }
}
```

## Example Configuration

**theme.config.dark.json:**

```json
{
  "paletteScale": 21,
  "accentUsage": "interactive-and-status",
  ...
  "editorConfig": {
    "background": "${darkBlue}",
    "foreground": "${textPrimary}"
  },
  "backgroundConfig": {
    "primary": "${primaryBg}",
    "secondary": "${secondaryBg}"
  },
  "variables": {
    "darkBlue": "#001133",
    "brightAccent": "#00AAFF",
    "primaryBg": "#161616",
    "secondaryBg": "#222222",
    "textPrimary": "#cccccc"
  },
  "overrides": {
    "focusBorder": "${brightAccent}",
    "button.background": "#007ACC"
  }
}
```

## Finding Theme Properties

To find available theme color properties:
1. Open Command Palette (Cmd+Shift+P)
2. Run "Developer: Generate Color Theme From Current Settings"
3. View generated theme to see all available properties

Or refer to the [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color).

## Workflow

1. Edit `theme.config.dark.json` or `theme.config.light.json`
2. Add variables and overrides sections
3. Run `npm run build` to regenerate themes
4. Reload VS Code to see changes

## Tips

- **Variables** help avoid repeating the same color values
- Use **overrides** to fine-tune specific elements without modifying the generator code
- Changes in config files persist across theme updates
- Both variants (light/dark) support independent variables and overrides

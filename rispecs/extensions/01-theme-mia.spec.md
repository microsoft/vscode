# Theme — Mia

> Three-universe dark/light theme and file icon theme.

## Desired Outcome
mia-vscode has a distinctive visual identity through a color theme inspired by the three universes — Engineer Blue, Ceremony Green, Story Purple — and a file icon theme that recognizes narrative file types (`.stc/`, `.ncp.json`, `.beat.json`).

## Current Reality
VS Code ships with default themes (Dark+, Light+, etc.). No theme recognizes narrative file types.

## Structural Tension
Color and iconography create visual coherence between the IDE and the narrative philosophy. When the environment looks different, developers think differently.

---

## Components

### MiaThreeDark
Dark color theme as default.
- **Behavior:** Registered as `Mia Three Universe Dark`. Set as default theme for fresh installs. Dark theme with deep backgrounds and three accent colors.
- **Styling:**
  ```json
  {
    "name": "Mia Three Universe Dark",
    "type": "dark",
    "colors": {
      "editor.background": "#1A1B26",
      "editor.foreground": "#C0CAF5",
      "activityBar.background": "#16161E",
      "activityBar.foreground": "#C0CAF5",
      "sideBar.background": "#1A1B26",
      "sideBar.foreground": "#A9B1D6",
      "statusBar.background": "#16161E",
      "statusBar.foreground": "#7AA2F7",
      "titleBar.activeBackground": "#16161E",
      "titleBar.activeForeground": "#C0CAF5",
      "tab.activeBackground": "#1E1F2E",
      "tab.activeForeground": "#C0CAF5",
      "tab.inactiveBackground": "#1A1B26",
      "terminal.ansiBlue": "#4A9EFF",
      "terminal.ansiGreen": "#4ADE80",
      "terminal.ansiMagenta": "#A78BFA",
      "focusBorder": "#4A9EFF33",
      "selection.background": "#4A9EFF33",
      "list.activeSelectionBackground": "#4A9EFF22"
    }
  }
  ```

### MiaThreeLight
Light theme variant.
- **Behavior:** Registered as `Mia Three Universe Light`. Light backgrounds with same three accent colors adapted for readability.
- **Styling:** Light variant uses `#FAFAFA` background, `#1A1B26` foreground, and saturated accent colors for visibility.

### MiaIconTheme
File icon theme for narrative file types.
- **Behavior:** Extends the default Seti icon theme with additional icons for:
  - `.stc/` directory → STC chart icon (tension arc)
  - `*.ncp.json` → NCP file icon (narrative node)
  - `*.beat.json` → Beat file icon (story beat pulse)
  - `.mia/` directory → Mia config icon (three circles)
  - `*.spec.md` → Spec file icon (document with sparkle)
  - `*.smdf.json` → SMDF file icon (state machine)
  
  Each icon uses the relevant universe accent color. SVG format with theme color token support.

### ThemeContribution
Extension manifest for theme registration.
- **Data:** Extension lives at `extensions/theme-mia/` with:
  ```json
  {
    "name": "theme-mia",
    "displayName": "Mia Three Universe Theme",
    "publisher": "mia",
    "contributes": {
      "themes": [
        { "label": "Mia Three Universe Dark", "uiTheme": "vs-dark", "path": "./themes/dark.json" },
        { "label": "Mia Three Universe Light", "uiTheme": "vs", "path": "./themes/light.json" }
      ],
      "iconThemes": [
        { "id": "mia-icons", "label": "Mia Icons", "path": "./icons/mia-icon-theme.json" }
      ]
    }
  }
  ```

---

## Supporting Structures
- Extension directory: `extensions/theme-mia/`
- Theme JSON files in `extensions/theme-mia/themes/`
- Icon SVGs in `extensions/theme-mia/icons/`
- Activation: on startup (theme must be available immediately)
- Fulfills: `mia-code-server/rispecs/mia-vscode/01-branding-theme.spec.md` (theme portion)

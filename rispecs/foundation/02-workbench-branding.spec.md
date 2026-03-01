# Workbench Branding

> Title bar, about dialog, splash screen, and application icons.

## Desired Outcome
When users launch mia-vscode, every visual surface — window title, about dialog, loading screen, dock/taskbar icon — communicates the Mia Code identity with three-universe color language.

## Current Reality
All branding surfaces show "Code - OSS" defaults with the standard VS Code icon.

## Structural Tension
Visual identity creates immediate recognition that this is a narrative-aware environment, distinct from stock VS Code.

---

## Components

### ApplicationIcons
Custom icons for all platform surfaces.
- **Behavior:** Replace VS Code application icons with Mia Code branded versions. Three interlocking circles (Engineer blue, Ceremony green, Story purple) on dark background. Provide all required sizes:
  - **macOS**: `.icns` (16px to 1024px)
  - **Windows**: `.ico` (16px to 256px)
  - **Linux**: multiple `.png` sizes (16, 32, 48, 64, 128, 256, 512)
- **Layout:** Assets in `resources/linux/`, `resources/win32/`, `resources/darwin/`

### WindowTitleFormat
Custom window title.
- **Behavior:** Window title format: `Mia Code - {activeEditorShort} - {rootName}`. Title bar uses platform-native styling. When connected to mia-code-server, append universe indicators if enabled.

### AboutDialog
Branded about dialog content.
- **Behavior:** About dialog shows:
  - Mia Code logo
  - Version: `Mia Code {version}` (tracks upstream VS Code version with mia suffix, e.g., `1.96.0-mia.1`)
  - Philosophy tagline: "Narrative-Driven Development — Engineer · Ceremony · Story"
  - Links to: mia-code-server docs, miadisabelle GitHub org, upstream VS Code

### SplashScreen
Loading screen branding.
- **Behavior:** Loading/splash screen shows Mia Code logo centered. Background color: `#1A1B26` (matching theme). Logo fades into workbench on load completion. No delay — purely replaces the default loading indicator.

---

## Supporting Structures
- Icon assets created as SVG sources, exported to platform formats via build scripts
- Window title controlled by `product.json` `nameShort` + workbench title configuration
- About dialog content derived from product.json fields
- Fulfills: `mia-code-server/rispecs/mia-vscode/01-branding-theme.spec.md` (branding portion)

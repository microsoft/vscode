# 2026 Themes

Modern, minimal light and dark themes for VS Code with a consistent neutral palette and accessible color contrast.

> **Note**: These themes are generated using an external theme generator. The source code for the generator is maintained in a separate repository: [vscode-2026-theme-generator](../../../vscode-2026-theme-generator)

## Design Philosophy

- **Minimal and modern**: Clean, distraction-free interface
- **Consistent palette**: Limited base colors (5 neutral shades + accent) for visual coherence
- **Accessible**: WCAG AA compliant contrast ratios (minimum 4.5:1 for text)
- **Generated externally**: Themes are generated from a TypeScript-based generator with configurable color palettes

## Color Palette

### Light Theme

| Purpose | Color | Usage |
|---------|-------|-------|
| Text Primary | `#1A1A1A` | Main text content |
| Text Secondary | `#6B6B6B` | Secondary text, line numbers |
| Background Primary | `#FFFFFF` | Main editor background |
| Background Secondary | `#F5F5F5` | Sidebars, inactive tabs |
| Border Default | `#848484` | Component borders |
| Accent | `#0066CC` | Interactive elements, focus states |

### Dark Theme

| Purpose | Color | Usage |
|---------|-------|-------|
| Text Primary | `#bbbbbb` | Main text content |
| Text Secondary | `#888888` | Secondary text, line numbers |
| Background Primary | `#191919` | Main editor background |
| Background Secondary | `#242424` | Sidebars, inactive tabs |
| Border Default | `#848484` | Component borders |
| Accent | `#007ACC` | Interactive elements, focus states |

## Modifying These Themes

These theme files are **generated** and should not be edited directly. To customize or modify the themes:

1. Navigate to the theme generator repository (one level up from vscode root)
2. Modify the configuration files (`theme.config.light.json` and `theme.config.dark.json`)
3. Run the generator to create new theme files
4. Copy the generated files back to this directory

See the [theme generator README](../../../vscode-2026-theme-generator/README.md) for detailed documentation on configuration options, color customization, and the generation process.

## Accessibility

All text/background combinations meet WCAG AA standards (4.5:1 contrast ratio minimum).

## License

MIT

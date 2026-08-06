# VS Code Modern Icons

This built-in file icon theme is ready for a full icon set. The checked-in generic file and folder icons keep the theme selectable while the final assets and mappings are added.

## Asset format

- Use standalone SVG files with a `16 16` view box and a transparent background.
- Use explicit fill and stroke colors. External SVG background images do not inherit VS Code theme colors.
- Do not include scripts, external resources, embedded fonts, CSS variables, or raster images inside SVG files.
- Optimize paths and align strokes to the 16-pixel canvas.
- Add dark, light, and high-contrast variants when a single color does not provide sufficient contrast.
- Name files in lowercase kebab case and place them in `fileicons/images`.

## Theme mappings

Add every asset to `iconDefinitions` in `fileicons/vscode-modern-icons-icon-theme.json`, then reference its definition ID from one or more of:

- `fileExtensions`
- `fileNames`
- `languageIds`
- `folderNames`
- `folderNamesExpanded`
- `rootFolderNames`
- `rootFolderNamesExpanded`

Mappings are case-insensitive. Extension keys do not include a leading period, and filename keys do not include path segments.

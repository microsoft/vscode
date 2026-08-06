# VS Code Modern Icons

This built-in file icon theme is ready for a full icon set. It deliberately leaves generic file and folder associations unset.

## Design source

The A group comes from [Ticket 1862 - VSCode 3rd Party Seti](https://www.figma.com/design/CnjK8irotB7IEUIgXdbS6M/Ticket-1862---VSCode-3rd-Party-Seti?node-id=4584-939):

- `apple` (`4584:939`)
- `argdown` (`4584:941`)
- `asm` (`4584:943`)
- `audio` (`4584:945`)

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

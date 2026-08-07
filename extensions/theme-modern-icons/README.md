# VS Code Modern Icons

This built-in file icon theme provides a monochrome icon set. Image icons are rendered as masks filled with the current VS Code foreground color, so only the shape of each icon matters.

## Design source

The A group comes from [Ticket 1862 - VSCode 3rd Party Seti](https://www.figma.com/design/CnjK8irotB7IEUIgXdbS6M/Ticket-1862---VSCode-3rd-Party-Seti?node-id=4584-939):

- `apple` (`4584:939`)
- `argdown` (`4584:941`)
- `asm` (`4584:943`)
- `audio` (`4584:945`)

## Asset format

- Use standalone SVG files with a `16 16` view box and a transparent background.
- Use `currentColor` for monochrome fill and stroke colors. This theme renders image icons as masks so they inherit the surrounding VS Code foreground color.
- Do not include scripts, external resources, embedded fonts, CSS variables, or raster images inside SVG files.
- Optimize paths and align strokes to the 16-pixel canvas.
- Because icons are rendered as masks, only their shape is used. Colors, including light and high-contrast variants, are ignored.
- Name files in lowercase kebab case and place them in `fileicons/images`.

## Theme mappings

Add each asset to `iconDefinitions` in `fileicons/vscode-modern-icons-icon-theme.json`, then reference it using one or more of:

- `fileExtensions`
- `fileNames`
- `languageIds`
- `folderNames`
- `folderNamesExpanded`
- `rootFolderNames`
- `rootFolderNamesExpanded`

Mappings are case-insensitive. Extension keys do not include a leading period, and filename keys do not include path segments.

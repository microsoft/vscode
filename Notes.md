# Notes
https://github.com/FatalMerlin/vscode/blob/ae336f2d3e532e52a6d5b09bcd555e0c51b5f2fe/src/vs/workbench/services/themes/common/colorThemeData.ts#L720

=> if Color is Array of Colors, attach `getArray()` & `isArray` to Color object.

=> Color will be:

```ts
{
	rgba: '',
	hsla: () => {},
	hsva: () => {},
	isArray: true,
	getArray: () => Color[], // defaults to `return this` if `isArray === false`
}
```

### TODO:

Add:

`editorBracketHighlightingForegroundArray`
`editorBracketPairGuideBackgroundArray`
`editorBracketPairGuideActiveBackgroundArray`

Config Options ?

Also refine code

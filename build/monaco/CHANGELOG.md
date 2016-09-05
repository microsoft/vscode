# Monaco Editor Change log

## [0.6.0]
- This will be the last release that contains specific IE9 and IE10 fixes/workarounds. We will begin cleaning our code-base and remove them.
- `javascript` and `typescript` language services:
  - exposed API to get to the underlying language service.
  - fixed a bug that prevented modifying `extraLibs`.
- Multiple improvements/bugfixes to the `css`, `less`, `scss` and `json` language services.

### API changes:
  - settings:
    - new: `mouseWheelZoom`, `wordWrap`, `snippetSuggestions`, `tabCompletion`, `wordBasedSuggestions`, `renderControlCharacters`, `renderLineHighlight`, `fontWeight`.
    - removed: `tabFocusMode`, `outlineMarkers`.
    - renamed: `indentGuides` -> `renderIndentGuides`, `referenceInfos` -> `codeLens`
  - added `editor.pushUndoStop()` to explicitly push an undo stop
  - added `suppressMouseDown` to `IContentWidget`
  - added optional `resolveLink` to `ILinkProvider`
  - removed `enablement`, `contextMenuGroupId` from `IActionDescriptor`
  - removed exposed constants for editor context keys.

### Notable bugfixes:
  - Icons missing in the find widget in IE11 [#148](https://github.com/Microsoft/monaco-editor/issues/148)
  - Multiple context menu issues
  - Multiple clicking issues in IE11/Edge ([#137](https://github.com/Microsoft/monaco-editor/issues/137), [#118](https://github.com/Microsoft/monaco-editor/issues/118))
  - Multiple issues with the high-contrast theme.
  - Multiple IME issues in IE11, Edge and Firefox.


## [0.5.1]

- Fixed mouse handling in IE

## [0.5.0]

### Breaking changes
- `monaco.editor.createWebWorker` now loads the AMD module and calls `create` and passes in as first argument a context of type `monaco.worker.IWorkerContext` and as second argument the `initData`. This breaking change was needed to allow handling the case of misconfigured web workers (running on a file protocol or the cross-domain case)
- the `CodeActionProvider.provideCodeActions` now gets passed in a `CodeActionContext` that contains the markers at the relevant range.
- the `hoverMessage` of a decoration is now a `MarkedString | MarkedString[]`
- the `contents` of a `Hover` returned by a `HoverProvider` is now a `MarkedString | MarkedString[]`
- removed deprecated `IEditor.onDidChangeModelRawContent`, `IModel.onDidChangeRawContent`

### Notable fixes
- Broken configurations (loading from `file://` or misconfigured cross-domain loading) now load the web worker code in the UI thread. This caused a breaking change in the behaviour of `monaco.editor.createWebWorker`
- The right-pointing mouse pointer is oversized in high DPI - [issue](https://github.com/Microsoft/monaco-editor/issues/5)
- The editor functions now correctly when hosted inside a `position:fixed` element.
- Cross origin configuration is now picked up (as advertised in documentation from MonacoEnvironment)

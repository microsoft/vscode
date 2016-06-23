# Monaco Editor Change log

## [0.5.0]

### Notable fixes
- Broken configurations (loading from `file://` or misconfigured cross-domain loading) now load the web worker code in the UI thread. This caused a breaking change in the behaviour of `monaco.editor.createWebWorker`
- The right-pointing mouse pointer is oversized in high DPI - [issue](https://github.com/Microsoft/monaco-editor/issues/5)

### Breaking changes
- `monaco.editor.createWebWorker` now loads the AMD module and calls `create` and passes in as first argument a context of type `monaco.worker.IWorkerContext` and as second argument the `initData`. This breaking change was needed to allow handling the case of misconfigured web workers (running on a file protocol or the cross-domain case)
- the `CodeActionProvider.provideCodeActions` now gets passed in a `CodeActionContext` that contains the markers at the relevant range.
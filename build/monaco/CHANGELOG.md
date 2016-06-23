# Monaco Editor Change log

## [0.5.0]

### Breaking changes
- `createWebWorker` now loads the AMD module and calls `create` and passes in as first argument a context of type `monaco.worker.IWorkerContext` and as second argument the `initData`. This breaking change was needed to allow handling the case of misconfigured web workers (running of a file protocol or a cross-domain case)
- the `CodeActionProvider.provideCodeActions` now gets passed in a `CodeActionContext` that contains the markers at the relevant range.
# Extension build lifecycle events

Set `VSCODE_BUILD_EVENTS=1` to add machine-readable lifecycle events to extension TypeScript watch compilations (`watch-extension:*`) and extension builds using `extensions/esbuild-common.mts`. Other values, including an unset variable, disable events. Existing human-readable compilation logs remain available.

Events are standalone, uncolored stdout lines with no timestamp or payload:

```text
VSCODE_BUILD_START
VSCODE_BUILD_DONE
VSCODE_BUILD_FAILED
```

`START` begins a cycle. Exactly one terminal event follows once all overlapping builds in that cycle finish: `FAILED` if any build failed, otherwise `DONE`. A later cycle starts with a clean failure state. Before-build hooks, esbuild plugins, and asynchronous postprocessing are part of the build: readiness is not reported until they finish, and their errors fail the cycle.

Aggregation is local to each runner process and lifecycle: the gulp extension watcher aggregates TypeScript compilations, and each esbuild runner process aggregates its concurrent builds. Consumers must keep separate processes' output separate; these events do not describe the readiness of the entire repository. Watcher subscription errors remain diagnostics, not completed build cycles.

Without the opt-in, no event lines are printed. Build errors still follow the existing behavior: one-shot esbuild runners exit unsuccessfully, while watchers log failures and allow subsequent rebuilds. One-shot failures now allow overlapping builds to finish before the process exits, and print hook errors before exiting.

Run the focused tests with Node 24 or later:

```sh
node --test build/lib/test/buildEvents.test.ts extensions/esbuild-common.test.mts
```

# Extension build lifecycle events

Set `VSCODE_BUILD_EVENTS=1` to add machine-readable lifecycle events to extension TypeScript watch compilations (`watch-extension:*`) and extension builds using `extensions/esbuild-common.mts`. Other values, including an unset variable, disable events. Existing human-readable compilation logs remain available.

Each event is one uncolored JSON object on its own stdout line. Human-readable logs remain interleaved with these records; stdout as a whole is not a JSONL-only stream.

```jsonl
{"type":"vscode.build","version":1,"event":"start"}
{"type":"vscode.build","version":1,"event":"finish","success":true}
{"type":"vscode.build","version":1,"event":"finish","success":false}
```

`start` begins a cycle. Exactly one `finish` event follows once all overlapping builds in that cycle finish: `success: false` if any build failed, otherwise `success: true`. A later cycle starts with a clean failure state. Before-build hooks, esbuild plugins, and asynchronous postprocessing are part of the build: readiness is not reported until they finish, and their errors fail the cycle.

Consumers should parse complete lines and recognize records by `type: "vscode.build"`. Version 1 defines `event: "start"` and `event: "finish"` with a required boolean `success` on finish. Ignore unrelated log lines and unknown additional fields; field order is not significant. Additional metadata can be introduced without a version bump. Incompatible changes require a new version, which consumers should report as unsupported rather than treating as successful completion.

Aggregation is local to each runner process and lifecycle: the gulp extension watcher aggregates TypeScript compilations, and each esbuild runner process aggregates its concurrent builds. Consumers must keep separate processes' output separate; these events do not describe the readiness of the entire repository. Watcher subscription errors remain diagnostics, not completed build cycles.

Without the opt-in, no event lines are printed. Build errors still follow the existing behavior: one-shot esbuild runners exit unsuccessfully, while watchers log failures and allow subsequent rebuilds. One-shot failures now allow overlapping builds to finish before the process exits, and print hook errors before exiting.

Run the focused tests with Node 24 or later:

```sh
node --test build/lib/test/buildEvents.test.ts extensions/esbuild-common.test.mts
```

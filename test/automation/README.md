# VS Code Automation Package

This package contains functionality for automating various components of the VS Code UI, via an automation "driver" that connects from a separate process. It is used by the `smoke` tests.

## Electron Benchmark Stories

Compile the VS Code sources and automation package, then invoke either app-owned story through the generic noninteractive CLI:

```powershell
npm run transpile-client
npm --prefix test\automation run compile
node test\automation\out\benchmark\storyCli.js --request C:\benchmark\request.json --result C:\benchmark\result.json --log C:\benchmark\story.log
```

The v1 request supports `vscode.empty-workbench.cold-start` and `vscode.window-resize`:

```json
{
	"schemaVersion": 1,
	"story": "vscode.empty-workbench.cold-start",
	"runId": "run-1",
	"appRoot": "C:\\src\\vscode",
	"electronExecutable": "C:\\src\\electron\\out\\Testing\\electron.exe",
	"userDataDir": "C:\\benchmark\\profile",
	"extensionsDir": "C:\\benchmark\\extensions",
	"artifactsDir": "C:\\benchmark\\artifacts",
	"timeoutMs": 120000,
	"env": {},
	"launchArgs": [
		"--trace-perfetto-config-file=C:\\benchmark\\perfetto.json",
		"--trace-startup-file=C:\\benchmark\\trace.json",
		"--js-flags=--logfile=C:\\benchmark\\v8.log"
	]
}
```

Use `appExecutable` instead of `appRoot` and `electronExecutable` for a packaged VS Code executable. `userDataDir` and `extensionsDir` must be fresh, empty, absolute, and distinct. `launchArgs` remain ordered and are passed to Electron unchanged; profile overrides are rejected.

For `appRoot` launches, the story applies the same `VSCODE_DEV`, `VSCODE_CLI`, and `VSCODE_REPOSITORY` environment used by the existing source smoke-test launcher. Request `env` values are applied last.

The CLI writes one v1 JSON result atomically and keeps human-readable output in the requested log file. Every phase is `{ startTimeMs, endTimeMs, durationMs }` from one monotonic origin:

- `electronLaunch`: begins immediately before the public Playwright Electron launch call and ends when it returns a connected `ElectronApplication`. Playwright does not expose the OS child spawn timestamp without private coupling.
- `processSpawn`: deprecated v1 compatibility alias for `electronLaunch`, emitted only by the cold-start story with identical values.
- `firstWindow`: connected Electron application to the first Playwright page.
- `didFinishLoad`: first window to Playwright's load completion.
- `monacoWorkbench`: load completion to a visible `.monaco-workbench`.
- `workbenchRestored`: visible workbench to the existing smoke-test driver's restored lifecycle and restored-contribution signal.
- `resizeWarmup`: resize story initial-bound normalization and four alternating warmup operations.
- `resizeMeasure`: twenty alternating measured resize operations, bracketed by renderer User Timing marks `vscode.window-resize.measure.start` and `vscode.window-resize.measure.end`.
- `shutdown`: bounded graceful shutdown and verified process termination.

The resize story uses fixed bounds of `{ x: 80, y: 80, width: 1200, height: 800 }` and `{ x: 80, y: 80, width: 1000, height: 700 }`. Each operation waits for the Electron `BrowserWindow` resize event and two renderer animation frames. The even operation counts leave the final window at the initial bounds.

When Chromium startup tracing includes `blink.user_timing`, the two resize performance marks appear in the caller-owned trace. For example, pass `--trace-startup=blink.user_timing`, `--trace-startup-duration=30`, `--trace-startup-format=json`, and `--trace-startup-file=<absolute-path>`.

Every result includes a top-level `shutdown` object:

```json
{
	"status": "clean",
	"exitCode": 0,
	"signal": null
}
```

The status is one of `clean`, `timeout`, `forced`, `crash`, or `error`. A valid successful result always has `shutdown.status: "clean"`; forced, timed-out, or failed cleanup changes the overall result to failure. Launch/readiness timeout is bounded by `timeoutMs`; cleanup has a separate 20-second bound so an expired measurement deadline cannot prevent process-tree cleanup.

The story-specific compatibility entry points remain available at `out\benchmark\emptyWorkbenchColdStartCli.js` and `out\benchmark\windowResizeCli.js`; both delegate to the generic CLI.

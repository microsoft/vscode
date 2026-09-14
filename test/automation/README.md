# VS Code Automation Package

This package contains functionality for automating various components of the VS Code UI, via an automation "driver" that connects from a separate process. It is used by the `smoke` tests.

## Empty Workbench Cold-Start Story

Compile the automation package, then invoke the app-owned benchmark story noninteractively:

```powershell
npm --prefix test\automation run compile
node test\automation\out\benchmark\emptyWorkbenchColdStartCli.js --request C:\benchmark\request.json --result C:\benchmark\result.json --log C:\benchmark\story.log
```

The v1 request is:

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

The CLI writes one v1 JSON result atomically. It reports `processSpawn`, `firstWindow`, `didFinishLoad`, `monacoWorkbench`, and `workbenchRestored` as `{ startTimeMs, endTimeMs, durationMs }` values from one monotonic origin. Human-readable output is written only to the requested log file.

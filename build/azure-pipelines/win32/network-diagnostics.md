# Windows network failure diagnostics

The shared Windows compile template collects a snapshot after a failed Build client step (or an earlier failure), before 1ES stops Network Isolation. Successful jobs skip collection. This targets rare failures such as [microsoft/vscode-engineering#3684](https://github.com/microsoft/vscode-engineering/issues/3684); it neither retries downloads nor changes DNS, firewall, proxy, isolation, or event-log settings.

## Evidence

The collector writes JSON sections to `.build/logs/network`. CI and flaky-build jobs include them in their existing logs artifact. Product compile jobs publish a separate `network-diagnostics-windows-<arch>-compile-<attempt>` artifact only when collection initialized its output directory.

- `capture.json`: UTC capture times, bounded build/job/agent identifiers, the event lookback window, completion state, and unavailable sections.
- `listener.json`: the Network Isolation listener's PIDs and start times. An empty successful result means no matching process was observed, not that enumeration failed.
- `dns-servers.json`, `dns-udp-endpoints.json`, `dns-tcp-listeners.json`: configured resolver addresses and local port-53 ownership.
- `listener-crashes.json`: existing Application Error / Windows Error Reporting records for `EtwNetworkEventListener.exe`, projecting only times, event/record IDs, and numeric process/exception codes.
- `dns-timeouts.json`, `dns-query-results.json`: existing DNS Client events for `vsblob.dev.azure.com`, projecting numeric status/type/client PID fields, not free-form query results. A disabled or inaccessible channel is explicitly unavailable; collection does not enable it.
- `listener-log-inventory.json`: immediate file names, sizes, and modification times under `%LOCALAPPDATA%\Temp\NetworkIsolation\Logs`. **This is metadata, not copies of the logs.** Raw listener logs have no reviewed content contract here; neither their contents nor adjacent configuration, environment, state files, command lines, event messages, or process dumps are archived.

Each section is limited to 64 records and 64 KiB of UTF-8 JSON. Event queries cover the previous hour. The existing command-timeout helper stops the collector's process tree after 45 seconds; the pipeline task has a two-minute backstop. Sections start as `notCollected`, replacing any previous snapshot, and are updated as they finish. `capture.json` starts with `completed: false`, so interrupted collection remains distinguishable from a completed snapshot. Missing commands, denied access, disabled logs, and missing listener logs produce explicit warnings and unavailable sections with bounded reason codes rather than exception messages. Collection errors do not replace the original build failure.

The snapshot cannot prove when or why a listener exited or recover a DNS question that was never logged. A clean snapshot after a retry is not proof of repair. The current feed wrapper retries before reporting failure, so this snapshot is after the exhausted retries, not necessarily at the first failed lookup. Agent loss, cancellation, failure before the scripts/runtime are available, or failure of artifact publication can still prevent collection. Correlate timestamps with the Build client and Start/Stop Network Isolation task logs, which also identify the task/image versions.

## Validation and rollout

Run the focused build-script tests:

```powershell
node --test build\lib\test\windowsNetworkDiagnostics.test.ts
```

The Windows tests use isolated PowerShell processes with fake command results and temporary files. They verify evidence projection, unavailable/empty distinctions, bounded output, interruption, and that secrets in excluded fields are not archived. The template checks cover placement, failure-only execution, timeouts, and artifact publication.

Before relying on hosted-agent evidence, use an approved non-publishing validation branch/run. Insert a deliberate harmless failing step immediately before the collector in that validation only; do not break DNS or stop the isolation listener. Confirm that the collector runs before Stop Network Isolation, that the resulting artifact contains the JSON sections (including explicit unavailable states), and that the job remains failed for the injected failure. Inspect actual permissions and event availability on the pool; a local test does not establish those. Remove the injected failure before landing the change.

For future raw-listener-log retention, first have the Network Isolation owners identify and review a specific safe file/field allowlist and retention/size limits. Do not copy the whole Network Isolation directory or treat these diagnostic artifacts as public attachments.

# Windows network failure diagnostics

Every failed Windows compile, CI, flaky-build and product test job collects a snapshot as its last step, before 1ES stops Network Isolation. Successful jobs skip collection. This targets rare failures such as [microsoft/vscode-engineering#3684](https://github.com/microsoft/vscode-engineering/issues/3684) and [microsoft/vscode-engineering#4433](https://github.com/microsoft/vscode-engineering/issues/4433); it neither retries downloads nor changes DNS, firewall, proxy, isolation, or event-log settings.

## The Network Isolation listener

1ES Network Isolation starts `EtwNetworkEventListener.exe`, which serves both the job's HTTP proxy (`HTTP_PROXY`/`HTTPS_PROXY`) and its DNS. When it exits during a job, every later download fails with errors that look like an outage of the service being contacted, for example `Failed to connect to github.com:443 over proxy <address> after ~2050 ms: Could not connect to server` from Git, or `No such host is known`. The Stop Network Isolation task then logs `No service process found to kill`.

When that happens, the collector reports an error annotation that names the listener, so the failure is attributed to Network Isolation instead of to the failing step.

## Evidence

The collector writes JSON sections to `.build/logs/network`. CI and flaky-build jobs include them in their existing logs artifact. Product compile jobs publish a separate `network-diagnostics-windows-<arch>-compile-<attempt>` artifact only when collection initialized its output directory.

- `capture.json`: UTC capture times, bounded build/job/agent identifiers, the event lookback window, completion state, and unavailable sections.
- `listener-health.json`: a `verdict` (`notIsolated`, `listenerRunning`, `listenerStopped` or `proxyUnreachable`), whether Network Isolation started (`1ESNI_CONFIG_PATH` is set) and the listener is running, and the result and duration of a TCP connection to the proxy port. The proxy address is not recorded.
- `listener.json`: the Network Isolation listener's PIDs and start times. An empty successful result means no matching process was observed, not that enumeration failed.
- `dns-servers.json`, `dns-udp-endpoints.json`, `dns-tcp-listeners.json`: configured resolver addresses and local port-53 ownership.
- `listener-crashes.json`: existing Application Error / Windows Error Reporting records for `EtwNetworkEventListener.exe`, projecting only times, event/record IDs, and numeric process/exception codes.
- `listener-clr-exceptions.json`: existing `.NET Runtime` 1025/1026 records for the listener, which is a .NET program, projecting the exception type and up to 16 stack-frame method names. Exception messages are not archived, because they can contain hosts or URLs of proxied requests.
- `dns-timeouts.json`, `dns-query-results.json`: existing DNS Client events for `vsblob.dev.azure.com`, projecting numeric status/type fields and separate process identities, not free-form query results. `emitterProcessId` comes from the event header and does not necessarily identify the requesting client. `clientProcessId` is preserved only when the payload supplies it (1014/v1); it is null for 1014/v0 and 3008/v0. Either PID can be null independently. Query type/status come from 3008 and are null for 1014. A disabled or inaccessible channel is explicitly unavailable; collection does not enable it.
- `listener-log-inventory.json`: immediate file names, sizes, and modification times under `%LOCALAPPDATA%\Temp\NetworkIsolation\Logs`. **This is metadata, not copies of the logs.** Raw listener logs have no reviewed content contract here; neither their contents nor adjacent configuration, environment, state files, command lines, event messages, or process dumps are archived.

Each section is limited to 64 records and 64 KiB of UTF-8 JSON. Event queries cover the previous hour. The existing command-timeout helper stops the collector's process tree after 45 seconds; the pipeline task has a two-minute backstop. Sections start as `notCollected`, replacing any previous snapshot, and are updated as they finish. `capture.json` starts with `completed: false`, so interrupted collection remains distinguishable from a completed snapshot. Missing commands, denied access, disabled logs, and missing listener logs produce unavailable sections with bounded reason codes rather than exception messages. All but disabled logs also produce warnings and a non-zero (non-fatal) exit; the hosted images disable the DNS Client operational channel, so that expected state is only recorded in the section. Collection errors do not replace the original build failure.

The snapshot cannot prove when or why a listener exited or recover a DNS question that was never logged; the crash records only help if Windows logged the exit. A clean snapshot after a retry is not proof of repair. Collection runs at the end of the job, after any retries of the failing step, not at the first failed request. Agent loss, cancellation, job timeout, failure before Node.js is installed, or failure of artifact publication can still prevent collection. Correlate timestamps with the failing step and the Start/Stop Network Isolation task logs, which also identify the task/image versions.

## Validation and rollout

Run the focused build-script tests:

```powershell
node --test build\lib\test\windowsNetworkDiagnostics.test.ts
```

The Windows tests use isolated PowerShell processes with fake command results, temporary files and local sockets. They verify evidence projection, the listener verdict and proxy probe, unavailable/empty distinctions, bounded output, interruption, and that secrets in excluded fields are not archived. The template checks cover placement, failure-only execution, timeouts, and artifact publication.

To validate a change on hosted agents, use non-publishing CI runs of a temporary branch with a step injected before `Checkout microsoft/vscode-capi`:

- A control run whose injected step fails, which must not report the listener.
- A run whose injected step stops `EtwNetworkEventListener.exe`, which reproduces a listener exit: the checkout then fails with `Failed to connect to github.com:443 over proxy` after about two seconds per attempt, the collector must report the stopped listener, and Stop Network Isolation logs `No service process found to kill`. The firewall filters remain, so this blocks the job's traffic rather than bypassing isolation.

Check the resulting JSON sections and that the jobs remain failed. Remove the injected step before landing the change.

For future raw-listener-log retention, first have the Network Isolation owners identify and review a specific safe file/field allowlist and retention/size limits. Do not copy the whole Network Isolation directory or treat these diagnostic artifacts as public attachments.

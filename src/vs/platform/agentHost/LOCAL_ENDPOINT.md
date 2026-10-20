# Local Agent Host Endpoint Discovery

VS Code's local agent host exposes the Agent Host Protocol (AHP) to other processes running as the same user. The endpoint is a WebSocket server bound to a Unix domain socket on macOS/Linux or a named pipe on Windows.

The local workbench uses a separate MessagePort transport. This document describes only the discoverable endpoint for external local clients.

## AHP transport logging

`chat.agentHost.ahpJsonlLoggingEnabled` defaults to enabled only in Insiders. Local and ordinary remote connections capture both directions in the window; the generic host WebSocket transport does not capture a second copy. Mission Control connections capture only on the host, including connections from VS Code windows.

Desktop and remote-server starters forward the setting through `VSCODE_AGENT_HOST_AHP_JSONL_LOGGING` at launch so host capture can include the first handshake. The owning local window also mirrors the setting into the read-only `ahpJsonlLoggingEnabled` AHP root-config property; updates affect existing Mission Control lanes without restarting or replenishing the byte budget. Remote Mission Control clients do not mirror their window's setting over the host owner's choice. Hosts without an explicit startup value use the Insiders default.

Mission Control hosts advertise their log directory in the optional `vscode.ahpLogDirectory` initialization metadata. The wire-log viewer reads those host-owned files through standard AHP resource operations, subject to the existing authentication and filesystem grants. Debug-log exports include Mission Control transport logs collected by the local Agent Host, but do not fetch logs from remote Mission Control hosts. Reads of the capture directory, their responses, and log-only file-watch changes are excluded from capture so inspection cannot recursively record log contents or feed back into file watching. This does not enable host-management methods, advertise OTLP diagnostic logs, or expand filesystem access. Hosts without this metadata retain historical window-local logs as a fallback.

Debug-log exports log and skip unsupported or unavailable individual log sources. Up to 1,000 client-file candidates are retained independently of the host archive; the combined ZIP entry budget and Mission Control deduplication are applied only after the host archive is available. A failed host-archive download does not prevent exporting client-owned logs. Cancellation and destination folder, write, or installation failures stop the operation and preserve the previous export.

Native ZIP creation reports skipped sources back to the exporter. If the host archive disappears during native inspection or opening, the exporter rebuilds the ZIP from the retained client candidates and reports the partial export.

All AHP JSONL writers in one process that use the same log directory share a cumulative 500 MiB budget, including concurrent connections, reconnects, and Mission Control lanes. Each window and host process accounts independently. Existing per-connection rotation (five files of up to 75 MiB each) still applies, but deleting or rotating a file does not replenish the shared budget. Pending entries and dropped-entry markers reserve their UTF-8 byte count before being queued, so queued writes cannot overshoot the budget.

When the next complete entry would exceed the budget, the process emits one `[AHPLog]` warning and stops capture for that log directory until the window or host process restarts. Already queued entries still flush. Subsequent messages are skipped before serialization; accounting uses memory only, without extra filesystem scans or metadata calls. Protocol traffic and other diagnostic logs are unaffected.

## Metadata location

The registry is a **directory of per-instance entry files**:

```text
<userDataPath>/agent-host/local-endpoint/entries/<identity>.json
```

Each locally running agent host process (this editor's own utility process, other editor windows, and the standalone `code agent host` CLI) owns exactly one entry file and writes only that file. `<identity>` is the lowercase SHA-256 hex digest of the UTF-8 string `${type}\0${pid}\0${instanceId}` (NUL-separated), so the filename is cross-language, path-safe, and collision-resistant for the full entry identity. Readers enumerate the directory to discover every live local agent host.

`<userDataPath>` is the active VS Code user data directory. Its value depends on the product quality and any `--user-data-dir` argument. Implementations should resolve the active user data directory rather than assuming the default Stable or Insiders location.

Because each process writes only its own file, there is no shared read-modify-write and therefore **no lock**. See [Multi-writer safety](#multi-writer-safety).

Entries are optional. If VS Code cannot prepare or publish the external endpoint, it logs the error and continues running the agent host over its internal MessagePort transport.

### Legacy `metadata.json` fallback (read-only)

Earlier builds wrote a single shared array file at `<userDataPath>/agent-host/local-endpoint/metadata.json`. Readers still merge valid entries from that legacy file **read-only** so hosts started by an older build (or before an in-place upgrade) remain discoverable. New per-instance entry files win any `(type, pid, instanceId)` collision. Writers never create, lock, or mutate `metadata.json`; its stale entries are filtered out by the PID-liveness check and age out naturally as those old hosts exit.

## File format

Each entry file is a single JSON object. The current schema version is `2`:

```json
{
  "schemaVersion": 2,
  "type": "editor",
  "pid": 12345,
  "instanceId": "base64url-instance-id",
  "protocolVersion": "0.7.0",
  "connectionToken": "base64url-bearer-token",
  "endpoint": {
    "type": "socket",
    "path": "\\\\.\\pipe\\vscode-agent-host-..."
  }
}
```

The legacy `metadata.json` fallback holds a JSON **array** of these same entry objects; the serialized entry schema is identical, only the storage container differs.

| Property | Description |
|---|---|
| `schemaVersion` | Metadata schema version. Clients must ignore entries whose version they do not understand rather than rejecting the whole file. |
| `type` | Kind of process that owns the endpoint: `editor` (a VS Code utility process) or `standalone` (the `code agent host` CLI). This controls ownership/default-selection policy on the client; it is not a measure of trust. |
| `pid` | PID of the process that owns the endpoint. |
| `instanceId` | Random identity used to distinguish successive endpoint owners. Combined with `type` and `pid`, this forms the entry's identity for dedupe/removal and for naming the entry file, since PIDs can be reused after a process exits. |
| `protocolVersion` | AHP version spoken by the host. Clients must still perform the normal AHP `initialize` negotiation. |
| `connectionToken` | Random bearer token required during the WebSocket upgrade. |
| `endpoint` | Discriminated union describing how to connect: `{ "type": "socket", "path": string }` for a Windows named pipe or Unix domain socket (used by the editor today), or `{ "type": "tcp", "host": string, "port": number }` for a TCP listener (used by the standalone CLI). |
| `quality` | Optional. Product quality of a standalone CLI endpoint. Not part of entry identity. |
| `tunnelName` | Optional. Tunnel name associated with a standalone CLI endpoint. Not part of entry identity. |

Readers must treat every entry and field as untrusted input:

- structurally validate every entry, dropping malformed ones individually rather than failing the whole read;
- ignore entries with an unsupported `schemaVersion`;
- ignore entries whose PID is confirmed dead, when a PID liveness check is possible;
- deduplicate entries by `(type, pid, instanceId)`;
- never reconstruct `endpoint` values — always use the published address as-is;
- perform the normal AHP `initialize` negotiation after connecting, regardless of the advertised `protocolVersion`.

The shared parser/model lives in [`common/agentHostEndpointRegistry.ts`](common/agentHostEndpointRegistry.ts) so every local reader and writer (the editor publisher, a future registry watcher, SSH discovery, and tests) validates entries identically.

Schema version `1` (a flat `{ endpointPath: string }` shape, `type` always `"editor"`) is the format previously written by the editor alone. Version-`2` readers ignore version-`1` entries rather than attempting to interpret them, consistent with the "ignore unsupported schema versions" rule above.

## Connecting

Connect to `endpoint.path` (socket endpoints) using WebSocket framing and provide `connectionToken` in the standard VS Code connection-token query parameter:

```text
?tkn=<connectionToken>
```

After the WebSocket upgrade succeeds, send the normal AHP `initialize` request. The metadata `protocolVersion` is useful for discovery and diagnostics, but it does not replace protocol negotiation.

Connections without the token, or with the wrong token, are rejected with HTTP 403 during the WebSocket upgrade.

### TCP connections and windowed delivery

Authenticated owner connections can open outbound sockets in the agent host's network when the host advertises the standard `tcpConnections` capability in `initialize`. Trusted local MessagePort connections also support this capability; unauthenticated WebSockets and multi-tenant relay connections do not.

Default VS Code clients offer upstream's released `SUPPORTED_PROTOCOL_VERSIONS` plus the legacy `0.10.0` compatibility alias. TCP availability is capability-based, with no additional 1.1 version gate or version override. Web PubSub and Mission Control transports reject TCP before opening a destination because their relay envelopes do not preserve original AHP JSON sizes.

Use `createTcpConnection`, then `subscribe` with `flowControl.receive`. TCP requires windowed delivery: the subscribe response contains accepted limits, followed by a `channel/snapshot` with empty state. Small `tcp/data` and `tcp/eof` notifications are sent directly; larger notifications use `channel/frame`, sized to the remaining credit as well as the frame limit. Tiny windows permit enough overshoot for the envelope and forward progress. `tcp/reset`, `unsubscribe`, and `channel/credit` bypass the data window but share a separately bounded control lane. TCP channels belong to the exact transport that created them and are never replayed or restored on reconnect. Requested TCP channels are reported in a replay result's `missing`; snapshot results omit their snapshots and have no `missing` field.

The control lane limits each notification to 16 KiB of UTF-16 JSON. Per transport, the receive token bucket allows a burst of 4096 controls and 1 MiB, replenished at those rates per second; outgoing controls are paced at half those limits to leave headroom for bunched delivery. Outgoing controls have a 64 KiB / 1024-entry queue, coalesce pending cumulative credits, and may use up to 64 KiB of reserved transport space beyond the 256 KiB data threshold. Incomplete fragments and releases reaching a quarter of the receive window schedule credit in a microtask, avoiding a browser timer delay on each credit/data round trip. Smaller complete-message releases coalesce for up to 10 ms. All credits still pass through the control budget. Incoming control-budget violations or outgoing queue overflow close the transport explicitly. These limits also cover TCP `unsubscribe` before subscription and controls for unknown TCP channels; ordinary subscriptions keep their existing unsubscribe behavior.

The client exposes `IAgentConnection.openTcpConnection()` as a bounded pull stream (`read`, `write`, `drain`, `end`, `close`). Consumers must read continuously rather than wait for EOF before releasing data. `end` half-closes the outgoing direction; `drain` waits for peer consumption credit, not application-level delivery at the destination.

The implementation allows 256 opening/live sockets per transport and 512 per host. Aggregate pending application writes are limited to 16 MiB per transport and 32 MiB per host, with a 4 MiB / 64-call per-stream write queue. Receive windows default to 256 KiB with 16 KiB frames, and separate local budgets bound reassembly and unread data. Creation/subscription and graceful drain after both half-closes have 30-second deadlines. Transport loss, reset, early unsubscribe, invalid data, and deadlines abort established sockets with TCP RST rather than normal EOF. Graceful closure preserves accepted writes; pending connection attempts are cancelled.

[`AgentHostChannelDelivery`](common/agentHostChannelDelivery.ts) owns generic direct/fragmented delivery, original JSON UTF-16 byte accounting, credit, and fair scheduling. Channel adapters own snapshot installation, data consumption, reset behavior, and recovery. TCP is its first consumer; chat, terminal, telemetry, and other subscriptions still use their existing delivery paths. TCP and fragment payloads are redacted from AHP JSONL logs.

## Endpoint paths

On Windows, the editor's `endpoint.path` is a named pipe:

```text
\\.\pipe\vscode-agent-host-<user-data-hash>-<instance-id>
```

On macOS/Linux, the socket is placed under `os.tmpdir()` using a short, user-data-specific directory to stay within Unix socket path-length limits:

```text
<os.tmpdir()>/vscode-ah-<user-data-hash>/<instance-id>.sock
```

Clients must use the path from the metadata file rather than reconstructing it.

## Multi-writer safety

The registry needs no lock. Each process owns a single entry file named after its own `(type, pid, instanceId)` identity, so concurrent publishers never touch the same file and cannot clobber each other's records. Every writer:

1. Prepares the owner-only `entries` directory.
2. Writes a mode-`0600` uniquely-named temporary file in that directory, flushes it, and atomically renames it over its own `<identity>.json` final path. Temporary files are cleaned up on failure and are ignored by readers because they are not `*.json`.

On Windows a rename over an existing file can transiently fail while another handle is open; because each identity has a single owner, the writer safely removes and replaces only its own final path to make republish idempotent without introducing a shared race.

Readers never write under coordination. Each reader:

1. Enumerates `entries/*.json`, plus the legacy `metadata.json` array if present.
2. Parses and structurally validates every entry independently, ignoring malformed files, unsupported schema versions, temporary files, and any other unrecognized names — a bad file logs a warning but never hides valid entries. A valid entry must also live under its own canonical `<identity>.json` name; an object stored under any other name is warned and ignored, so a misnamed copy can never shadow or delete the real entry.
3. Drops entries whose PID is confirmed dead. A dead entry's own file is best-effort removed by exact path; this is race-safe because any replacement owner would use a different `instanceId` and therefore a different filename.
4. Deduplicates by `(type, pid, instanceId)`, letting new entry files win over legacy `metadata.json` collisions.
5. Returns a deterministic ordering.

## Security and lifecycle

- The metadata root and the `entries` directory are restricted to the current user (mode `0700` on POSIX). Entry files are mode `0600`. On Windows, both directories carry an owner-only ACL; `SYSTEM` and Administrators also retain full access.
- The socket or pipe itself may use platform-default access. Possession of the metadata token is required to complete the WebSocket upgrade.
- An entry file is written atomically only after the endpoint is listening and the protocol handler is installed.
- On shutdown, VS Code computes its own `<identity>.json` path and removes only that exact file. The shared `entries` directory is intentionally left in place to avoid racing a concurrent publisher (an `rmdir` could delete the directory between another writer creating it and writing its temp file). Because a process only ever deletes its own file, it can never remove another live writer's entry, and the legacy `metadata.json` is never mutated.
- Clients should handle a missing entry, a stale PID, endpoint closure, and the registry changing while reconnecting.

The implementation and lifecycle wiring live in:

- [`common/agentHostEndpointRegistry.ts`](common/agentHostEndpointRegistry.ts)
- [`node/localAgentHostMetadata.ts`](node/localAgentHostMetadata.ts)
- [`node/agentHostMain.ts`](node/agentHostMain.ts)
- [`node/webSocketTransport.ts`](node/webSocketTransport.ts)

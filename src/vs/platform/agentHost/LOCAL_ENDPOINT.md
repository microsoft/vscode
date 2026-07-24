# Local Agent Host Endpoint Discovery

VS Code's local agent host exposes the Agent Host Protocol (AHP) to other
processes running as the same user. The endpoint is a WebSocket server bound to
a Unix domain socket on macOS/Linux or a named pipe on Windows.

The local workbench uses a separate MessagePort transport. This document
describes only the discoverable endpoint for external local clients.

## Metadata location

The endpoint metadata file is:

```text
<userDataPath>/agent-host/local-endpoint/metadata.json
```

`<userDataPath>` is the active VS Code user data directory. Its value depends on
the product quality and any `--user-data-dir` argument. Implementations
should resolve the active user data directory rather than assuming the default
Stable or Insiders location.

The file is a **shared registry**: every locally running agent host process
(this editor's own utility process, other editor windows, and the standalone
`code agent host` CLI) upserts its own entry into the same file, so any one
process can discover every other live local agent host.

The file is optional. If VS Code cannot prepare or publish the external
endpoint, it logs the error and continues running the agent host over its
internal MessagePort transport.

## File format

The current schema version is `2`:

```json
[
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
]
```

| Property | Description |
|---|---|
| `schemaVersion` | Metadata schema version. Clients must ignore entries whose version they do not understand rather than rejecting the whole file. |
| `type` | Kind of process that owns the endpoint: `editor` (a VS Code utility process) or `standalone` (the `code agent host` CLI). This controls ownership/default-selection policy on the client; it is not a measure of trust. |
| `pid` | PID of the process that owns the endpoint. |
| `instanceId` | Random identity used to distinguish successive endpoint owners. Combined with `type` and `pid`, this forms the entry's identity for dedupe/upsert/removal, since PIDs can be reused after a process exits. |
| `protocolVersion` | AHP version spoken by the host. Clients must still perform the normal AHP `initialize` negotiation. |
| `connectionToken` | Random bearer token required during the WebSocket upgrade. |
| `endpoint` | Discriminated union describing how to connect: `{ "type": "socket", "path": string }` for a Windows named pipe or Unix domain socket (used by the editor today), or `{ "type": "tcp", "host": string, "port": number }` for a TCP listener (used by the standalone CLI). |
| `quality` | Optional. Product quality of a standalone CLI endpoint. Not part of entry identity. |
| `tunnelName` | Optional. Tunnel name associated with a standalone CLI endpoint. Not part of entry identity. |

Readers must treat every entry and field as untrusted input:

- structurally validate every entry, dropping malformed ones individually
  rather than failing the whole read;
- ignore entries with an unsupported `schemaVersion`;
- ignore entries whose PID is confirmed dead, when a PID liveness check is
  possible;
- deduplicate entries by `(type, pid, instanceId)`;
- never reconstruct `endpoint` values — always use the published address as-is;
- perform the normal AHP `initialize` negotiation after connecting, regardless
  of the advertised `protocolVersion`.

The shared parser/model lives in
[`common/agentHostEndpointRegistry.ts`](common/agentHostEndpointRegistry.ts) so
every local reader and writer (the editor publisher, a future registry
watcher, SSH discovery, and tests) validates entries identically.

Schema version `1` (a flat `{ endpointPath: string }` shape, `type` always
`"editor"`) is the format previously written by the editor alone. Version-`2`
readers ignore version-`1` entries rather than attempting to interpret them,
consistent with the "ignore unsupported schema versions" rule above.

## Connecting

Connect to `endpoint.path` (socket endpoints) using WebSocket framing and
provide `connectionToken` in the standard VS Code connection-token query
parameter:

```text
?tkn=<connectionToken>
```

After the WebSocket upgrade succeeds, send the normal AHP `initialize` request.
The metadata `protocolVersion` is useful for discovery and diagnostics, but it
does not replace protocol negotiation.

Connections without the token, or with the wrong token, are rejected with HTTP
403 during the WebSocket upgrade.

## Endpoint paths

On Windows, the editor's `endpoint.path` is a named pipe:

```text
\\.\pipe\vscode-agent-host-<user-data-hash>-<instance-id>
```

On macOS/Linux, the socket is placed under `os.tmpdir()` using a short,
user-data-specific directory to stay within Unix socket path-length limits:

```text
<os.tmpdir()>/vscode-ah-<user-data-hash>/<instance-id>.sock
```

Clients must use the path from the metadata file rather than reconstructing it.

## Multi-writer safety

Because more than one process can publish to `metadata.json` at once, an
atomic rename by itself is not sufficient: two writers could read the same
array concurrently and each overwrite the other's addition. Every writer
therefore:

1. Acquires an exclusive lock: an atomically-created sibling lock directory
   (`metadata.json.lock`) containing an `owner.json` file recording the
   lock holder's `(pid, instanceId)`.
2. Reads the current array.
3. Drops entries whose PID is confirmed dead.
4. Upserts its own `(type, pid, instanceId)` entry.
5. Writes a mode-`0600` temporary file and atomically renames it over
   `metadata.json`.
6. Releases the lock.

Lock acquisition is bounded: if the lock directory already exists, a
contender inspects `owner.json`. If the recorded PID is no longer alive, the
lock is stale and is reclaimed immediately; otherwise acquisition is retried
until a short timeout elapses. On timeout, the writer does **not** silently
bypass the lock and write anyway — it logs the failure and continues running
undiscoverable, exactly as when the endpoint cannot be published at all.

Readers never take the lock: because the registry file is only ever observed
in a fully-written state (via atomic rename), reads are always safe without
coordination.

## Security and lifecycle

- The metadata directory and file are restricted to the current user. On
  Windows, `SYSTEM` and Administrators also retain full access.
- The socket or pipe itself may use platform-default access. Possession of the
  metadata token is required to complete the WebSocket upgrade.
- Metadata is written atomically only after the endpoint is listening and the
  protocol handler is installed.
- On shutdown, VS Code reacquires the write lock and removes only the entry
  whose `(type, pid, instanceId)` exactly matches its own. This prevents an
  older process from deleting a newer process's endpoint record, and prevents
  a writer from ever deleting another live writer's entry. The file itself is
  deleted only when the resulting array is empty.
- Clients should handle a missing file, a stale PID, endpoint closure, and the
  metadata being replaced while reconnecting.

The implementation and lifecycle wiring live in:

- [`common/agentHostEndpointRegistry.ts`](common/agentHostEndpointRegistry.ts)
- [`node/localAgentHostMetadata.ts`](node/localAgentHostMetadata.ts)
- [`node/agentHostMain.ts`](node/agentHostMain.ts)
- [`node/webSocketTransport.ts`](node/webSocketTransport.ts)

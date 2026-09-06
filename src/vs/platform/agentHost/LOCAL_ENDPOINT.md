# Local Agent Host Endpoint Discovery

VS Code's local agent host exposes the Agent Host Protocol (AHP) to other
processes running as the same user. The endpoint is a WebSocket server bound to
a Unix domain socket on macOS/Linux or a named pipe on Windows.

The local workbench uses a separate MessagePort transport. This document
describes only the discoverable endpoint for external local clients.

## Metadata location

The registry is a **directory of per-instance entry files**:

```text
<userDataPath>/agent-host/local-endpoint/entries/<identity>.json
```

Each locally running agent host process (this editor's own utility process,
other editor windows, and the standalone `code agent host` CLI) owns exactly one
entry file and writes only that file. `<identity>` is the lowercase SHA-256 hex
digest of the UTF-8 string `${type}\0${pid}\0${instanceId}` (NUL-separated), so
the filename is cross-language, path-safe, and collision-resistant for the full
entry identity. Readers enumerate the directory to discover every live local
agent host.

`<userDataPath>` is the active VS Code user data directory. Its value depends on
the product quality and any `--user-data-dir` argument. Implementations
should resolve the active user data directory rather than assuming the default
Stable or Insiders location.

Because each process writes only its own file, there is no shared
read-modify-write and therefore **no lock**. See
[Multi-writer safety](#multi-writer-safety).

Entries are optional. If VS Code cannot prepare or publish the external
endpoint, it logs the error and continues running the agent host over its
internal MessagePort transport.

### Legacy `metadata.json` fallback (read-only)

Earlier builds wrote a single shared array file at
`<userDataPath>/agent-host/local-endpoint/metadata.json`. Readers still merge
valid entries from that legacy file **read-only** so hosts started by an older
build (or before an in-place upgrade) remain discoverable. New per-instance
entry files win any `(type, pid, instanceId)` collision. Writers never create,
lock, or mutate `metadata.json`; its stale entries are filtered out by the
PID-liveness check and age out naturally as those old hosts exit.

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

The legacy `metadata.json` fallback holds a JSON **array** of these same entry
objects; the serialized entry schema is identical, only the storage container
differs.

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

The registry needs no lock. Each process owns a single entry file named after
its own `(type, pid, instanceId)` identity, so concurrent publishers never touch
the same file and cannot clobber each other's records. Every writer:

1. Prepares the owner-only `entries` directory.
2. Writes a mode-`0600` uniquely-named temporary file in that directory, flushes
   it, and atomically renames it over its own `<identity>.json` final path.
   Temporary files are cleaned up on failure and are ignored by readers because
   they are not `*.json`.

On Windows a rename over an existing file can transiently fail while another
handle is open; because each identity has a single owner, the writer safely
removes and replaces only its own final path to make republish idempotent
without introducing a shared race.

Readers never write under coordination. Each reader:

1. Enumerates `entries/*.json`, plus the legacy `metadata.json` array if present.
2. Parses and structurally validates every entry independently, ignoring
   malformed files, unsupported schema versions, temporary files, and any other
   unrecognized names — a bad file logs a warning but never hides valid entries.
   A valid entry must also live under its own canonical `<identity>.json` name;
   an object stored under any other name is warned and ignored, so a misnamed
   copy can never shadow or delete the real entry.
3. Drops entries whose PID is confirmed dead. A dead entry's own file is
   best-effort removed by exact path; this is race-safe because any replacement
   owner would use a different `instanceId` and therefore a different filename.
4. Deduplicates by `(type, pid, instanceId)`, letting new entry files win over
   legacy `metadata.json` collisions.
5. Returns a deterministic ordering.

## Security and lifecycle

- The metadata root and the `entries` directory are restricted to the current
  user (mode `0700` on POSIX). Entry files are mode `0600`. On Windows, both
  directories carry an owner-only ACL; `SYSTEM` and Administrators also retain
  full access.
- The socket or pipe itself may use platform-default access. Possession of the
  metadata token is required to complete the WebSocket upgrade.
- An entry file is written atomically only after the endpoint is listening and
  the protocol handler is installed.
- On shutdown, VS Code computes its own `<identity>.json` path and removes only
  that exact file. The shared `entries` directory is intentionally left in place
  to avoid racing a concurrent publisher (an `rmdir` could delete the directory
  between another writer creating it and writing its temp file). Because a
  process only ever deletes its own file, it can never remove another live
  writer's entry, and the legacy `metadata.json` is never mutated.
- Clients should handle a missing entry, a stale PID, endpoint closure, and the
  registry changing while reconnecting.

The implementation and lifecycle wiring live in:

- [`common/agentHostEndpointRegistry.ts`](common/agentHostEndpointRegistry.ts)
- [`node/localAgentHostMetadata.ts`](node/localAgentHostMetadata.ts)
- [`node/agentHostMain.ts`](node/agentHostMain.ts)
- [`node/webSocketTransport.ts`](node/webSocketTransport.ts)

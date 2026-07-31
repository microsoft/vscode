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

The file is optional. If VS Code cannot prepare or publish the external
endpoint, it logs the error and continues running the agent host over its
internal MessagePort transport.

## File format

The current schema version is `1`:

```json
[
  {
    "type": "editor",
    "schemaVersion": 1,
    "pid": 12345,
    "instanceId": "base64url-instance-id",
    "endpointPath": "\\\\.\\pipe\\vscode-agent-host-...",
    "connectionToken": "base64url-bearer-token",
    "protocolVersion": "0.7.0"
  }
]
```

| Property | Description |
|---|---|
| `type` | Kind of local server. Currently always `editor`. |
| `schemaVersion` | Metadata schema version. Clients should reject unsupported versions. |
| `pid` | PID of the agent host utility process that owns the endpoint. |
| `instanceId` | Random identity used to distinguish successive endpoint owners. |
| `endpointPath` | Windows named pipe or Unix domain socket path. |
| `connectionToken` | Random bearer token required during the WebSocket upgrade. |
| `protocolVersion` | AHP version spoken by the host. Clients must still perform the normal AHP `initialize` negotiation. |

Readers should treat every entry and field as untrusted input.

## Connecting

Connect to `endpointPath` using WebSocket framing and provide
`connectionToken` in the standard VS Code connection-token query parameter:

```text
?tkn=<connectionToken>
```

After the WebSocket upgrade succeeds, send the normal AHP `initialize` request.
The metadata `protocolVersion` is useful for discovery and diagnostics, but it
does not replace protocol negotiation.

Connections without the token, or with the wrong token, are rejected with HTTP
403 during the WebSocket upgrade.

## Endpoint paths

On Windows, `endpointPath` is a named pipe:

```text
\\.\pipe\vscode-agent-host-<user-data-hash>-<instance-id>
```

On macOS/Linux, the socket is placed under `os.tmpdir()` using a short,
user-data-specific directory to stay within Unix socket path-length limits:

```text
<os.tmpdir()>/vscode-ah-<user-data-hash>/<instance-id>.sock
```

Clients must use the path from the metadata file rather than reconstructing it.

## Security and lifecycle

- The metadata directory and file are restricted to the current user. On
  Windows, `SYSTEM` and Administrators also retain full access.
- The socket or pipe itself may use platform-default access. Possession of the
  metadata token is required to complete the WebSocket upgrade.
- Metadata is written atomically only after the endpoint is listening and the
  protocol handler is installed.
- On shutdown, VS Code removes the metadata only if its PID and `instanceId`
  still match. This prevents an older process from deleting a newer process's
  endpoint record.
- Clients should handle a missing file, a stale PID, endpoint closure, and the
  metadata being replaced while reconnecting.

The implementation and lifecycle wiring live in:

- [`node/localAgentHostMetadata.ts`](node/localAgentHostMetadata.ts)
- [`node/agentHostMain.ts`](node/agentHostMain.ts)
- [`node/webSocketTransport.ts`](node/webSocketTransport.ts)

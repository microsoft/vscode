# Mock Copilot policy server

Local Node server and web GUI for the four Copilot policy endpoints used by
`DefaultAccountService`. Mock selected endpoints while forwarding the rest to
the real API. It has no runtime dependencies and is not shipped with VS Code.

## Start

```sh
npm run mock-policy-server
```

Open `http://127.0.0.1:3000`. Managed settings is mocked by default. Use the
switch beside each endpoint tab to choose mock or passthrough. Presets apply
immediately; response behavior, status, and JSON edits auto-save.

Valid endpoint bodies and response configuration are stored redundantly: the
browser keeps each response-body draft in `localStorage`, and the server
atomically writes its complete state to `~/.mock-policy-server/state.json`.
Both copies survive server restarts. Invalid JSON remains in browser storage
until corrected because the server cannot serve it. Use `--state-file` or
`MOCK_POLICY_STATE_FILE` to select a different server-side state file.

The GUI opens on the **Policies** workspace. Select **Setup** in the header to
open a modal that guides you through any of these connection methods:

- **System proxy (recommended):** works with Code OSS, Stable, Insiders, Copilot
  CLI, and SDK/runtime clients. Any HTTP debugging proxy that can rewrite HTTPS
  requests works; [Proxyman](https://proxyman.com/) is the suggested option on
  macOS and Windows. The page provides a **Map Remote** rule, along with the
  per-platform toggle that routes system traffic through Proxyman (**Tools > macOS Proxy** on macOS,
  **Tools > Override Windows Proxy** on Windows). VS Code clients must also add
  the displayed `http.proxy` property to `settings.json`; the copy action copies
  only the property, without surrounding object braces.
- **File-based settings:** skip proxying altogether by writing the enterprise
  `managed-settings.json` to the client device. The client reads it from disk at
  startup — before sign-in and with no server round trip — so these requests never
  reach this server. Use it to avoid proxy setup, or to test precedence against a
  server-managed response. Local clients only. See
  [Deploying file-based settings](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings#deploying-file-based-settings).

After connecting, open the VS Code Command Palette and run **> Developer: Sync
Account Policy**. To refresh the policy used by Local Agent Host, also run
**> Developer: Restart Local Agent Host**.

For file-based settings there is nothing to connect: use **File Deployment** in
the right sidebar on the Policies page. It provides per-platform commands
(macOS, Windows PowerShell, Linux) that write the current response body to
`managed-settings.json` at its documented location. Copy one, run it on the
client device, and restart the client. On macOS and Linux the command uses
`sudo` so the file is the root-owned, non-writable regular file Copilot CLI
requires. Each platform section also provides a removal command to unset the
file-based policy.

| Operating system | `managed-settings.json` location |
| --- | --- |
| macOS | `/Library/Application Support/GitHubCopilot/managed-settings.json` |
| Windows | `%ProgramFiles%\GitHubCopilot\managed-settings.json` |
| Linux | `/etc/github-copilot/managed-settings.json` |

The Setup dialog tests the system proxy every five seconds by sending an
unauthenticated request shaped like
`GET <configured upstream>/copilot_internal/managed_settings?mockPolicySetupProbe=<random UUID>`
(`https://api.github.com` is the default upstream).
The probe must traverse the same mapping as real policy traffic: the page only
reports a successful connection when the mapped response carries this mock
server's identifying header. It does not inspect Proxyman or the operating
system's proxy configuration. The global header always shows a green or red
connection indicator.

To keep those automatic probes out of Proxyman's traffic list, use the display
filter regex `^(?!.*mockPolicySetupProbe).*managed_settings.*`. This should only
filter the displayed traffic; keep the probe included in the Map Remote rule so
the connection check can reach this server. The mock server recognizes the probe
query parameter and excludes those requests from **Live Requests**.

If no real request appears in **Live Requests**, open **Troubleshooting** in the
right sidebar, expand the client platform under **Clear SDK policy cache**, and run
the copied command in a terminal. The Copilot SDK maintains this cache outside of
VS Code; these commands delete the SDK cache file for the selected platform so a
fresh managed-settings request can be made. Without clearing it, a fresh cache
entry can prevent the client from making a request for up to one hour. Then run
the commands above again.

macOS:
```sh
rm -rf -- "${COPILOT_CACHE_HOME:-$HOME/Library/Caches/copilot}/managed-settings"
```

Windows PowerShell:
```powershell
$root = if ($env:COPILOT_CACHE_HOME) { $env:COPILOT_CACHE_HOME } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'copilot' } else { Join-Path $HOME '.cache\copilot' }; $path = Join-Path $root 'managed-settings'; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
```

Select a policy endpoint request in **Live Requests** to open its response editor.
Requests that do not match one of the four policy endpoints remain read-only.

Other Copilot clients share that cache. For an isolated run, start both the
server and Code OSS with the same temporary cache home:

```sh
COPILOT_CACHE_HOME="$PWD/.build/mock-policy-cache" npm run mock-policy-server
COPILOT_CACHE_HOME="$PWD/.build/mock-policy-cache" ./scripts/code.sh
```

## HTTP API

The control API is JSON-only and supports complete configuration without the
GUI. Start with its machine-readable index and current state:

```sh
BASE=http://127.0.0.1:3000
curl "$BASE/api"
curl "$BASE/api/state"
```

`GET /api/state` returns endpoint IDs, presets, current bodies, statuses, and
mock/passthrough state.

`GET /api` is intended for agents as well as humans. It documents update field
types, valid response modes, atomic update semantics, route side effects, and
the common JSON error shape. Unknown routes point back to this discovery
document, and unsupported methods return `405` with an `Allow` header.

Apply a known preset:

```sh
curl -X POST "$BASE/api/state" \
  -H 'Content-Type: application/json' \
  -d '{"endpoint":"managedSettings","preset":"not-configured"}'
```

Set a custom response:

```sh
curl -X POST "$BASE/api/state" \
  -H 'Content-Type: application/json' \
  -d '{"endpoint":"managedSettings","active":true,"status":200,"body":{}}'
```

Configure multiple endpoints atomically:

```sh
curl -X POST "$BASE/api/state" \
  -H 'Content-Type: application/json' \
  -d '{"endpoints":[
    {"endpoint":"managedSettings","preset":"empty"},
    {"endpoint":"entitlements","active":false},
    {"endpoint":"token","active":false},
    {"endpoint":"mcpRegistry","active":false}
  ]}'
```

A preset sets the status and body and enables mocking. Response behavior is
configured independently with `mode`, including when a preset and mode are sent
in the same update. Explicit `status`, `body`, or `active` values override the
preset. Invalid requests are rejected before any endpoint changes. Supported
response modes are `json`, `malformed-json`, `disconnect`, and `timeout`.

Generate file-based Managed Settings commands from the current
`managedSettings` response:

```sh
curl "$BASE/api/file-deployment"
```

The response includes the destination path plus install and removal commands
for macOS, Windows, and Linux. The server does not run these commands; run one
on the client machine and restart the client. Run the corresponding removal
command, or delete `managed-settings.json`, to unset file-based Managed Settings.

Other control operations:

```sh
curl "$BASE/api/schema"
curl "$BASE/api/log"
curl -X DELETE "$BASE/api/log"
curl -X DELETE "$BASE/api/cache"
curl -X POST "$BASE/api/reset"
```

`DELETE /api/cache` modifies files on the machine running the server. Inspect
each route's `sideEffects` value in `GET /api` before invoking it.

### Test fail-closed managed-settings refresh

First serve a successful policy that enables the forced-refresh requirement and
sync it into VS Code. Then configure an HTTP error preset or a failing response
behavior and sync again. Seeding the requirement first mirrors a real deployment
where the cached control self-perpetuates through an outage.

```sh
curl -X POST "$BASE/api/state" \
  -H 'Content-Type: application/json' \
  -d '{"endpoint":"managedSettings","preset":"customization-lockdown"}'

# Run "Developer: Sync Account Policy" in VS Code, then choose one:
curl -X POST "$BASE/api/state" -H 'Content-Type: application/json' \
  -d '{"endpoint":"managedSettings","preset":"server-error"}'
curl -X POST "$BASE/api/state" -H 'Content-Type: application/json' \
  -d '{"endpoint":"managedSettings","mode":"malformed-json","status":200}'
curl -X POST "$BASE/api/state" -H 'Content-Type: application/json' \
  -d '{"endpoint":"managedSettings","mode":"disconnect"}'
curl -X POST "$BASE/api/state" -H 'Content-Type: application/json' \
  -d '{"endpoint":"managedSettings","mode":"timeout"}'
```

These configurations exercise HTTP error, malformed response, immediate network
failure, and client-timeout paths respectively. Clear the policy cache if the
request does not appear in **Live Requests**.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api` | Discover request shapes and routes |
| `GET` | `/api/state` | Read definitions, presets, and current state |
| `POST` | `/api/state` | Apply and persist one update or an atomic endpoint array |
| `POST` | `/api/reset` | Restore and persist default endpoint state |
| `GET` | `/api/schema` | Read the managed-settings schema |
| `POST` | `/api/schema` | Change and reload the schema source for the current server process (loopback URL only) |
| `GET` | `/api/file-deployment` | Generate file install and removal commands |
| `GET`, `DELETE` | `/api/log` | Read or clear the request log |
| `DELETE` | `/api/cache` | Clear the managed-settings disk cache |

## Schema and options

The server auto-detects
`copilot-agent-runtime/schema/managed-settings-schema.json` beside the primary
VS Code checkout, including from a Git worktree. Override it at startup with
`--schema` or `MANAGED_SETTINGS_SCHEMA`, or edit **Schema source** in the GUI
and select **Load Schema**. GUI changes apply to the current server process and
reset to the startup source when the server restarts. Changing the schema source
is restricted to requests made through a loopback URL because the source can be
a local file path or remote URL.

```sh
npm run mock-policy-server -- --upstream https://api.ghe.example.com
npm run mock-policy-server -- --schema /path/to/managed-settings-schema.json
npm run mock-policy-server -- --port 3001
npm run mock-policy-server -- --state-file /path/to/mock-policy-state.json
npm run mock-policy-server -- --help
```

| Flag | Environment variable | Default |
| --- | --- | --- |
| `--host` | — | `127.0.0.1` |
| `--port` | — | `3000` |
| `--upstream` | `MOCK_POLICY_UPSTREAM` | `https://api.github.com` |
| `--schema` | `MANAGED_SETTINGS_SCHEMA` | Auto-detected sibling checkout |
| `--state-file` | `MOCK_POLICY_STATE_FILE` | `~/.mock-policy-server/state.json` |

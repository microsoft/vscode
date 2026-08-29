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

The GUI opens on the **Policies** workspace. Select **Setup** in the header to
open a modal that guides you through any of these connection methods:

- **System proxy (recommended):** works with Code OSS, Stable, Insiders, Copilot
  CLI, and SDK/runtime clients. The page recommends Proxyman on macOS and Windows
  and provides a **Map Remote** rule, along with the per-platform toggle that
  routes system traffic through Proxyman (**Tools > macOS Proxy** on macOS,
  **Tools > Override Windows Proxy** on Windows). VS Code clients must also add
  the displayed `http.proxy` property to `settings.json`; the copy action copies
  only the property, without surrounding object braces.
- **Code OSS overrides:** the quicker option for Code OSS from this checkout.
  Select **Apply Overrides**, reload, and sign in. This option does not redirect
  SDK/runtime requests.
- **File-based settings:** skip proxying altogether by writing the enterprise
  `managed-settings.json` to the client device. The client reads it from disk at
  startup — before sign-in and with no server round trip — so these requests never
  reach this server. Use it to avoid proxy setup, or to test precedence against a
  server-managed response. Local clients only. See
  [Deploying file-based settings](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings#deploying-file-based-settings).

After connecting, open the VS Code Command Palette and run **> Developer: Sync
Account Policy**. To refresh the policy used by Local Agent Host, also run
**> Developer: Restart Local Agent Host**.

For file-based settings there is nothing to connect: expand **Deploy as a file**
under the Managed Settings response body on the Policies page. It builds a
per-platform one-liner (macOS, Windows PowerShell, Linux) that writes the current
response body to `managed-settings.json` at its documented location. Copy it, run
it on the client device, and restart the client. On macOS and Linux the command
uses `sudo` so the file is the root-owned, non-writable regular file Copilot CLI
requires.

| Operating system | `managed-settings.json` location |
| --- | --- |
| macOS | `/Library/Application Support/GitHubCopilot/managed-settings.json` |
| Windows | `%ProgramFiles%\GitHubCopilot\managed-settings.json` |
| Linux | `/etc/github-copilot/managed-settings.json` |

The Setup dialog checks Code OSS overrides directly. It tests the system proxy by
sending a request without credentials to the managed settings URL and confirming
that the response came from this local server. It does not inspect Proxyman or
the operating system's proxy configuration. The test runs automatically, and the
global header always shows a green or red connection indicator.

If no real request appears in **Live Requests**, open **Clear SDK Policy Cache**,
expand the section for the client platform, and run the copied command in a
terminal. A fresh managed-settings cache entry can prevent the client from making
a request for up to one hour. Then run the commands above again.

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
| `POST` | `/api/state` | Apply one update or an atomic endpoint array |
| `POST` | `/api/reset` | Restore startup endpoint state |
| `GET` | `/api/schema` | Read the managed-settings schema |
| `GET`, `DELETE` | `/api/log` | Read or clear the request log |
| `DELETE` | `/api/cache` | Clear the managed-settings disk cache |
| `POST` | `/api/wire` | Apply `product.overrides.json` |
| `POST` | `/api/unwire` | Restore `product.overrides.json` |

## Schema and options

The server auto-detects
`copilot-agent-runtime/schema/managed-settings-schema.json` beside the primary
VS Code checkout, including from a Git worktree. Override it at startup with
`--schema` or `MANAGED_SETTINGS_SCHEMA`.

```sh
npm run mock-policy-server -- --upstream https://api.ghe.example.com
npm run mock-policy-server -- --schema /path/to/managed-settings-schema.json
npm run mock-policy-server -- --help
```

| Flag | Environment variable | Default |
| --- | --- | --- |
| `--host` | — | `127.0.0.1` |
| `--upstream` | `MOCK_POLICY_UPSTREAM` | `https://api.github.com` |
| `--schema` | `MANAGED_SETTINGS_SCHEMA` | Auto-detected sibling checkout |

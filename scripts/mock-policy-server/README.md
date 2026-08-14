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
immediately; status and JSON edits auto-save.

Point a client at the server with either:

- **Code OSS from sources:** select **Apply Overrides**, reload, sign in, and run
  **Developer: Sync Account Policy**.
- **Stable, Insiders, CLI, or another client:** configure the system proxy
  mapping shown for the selected endpoint and copy the VS Code `http.proxy`
  setting.

If no request appears in **Live Requests**, use **Clear Policy Cache**. A fresh
managed-settings cache entry can prevent the client from making a request for up
to one hour. Then run **Developer: Restart Local Agent Host** to force a new SDK
policy resolution.

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

A preset sets its status and body and enables mocking. Explicit `status`, `body`,
or `active` values in the same update override the preset. Invalid requests are
rejected before any endpoint changes.

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

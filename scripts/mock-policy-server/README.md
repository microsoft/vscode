# Mock Copilot policy endpoints

A standalone dev tool that mocks the Copilot **policy** endpoints that
`DefaultAccountService`
(`src/vs/workbench/services/accounts/browser/defaultAccount.ts`) calls, so you
can exercise the entitlement / token / MCP-registry / managed-settings (policy)
pipeline locally without the real GitHub backend.

It is **not** part of the shipped product — it is a local Node server + web GUI
with zero runtime dependencies.

## What it mocks

| Endpoint | Path | `product.json` key | Mocked by default |
| --- | --- | --- | --- |
| Managed settings | `/copilot_internal/managed_settings` | `managedSettingsUrl` | **yes** |
| Entitlements | `/copilot_internal/user` | `entitlementUrl` | no |
| Token | `/copilot_internal/v2/token` | `tokenEntitlementUrl` | no |
| MCP registry | `/copilot/mcp_registry` | `mcpRegistryDataUrl` | no |

The flow is gated: the **token** and **managed settings** are only fetched when
entitlements report `chat_enabled: true`, and the **MCP registry** only when the
token enables `mcp`.

### Everything else is proxied upstream

Any request this server is not deliberately mocking — including endpoints left
in passthrough, and any unrelated path — is forwarded to the real API
(`https://api.github.com` by default) and streamed straight back, with the
client's `Authorization` header untouched. That is what makes a blanket proxy
rule safe: you can redirect a whole URL prefix and still only fake the endpoints
you switched on.

Each endpoint has a **Mock this endpoint** checkbox and a status dot on its tab:
green means this server answers it, grey means it goes to the real API.

## Quick start

```sh
npm run mock-policy-server          # GUI on http://127.0.0.1:3000
```

1. Open the printed GUI URL.
2. Pick a preset and click **Apply** (this also switches mocking on for that
   endpoint). Everything in the editor auto-saves.
3. Point a client at the server using **one** of the two options below.
4. Watch the **Live requests** panel to confirm the client actually reached you.

## Option 1 — `product.overrides.json` (default)

Best for **Code OSS running from sources**. Click **Apply overrides** in the
sidebar, then:

1. **Reload** Code OSS (`VSCODE_DEV` must be set, i.e. running from sources).
2. Sign in with your GitHub/Copilot account.
3. Run **Developer: Sync Account Policy** (forces a refresh).
4. Run **Developer: Policy Diagnostics** to inspect the applied values.

**Restore original** reverts it. The existing file is copied to
`product.overrides.json.pre-mock-server` before anything is written, and that
backup is restored wholesale on unwire.

### How wiring works

`src/bootstrap-meta.ts` merges `product.overrides.json` over `product.json` with
a shallow, top-level `Object.assign`, only when `VSCODE_DEV` is set, and the file
is git-ignored. To override nested keys the tool writes back the **entire**
`defaultChatAgent` object (seeded from `product.json`) with only the four
endpoint URLs flipped, preserving every other key. Unwiring restores those URLs
to their `product.json` values and removes the file if nothing else remains.

### Caveats

- Works for the **default (github.com) provider** path, which reads these URLs
  directly from config. The enterprise provider derives some URLs from the
  enterprise host instead.
- You must be **signed in**; the fetch only fires for an authenticated account.
- Overrides require a **reload** and only apply when running from sources.
- The server ignores the `Authorization` header on mocked endpoints — any token
  is accepted. (Proxied requests forward it untouched.)

## Option 2 — with a proxy

Prefer this when `product.overrides.json` cannot help you:

- a **stable or Insiders build** (no `VSCODE_DEV`, no overrides file)
- the **Copilot CLI** or any other Copilot client
- you want to change policy **without reloading** anything

Add one Map Remote style rule in Proxyman, Charles, mitmproxy or Fiddler — the
GUI sidebar has both values with a copy button:

| Field | Value |
| --- | --- |
| Map from | `https://api.github.com/copilot_internal/*` |
| Map to | `http://127.0.0.1:3000/copilot_internal/*` |

Because the rule is a dumb one-time redirect, you never touch the proxy again —
you change policy in the browser tab and the next request picks it up.

**Proxyman specifics:** tick **Include query & path**, and leave *Advanced ›
preserve host header* **off** so the rewritten `Host` reaches this server.

**TLS:** the client speaks HTTPS to `api.github.com`, so the proxy must have its
root certificate installed and trusted on the machine (Proxyman: *Certificate ›
Install Certificate on this Mac*). The hop from the proxy to this server is
plain HTTP on loopback, which needs no certificate. If a client pins
certificates or ignores the system proxy, use Option 1 instead.

**GitHub Enterprise:** start the server with `--upstream https://api.ghe.example.com`
and point the Map Remote rule at that host, so un-mocked requests still reach
the right backend.

## The managed-settings disk cache gotcha

**Read this first if a policy change appears to do nothing.**

The Copilot runtime persists the last managed-settings response to disk and,
while that entry is **fresh (less than 1 hour old)**, skips the network
entirely. Your override is never even requested, so the tool looks broken when
it is working perfectly.

| Platform | Directory |
| --- | --- |
| macOS | `~/Library/Caches/copilot/managed-settings/` |
| Linux | `${XDG_CACHE_HOME:-~/.cache}/copilot/managed-settings/` |
| Windows | `%LOCALAPPDATA%\copilot\managed-settings\` |

`COPILOT_CACHE_HOME` overrides the platform base outright, in which case the
cache is at `$COPILOT_CACHE_HOME/managed-settings/`.

The **Clear managed-settings cache** button in the GUI header wipes these and
reports how many entries it removed. It is destructive but entirely safe — the
cache is disposable by design, and the runtime writes a header comment in every
file saying so.

The non-destructive alternative is to serve the **Force remote settings
refresh** preset (`{ "forceRemoteSettingsRefresh": true }`) once: it tells the
client to re-fetch on next startup regardless of cache freshness. That only
helps if the client can already see one of your responses, so it is a good way
to *stay* live once you are, and the cache button is what gets you there.

(Paths verified against `src/runtime/src/storage/managed_settings_cache.rs` and
`src/runtime/src/workspace/path_helpers.rs` in `github/copilot-agent-runtime`.)

## Options

```sh
npm run mock-policy-server -- --port 4000
npm run mock-policy-server -- --upstream https://api.ghe.example.com
npm run mock-policy-server -- --schema ./copilot-agent-runtime/schema/managed-settings-schema.json
npm run mock-policy-server -- --help
```

| Flag | Env | Default |
| --- | --- | --- |
| `--port` | `PORT` | `3000` |
| `--host` | — | `127.0.0.1` |
| `--upstream` | `MOCK_POLICY_UPSTREAM` | `https://api.github.com` |
| `--schema` | `MANAGED_SETTINGS_SCHEMA` | `copilot-agent-runtime/schema/managed-settings-schema.json` |

## Managed-settings schema

The GUI loads the managed-settings JSON schema and, on the **Managed Settings**
tab, warns about top-level keys that are not declared in it (mirroring how
`projectManagedSettings` drops undeclared keys — a typo like `permisions` would
otherwise silently do nothing). Warnings are shown only for **2xx** bodies,
since a 404/466/500 body is an error payload rather than a policy document.

The schema source is resolved in this order:

1. `--schema <url | file-uri | path>` CLI flag
2. `MANAGED_SETTINGS_SCHEMA` environment variable
3. Default: `./copilot-agent-runtime/schema/managed-settings-schema.json`,
   resolved against the **app's current working directory** (normally the vscode
   repo root, where the schema repo sits side-by-side).

`http(s)://` URLs and `file://` URIs are both accepted. The schema is re-read on
every **Load**, so you can edit it without restarting the server. A missing
schema is non-fatal — the GUI shows the resolved path and skips validation.
**Generate example** hydrates a full example document from the schema.

## Presets

The Managed Settings tab ships realistic policy documents, each valid against
the schema: empty, locked down, bypass disabled, bypass allow-auto-only, MCP
allow/deny, remote control requireSSO, plugin/marketplace policy, force remote
refresh, plus 404 (no policy), 500 (cache-fallback path) and the compatibility
rejection contract:

```json
{
	"error_code": "client_update_required",
	"client_id": "vscode",
	"client_version": "1.132.0",
	"minimum_client_version": "1.133.0"
}
```

The control API also accepts
`{ "endpoint": "managedSettings", "status": 466, "body": { ... } }` at
`POST /api/state`.

## Why not a proxy script?

Proxyman's JavaScript scripting sandbox has no filesystem or network access and
runs synchronously, so a script cannot read a config file that you edit live —
the policy would have to be hardcoded in the script and re-edited (and the
script re-saved) for every change. A static Map Remote rule plus this server
keeps the proxy rule fixed and moves all the editing into a UI.

## Control API

Same-origin only (no CORS), which is a deliberate CSRF guard: without it, an
unrelated website could drive `/api/wire` and rewrite your local
`product.overrides.json`. The mocked Copilot endpoints *do* send permissive
CORS, so the **web** build of Code OSS can call them cross-origin.

| Route | Purpose |
| --- | --- |
| `GET /api/state` | Full GUI state (endpoints, bodies, statuses, toggles, proxy values) |
| `POST /api/state` | Update `status`, `body` and/or `active` for one endpoint |
| `GET /api/schema` | Load the managed-settings schema (`?source=` to override) |
| `GET /api/log` | Rolling request log (last 200) |
| `DELETE /api/log` | Clear the request log |
| `DELETE /api/cache` | Wipe the managed-settings disk cache |
| `POST /api/wire` | Point `product.overrides.json` at this server |
| `POST /api/unwire` | Restore the original `product.overrides.json` |

## Files

- `server.ts` — zero-dependency Node server (mock routes + upstream proxy +
  control API + schema loader + GUI assets).
- `endpoints.ts` — endpoint definitions and presets, shared by the server and
  the GUI.
- `public/` — the web GUI (`index.html`, `app.ts`, `style.css`).

`server.ts` runs under `node --experimental-strip-types` with no build step, and
serves `endpoints.ts` and `public/app.ts` to the browser type-stripped via
`module.stripTypeScriptTypes()`.

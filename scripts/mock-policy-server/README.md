# Mock Copilot policy endpoints

A standalone dev tool that mocks the Copilot **policy** endpoints that
`DefaultAccountService`
(`src/vs/workbench/services/accounts/browser/defaultAccount.ts`) calls, so you
can exercise the entitlement / token / MCP-registry / managed-settings (policy)
pipeline locally without the real GitHub backend.

It is **not** part of the shipped product — it is a local Node server + web GUI.

## What it mocks

| Endpoint | Path | `product.json` key | Response |
| --- | --- | --- | --- |
| Entitlements | `/copilot_internal/user` | `entitlementUrl` | `IEntitlementsData` (`chat_enabled`, `copilot_plan`, `cloud_session_storage_enabled`, …) |
| Token | `/copilot_internal/v2/token` | `tokenEntitlementUrl` | `{ token: "agent_mode=1;editor_preview_features=1;mcp=1;…:sig" }` |
| MCP registry | `/copilot/mcp_registry` | `mcpRegistryDataUrl` | `{ mcp_registries: [{ url, registry_access }] }` |
| Managed settings | `/copilot_internal/managed_settings` | `managedSettingsUrl` | `IManagedSettingsResponse` (enterprise `settings.json`) |

The flow is gated: the **token** and **managed settings** are only fetched when
entitlements report `chat_enabled: true`, and the **MCP registry** only when the
token enables `mcp`.

## Usage

```sh
npm run mock-policy-server          # starts on http://127.0.0.1:3000
npm run mock-policy-server -- --port 4000
npm run mock-policy-server -- --schema ./copilot-agent-runtime/schema/managed-settings-schema.json
```

1. Open the printed GUI URL.
2. Pick an endpoint tab, choose a preset or edit the JSON, and **Save**.
3. Click **Wire all endpoints** to point `product.overrides.json` at this server.
4. **Reload** Code OSS (running from sources, so `VSCODE_DEV` is set).
5. Sign in with your GitHub/Copilot account.
6. Run **Developer: Sync Account Policy** (forces a refresh).
7. Run **Developer: Policy Diagnostics** to inspect the applied values.

Click **Unwire** to restore the original URLs.

## Managed-settings schema

The GUI loads the managed-settings JSON schema and, on the **Managed Settings**
tab, warns about top-level keys that are not declared in it (mirroring how
`projectManagedSettings` drops undeclared keys). The schema source is resolved in
this order:

1. `--schema <url | file-uri | path>` CLI flag
2. `MANAGED_SETTINGS_SCHEMA` environment variable
3. Default: `./copilot-agent-runtime/schema/managed-settings-schema.json`,
   resolved against the **app's current working directory** (normally the vscode
   repo root, where the schema repo sits side-by-side).

`http(s)://` URLs and `file://` URIs are both accepted; relative paths are
resolved from the cwd. The schema is re-read on every **Refresh**, so you can
edit it without restarting the server. A missing schema is non-fatal — the GUI
just shows the resolved path and skips schema validation.

## How wiring works

`src/bootstrap-meta.ts` merges `product.overrides.json` over `product.json` with
a shallow, top-level `Object.assign`, only when `VSCODE_DEV` is set, and the file
is git-ignored. To override nested keys the tool writes back the **entire**
`defaultChatAgent` object (seeded from `product.json`) with only the four
endpoint URLs flipped, preserving every other key. Unwiring restores those URLs
to their `product.json` values and removes the file if nothing else remains.

## Caveats

- Works for the **default (github.com) provider** path, which reads these URLs
  directly from config. The enterprise provider derives some URLs from the
  enterprise host instead.
- You must be **signed in**; the fetch only fires for an authenticated account.
- Overrides require a **reload** and only apply when running from sources.
- The server ignores the `Authorization` header — any token is accepted.

## Files

- `server.js` — zero-dependency Node `http` server (endpoints + control API + schema loader + static).
- `endpoints.js` — shared endpoint definitions and presets (used by server and GUI).
- `public/` — the web GUI (`index.html`, `app.js`, `style.css`).

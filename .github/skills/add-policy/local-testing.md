# Local Testing: Mock Policy Server

When developing or reviewing account/GitHub policy and managed settings, you
usually can't hit the real Copilot backend (it needs an enterprise admin to
author `.github/copilot/settings.json`, and you can't freely edit the responses).
Use the **mock policy server** to serve arbitrary policy responses locally and
exercise the full pipeline (entitlements → token → MCP registry → managed
settings → `IPolicyData` → `PolicyConfiguration`).

- Tool: `scripts/mock-policy-server/` (zero-dependency Node server + small web GUI)
- Full docs / control API: [`scripts/mock-policy-server/README.md`](../../../scripts/mock-policy-server/README.md)

It mocks the four endpoints `DefaultAccountService` calls (the URLs come from
`product.json` → `defaultChatAgent`):

| Endpoint | Path | `product.json` key |
|----------|------|--------------------|
| Entitlements | `/copilot_internal/user` | `entitlementUrl` |
| Token | `/copilot_internal/v2/token` | `tokenEntitlementUrl` |
| MCP registry | `/copilot/mcp_registry` | `mcpRegistryDataUrl` |
| Managed settings | `/copilot_internal/managed_settings` | `managedSettingsUrl` |

## Basic steps

1. **Start the server** from the repo root:
   ```sh
   npm run mock-policy-server          # http://127.0.0.1:3000
   ```
2. **Author the responses.** Open the GUI URL, pick the endpoint tab, choose a
   preset or edit the JSON, and **Save**. (Or script it: `POST /api/state` with
   `{ "endpoint": "<id>", "body": { … } }`.) Make sure **entitlements**
   `chat_enabled` is `true` — otherwise the token and managed settings are never
   fetched.
3. **Wire** — click **Wire all endpoints**. This writes `product.overrides.json`,
   pointing every `defaultChatAgent` policy URL at the local server while
   preserving all other keys.
4. **Reload Code OSS** and **sign in** with the Copilot/GitHub account. Overrides
   only apply when running from sources (`VSCODE_DEV` is set) and after a reload.
5. **Apply & verify:**
   - **Developer: Sync Account Policy** — forces a refresh of the policy data.
   - **Developer: Policy Diagnostics** — opens a report; confirm the Managed
     Settings section and the Applied Policy table reflect your mocked values.
6. **Iterate** — change a response and re-run **Sync Account Policy** (no need to
   re-wire). Click **Unwire** when done to restore the original URLs.

## Notes

- **Gating:** the **token** and **managed settings** are only fetched when
  entitlements report `chat_enabled: true`; the **MCP registry** only when the
  token sets `mcp=1`. The token is a string with the grammar
  `key=value;key=value:signature` (flags read: `agent_mode`,
  `editor_preview_features`, `mcp`).
- **Managed-settings schema:** the GUI loads the schema and warns about top-level
  keys not declared in it (the same keys `projectManagedSettings` would drop).
  The source is `--schema <url|file-uri|path>` / `MANAGED_SETTINGS_SCHEMA`,
  defaulting to `./copilot-agent-runtime/schema/managed-settings-schema.json`
  resolved against the current working directory.
- This mocks the **response bodies only**, not authentication — you still need to
  be signed in with a real account.

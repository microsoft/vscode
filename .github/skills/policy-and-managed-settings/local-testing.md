# Local Testing: Mock Policy Server

```sh
npm run mock-policy-server   # http://127.0.0.1:3000
```

[`scripts/mock-policy-server/README.md`](../../../scripts/mock-policy-server/README.md) covers proxy setup, file deployment, cache locations, schema loading, and options. Agent essentials:

- Drive it via the JSON API: `GET /api` (discovery), `GET /api/state` (endpoints, preset IDs), `POST /api/state` (single or atomic array update). Prefer preset IDs over copied bodies.
- Only managed settings is mocked by default; keep other endpoints in passthrough.
- Clients share the runtime's managed-settings cache. Use an isolated `COPILOT_CACHE_HOME` (and `--state-file`) for deterministic runs, or use the GUI's **Clear SDK Policy Cache** commands.
- Apply changes in VS Code with **Developer: Sync Account Policy**.
- `forceRemoteSettingsRefresh`: apply `customization-lockdown`, sync once successfully, then switch to `server-error` or a `malformed-json`/`disconnect`/`timeout` response mode and sync again.

## Runtime diagnostics

To test **Agent Runtime Resolution** in **Developer: Policy Diagnostics**, the runtime must fetch the mock itself. Launch Code OSS with `COPILOT_DEBUG_GITHUB_API_URL=http://127.0.0.1:<port>`, a fresh `COPILOT_CACHE_HOME`, and `COPILOT_MANAGED_SETTINGS_CACHE=0`. This does not redirect the workbench's own account-policy fetch (use the proxy setup for both), and the GUI's proxy indicator may stay red; check the live request log instead.

With a preset such as `disable-bypass-permissions`, a new report should show an account, `serverManaged: true`, the preset in the `server` layer, and `source: mixed` when device policy is also set. This verifies diagnostics, not enforcement. The model-free regression is `copilotManagedSettingsAgentHostE2E.integrationTest.ts`.

Commit only presets known to be valid; edit the body directly for experiments.

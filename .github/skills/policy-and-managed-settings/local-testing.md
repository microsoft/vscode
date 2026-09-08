# Local Testing: Mock Policy Server

Use [`scripts/mock-policy-server/`](../../../scripts/mock-policy-server/) to test
Copilot policy responses locally. It can mock the four `defaultChatAgent`
endpoints that `DefaultAccountService` calls and proxy unmocked requests to the
real API.

## Quick start

```sh
npm run mock-policy-server          # http://127.0.0.1:3000
```

Only managed settings is mocked by default. Use the switch beside each endpoint
tab to choose mock or passthrough. Presets apply immediately; response edits
auto-save.

Valid endpoint state persists atomically in
`~/.mock-policy-server/state.json` and response-body drafts are also retained in
browser storage. On the first restart after upgrading from an in-memory-only
server, the GUI restores valid browser drafts into the server-side state file.
Use `--state-file` or `MOCK_POLICY_STATE_FILE` for isolated test instances.

Agents should use the JSON control API: start with `GET /api` for discovery and
`GET /api/state` for endpoint IDs and presets, then use `POST /api/state` for a
single update or an atomic endpoint array. Prefer known preset IDs over copying
preset bodies. Use `GET /api/file-deployment` to generate platform-specific
install and removal commands from the current Managed Settings response.

Choose the client setup in the GUI:

- **Code OSS, Stable, Insiders, CLI, or other clients:** configure the displayed
  system proxy mapping and enable Proxyman's platform proxy toggle (**Tools >
  macOS Proxy** or **Tools > Override Windows Proxy**). VS Code clients must
  also add the displayed `http.proxy` property to `settings.json`.
- **File-based settings (no proxy):** use **File Deployment** in the right
  sidebar and run the copied per-platform command to write the current body to
  `managed-settings.json` on the device. Restart the client to load it. Use it
  to skip proxying or to test precedence against a server-managed response. See
  [Deploying file-based settings](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings#deploying-file-based-settings).

Use **Clear SDK Policy Cache**, expand the macOS or Windows section, and run the
copied command when the runtime's fresh managed-settings cache prevents a network
request. Select a known policy endpoint in the live request log to open its
response editor.

To test `forceRemoteSettingsRefresh` fail-closed behavior, apply the
`customization-lockdown` managed-settings preset and sync once successfully.
Then select the `server-error` preset or choose the `malformed-json`,
`disconnect`, or `timeout` response behavior and sync again. The successful
first response seeds the cached refresh requirement; the second response
exercises HTTP, parse, immediate-network, or client-timeout failure without
manually editing payloads.

Other Copilot clients share the default cache. For deterministic testing, start
both Code OSS and the mock server with the same isolated `COPILOT_CACHE_HOME`.

The managed-settings schema is auto-detected from a sibling
`copilot-agent-runtime` checkout, including when VS Code runs from a Git
worktree. Use `--schema` or `MANAGED_SETTINGS_SCHEMA` at server startup to
override it. The GUI's **Schema source** field can load a different path, file
URI, or HTTP(S) URL for the current server process; restart the server to return
to its startup source.

See the [mock policy server README](../../../scripts/mock-policy-server/README.md)
for proxy setup, cache locations, schema loading, and server options.

Keep shared presets limited to responses already known to be valid. Edit the
response body directly for one-off experiments rather than committing
speculative policy examples.

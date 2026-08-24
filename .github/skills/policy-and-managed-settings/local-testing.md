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

Agents should use the JSON control API: start with `GET /api` for discovery and
`GET /api/state` for endpoint IDs and presets, then use `POST /api/state` for a
single update or an atomic endpoint array. Prefer known preset IDs over copying
preset bodies.

Choose the client setup in the GUI:

- **Code OSS from sources:** apply `product.overrides.json`, reload, sign in, and
  run **Developer: Sync Account Policy**.
- **Stable, Insiders, CLI, or other clients:** configure the displayed system
  proxy mapping.

Use **Clear Policy Cache** when the runtime's fresh managed-settings cache
prevents a network request. The live request log confirms whether the client
reached the server.

Other Copilot clients share the default cache. For deterministic testing, start
both Code OSS and the mock server with the same isolated `COPILOT_CACHE_HOME`.

The managed-settings schema is auto-detected from a sibling
`copilot-agent-runtime` checkout, including when VS Code runs from a Git
worktree. Use `--schema` or `MANAGED_SETTINGS_SCHEMA` at server startup to
override it; the GUI does not reload schema sources.

See the [mock policy server README](../../../scripts/mock-policy-server/README.md)
for proxy setup, cache locations, schema loading, and server options.

Keep shared presets limited to responses already known to be valid. Edit the
response body directly for one-off experiments rather than committing
speculative policy examples.

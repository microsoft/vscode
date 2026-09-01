# Investigation: bundled Copilot CLI ignores `toolSearch: {enabled: true}` under replay

## Goal

Identify which input the bundled `@github/copilot` runtime (v1.0.82-0) requires to activate its
tool-search feature, that the e2e replay environment does not provide. Once identified, teach
`src/vs/platform/agentHost/test/node/e2e/harness/capiStubs.ts` to serve it, so the prompt-snapshot
suite can pin the full production wire (`tool_search_tool` in the tools array + deferral of
non-allowlisted tools) instead of only the host-authored half.

Per the feature owner: tool search in production is switched by the host setting
(`chat.agentHost.copilot.toolSearch.enabled` → session config `toolSearch: {enabled}`), NOT by an
experiment. So the runtime honors the setting in production but ignores it under replay — some
bootstrap input must differ.

## Symptom (verified repeatedly)

In the e2e replay environment, a Copilot CLI session launched with:

- session config `toolSearch: { enabled: true, deferThreshold: 1 }` (also tried `0`)
- a registered custom tool named `tool_search_tool` with `overridesBuiltInTool: true, defer: 'never'`
  (see `copilotAgentSession.ts` `_createClientSdkTools`, ~line 1821)
- client tools including deferrable ones (`defer: 'auto'`)

produces a model request whose `tools` array contains every tool preloaded, no `tool_search_tool`,
and nothing deferred. The host side is provably correct in the same request: the host-composed
system prompt contains the tool-search guidance line ("Most tools are deferred and hidden…"),
which is emitted from the same `toolSearchActive` boolean that produced the session config
(`copilotSessionLauncher.ts` `_buildSessionConfig`, ~lines 868–948).

The record-only coverage tests (`copilotCoverageSuite.ts`, "tool search exposes deferred client
tools…") did see tool search activate when recorded against live CAPI with this same host code —
so the runtime's gate opens with live bootstrap data and closes with stubbed bootstrap data.

## Ruled out (each empirically, with the setting provably received)

1. **Host gates** — config push, model support, client `toolSearch` tool registration: all green
   (guidance line present in the very request that lacks the tool).
2. **`/models` catalog metadata** — adding `capabilities.supports.tool_search: true` and
   `policy: { state: 'enabled' }` to the stub catalog changed nothing.
3. **Deferral arithmetic** — `deferThreshold: 0` ("always defer") plus a deferrable client tool:
   still no `tool_search_tool`, still nothing deferred.
4. **SDK plumbing shape** — the bundled `copilot-sdk/types.d.ts` documents exactly the config the
   host sends (`ToolSearchConfig`, ~line 513; the `tool_search_tool` override contract, ~line 1747).

## Prime suspects (unverified)

1. **The Copilot token.** Real `/copilot_internal/v2/token` responses embed `key=value;…`
   entitlement fields inside the token string; the runtime parses them. The replay stub token is
   the bare string `replay-copilot-token` with no fields (`capiStubs.ts` `tokenStubBody`).
2. **`/copilot_internal/user` payload flags** — the stub (`userStubBody`) is a guessed set; a flag
   the runtime checks may be missing.
3. **Any other bootstrap endpoint** the runtime queries that the proxy stubs empty (`{}` catch-all
   for `/copilot_internal/*`) or 404s. Capture the full endpoint list the CLI hits during a session
   (the replay proxy sees every request — log unmatched/stubbed paths).

## Where the gating logic lives (and why static analysis stalled)

- The decision is NOT in the inspectable JS bundles. Checked: `app.js` (TUI),
  `copilot-sdk/index.js` (SDK client), `sdk/index.js` (session host JS) under
  `node_modules/@github/copilot-darwin-arm64/` — they only pass `toolSearch` through to the native
  layer (`sessionScalarSetToolSearchOverrideJson`).
- The `copilot` binary is a Node SEA (Mach-O, ~146MB); its JS/data payload is not greppable
  (likely compressed/V8-snapshot). `strings`/`rg -a` find neither `tool_search` nor known feature
  flag names like `SHELL_SPAWN_BACKEND`.
- The runtime has feature-flag infrastructure: `resolvedFeatureFlags` per session, and a
  `COPILOT_CLI_ENABLED_FEATURE_FLAGS` env var the host already uses for `SHELL_SPAWN_BACKEND`
  (`copilotAgent.ts` ~line 2009). If a flag name for tool search exists, forcing it via this env
  var may be the cheapest fix — the flag name is the unknown.
- `changelog.json` in the binary dir mentions: "Experimental: Tool search with deferred loading",
  "Enable tool search for Claude Haiku 4.5+", "Subagents correctly evaluate tool search support
  for their own model" — evidence of runtime-side model gating and an experimental phase, but the
  feature owner states production is setting-driven.
- Best source of truth: the `github/copilot-cli` / copilot-agent-runtime source (the team is
  reachable; the repo may be accessible to maintainers). Find where `toolSearch.enabled` from
  session config is consumed and what it is ANDed with.

## How to reproduce / probe (all tokenless, ~3 min per single-model run)

Repro on branch `dev/bhavyau/tool-search-prompt-snapshot` (or any branch containing PR #333689):

```sh
npm run transpile-client
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/e2e/providers/copilotPromptsE2E.integrationTest.ts --grep "claude-haiku-4.5"
```

To inspect the exact wire request, temporarily add inside the test (before the assertion) —
`writeFileSync` is already imported:

```ts
writeFileSync(`/tmp/ahp-body-${model}.json`, body);
```

then check `JSON.parse(...).tools` for `tool_search_tool`. Remove the line afterwards.

Probe surface:
- Stub bodies: `src/vs/platform/agentHost/test/node/e2e/harness/capiStubs.ts` (token, user, models).
- Proxy (sees every request the CLI makes; add logging for unknown paths):
  `src/vs/platform/agentHost/test/node/e2e/harness/capiReplayProxy.ts`.
- Env vars for the CLI process: `copilotAgent.ts` `_spawn…` region (~line 1995).
- Runtime debug logs: failed tests dump them (`lease.dumpRuntimeLogsOnFailure`); also consider
  raising the CLI log level via env if it supports one.

## Definition of done

1. Name the exact input (token field, user flag, endpoint, env flag) the runtime requires.
2. Serve it from `capiStubs.ts` (or set it in the CLI env) so replay activates tool search.
3. Regenerate baselines (`AGENT_HOST_UPDATE_AHP_SNAPSHOTS=1 …`) — expect `tool_search_tool` and
   deferral to appear for tool-search models — and review the diff.
4. Upgrade the consistency assertion in `copilotPromptsE2E.integrationTest.ts` (search for
   `TOOL_SEARCH_GUIDANCE_FRAGMENT`) from one-directional to a strict check if the wire is now
   fully deterministic.
5. Consider promoting the record-only tool-search tests in `copilotCoverageSuite.ts` to replay.

## Constraints

- Never commit; the branch owner commits.
- Keep the e2e suite external to the host: no imports from `src/vs/platform/agentHost/node/**`
  into `test/node/e2e/**` (see `e2e/README.md`, "Two governing principles").
- Recording against live CAPI requires credentials the investigation should not assume.

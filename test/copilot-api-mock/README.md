# copilot-api-mock + Policy Inspector

A zero-dependency tool for validating **enterprise-managed plugins** (and account
policy more broadly) against **Code OSS** — fully offline, no real GitHub backend
or sign-in.

It has two layers:

1. **`copilot-api-mock` (the engine)** — serves the four endpoints VS Code core's
   `DefaultAccountProvider` hits, ships a stub `github` auth extension, example
   payloads, override scripts, and a CI validator. Exposes a small control-plane
   HTTP API.
2. **Policy Inspector (the UI)** — a local-first inspector (inspired by
   `ahp-inspector`) that is a pure **client** of that control-plane API: a
   timeline of policy fetches → a detail panel showing each response and the
   adapted `IPolicyData`, plus an effective-policy headline. Because it only
   talks to the documented API, it could later be lifted out to stand alone.

> "Policy" here means the **Copilot enterprise policy** pipeline — not VS Code's
> OS-level Group Policy / MDM (`NativePolicyService`), which is a separate system.

Entry points (run from the repo root):

```bash
npm run policy-inspector        # dev: start the engine + open the Policy Inspector
npm run mock-copilot-api        # same server, engine-centric alias
npm run test-copilot-api-mock   # CI: validate examples against core (headless, exits non-zero on drift)
```

## Why this exists

The enterprise-managed plugins feature (VS Code 1.122) delivers three keys —
`enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces` — from the
`/copilot_internal/managed_settings` endpoint. Those flow through
`adaptManagedSettings` → `IPolicyData` → policy-locked `chat.plugins.*` settings
→ the plugin gate in `AgentPluginService`. This tool lets a developer exercise
that **real** path (including rate-limit backoff and malformed-entry handling)
without an enterprise tenant.

## What it mocks

| Endpoint (from `product.json` → `defaultChatAgent`) | Purpose |
|---|---|
| `GET /copilot_internal/user` | Entitlements. `chat_enabled: true` **gates** the rest. |
| `GET /copilot_internal/v2/token` | `;`-delimited token string (`agent_mode`, `mcp`, `editor_preview_features`, …). |
| `GET /copilot/mcp_registry` | MCP registry (only fetched when the token's `mcp=1`). |
| `GET /copilot_internal/managed_settings` | The editable enterprise policy payload (`.github/copilot/settings.json`). |

Plus a control plane: `GET /__health`, `GET /__state`, `POST /__settings`,
`POST /__conditions`, `GET /__examples`, `GET /__adapted` (live preview through
core's real `adaptManagedSettings`), and `GET /__log`.

## Quick start (offline, ~30s)

```bash
# 1. Start the engine + Policy Inspector (from the repo root)
npm run policy-inspector
#   → Policy Inspector + base URL on http://localhost:3000
#   (from inside test/copilot-api-mock you can also use: npm start)

# 2. In another terminal, point Code OSS at the mock
cd test/copilot-api-mock && npm run apply-overrides
#   → writes product.overrides.json (backed up byte-for-byte; reversible)

# 3. Launch Code OSS with the stub auth provider (no real sign-in)
cd ../..
./scripts/code.sh \
  --disable-extension vscode.github-authentication \
  --extensionDevelopmentPath="$PWD/test/copilot-api-mock/auth-extension"
```

Then open <http://localhost:3000> for the Policy Inspector, or inspect inside
Code OSS (see below).

Then inspect the result inside Code OSS:

- **Policy Diagnostics** (command palette → *Developer: Policy Diagnostics*) shows the applied `chat.plugins.*` policy values and the managed-settings fetch status.
- The **Agent Plugins** view shows enterprise-blocked plugins as disabled / non-removable.
- `curl localhost:3000/__log` shows exactly which endpoints core fetched.

### Clean up

```bash
cd test/copilot-api-mock
npm run revert-overrides   # restores product.overrides.json to its prior state
```

## Policy Inspector

Opening the base URL (e.g. <http://localhost:3000>) serves the **Policy
Inspector** — a zero-dependency, local-first inspector for the Copilot enterprise
policy pipeline. The PRIMARY input is the editable `managed_settings` payload —
the real `.github/copilot/settings.json` an admin authors. Layout:

- **Editor** — the `managed_settings` payload, editable live; every edit is
  pushed to the server and served on Code OSS's next fetch (debounced).
- **Examples** rail — load a starting-point payload into the editor.
- **Delivery conditions** — an axis orthogonal to the payload: the
  `chat_enabled` gate and the `managed_settings` HTTP status (200 / 429 / 500).
- **Effective policy** headline — what the current payload adapts to
  (`enabledPlugins` allow/deny counts, marketplaces, strict, warnings),
  computed by importing core's *real* compiled `adaptManagedSettings`.
- **Timeline** — a dense log of the fetches Code OSS actually made (endpoint,
  status, latency, auth), newest first, with a ⚠ pip when the adapter dropped
  off-spec entries. Filter by endpoint / status, or search.
- **Detail panel** — click a fetch to see its request, the response (Pretty/Raw,
  copyable), and — for `managed_settings` — the adapted `IPolicyData` plus the
  exact adapter warnings. Each row is self-contained, so it stays accurate even
  after you edit the payload or conditions.

The control plane it consumes: `GET /__health`, `GET /__state`,
`POST /__settings`, `POST /__conditions`, `GET /__examples`, `GET /__adapted`
(live core adapter), `GET /__log` (the four mocked endpoints only — the
inspector's own polling is excluded).

The adapted views need Code OSS to be built (they import from `out/`); until then
they show a hint. Everything else works without a build.

## CI validation

`npm run test-copilot-api-mock` runs two checks: (1) architecture facts the tool
encodes about core — the `chat_enabled` gate is a boolean and the token string
carries the flags core reads; and (2) every example payload under `examples/`
run through core's real `adaptManagedSettings`, asserted against a committed
snapshot in `examples/snapshots.json`. It exits non-zero on any mismatch, so
**examples can't silently drift from core**.

When you intentionally change an example (or core's adapter changes), refresh the
snapshot and re-commit:

```bash
npm run test-copilot-api-mock -- --update     # from the repo root
# or, inside test/copilot-api-mock:  npm run check:update
```

This requires Code OSS to be built (it imports the compiled adapter from
`out/`); the validator prints a clear error and exits non-zero if it isn't.

## Examples

Each `examples/<name>.json` is a REAL `.github/copilot/settings.json` payload —
no test scaffolding — usable as a starting point in the inspector's editor.
`examples/_meta.json` holds one-line descriptions; `examples/snapshots.json` is
the generated CI snapshot. Current examples:

| Example | What it demonstrates |
|---|---|
| `empty` | `{}` — explicit "no policy file present". |
| `enabled-plugins` | `enabledPlugins` gate: only listed-true plugins load. |
| `extra-marketplaces` | Marketplace union (github + git source forms). |
| `strict-marketplaces` | `strictKnownMarketplaces`: only the enterprise marketplace is trusted. |
| `malformed` | Off-spec entries; `adaptManagedSettings` drops the bad ones. |

Delivery conditions that used to be baked into scenarios — the `chat_enabled`
gate and a `429` rate-limit — are now an **orthogonal axis** you combine with any
payload, via the inspector's *Delivery conditions* panel or the control plane:

```bash
curl -XPOST localhost:3000/__settings   -d '{"strictKnownMarketplaces":true}'
curl -XPOST localhost:3000/__conditions -d '{"chatEnabled":false,"managedSettingsStatus":429}'
curl localhost:3000/__state             # see the active payload + conditions
```

Add your own example by dropping a pure-payload `examples/<name>.json` (a
`managed_settings` object — any key core understands works) and, optionally, a
blurb in `examples/_meta.json`; then run `--update` to snapshot it.

## Forward compatibility (no hardcoded policy keys)

**This tool never needs a code change when a new enterprise-managed policy key
is added** — only when the underlying *architecture* changes (a brand-new
endpoint, or a change to the token-string format).

That is by construction:

- `managedSettings` is served **verbatim** ([responses.mjs](src/responses.mjs)) — the mock never enumerates policy keys.
- The adapted `IPolicyData` is produced by importing core's **real** compiled `adaptManagedSettings` ([adapter.mjs](src/adapter.mjs)) — so the tool computes exactly what the workbench computes, including any newly added key.
- The Policy Inspector headline renders **one chip per adapted key generically** (by value type), so a new key appears automatically.
- CI is a **snapshot through that same real adapter** ([validate.mjs](src/validate.mjs)); a new key is captured on the next `--update`, with no code change. (The only tool-side assertions are architecture facts — the gate and token-string flags — not a per-policy registry.)

So the flow for a new policy is: core adds the key → rebuild Code OSS → the tool
surfaces it everywhere automatically; add an example if you want to exercise it.

## How the redirect works

`product.overrides.json` (repo root, gitignored) is shallow-merged over
`product.json` when `VSCODE_DEV` is set. Because that merge is shallow,
overriding `defaultChatAgent` replaces the **whole** object — so
`apply-overrides.mjs` reads the complete `defaultChatAgent` from `product.json`
and patches only the four URLs, preserving every other field.

> **Why not the enterprise (`github-enterprise.uri`) path?** Core derives
> enterprise URLs as `http://api.<host>/…`, so `localhost:3000` would become
> `api.localhost:3000`, which doesn't resolve. The default-provider URL override
> gives exact control. (And the account label must avoid `_`, which core treats
> as an EMU/enterprise account.)

## Source-of-truth pins

The response shapes are pinned to core. If core changes these, update
`src/responses.mjs`:

- `src/vs/base/common/defaultAccount.ts` — `IEntitlementsData`
- `src/vs/workbench/services/accounts/browser/defaultAccount.ts` — token parsing, MCP registry
- `src/vs/workbench/services/accounts/browser/managedSettings.ts` — managed-settings shape

The stub auth provider mirrors
`src/vs/sessions/test/e2e/extensions/sessions-e2e-mock/extension.js`.

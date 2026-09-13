# CLAUDE.md

Context for Claude Code (or any AI assistant) working in this repository.
Read this fully before making changes. See also `ARCHITECTURE.md` and
`DECISIONS.md` for deeper background — this file stays short on purpose.

## What this repo is

Kente Workbench — a fork of `microsoft/vscode` with an embedded, governance-
aware coding agent, built for African developer economics (cost-tiered
model routing, offline-first, low-spec-hardware support). Currently in
Tier 0 (foundation): forking and de-branding the editor shell before any
agent code exists.

**"Kente Workbench" is a working/placeholder name** — not finalized. See
`DECISIONS.md` for why it changed from "Kente Studio."

## Tech stack

- Electron + TypeScript (inherited from upstream VS Code)
- Node.js — **pinned to major version 24**, per `.nvmrc`. Mismatches throw
  a hard preinstall error by design (upstream's `build/npm/preinstall.ts`).
  Use `nvm use` before anything else in this repo.
- Build system: Gulp (`npm run gulp <task>`), not webpack/vite — this is
  inherited from upstream and not worth changing.
- Extension gallery: Open VSX (`https://open-vsx.org`), not Microsoft's
  marketplace — required for license compliance as a third-party fork.

## Common commands

```bash
nvm use                  # match the pinned Node version — do this first, always
npm ci                   # clean install; ~15-20 min on first run (native modules)
npm run compile          # compile TypeScript
./scripts/code.sh         # launch the editor (needs a display)
npm run eslint            # lint
node apply-product-json.cjs product.json   # re-apply branding after upstream merges
```

CI (`.github/workflows/build.yml`) runs a fast Ubuntu compile/lint check on
every push, plus native macOS + Windows packaging builds. Never cross-
compile platform packages locally — build each on its native OS.

## Architecture (summary — see ARCHITECTURE.md for the full picture)

Everything funnels through one chokepoint: the **governance gate**. Order
of composition for any agent action: IDE shell → agent orchestrator →
governance gate (approval + audit log) → capability layer (model routing /
retrieval / tool & infra / skills & hooks) → integrations (MCP, Slack,
Teams, WhatsApp).

No agent orchestrator code exists yet in this repo — Tier 0 is the editor
shell only.

## Hard rules — do not weaken these

- **No autonomous production changes without human sign-off.** Any code
  this repo ships must enforce approval gates for production-impacting
  actions (deploys, infra changes on shared/remote clusters, merges). This
  is a governance requirement inherited from the MTN Ghana AI/vendor
  governance principles this project originated under — not a style
  preference.
- **Telemetry is off by default** (`enableTelemetry: false` in
  `product.json`). Don't silently re-enable it or point it at a new
  endpoint without an explicit, documented opt-in mechanism.
- **Don't reintroduce Microsoft-specific endpoints** (`aiConfig`,
  `crashReporter`, the original `updateUrl`) when merging upstream changes
  — `apply-product-json.cjs` strips these; re-run it after upstream syncs.
- **Local Docker/dev-only infra actions are low-friction; anything
  touching a remote/shared cluster goes through the same approval gate as
  code changes.** Don't build a shortcut around this distinction.

## Known gotchas

- **Node version**: `.nvmrc` pins major version 24. A mismatch fails loudly
  at `npm ci` — this is intentional upstream behavior, not a bug to work
  around.
- **`.js` files in this repo are ES modules** (`package.json` has
  `"type": "module"`) — any new CommonJS script needs a `.cjs` extension,
  or it throws `ReferenceError: require is not defined`.
- **`product.json.diff` is documentation, not a literal patch** — don't
  `git apply` it. Use `apply-product-json.cjs` for actual changes, which
  patches by key rather than by line/context.
- **Icons are not yet replaced** — `resources/{darwin,win32,linux}/` still
  has upstream VS Code icon assets pending final branding artwork.

## Related docs

- `ARCHITECTURE.md` — full system architecture and the tiered feature roadmap
- `DECISIONS.md` — naming history, why VS Code was forked directly rather
  than via Cursor/Void, and other decisions with their rationale
- `SETUP.md` — step-by-step fork/build runbook

# Phase 15 — SDK Distribution via `product.json` + main.vscode-cdn.net

> **Retrospective**, not a forward plan. Phase 15 shipped without a
> dedicated `phaseN-plan.md`; this file documents what actually landed so
> the roadmap's Phase 15 link resolves and future readers have the same
> contract-level record the other phases carry. Source of truth for the
> code is the files cited inline.
> Last updated: 2026-06-17.

**Status:** ✅ done — runtime downloader and the per-platform build
pipeline both landed. Unit tests green (16 across `resolveSdkTarget` +
`AgentSdkDownloader` in
[`agentSdkDownloader.test.ts`](../../test/node/agentSdkDownloader.test.ts)),
`typecheck-client` clean. Shipped under the previously-tracked
"per-platform" work (the earlier roadmap referenced a
`phase15-per-platform-plan.md` that was never written — this file replaces
those dangling links).

## Goal

Ship the Claude and Codex agent SDKs to end users without bundling them in
the app and without asking users to hand-install anything. A fresh
Insiders install should be able to pick a Claude or Codex model and have
the SDK fetched on demand, while developers keep a zero-friction local
override.

The constraint that shaped the whole design: **macOS Universal bundles
share a single `product.json` across arm64 and x64 launches**, so the
shipped config cannot hard-code a per-arch URL. The runtime must resolve
the right tarball per launch.

## Scope

**In scope**
- `product.agentSdks.<pkg>` config shape (`{ version, urlTemplate }`) in
  [`product.ts`](../../../../base/common/product.ts).
- Runtime downloader `AgentSdkDownloader` + `resolveSdkTarget` in
  [`agentSdkDownloader.ts`](../agentSdkDownloader.ts): dev-override →
  cache → CDN download, with negative-cache latching and in-process
  download de-duplication.
- Per-package strategy object `IAgentSdkPackage` so the downloader never
  branches on provider id (`ClaudeSdkPackage`, `CodexSdkPackage` live in
  their owning agent modules).
- Provider-registration gate via `IAgentSdkDownloader.isAvailable(pkg)`.
- Three-tier SDK resolution in
  [`claudeAgentSdkService.ts`](./claudeAgentSdkService.ts#L186) `_loadSdk`
  (env override → downloader → dev bare-import) and the Codex equivalent.
- Build pipeline under [`build/agent-sdk/`](../../../../../../build/agent-sdk/README.md):
  per-SDK pinned `{package.json, package-lock.json}`, `produce.ts`,
  `package.ts` (deterministic tar), `upload.ts` (idempotent CDN publish),
  `common.ts` (shared helpers incl. `readAgentSdkResults`).
- Azure Pipelines integration:
  [`agent-sdk-produce.yml`](../../../../../../build/azure-pipelines/common/agent-sdk-produce.yml)
  before each `gulp vscode-<platform>-<arch>-min-ci`, and the
  `packageTask` `jsonEditor` stamp in
  [`gulpfile.vscode.ts`](../../../../../../build/gulpfile.vscode.ts#L308).

**Out of scope**
- Per-tarball sha256 in `product.json` — replaced by `product.checksums`
  (covers the shipped `product.json`) + HTTPS to a Microsoft-controlled
  CDN as the trust chain.
- REH-web `agentSdks` stamping — the agent host is node-only; the
  browser-served server has no consumer.
- A separate `AgentSDK` pipeline stage / `aggregate.ts` — rejected in
  favour of an inline `readAgentSdkResults()` call inside the existing
  `jsonEditor` callback, keeping `packageTask` a sync stream-returning
  function.
- A standalone `verify-determinism.ts` CI gate — the determinism comes
  from `npm ci` against the committed lockfile + reproducible
  node-tar/gzip flags in `package.ts`; no separate enforcement script
  shipped.

## What shipped

### Runtime config shape

`product.agentSdks` is an optional map keyed by package id
([`product.ts`](../../../../base/common/product.ts#L81)):

```typescript
interface IAgentSdkProductConfig {
    readonly version: string;
    readonly urlTemplate: string; // format2() template, e.g.
    // https://main.vscode-cdn.net/agent-sdk/claude/0.3.169/{sdkTarget}.tgz
}
```

`urlTemplate` carries a single recognised placeholder, `{sdkTarget}`. The
same template ships on every platform; the runtime substitutes the
placeholder per launch. `vscode-distro` and OSS `product.json` both omit
`agentSdks` — the build IS the distribution, so only built products carry
it.

### `resolveSdkTarget` — per-launch target resolution

[`resolveSdkTarget(pkg, host?)`](../agentSdkDownloader.ts) maps the
running host `(platform, arch, libc)` to the build's tarball suffix:

- Claude on glibc Linux → `linux-x64` / `linux-arm64`
- Claude on musl Linux → `linux-x64-musl` / `linux-arm64-musl`
- Codex Linux (any libc) → `linux-x64` / `linux-arm64` (its Linux binary
  is statically musl-linked, so one SKU runs on both)
- everywhere else → `<platform>-<arch>`
- unsupported (`armhf`, web, …) → `undefined` → provider not registered

The only per-SDK knob is `IAgentSdkPackage.hasSeparateMuslLinuxPackage`
(Claude: `true`, Codex: `false`). This runtime function is the deliberate
mirror of the build-time `getSdkTargetForBuild` in
[`build/agent-sdk/common.ts`](../../../../../../build/agent-sdk/common.ts) —
the two tables must stay in lockstep when a new SKU is added.

### `AgentSdkDownloader` — resolution order + resilience

[`loadSdkRoot(pkg, token)`](../agentSdkDownloader.ts) returns the absolute
SDK root (the dir containing `node_modules/`); callers resolve the
package-internal entrypoint themselves:

1. **Dev override** — `process.env[pkg.devOverrideEnvVar]` returned
   unchanged.
2. **Cache hit** — `<userDataPath>/agent-host/sdk-cache/<pkg>/<sdkVersion>/<sdkTarget>/`
   with a `.complete` sentinel. The `sdkTarget` segment keeps Universal
   launches that resolve to different targets from thrashing one cache.
3. **Download** — fetch `format2(config.urlTemplate, { sdkTarget })`,
   extract, write the sentinel.

Resilience details that shipped:
- **Negative-cache latch** (`LOAD_FAILURE_NEGATIVE_CACHE_MS = 30s`,
  keyed by `pkg.id`) so a broken CDN isn't hammered by poll-driven UIs.
  Cancellations are not latched.
- **In-flight de-dup** keyed by `cacheDir` so concurrent `loadSdkRoot`
  calls share one download; distinct targets get distinct entries.
- **Rename-winner** publish so concurrent first-launch downloads don't
  corrupt the cache; the loser returns the winner's published dir.

`isAvailable(pkg)` is the cheap synchronous startup gate: `true` iff the
dev override is set, OR (`product.agentSdks?.[pkg.id]` populated AND
`resolveSdkTarget(pkg)` resolves). Used to decide whether to register the
provider at all — no download triggered.

### `_loadSdk` three-tier resolution

[`claudeAgentSdkService.ts:186`](./claudeAgentSdkService.ts#L186):

1. `AgentHostClaudeSdkRootEnvVar` override → import
   `<root>/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`.
2. `this._downloader.isAvailable(ClaudeSdkPackage)` → download root,
   import the same entrypoint off it. Errors propagate as-is so a CDN
   outage / corrupt cache surfaces actionable diagnostics, not a
   misleading "cannot find module".
3. Dev bare-import `@anthropic-ai/claude-agent-sdk` (resolves via this
   repo's `node_modules` devDependency) — reached only in dev launches.

Codex mirrors this in `CodexAgent._startConnection`, resolving
`@openai/codex/bin/codex.js` off the root.

### Build pipeline (`build/agent-sdk/`)

- **`agents/<sdk>/{package.json, package-lock.json}`** — one folder per
  SDK; the folder set IS the SDK list (no parallel array). Each
  `package.json` declares exactly one dependency at an exact version
  (no `^`/`~` — ranges would break the content-addressed CDN upload).
  Today: Claude `0.3.169`, Codex `0.135.0`.
- **`package.ts` `buildOne`** — runs on any OS: `npm ci` with
  `npm_config_libc/os/cpu` fetches the foreign-platform binary verbatim
  from the locked graph, then reproducible node-tar+gzip.
- **`upload.ts` `uploadOne`** — HEAD-then-decide: absent → upload;
  matching sha → skip (idempotent re-runs); drifted sha → fail loud
  rather than overwrite content-addressed history.
- **`produce.ts`** — per-`(vscode-platform, arch)` entry. Iterates SDKs
  in parallel, builds + (conditionally) uploads, writes the results JSON,
  emits `##vso[task.setvariable variable=AGENT_SDK_RESULTS_FILE]`.
  Behaviour splits on `VSCODE_PUBLISH`: `true` → build+upload+stamp;
  unset → build-only (tarballs published as inspection artifacts,
  `product.json` ships without `agentSdks`, runtime falls back to the
  dev-override path — same UX as a local `gulp` build).
- **`gulpfile.vscode.ts` `packageTask`** — the existing `jsonEditor`
  callback (the one that injects `commit`/`date`/`checksums`/`version`)
  calls `readAgentSdkResults()` and, when non-empty, merges
  `json.agentSdks`. REH writes it only for `type === 'reh'`.

## Trade-offs accepted

- **`urlTemplate` + `{sdkTarget}` over per-platform `{url, sha256}`.**
  The original design stamped a concrete URL + hash per platform. That
  breaks macOS Universal, where one `product.json` serves two arches.
  Moving target resolution to launch time (and dropping the per-tarball
  sha for `product.checksums` + HTTPS) is what makes Universal work with
  a single shipped config.
- **No per-tarball sha256 verification at runtime.** Trust rests on the
  signed app bundle covering `product.json` via `product.checksums`, plus
  HTTPS to a Microsoft-controlled CDN. Accepted as equivalent to how the
  rest of `product.json`'s URLs are trusted.
- **Inline gulp stamping over a dedicated pipeline stage.** Keeps
  `packageTask` synchronous and avoids an `aggregate.ts`; the cost is
  that the `produce.ts` ↔ `getSdkTargetForBuild` ↔ runtime
  `resolveSdkTarget` triple must be kept in sync by convention.
- **Dev override retained indefinitely.** `chat.agentHost.claudeAgent.path`
  → `AgentHostClaudeSdkRootEnvVar` (and the Codex equivalent) survive as
  the SDK-development bypass; they are no longer the primary distribution
  path.

## Tests

- [`agentSdkDownloader.test.ts`](../../test/node/agentSdkDownloader.test.ts)
  — 16 tests: `resolveSdkTarget` table (platform/arch/musl/unsupported),
  `isAvailable` gating, `loadSdkRoot` dev-override / template-substitution
  / cache-miss-download / cache-hit / Universal-target-separation /
  missing-config error / bad-placeholder error / cancellation cleanup /
  concurrent-share / rename-loser.
- Build-side determinism is enforced structurally (committed lockfile +
  reproducible tar flags); no separate determinism test script shipped.

## Exit criteria (met)

- Fresh Insiders install can use Claude/Codex without installing the SDK
  or setting any path.
- SDK version bumps are a build-pipeline change: edit the exact version in
  `build/agent-sdk/agents/<sdk>/package.json`, refresh the lockfile
  (`npm install --package-lock-only --ignore-scripts`), commit both. The
  per-platform `produce.ts` step republishes the tarballs and
  `packageTask` re-stamps `product.agentSdks[pkg]`.
- Dev override keeps working for SDK development.

## Bumping an SDK version (operational note)

1. Edit `dependencies` version in
   `build/agent-sdk/agents/<sdk>/package.json` to the new exact version.
2. From that directory:
   `npm install --package-lock-only --ignore-scripts` to refresh
   `package-lock.json`.
3. Commit both files. The next publish build produces + uploads the new
   tarballs and stamps the new version into `product.json`.

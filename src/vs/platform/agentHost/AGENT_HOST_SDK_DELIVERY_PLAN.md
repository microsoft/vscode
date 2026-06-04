# Plan: On-demand delivery of Agent Host SDKs (Codex + Claude)

## Problem

The agent host can register the Codex and Claude agent providers, but today only when the
user manually points a setting at a locally-downloaded SDK:

- `chat.agentHost.claudeAgent.path` → `@anthropic-ai/claude-agent-sdk` package
- `chat.agentHost.codexAgent.path` → `codex` binary

We don't want to **bundle** the SDKs (each per-platform native package is ~190–210 MB).
Instead we want to:

1. Publish the SDK bundles as **regular VS Code assets** (ESRP-signed, served from the
   PRSS CDN, listed on `builds.code.visualstudio.com`), with a download URL shaped like
   `https://vscode.download.prss.microsoft.com/dbazure/download/insider/<commit>/<file>.gz`.
2. Pin a **specific SDK version per VS Code build** (baked into `product.json`); rebuild /
   re-upload the SDK bundle only when the pinned version changes (dedupe / no-op otherwise).
3. Source the SDKs from the **approved npm mirror (Terrapin / Monaco feed)**, not raw npm.
4. **Download on demand at runtime**, verify checksum, cache, and hand the path to the
   agent host — keeping the existing settings as **developer overrides**.
5. Use the build as a **smoke-test gate**: download + run a basic SDK sanity check so a
   green VS Code build proves the product + pinned SDKs work together.

## Key facts established during research

### Package shapes
- **Codex**: `@openai/codex` (16 KB JS launcher, `bin/codex.js`) resolves a per-platform
  optionalDependency `@openai/codex-<os>-<arch>` (e.g. `@openai/codex-darwin-arm64`, ~191 MB)
  that vendors `vendor/<triple>/bin/codex` (Rust binary) and a vendored `rg`. The agent host
  spawns `codex app-server`. `@openai/codex-sdk` is **NOT** required and should be removed if
  present. `package.json` currently declares `@openai/codex` only.
- **Claude**: `@anthropic-ai/claude-agent-sdk` (8.9 MB JS core, `main: sdk.mjs`, loaded via
  dynamic `import()`), deps `@anthropic-ai/sdk` + `@modelcontextprotocol/sdk`, plus a
  per-platform optionalDependency `@anthropic-ai/claude-agent-sdk-<os>-<arch>` (~207 MB)
  containing a native `claude` binary. Linux has **musl** variants too.

Both SDKs = small JS core + one heavy per-platform native package.

### Build / publish plumbing that already exists (precedents to mirror)
- `build/azure-pipelines/product-build.yml`:
  - `PRSS_CDN_URL = https://vscode.download.prss.microsoft.com/dbazure/download` (var, ~line 151)
  - `VSCODE_MIXIN_REPO = microsoft/vscode-distro` (product.json overlay source)
  - Dedicated `Copilot` stage (~line 219) builds a VSIX and publishes it as a pipeline
    artifact (`copilot_vsix`); `downloadCopilotVsix.ts` later consumes it. **Closest existing
    pattern to mirror.**
- `build/azure-pipelines/common/publish.ts` → `processArtifact()`:
  - Uploads each `vscode_<product>_<os>_<arch>_<type>` artifact to ESRP, releases it to
    `${PRSS_CDN_URL}/${quality}/${version}/${filename}`, records an `Asset`
    `{platform, type, url, hash, sha256hash, size}` in CosmosDB (`builds` DB).
  - `getPlatform()` maps product/os/arch/type → asset platform string (needs new cases).
  - **Dedupe is built in**: it HTTP-200-checks the PRSS URL before uploading.
- `build/lib/builtInExtensions.ts`: build-time download of versioned artifacts (version +
  `sha256` baked into `product.json`). **The pattern for pinning version+hash in product.json.**
- npm mirror: `product-build.yml` default registry
  `https://pkgs.dev.azure.com/monacotools/Monaco/_packaging/vscode/npm/registry/` (Terrapin).

### Runtime plumbing that already exists
- Agent host is spawned by **starters in the main process**:
  - `electronAgentHostStarter.ts` (Electron UtilityProcess) and
  - `nodeAgentHostStarter.ts` (Node child process, also used for headless websocket mode).
  - Starters read the settings and forward paths via env vars:
    - `VSCODE_AGENT_HOST_CLAUDE_SDK_PATH` (`AgentHostClaudeSdkPathEnvVar`)
    - `VSCODE_AGENT_HOST_CODEX_APP_SERVER_PATH` (`AgentHostCodexAgentBinaryPathEnvVar`)
  - The agent host process (`claudeAgentSdkService.ts`, `codexAgent.ts`) only reads those env
    vars. **If we resolve the path before spawn and set the same env vars, the agent host code
    needs zero changes.**
- `IProductConfiguration` (`src/vs/base/common/product.ts`) exposes `commit`, `quality`,
  `downloadUrl` at runtime → enough to construct a PRSS asset URL from a pinned filename.
- The agent host can run **headless** (server/websocket mode, no renderer window), so the
  download owner must not require a workbench window.

## Concepts clarified

### Compile-time drift + the `package.json` ⇄ `product.json` rule
- The SDK is installed as a **devDependency** purely so TypeScript has its **types** while
  compiling. A type-only assertion in `claudeAgentSdkService.ts` checks our hand-written
  `IClaudeSdkBindings` shim against those types and **fails `tsc`** if the SDK changed an
  export/signature. (Codex: analogous generated-protocol types via `npm run codex:gen-protocol`.)
- So the SDK devDependency must be present for the type check to work, and it only validates
  against *whatever version is installed*.
- **Decision (keep it simple): a PR check hard-enforces `package.json` devDependency version
  == `product.json` pin version** for each SDK, as an **exact-string** compare. Both SDK
  devDependencies are declared as **exact** versions (no caret/range): `@openai/codex` must be
  `0.134.0` (currently `^0.134.0` → change to exact), `@anthropic-ai/claude-agent-sdk` is
  already exact. Exact pins make the check a trivial string compare, eliminate accidental patch
  float, and keep `package.json` / `package-lock.json` / `product.json` from silently
  disagreeing (Decision: V1).
- **Trying a newer SDK locally** → don't touch either version. Use the **runtime override
  settings** `chat.agentHost.claudeAgent.path` / `chat.agentHost.codexAgent.path` (or their env
  vars) to point the running agent host at any locally-installed SDK/binary. These **always
  win** over the downloaded pinned SDK, so experimentation is **zero repo edits**.
- **Developing against a newer SDK's API/types** (updating the shims) → that *is* a version
  bump: change both files to the new version (runbook below). The equality check keeps it honest.

### Pruning is light; the real question is build topology
`npm install` normally fetches only the **host's** native package (npm filters optionalDeps by
os/cpu). **But VS Code's CI cross-compiles**: each OS pool builds several arches
(linux → x64+arm64+armhf; windows → x64+arm64; macOS → x64+arm64+universal), so the **target
arch usually differs from the build agent's arch**. We therefore fetch the SDK native package
**by explicit target os/arch** (`npm install --os/--cpu`, or download the `*-<os>-<arch>`
tarball directly), driven by the job's `VSCODE_ARCH` — not by host filtering.

Consequences:
- No fat ~1.2 GB tree to prune — we fetch exactly one native package per target. Remaining
  "pruning" is light: strip docs/tests/sourcemaps; decide on codex's vendored `rg`.
- One `.gz` + one CDN link per target os/arch (`darwin-x64`, `darwin-arm64`, `linux-x64`,
  `linux-arm64`, `linux-armhf`, `win32-x64`, `win32-arm64`, + Alpine **musl** variants).
- **macOS universal needs no special SDK bundle** — the universal app downloads the
  `darwin-x64` or `darwin-arm64` bundle matching the running machine's `process.arch`.
- **Native-boot smoke tests are arch-limited**: a job can always `import()` the claude JS core
  and validate a native binary's header/arch (Mach-O/ELF/PE), but can only *execute*
  `codex app-server` when the agent arch matches the target (or emulation is available).

## Proposed architecture

### A. product.json contract (pinning)
Add an `agentHostSdks` section directly in the **OSS `vscode/product.json`** (same precedent as
`builtInExtensions`, which carry `version` + `sha256` and are reviewable in normal PRs):

```jsonc
"agentHostSdks": {
  "codex":  { "version": "0.134.0", "platforms": { "darwin-arm64": { "file": "agent-host-sdk-codex-darwin-arm64-0.134.0.gz", "sha256": "..." } /* , ... */ } },
  "claude": { "version": "0.2.128", "platforms": { "darwin-arm64": { "file": "agent-host-sdk-claude-darwin-arm64-0.2.128.gz", "sha256": "..." } /* , ... */ } }
}
```

- `file` carries the SDK **version** (commit-independent). The runtime builds the URL as
  `${downloadUrlBase}/${quality}/agent-host-sdks/${file}` using `product.quality` only —
  **no commit needed** (Decision: B2, version-keyed path).
- The asset is **not** recorded as a per-build CosmosDB `Asset` and does **not** appear on the
  `builds.code.visualstudio.com` builds page (Decision: B2). The git-tracked product.json pin is
  the authoritative record of which SDK version a build uses.
- The pin can still be overridden per quality via the `vscode-distro` mixin if ever needed, but
  routine version bumps happen in the OSS repo only.

### B. Build stage (Topology C2 — one dedicated `AgentHostSdks` job, explicit `--os/--cpu/--libc`)
A single dedicated stage/job (mirrors the `Copilot` stage) fetches/packages/hashes/publishes
**all** targets from one agent; native-boot smoke tests run opportunistically on native-arch
runners. We can build all targets from one OS because we only **download** the prebuilt leaf
binary packages (`@openai/codex-<os>-<arch>`, `@anthropic-ai/claude-agent-sdk-<os>-<arch>`,
incl. musl) — we never execute them at build time and they have no platform-gated postinstall.

1. For each target `<os>-<arch>[-musl]`: `npm install @openai/codex@<ver>` /
   `@anthropic-ai/claude-agent-sdk@<ver>` with **explicit** `--os=<os> --cpu=<arch>
   [--libc=musl]` into a per-target temp dir, from the **Terrapin / Monaco mirror**.
   (Verify with infra: the mirror must mirror the per-platform leaf packages incl. musl.)
2. **Light strip** (JS core + required runtime deps + the one native package; drop
   docs/tests/sourcemaps; resolve codex `rg` via smoke test).
3. Deterministic tar+gzip (fixed mtimes/ownership/order) →
   `agent-host-sdk-<sdk>-<os>-<arch>-<ver>.gz`; compute sha256. A shared `packageAgentHostSdk`
   module makes the **local helper and CI produce byte-identical hashes**.
4. **Verify against the pin**: hard-fail if computed sha256 ≠
   `product.json.agentHostSdks.<sdk>.platforms.<os-arch>.sha256`.
5. **Smoke tests**: always `import()` the claude JS core + validate each native binary's
   header/arch; additionally **boot `codex app-server`** on native-arch runners (matching
   per-platform jobs or a post-publish test that downloads the asset).
6. Publish each `.gz` via **ESRP *release*** (provision-to-CDN, **not** code-signing) to a
   **version-keyed, commit-independent** PRSS path (e.g.
   `${PRSS_CDN_URL}/${quality}/agent-host-sdks/<file-with-version>.gz`). This needs a small
   custom publish path (the standard `processArtifact` is commit-keyed + writes a CosmosDB
   asset — see Decision 7/8).
7. **Dedupe is by version**: HTTP-200-check the stable version-keyed URL before release →
   unchanged versions are a true no-op **across builds** (not just within one build).
8. **No code-signing / no notarization of the native binaries** (Decision 9): the binaries are
   downloaded programmatically and written by our own Node code at runtime, so they carry **no
   `com.apple.quarantine` xattr** and macOS Gatekeeper never intercepts them; they are spawned
   as **child processes**, not loaded into our hardened-runtime process. This mirrors how
   `@vscode/vsce-sign` and `@vscode/ripgrep` already ship downloaded native binaries. Integrity
   is enforced by **sha256 only**.

> macOS **universal** needs no extra SDK artifact: it ships only `darwin-x64` + `darwin-arm64`
> bundles, and the universal app downloads the one matching the running machine's `process.arch`.

### C. Runtime download owner — Option R1 (node-layer service called by both starters)
A new `node`-layer `IAgentHostSdkService` (in `platform/agentHost/node/`) owns
download/verify/cache and is called **inline by both starters** — `ElectronAgentHostStarter`
(runs in electron-**main**, a Node env) and `NodeAgentHostStarter` (server/dev/headless Node
env). This is the **only** owner that covers desktop **and** headless server with a single
implementation; the Electron *shared process* is desktop-only and unavailable on the server
path, so it cannot be the single owner.

`ensureSdk(codex|claude)` must:
- resolve the per-platform `{file, sha256}` from the product.json pin and build the URL as
  `${downloadUrlBase}/${quality}/agent-host-sdks/${file}`;
- download via a Node request util, verify sha256, extract+cache under global storage keyed by
  `<sdk>@<version>`, and return the on-disk path;
- be idempotent / cached: a present, hash-valid cache entry is a no-op (no re-verify cost per
  spawn beyond a cheap existence/marker check).

It slots into the **existing precedence** in both starters:
`setting (chat.agentHost.*.path) || env var || await ensureSdk(...)` — so **dev overrides always
win** and require zero repo edits. First-run download is async, one-time per version, gated
behind first agent-host start. Add a workbench progress surface when a window exists, with a
headless fallback (log only) for server mode.

#### Why R1 (vs the alternatives)
- **R1 — node-layer service, inline in both starters (CHOSEN).** + one implementation for
  desktop + headless; agent host unchanged; sits in existing env-var precedence; single cache
  owner. − first-run download runs in electron-main on desktop (async, one-time, cached — minor).
- **R2 — desktop delegates to Electron shared process; server inline.** + keeps main "light" on
  desktop; − **two** code paths for identical logic; shared process unavailable on server anyway.
- **R3 — agent host process downloads itself.** + self-contained, lazy; − re-verifies every
  spawn, duplicates download/verify/cache, no single cache owner, no UI progress.
- **R4 — workbench/sessions-layer service.** + richest UI; − agent host can start headless with
  no renderer window (websocket/server mode), so it can't be the single source of truth.

## SDK version-update flow (runbook)

Bumping a pinned SDK is a **small, OSS-reviewable PR in `microsoft/vscode`**.

**You edit (both versions, kept equal):**
1. **`package.json` devDependency** (`@openai/codex` / `@anthropic-ai/claude-agent-sdk`) — set
   to the new version and `npm install`.
2. **`product.json`** — set `agentHostSdks.<sdk>.version` to the **same** new version.
3. **Run `npm run update-agent-host-sdks`** to regenerate the per-platform `{file, sha256}` map
   in `product.json`, then **commit**.
4. **Fix any SDK API drift**: if `npm run compile` flags the binding-shim assertions, update the
   shims (intended early warning).

**CI guardrails (no auto-commit, hard fails with clear messages):**
5. **Version-equality check** — fails if `package.json` devDependency version ≠
   `product.json.agentHostSdks.<sdk>.version`.
6. **Hash check** (`update-agent-host-sdks --check`) — recomputes hashes deterministically and,
   on mismatch, fails telling you to run `npm run update-agent-host-sdks` and commit. Never
   writes to your branch.

**On merge/build (automatic):**
7. The dedicated `AgentHostSdks` stage re-fetches the pinned versions by explicit target,
   re-packages deterministically, re-verifies sha256 (hard fail on mismatch), runs the smoke
   tests, then **ESRP-*releases*** (provision-to-CDN, no code-signing) each `.gz` to the
   version-keyed PRSS path. **No CosmosDB asset record.** Unchanged versions HTTP-200-dedupe to a
   no-op.

**Local experimentation needs none of this:** point `chat.agentHost.claudeAgent.path` /
`chat.agentHost.codexAgent.path` at any locally-installed SDK/binary — the setting overrides the
downloaded pinned SDK at runtime, so trying a newer version is zero repo edits.

### D. Cache location, concurrency & lifecycle (Decisions L1 / Q9)
- **Location:** `<userDataPath>/agentHostSdks/<sdk>/<version>/` (server: equivalent server data
  dir), resolved via `INativeEnvironmentService`. Per-version subdir so an in-progress upgrade
  and the active version can coexist.
- **Atomic install:** download to a temp file → verify sha256 → extract to a temp dir → write a
  `.complete` marker last → atomic `rename` into `<version>/`. A present `<version>/.complete`
  is a no-op. Concurrent cross-process callers either see the marker or race the rename
  idempotently (identical bytes). **In-process**: a per-`<sdk>` promise cache dedupes concurrent
  `ensureSdk` calls.
- **Pruning (L1):** after a successful resolve of the active pinned version, delete sibling
  `<version>/` dirs that differ from the just-resolved one (never the one returned). Bounds disk
  to ~one bundle per SDK; self-healing.

### E. Failure & graceful degradation (Decision Q10 — the CI/dev-safety guarantee)
- `ensureSdk` returns **undefined** (no attempt) when the product.json `agentHostSdks` pin is
  absent **or `product.downloadUrl` is empty** (OSS dev builds). → runtime behaves **exactly as
  today**: opt-in via the settings/env vars only. This is what keeps existing builds, CI, and
  local dev green **before** the SDKs are ever published.
- On download/verify failure (offline, firewall, 404 because a pin isn't published yet): reject
  → the **specific agent provider is treated as unavailable** (not registered), identical to the
  current behavior when the setting is unset. The agent host process still starts; the failure is
  logged and (when a window exists) surfaced once. **Never crashes the host.**

### F. Bundle contents & strip policy (Decision Q11)
- Preserve the installed **package subtree (node_modules layout)** so module resolution /
  `import()` works unchanged. The returned path matches what the existing override expects:
  - **claude** → the `@anthropic-ai/claude-agent-sdk` package root (loaded via dynamic
    `import()`); include its runtime deps `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, and
    the one native `@anthropic-ai/claude-agent-sdk-<target>` package.
  - **codex** → the `codex` app-server executable inside `@openai/codex-<target>`; include the
    `@openai/codex` launcher.
- **Light strip only:** `*.md`, `*.map`, `*.d.ts`, test/`__tests__` dirs. **Keep** codex's
  vendored `rg` unless a smoke test proves it unused (revisit later, not now).

### G. Publish mechanism (Decision Q14 — bypasses `processArtifact`)
Because B2 wants version-keyed paths and no CosmosDB record, the standard commit-keyed
`processArtifact` flow is **not** reused. A dedicated publish script (extracted from the
release-only path of `publish.ts`) takes each per-target `.gz` and:
1. computes `friendlyFileName = ${quality}/agent-host-sdks/${file}`;
2. HTTP-200-checks `${PRSS_CDN_URL}/${friendlyFileName}` → skip if present (cross-build dedupe);
3. else `ESRPReleaseService.createRelease(version, filePath, friendlyFileName)` (provision only,
   no `sign-*`/`notarize-*` ops);
4. **no** `createAsset` / CosmosDB write.

### H. Pipeline placement (Decision Q15 — safe to dispatch)
- A **standalone `AgentHostSdks` stage** (mirrors the `Copilot` stage structure) that the
  installer/app stages do **not** `dependsOn`. A failure in this stage therefore cannot break the
  product/installer builds — it surfaces as its own check. This satisfies "safe to dispatch."
- The stage: setup npm registry (Terrapin) → run the build job (C2) → run the smoke tests → run
  the publish script. Secret/service-connection/pool names are reused from the existing publish
  and Copilot templates and are flagged in-code for human review (cannot be validated locally).

### I. Smoke-test depth (Decision Q16)
- **Always (any build agent):** extract each `.gz`; assert the native binary exists and has the
  correct **magic + arch** (Mach-O / ELF / PE header for the target); `import()` the claude JS
  core to catch packaging/resolution breakage.
- **Native-arch agents only (best-effort):** actually spawn `codex app-server` (minimal
  handshake) and the claude binary `--version`. Cross-arch targets skip execution (can't run a
  foreign binary) so they never block.

## Resolved decisions
1. **Runtime download owner** — Option R1: a `node`-layer `IAgentHostSdkService` called inline by
   **both** starters (electron-main + server/headless Node). The Electron shared process is
   desktop-only, so it cannot be the single owner.
2. **product.json pin** — store `{file, sha256}` per platform under
   `agentHostSdks.<sdk>.{version, platforms.<TargetPlatform>}`, reusing the existing
   `TargetPlatform` keys (`darwin-arm64`, `linux-armhf`, `alpine-x64`, …). Derive the URL at
   runtime from `downloadUrl` + `quality` + the **version-keyed** path (no commit).
3. **CDN addressing** — version-keyed, commit-independent path → true cross-build dedupe (B2).
4. **No builds-page listing** — publish to the CDN but write **no** CosmosDB asset record; the
   git-tracked product.json pin is the authoritative record (B2).
5. **No code-signing / notarization** — sha256 integrity only; rely on programmatic download
   (no quarantine xattr) + child-process spawn, mirroring `@vscode/vsce-sign` / `@vscode/ripgrep`.
6. **Hash mismatch** — hard fail the build. A PR check recomputes hashes and, on mismatch, fails
   telling the developer to run `npm run update-agent-host-sdks` and commit (no auto-commit).
7. **Build topology** — Topology C2: one dedicated `AgentHostSdks` stage builds all targets from a
   single agent via explicit `npm install --os/--cpu/--libc` (download-only of prebuilt leaf
   packages), emitting one `.gz` per target; native-boot smoke tests run opportunistically on
   native-arch runners. macOS universal needs no extra SDK.
8. **`package.json` vs `product.json`** — one **exact** version per SDK (V1), enforced equal by a
   PR check (hard fail, string compare). Local experimentation uses the runtime override
   settings, not repo edits. Pin lives in OSS `vscode/product.json` (precedent: `builtInExtensions`).
9. **`@openai/codex-sdk`** — already absent; the agent host only needs `@openai/codex`
   (launcher) + its per-platform native package. Change `@openai/codex` from `^0.134.0` →
   exact `0.134.0`.
10. **Cache** — L1: `<userDataPath>/agentHostSdks/<sdk>/<version>/`; atomic temp+rename+`.complete`
    marker; in-process promise dedupe; prune non-active siblings after a successful resolve.
11. **Graceful degradation** — `ensureSdk` no-ops (returns undefined) when the pin or
    `product.downloadUrl` is absent, and a download failure marks only that provider unavailable;
    the host never crashes. Guarantees existing dev/CI stays green before publish.
12. **Publish** — dedicated release-only script (no `processArtifact`, no CosmosDB); ESRP provision
    to `${quality}/agent-host-sdks/${file}` with HTTP-200 dedupe.
13. **Pipeline** — standalone `AgentHostSdks` stage; installers do **not** depend on it, so it
    cannot break the product build (safe to dispatch).

## Todos (high level)
- **package.json**: change `@openai/codex` `^0.134.0` → exact `0.134.0` (claude already exact);
  refresh lockfile.
- **Schema/types**: add `agentHostSdks` to `product.json` + `IProductConfiguration`
  (`src/vs/base/common/product.ts`); reuse `TargetPlatform` keys.
- **Runtime**: implement node-layer `IAgentHostSdkService` (TargetPlatform compute incl.
  alpine/musl, URL build, download, sha256 verify, atomic extract+cache+prune, in-proc dedupe,
  graceful no-op); wire into `ElectronAgentHostStarter` + `NodeAgentHostStarter` in the existing
  `setting || env || ensureSdk()` precedence; progress when windowed, log-only headless.
- **Build tooling**: shared `packageAgentHostSdk` module (deterministic tar+gz); `build/lib`
  fetch-by-target (`--os/--cpu/--libc`); `npm run update-agent-host-sdks` (+ `--check`); smoke
  tests (magic/arch + claude import + best-effort native spawn); release-only publish script.
- **PR checks**: version-equality (exact string) + hash `--check`, hard-failing with actionable
  messages.
- **Pipeline**: standalone `AgentHostSdks` stage mirroring the `Copilot` stage; additive,
  non-gating; flag service-connection/pool/secret names for human review.
- **Docs/tests**: reword setting descriptions to "developer override" (no longer required); unit
  tests for platform→key mapping, URL building, checksum-failure, override precedence, graceful
  no-op; e2e smoke in the build stage.

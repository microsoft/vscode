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
  == `product.json` pin version** for each SDK. One logical version per SDK, no silent skew.
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

- `file` is commit-independent; the runtime builds the URL as
  `${downloadUrlBase}/${quality}/${commit}/${file}` using `product.commit`/`product.quality`
  (the asset is published at `<quality>/<commit>/<file>`).
- The pin can still be overridden per quality via the `vscode-distro` mixin if ever needed, but
  routine version bumps happen in the OSS repo only.

### B. Build stage (Topology B — one dedicated `AgentHostSdks` job + fetch-by-target)
A dedicated stage/job (mirrors the `Copilot` stage) does fetch/package/hash/publish for **all**
targets; native-boot smoke tests run opportunistically on native-arch runners.

1. For each target `<os>-<arch>` (incl. Alpine **musl**): fetch the pinned `@openai/codex@<ver>`
   / `@anthropic-ai/claude-agent-sdk@<ver>` **by explicit target** (`npm install --os/--cpu` or
   direct `*-<os>-<arch>` tarball) from the **Terrapin mirror**.
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
6. Publish each `.gz` as a pipeline artifact (`vscode_agenthostsdk-<sdk>_<os>_<arch>_archive`)
   so `publish.ts`/`processArtifact` (with new `getPlatform` cases) ESRP-signs + releases to
   PRSS at `<quality>/<commit>/<file>` and records the CosmosDB asset.
7. **Dedupe**: `processArtifact` already HTTP-200-checks the PRSS URL → unchanged versions are a
   no-op on later builds.

> macOS **universal** needs no extra SDK artifact: it ships only `darwin-x64` + `darwin-arm64`
> bundles, and the universal app downloads the one matching the running machine's `process.arch`.

### C. Runtime download owner — Option 2 (shared-process service)
A new `IAgentHostSdkService` in the **shared process** downloads/verifies/caches; the
main-process starter calls `ensureSdk(codex|claude)` before spawn and forwards the returned
path via the existing env vars (no agent-host-process changes). It must: build the URL from the
product.json pin + `commit`/`quality`, download via `IRequestService`, verify sha256 (reuse
`IChecksumService`), extract+cache under global storage keyed by `<sdk>@<version>`, return the
on-disk path, and let the **existing settings win as dev overrides**. Add a workbench progress
surface when a window exists, with a headless fallback for server mode.

#### Why Option 2 (vs the alternatives)
- **Option 1 — Main process resolves before spawn.** + reuses env-var plumbing, headless-safe,
  agent host unchanged; − main process should stay light; first-run download blocks start.
- **Option 2 — Shared-process service, orchestrated by main starter (CHOSEN).** + shared
  process is purpose-built for background IO (already hosts extension downloads, checksum +
  request services); keeps main light; centralized cache+verify; headless *and* windowed; agent
  host needs zero changes; − cross-process coordination + download locking; server path needs a
  fallback resolver.
- **Option 3 — Agent host downloads itself.** + self-contained, lazy; − duplicates
  download/verify/cache in a lightweight process; re-checks every spawn; no UI progress.
- **Option 4 — Workbench/sessions-layer service.** + richest UI; − agent host can start with no
  renderer window (websocket/server mode), so it can't be the single source of truth.

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
7. The dedicated `AgentHostSdks` job re-fetches the pinned versions by explicit target,
   re-packages, re-verifies sha256 (hard fail on mismatch), runs the smoke tests, ESRP-signs and
   publishes each `.gz` to PRSS, recording the CosmosDB asset. Unchanged versions dedupe to a
   no-op.

**Local experimentation needs none of this:** point `chat.agentHost.claudeAgent.path` /
`chat.agentHost.codexAgent.path` at any locally-installed SDK/binary — the setting overrides the
downloaded pinned SDK at runtime, so trying a newer version is zero repo edits.

## Resolved decisions
1. **Runtime download owner** — Option 2 (shared-process service).
2. **product.json pin** — store `{file, sha256}` per platform; derive the URL at runtime from
   `downloadUrl`/`commit`/`quality`.
3. **Hash mismatch** — hard fail the build. A PR check recomputes hashes and, on mismatch, fails
   telling the developer to run `npm run update-agent-host-sdks` and commit (no auto-commit).
4. **Build topology** — Topology B: one dedicated `AgentHostSdks` job fetches all targets by
   explicit os/arch (cross-compilation-safe) and emits one `.gz` per target; native-boot smoke
   tests run opportunistically on native-arch runners. macOS universal needs no extra SDK.
5. **`package.json` vs `product.json`** — one logical version per SDK, enforced equal by a PR
   check (hard fail). Local experimentation uses the runtime override settings, not repo edits.
   Pin lives in OSS `vscode/product.json` (precedent: `builtInExtensions`).
6. **`@openai/codex-sdk`** — remove if present; the agent host only needs `@openai/codex`
   (launcher) + its per-platform native package.

## Todos (high level)
- Confirm/remove stray `@openai/codex-sdk` dependency; keep `@openai/codex` + pinned Claude.
- Define product.json `agentHostSdks` schema; mixin support for per-quality override.
- Build: dedicated `AgentHostSdks` job (fetch-by-target → strip → package → smoke-test →
  verify → publish); `getPlatform`/`processArtifact` cases; dedupe-by-version; shared
  `packageAgentHostSdk` module; `npm run update-agent-host-sdks` (+ `--check`); version-equality
  PR check.
- Runtime: `IAgentHostSdkService` (URL build + download + sha256 verify + extract + cache);
  wire into the Electron + Node starters with dev-override precedence; progress + headless
  fallback.
- Docs/tests: update setting descriptions (now "dev override", not "required"); unit tests for
  URL building, caching, checksum failure, override precedence; e2e smoke in build.

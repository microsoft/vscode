# build/agent-sdk

Per-platform agent SDK production. Each VS Code build (`darwin-arm64`,
`linux-x64`, Alpine REH, etc.) uploads its own platform's SDK tarballs
to `main.vscode-cdn.net` and stamps `agentSdks` into the shipped
`product.json` with a `{version, urlTemplate}` per SDK. Every platform
job emits the same `urlTemplate` per SDK — the runtime substitutes
`{sdkTarget}` per launch via `resolveSdkTarget()`, which is what lets
macOS Universal bundles share one `product.json` across arm64 + x64.

The runtime side (`src/vs/platform/agentHost/`) downloads and caches
the SDK tarball at first use. See `IAgentSdkProductConfig` in
`src/vs/base/common/product.ts` for the contract.

## How the pipeline uses this

The platform packaging jobs (Linux, macOS, Windows, Alpine) each include
the shared template `build/azure-pipelines/common/agent-sdk-produce.yml`
before the existing `gulp vscode-<platform>-<arch>-min-ci` step:

```yaml
- template: ../../common/agent-sdk-produce.yml@self
  parameters:
    vscodePlatform: linux
```

The template runs `node build/agent-sdk/produce.ts --vscode-platform=<x>
--arch=$(VSCODE_ARCH)`, which iterates the SDKs (`SDKS = ['claude',
'codex']`), figures out the matching `sdkTarget` for `(vscode-platform,
arch, sdk)` via `getSdkTargetForBuild`, runs `buildOne` for each in
parallel, and drops the tarballs in
`$(Build.SourcesDirectory)/.build/agent-sdk/tarballs/`.

### Publish vs test runs

`produce.ts` reads the pipeline variable `VSCODE_PUBLISH` from env (Azure
auto-injects all non-secret pipeline variables) to decide whether to
hit the CDN:

- **`VSCODE_PUBLISH=true` (real release builds)** — the AzureCLI@2
  step inside the template fetches CDN credentials, `produce.ts` calls
  `uploadOne` for every tarball (HEAD-then-decide idempotent), writes
  the results JSON, and emits `##vso[task.setvariable
  variable=AGENT_SDK_RESULTS_FILE]<path>`. The downstream gulp packaging
  step then stamps `product.agentSdks` via `readAgentSdkResults()`.

- **`VSCODE_PUBLISH` unset or not `'true'`** (PR runs, CI runs, manual
  test runs with the publish toggle off) — the AzureCLI credential
  step is skipped, the upload is skipped, no results file is written,
  and `task.setvariable` is not emitted. The tarballs are still produced
  and published as a pipeline artifact named
  `agent_sdk_<vscodePlatform>_<arch>_tarballs` so you can download
  and inspect them. product.json ships without `agentSdks` — same
  shape as a local dev build, so the runtime falls back to the
  per-provider env-var override.

### Where the agentSdks gating lives

Inside `packageTask`'s `jsonEditor` callback (the same one that injects
`commit` / `date` / `checksums` / `version`), `readAgentSdkResults()` loads
the results file (returns `{}` when the env var is unset) and merges
`agentSdks` into `product.json`. The REH gulpfile only writes `agentSdks`
for `type === 'reh'`; the REH-web variant skips it because the agent host
is node-only and the SDK config has no consumer in a browser-served
server.

Local `gulp vscode-darwin-arm64` invocations don't set
`AGENT_SDK_RESULTS_FILE` and don't have `VSCODE_PUBLISH=true`, so
`readAgentSdkResults()` returns `{}` and product.json ships without
`agentSdks` — same UX as today's no-config build.

## Why two steps, not inline-in-gulp

The agent SDK work is a distinct concern from the VS Code packaging
gulp graph. As its own pipeline step:

- Visible in the build log — operators see a discrete "Agent SDK: build
  + upload" step they can click into instead of grepping inside "Build
  client" output.
- Independently re-triggerable — if the SDK step fails, the operator
  can re-run just the platform job; if it succeeds but the gulp step
  fails, the SDK upload is already idempotent (HEAD-then-skip).
- Doesn't add async-stream complexity to the gulpfile. `packageTask`
  stays a sync stream-returning function; the only change is one
  synchronous `readAgentSdkResults()` call inside the existing
  `jsonEditor` callback.

## Files

- `agents/<sdk>/` — one folder per SDK we ship. Each contains a
  `package.json` (single dependency: the SDK's own npm package, pinned
  to an exact version) and a `package-lock.json` (full transitive
  graph). Folder name = SDK id = key under `product.agentSdks` = path
  segment in the CDN URL. The set of folders IS the SDK list — no
  parallel array to keep in sync.
- `common.ts` — types, `getSdks()` (discovers SDKs from `agents/`),
  `getAgentMeta()` / `getSdkVersion()` (reads from `agents/<sdk>/package.json`,
  rejects `^`/`~` ranges), `getSdkTargetForBuild()` (`(vscodePlatform,
  arch, sdk) → npm-suffix`), `buildCdnUrl()` / `buildCdnUrlTemplate()`,
  `sha256OfFile()`, `parseFlags()` for CLI flag parsing, and
  `readAgentSdkResults()` for the gulpfile-side reader.
- `package.ts` — `buildOne({ sdk, sdkTarget, outDir })`. Runs on any
  OS: copies `agents/<sdk>/{package.json,package-lock.json}` into a
  scratch dir, `npm ci` with `npm_config_libc/os/cpu` fetches the
  foreign platform binary verbatim from the locked graph, then
  node-tar+gzip with reproducible flags. Has a thin CLI at bottom.
- `upload.ts` — `uploadOne(...)`. HEAD-then-decide: absent → upload;
  matching sha → skip (idempotent re-runs); different / no-metadata sha
  → fail loud, refusing to overwrite content-addressed history. Thin CLI.
- `produce.ts` — pipeline-step entry. For one `(vscode-platform, arch)`,
  iterates the SDKs in parallel, calls `buildOne` + `uploadOne` for each
  that applies, writes results to `AGENT_SDK_RESULTS_FILE`, and emits
  `##vso[task.setvariable]` so downstream pipeline steps see the path.

## Bumping an SDK version

1. Edit the `dependencies` version in `build/agent-sdk/agents/<sdk>/package.json`
   to the new exact version.
2. From that directory: `npm install --package-lock-only --ignore-scripts`
   to refresh `package-lock.json`.
3. Also bump the matching `devDependencies` entry in repo-root
   `package.json` (the runtime imports types from that copy) so the
   shipped types and the build-time pin stay in lockstep.
4. `npm install` at repo root to refresh the root lockfile.
5. Commit all four edits together.

The next pipeline run rebuilds + uploads each platform tarball at the
new content-addressed CDN path and re-stamps each `product.json` with
the new `urlTemplate` pointing at the bumped version.

No human-paste step into vscode-distro. No coordination between jobs.

## Local dev

Build one tarball locally:

```sh
node build/agent-sdk/package.ts --sdk=claude --target=darwin-arm64 --out=/tmp/out
```

For OSS contributors who want to drive the agent host without going
through the CDN, point the dev override env vars at a local SDK install:

```sh
VSCODE_AGENT_HOST_CLAUDE_SDK_ROOT=/path/to/anthropic-claude-sdk-install \
  ./scripts/code.sh
```

(See `src/vs/platform/agentHost/common/agentService.ts` for env var names.)

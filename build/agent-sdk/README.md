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

## What ends up in a tarball

`npm ci --ignore-scripts --omit=peer`, then the whole `node_modules/` tarred.
`--omit=peer` is the load-bearing flag.

npm 7+ installs `peerDependencies` automatically, so claude's lockfile carries
100 packages the agent host never loads: `@modelcontextprotocol/sdk`, `zod`,
`ajv` and their transitive graph. The SDK inlines all of that into `sdk.mjs` at
publish time. `sdk.mjs` statically imports node builtins and nothing else, and
the one external module it resolves at runtime is its own native binary
package.

On the VS Code side, `@modelcontextprotocol/sdk` is only ever `import type`, so
TypeScript erases it. `zod` is not: `claudeJsonSchemaToZod.ts` imports `z` at
runtime to build the raw shapes it hands to `sdk.tool()`. That zod is VS Code's
own dependency (root `package.json`, shipped in the product), and the objects
flow *into* the SDK. Nothing resolves zod out of the downloaded tree. That is
the invariant `--omit=peer` needs, and it is weaker than "unused".

With the peers omitted, a claude tarball is exactly two packages,
`@anthropic-ai/claude-agent-sdk` and the one `claude-agent-sdk-<target>` binary
package, both pinned to the SDK version.

The point isn't size (the peers are ~4% of a ~90MB tarball). It's that the
tarball becomes a function of `(SDK version, target)` and nothing else. Before
this, a transitive peer bump could change the bytes without changing the
version, and since the CDN path is content-addressed and immutable, the upload
then failed against the already-published blob. That is
[#333870](https://github.com/microsoft/vscode/pull/333870) /
[#334094](https://github.com/microsoft/vscode/pull/334094).

`--omit=optional` would be a very different flag: the native binary ships as an
*optional* dependency, and `findMissingNativeOptionalDep` exists to catch it
going missing.

codex declares no peers at all, so the flag is inert there — its tarball bytes
are unchanged.

### Keeping the assumption honest

That the SDK inlines its peers is an implementation detail Anthropic never
promised; the `peerDependencies` block says the opposite. And `--omit=peer`
applies to every SDK, including any added later, so the check that justifies it
can't be special-cased to one.

`verifyStagedTree` in `package.ts` runs against the finished tree, just before
it is tarred, and nothing in it is conditioned on which SDK is being built:

1. **It imports the package's entry point** in a child process, under a
   timeout, with the peers absent. The entry is `<package>/<manifest.main>`,
   which is the literal path `claudeAgentSdkService.ts` loads at runtime.
   Packages that declare no `main` are skipped, which is how codex opts out
   without a special case: it ships only a `bin`, and the agent host never
   loads JS from that tarball. If a future SDK starts importing a peer for
   real, the build fails with ERR_MODULE_NOT_FOUND instead of failing on a
   user's machine months later, against a tarball already immutable on the CDN.
2. **It stats every native binary** and requires each to be present, non-empty
   and executable.

Step 2 needs the one piece of per-SDK knowledge in the file, since no manifest
field describes it: claude ships a single binary at the root of its platform
package, codex fills a `vendor/<rust-triple>/bin/` directory.
`listPlatformBinaries` is the only place that encodes those layouts, and
`chmodPlatformBinaries` reads from the same function, so the chmod and the
assertion cannot disagree about where the binaries are.

An SDK added under `agents/` with no entry in `listPlatformBinaries` yields no
binaries, and step 2 fails the build naming the function to edit. That is the
mandatory-per-SDK guard: a new folder cannot inherit `--omit=peer` unchecked.

The import probe deliberately does not exercise SDK-specific APIs. An earlier
version called `tool()` and `createSdkMcpServer()` with a zod shape to catch a
peer resolved lazily inside those calls, but that meant hardcoding one SDK's
call shape into the build, and the packaging step is the wrong place for it.
A peer that comes back will almost certainly come back as a static import,
which the plain import catches. The lazy resolution that does exist in
`sdk.mjs` today is for the native binary, and step 2 covers that.

Both steps are cross-target safe: `sdk.mjs` is platform-independent JS and
importing it does not spawn the native binary.

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

The `test/versionSync.test.ts` build test (run by `cd build && npm run
test` in PR CI) enforces step 3: it fails if an SDK's `agents/<sdk>`
`package.json` pin, its `package-lock.json`, and the repo-root
`devDependencies` pin ever fall out of lockstep.

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

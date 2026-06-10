# build/agent-sdk

Tooling that builds per-target tarballs of the Claude and Codex SDKs, uploads
them to `main.vscode-cdn.net`, and prints a `product.agentSdks` JSON fragment
for a human to paste into `vscode-distro`'s `product.json` (see
`src/vs/base/common/product.ts` for the shape).

## Scripts

- `package.ts` — builds one tarball for one `(sdk, target)` pair. **Linux only.**
  Stages a minimal `package.json` pinning `SDK_VERSIONS[sdk]` (from
  `common.ts`), runs `npm install --no-package-lock --ignore-scripts` with
  `npm_config_libc/os/cpu` set to the target's triple to fetch the foreign
  platform binary, normalizes mtimes (including symlinks via `lutimes`), and
  tars with reproducible flags. Emits `<sdk>-<version>-<target>.tgz` + a
  `.tgz.json` sidecar carrying the sha256 and size.
- `upload.ts` — uploads one tarball to the `main.vscode-cdn.net` storage
  account (path `agent-sdk/<sdk>/<sdkVersion>/<sdkTarget>.tgz`). HEAD-first:
  absent → upload; present with matching sha256 → skip (idempotent re-run);
  present with different sha256 → fail loud (refuse to overwrite
  content-addressed history). The HEAD-then-fail check is the actual
  defense against determinism drift — it catches a build that produces
  different bytes than the previous run regardless of cause (transitive
  dep bump, agent image update, registry-side tarball change).
- `aggregate.ts` — scans a directory of `<sdk>-<version>-<target>.tgz.json`
  sidecars (one per per-target job's artifact) and prints a markdown table
  with the JSON fragment a human pastes into `vscode-distro`'s `product.json`.
  Validates that every expected `(sdk, target)` pair — read live from each
  SDK's own `optionalDependencies` — is accounted for, failing loud on
  missing entries.
- `common.ts` — shared types and helpers. `getSdkVersion(sdk)` reads the
  pinned version from the repo-root `package.json` devDeps; `getTargets(sdk)`
  reads the platform list from the SDK's own `optionalDependencies` so the
  matrix stays in sync with what upstream actually ships.

## Bumping an SDK version

1. Edit the corresponding devDep in the repo-root `package.json`
   (`@anthropic-ai/claude-agent-sdk` or `@openai/codex`) to the new exact
   version (no `^` or `~` ranges — `getSdkVersion` rejects them).
2. Run `npm install` to refresh `package-lock.json`.
3. Run the pipeline. The per-target jobs build the new tarballs at content-
   addressed CDN paths that can't collide with the previous version's.
4. From the aggregate job's log, copy the printed JSON fragment.
5. Paste into `vscode-distro`'s `product.json` under `agentSdks`.

That's the whole workflow. No lockfiles to regenerate, no separate SDK-version
constant to keep in sync — the devDep IS the source of truth. Drift in
transitive resolutions surfaces at upload time as "sha doesn't match the
existing blob," which is exactly when we want a human to look.

## Targets

The build pipeline ships one tarball per `(sdk, target)` pair, where the
target set is whatever the SDK declares in its own `optionalDependencies`
(read live by `getTargets()` in `common.ts`).

As of writing:
- **Claude**: 8 targets — `darwin-{x64,arm64}`, `linux-{x64,arm64}`, `linux-{x64,arm64}-musl`, `win32-{x64,arm64}`.
- **Codex**: 6 targets — `darwin-{x64,arm64}`, `linux-{x64,arm64}`, `win32-{x64,arm64}` (Codex's Linux binaries are statically linked against musl, no glibc variant).

The pipeline YAML hand-lists these targets to drive its matrix fan-out
(Azure Pipelines can't fan out dynamically from a script). If the SDK
adds or drops a platform, edit the YAML defaults to match — `aggregate.ts`
will fail loud if the YAML matrix and the SDK's declared targets disagree.

## Determinism contract

- Pinned Linux runner — `package.ts` asserts `process.platform === 'linux'`.
- Pinned SDK version via the repo-root `package.json` devDeps; `package.ts`
  rejects ranged version specifiers (`^`, `~`). The SDK's own `package.json`
  pins its `optionalDependencies` (platform binaries) to exact versions, so
  the platform package fetched is deterministic for a given SDK version.
- `tar --format=gnu --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0
  --no-acls --no-xattrs --no-selinux` + `gzip -n -9`.
- `lutimes` (not `utimes`) normalises symlink mtimes — `.bin/codex` is a symlink.

Drift across days in *transitive* dep resolutions (e.g. Claude's `ajv@^8.x`
might resolve `8.12.0` today and `8.12.1` tomorrow) or in the agent's
Node/tar/gzip versions is NOT prevented at build time. It surfaces at upload
time as a sha mismatch; a human investigates.

## Upload + publish

`upload.ts` uses the `ClientAssertionCredential` pattern from
`build/azure-pipelines/upload-cdn.ts`: reads `AZURE_STORAGE_ACCOUNT`,
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_ID_TOKEN` from env. Reuses the
existing `vscodeweb` storage account (whose `$web` container backs
`main.vscode-cdn.net`); we just upload under the `agent-sdk/` prefix.

Sets `Cache-Control: max-age=31536000, immutable` and stamps the sha256 into
blob `metadata.sha256` so the next pipeline run can HEAD-and-decide.

## Pipeline shape

`build/azure-pipelines/agent-sdk/product-build-agent-sdk.yml` is the entry
point. It fans out 14 instances of `product-build-agent-sdk-target.yml`
(one per `(sdk, target)`), then an aggregate job collects every job's
sidecar artifact and runs `aggregate.ts` to print the
`product.agentSdks` fragment for a human to paste into vscode-distro's
`product.json`.

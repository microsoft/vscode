# Packaging `sota`

This document describes how the `sota` CLI is packaged into a single,
self-contained binary using **esbuild + Node SEA (Single Executable
Applications)**. The pipeline is implemented in three stages:

| Stage | Adds                                                          | Status     |
|-------|---------------------------------------------------------------|------------|
| 1     | esbuild bundle + Node SEA + prompt assets (macOS arm64 only)  | shipped    |
| 2     | Vendored `@anthropic-ai/claude-code` and `@openai/codex` CLIs | shipped    |
| 3     | Linux x64 and Windows x64 cross-builds                        | shipped    |

The shared pipeline lives in `scripts/lib/sea-pipeline.mjs`; one thin
driver per target platform wraps it (`scripts/package-<target>.mjs`).

## TL;DR

```bash
cd son-of-anton-cli
npm install                  # one-time

# Single platform:
npm run package:macos-arm64  # dist-bundle/sota
npm run package:linux-x64    # dist-bundle/sota-linux-x64
npm run package:windows-x64  # dist-bundle/sota-windows-x64.exe

# All three at once:
npm run package:all
```

Outputs land in `dist-bundle/` alongside `THIRD_PARTY_LICENSES.txt`. The
whole directory and the generated `sea-config.json` are git-ignored.

## Pipeline (ten steps)

For each target the pipeline runs:

1.  **Bundle** — `esbuild` walks the import graph from
    `src/seaEntry.ts` and writes a single CommonJS file to
    `dist-bundle/cli.cjs`. Everything (commander, ink, react,
    marked-terminal, the AWS Bedrock SDK, `son-of-anton-core/dist/**`)
    is inlined; no `node_modules` resolution happens at runtime.
2.  **Vendor install** — `npm install --no-save --no-package-lock
    --prefix dist-bundle/vendor --os <target-os> --cpu <target-cpu>
    @anthropic-ai/claude-code@<pin> @openai/codex@<pin>` populates
    `dist-bundle/vendor/node_modules/` with the **target** platform's
    optional-dep binaries (ripgrep, tree-sitter, etc.). The `--os` /
    `--cpu` flags drive npm's optional-dep resolver so this works even
    when the build host is a different OS/arch.
3.  **Shim rewrite** — replaces every launcher shim under
    `vendor/node_modules/.bin/` with a small wrapper that re-enters the
    SEA binary via its trampoline mode (`sota --sota-run-node …`).
    Posix targets get an `sh` wrapper; Windows gets a `.cmd` wrapper and
    a posix wrapper (for MSYS / git-bash). The actual SEA-binary path
    is templated as `__SOTA_BIN__` and resolved at first-run extraction
    time (we don't know the user's install path at build time).
4.  **Archive** — tar+gzip the vendor tree into
    `dist-bundle/vendor.tgz` so the SEA only carries one asset blob
    instead of thousands of individual files.
5.  **Licenses** — walk every package under
    `vendor/node_modules/`, concatenate each LICENSE file into
    `dist-bundle/THIRD_PARTY_LICENSES.txt` with name/version/license
    metadata.
6.  **`sea-config.json`** — emit a fresh config listing every
    `son-of-anton-core/dist/agents/prompts/*.prompt.md` and the
    `vendor.tgz` as SEA assets. `useCodeCache` is on for host builds
    (faster cold start) and off for cross-builds (the V8 code cache is
    keyed to the producing platform; embedding a host-built cache
    would crash a cross-target SEA at startup).
7.  **SEA blob** — `node --experimental-sea-config sea-config.json`
    produces the blob via a SEA-fuse-capable Node binary (cached
    per-target under `~/.cache/sota-sea/`). Homebrew strips the fuse
    sentinel, so the script falls back to an official tarball when
    `process.execPath` is unusable.
8.  **Copy & inject** — copy the target's official Node binary to
    `dist-bundle/<binary>`, then `npx postject` injects the blob into
    the `NODE_SEA` segment. On Mach-O we pass `--macho-segment-name
    NODE_SEA`; on ELF/PE we don't.
9.  **Re-sign** — on macOS, `codesign --remove-signature` strips the
    original signature; `codesign --sign -` applies an ad-hoc
    signature so the OS will execute the modified binary. After the
    ad-hoc step, an optional production-signing pass runs if the
    relevant `SOTA_MACOS_*` env vars are present (Developer ID re-sign
    + notarisation; see [Signing](#signing) below). On Windows,
    signing is likewise gated on `SOTA_WINDOWS_*` env vars and runs
    from the same hook. Skipped wholesale on Linux.
10. **Smoke** — `./dist-bundle/<binary> --version` must exit 0. Only
    runs when the build host matches the target; cross-builds skip
    this and rely on the consumer-machine validation in CI.

## What is bundled

- Everything under `son-of-anton-cli/src/**`.
- The full compiled tree of `son-of-anton-core/dist/**`, including the
  agent role descriptions (`agents/prompts/*.prompt.md`) — shipped as
  SEA assets, read via a `fs.readFileSync` shim in `src/seaEntry.ts`.
- All third-party deps from `package.json` (commander, ink, react,
  cli-highlight, marked / marked-terminal, ink-spinner, the AWS
  Bedrock SDK pair).
- **Stage 2 additions**: the upstream `@anthropic-ai/claude-code` and
  `@openai/codex` CLIs with their **target-platform** optional-dep
  binaries, as a `vendor.tgz` SEA asset. Extracted at first run into
  `~/.sota/cache/<sota-version>/`; subsequent runs reuse the extracted
  tree.

## Vendor extraction at runtime

On first invocation for a given `sota` version, the SEA entrypoint:

1.  Looks for `~/.sota/cache/<sota-version>/.extracted`; if present,
    short-circuits.
2.  Otherwise extracts the `vendor.tgz` asset via the system `tar`
    binary (available on macOS, Linux, and Windows 10+) into a sibling
    temp directory, then atomically renames into the final cache path
    so concurrent `sota` invocations don't race on a half-written tree.
3.  Rewrites the `__SOTA_BIN__` placeholder in every shim under
    `vendor/node_modules/.bin/` with `process.execPath` (the absolute
    path of the running SEA binary).
4.  Prepends `<cache>/node_modules/.bin/` to `process.env.PATH`. The
    existing `isClaudeCodeAvailable` / `isCodexAvailable` probes (in
    `son-of-anton-core/src/llm/{claudeCodeRunner,codexRunner}.ts`) walk
    `PATH` so this is sufficient to make them discover the vendored
    copies — no runner-side changes needed.

The cache directory layout:

```
~/.sota/cache/0.1.0/
├── .extracted                                # sentinel ISO timestamp
└── node_modules/
    ├── .bin/
    │   ├── claude          # sh wrapper -> SEA trampoline
    │   ├── claude.cmd      # Windows wrapper (only on Windows builds)
    │   ├── codex           # sh wrapper -> SEA trampoline
    │   └── codex.cmd       # Windows wrapper (only on Windows builds)
    ├── @anthropic-ai/
    │   └── claude-code/
    └── @openai/
        └── codex/
```

The `<sota-version>` segment means an upgrade extracts into a fresh
directory; the previous version's cache lingers until manually
cleaned. (`rm -rf ~/.sota/cache/` is always safe.)

## Node runtime: SEA-as-trampoline (strategy A')

The task spec asked us to pick one of three strategies for letting
the vendored launcher shims find a Node interpreter:

  - **A**: patch the shim's shebang to `process.execPath` of the SEA
    binary.
  - **B**: shell wrapper that does `exec "$SOTA_NODE" /path/to.js "$@"`.
  - **C**: bundle a separate `node` runtime in vendor/.

**Strategy A turned out to be impossible.** Per the Node SEA docs,
when a SEA binary is invoked, the embedded blob always runs as the
main module — there's no fuse / flag to fall through to a CLI-supplied
script path. So pointing a shebang at the SEA binary just re-runs
`sota` itself, with the JS path appended to `process.argv` but never
loaded.

**We landed on a hybrid of B and A** (call it **A'**): the shim is a
shell wrapper that re-enters the SEA binary with a special
`--sota-run-node <script>` argv that `seaEntry.ts` handles before the
CLI dispatch (`runScriptInTrampoline`). The trampoline synthesises the
correct `require` context for the script and runs it as if `sota`
were a generic Node interpreter — but only for the JS files we
vendor.

The trampoline tries synchronous `require()` first (best stack
traces). On `ERR_REQUIRE_ASYNC_MODULE` / `ERR_REQUIRE_ESM` (the
upstream `@openai/codex` shim is ESM with top-level `await`) it falls
back to dynamic `import()` via a file URL.

**Surprise**: `@anthropic-ai/claude-code@2.1.138` ships its bin
target as a *native* Mach-O / ELF / PE binary at `bin/claude.exe`
(despite the `.exe` suffix), not as a JS launcher. The shim-rewriter
sniffs each bin target's magic bytes and emits a different wrapper
for native binaries (a plain `exec "$DIR/.../claude.exe" "$@"`) so
we bypass the trampoline entirely for them.

Platform-specific quirks:

| Platform     | Shim format                          | JS launcher                                                     | Native binary                                       |
|--------------|--------------------------------------|-----------------------------------------------------------------|-----------------------------------------------------|
| macOS arm64  | `#!/bin/sh` POSIX wrapper            | `exec "/abs/sota" --sota-run-node "$DIR/cli.js" "$@"`           | `exec "$DIR/.../claude.exe" "$@"`                   |
| Linux x64    | `#!/bin/sh` POSIX wrapper            | Same as macOS                                                   | Same as macOS                                       |
| Windows x64  | `.cmd` + extension-less posix wrap   | `.cmd`: `"%SOTA_BIN%" --sota-run-node "%~dp0\cli.js" %*`        | `.cmd`: `"%~dp0\claude.exe" %*`                     |

The advantage of A' over C: we don't double the binary size by
bundling a second Node interpreter, and we keep the upgrade story
simple — only the SEA binary needs replacing.

## What is NOT bundled

- **The IDE** — this binary is the CLI only. The VS Code fork still
  ships through the regular `gulp vscode-darwin-arm64-min` pipeline.
- **A separate `node` interpreter** — see the strategy discussion
  above; the SEA binary's trampoline mode acts as the interpreter for
  vendored JS.

## Cross-platform status

| Platform        | Stage | Status         | Codesign at build time                   |
|-----------------|-------|----------------|------------------------------------------|
| macOS arm64     | 1+2   | shipped        | ad-hoc + optional Developer ID/notary    |
| Linux x64       | 3     | shipped        | n/a                                      |
| Windows x64     | 3     | shipped        | optional Authenticode via `signtool`     |
| macOS x64       | 3+    | not yet built  | —                                        |
| Linux arm64     | 3+    | not yet built  | —                                        |

The cache-dir convention (`~/.sota/cache/...`) is identical on macOS,
Linux, and Windows. On Windows that resolves to
`C:\Users\<user>\.sota\cache\` — less XDG-compliant than
`%LOCALAPPDATA%` but consistent across the three targets.

## Approximate binary sizes

Measured with `claude-code@2.1.138` + `codex@0.130.0`, Node 22.20.0:

| Binary                                 | vendor.tgz  | Final binary |
|----------------------------------------|-------------|--------------|
| `sota` (darwin-arm64, Mach-O)          | 135 MiB     | 247 MiB      |
| `sota-linux-x64` (ELF)                 |  83 MiB     | 206 MiB      |
| `sota-windows-x64.exe` (PE)            | 151 MiB     | 238 MiB      |

The `vendor.tgz` size varies per target because the platform-specific
optional-dep binaries differ (e.g. claude-code's native binary for
darwin-arm64 vs win32-x64). After first-run extraction the user sees
an additional `~/.sota/cache/<version>/` tree roughly 3× the archive
size (uncompressed).

## Signing

Production signing is bolted onto the packaging pipeline as an optional
ninth-step extension (`signBinary` in `scripts/lib/sea-pipeline.mjs`). It
is **entirely env-var driven** — with no env vars set the local dev flow
is unchanged (ad-hoc Mach-O signature, unsigned ELF, unsigned PE). The
release GitHub Actions workflow (`.github/workflows/release-sota.yml`)
sets the env vars from repository secrets on a per-runner basis.

### macOS — Developer ID + notarisation

| Env var                            | Meaning                                                                                |
|------------------------------------|----------------------------------------------------------------------------------------|
| `SOTA_MACOS_SIGNING_IDENTITY`      | Common name of the Developer ID Application identity in the login keychain.            |
| `SOTA_MACOS_NOTARY_KEY_ID`         | App Store Connect API key ID (10-char alphanumeric).                                   |
| `SOTA_MACOS_NOTARY_KEY_ISSUER`     | Issuer UUID for the API key.                                                           |
| `SOTA_MACOS_NOTARY_KEY_PATH`       | Path to the `AuthKey_<id>.p8` file on disk.                                            |

Behaviour:

- If `SOTA_MACOS_SIGNING_IDENTITY` is set, the binary is re-signed
  with `codesign --force --options runtime --timestamp --sign <identity>`
  *after* the existing ad-hoc signature. The `--options runtime`
  flag enables the hardened runtime, which is a prerequisite for
  notarisation.
- If all three `SOTA_MACOS_NOTARY_KEY_*` vars are also set, the
  packager zips the binary, submits to `xcrun notarytool submit --wait`,
  then `xcrun stapler staple`s the result. The zip is cleaned up
  afterwards. Notarisation typically takes 1–5 minutes.
- Either step is a silent no-op when its env vars are absent.

### Windows — Authenticode

| Env var                                       | Meaning                                                                |
|-----------------------------------------------|------------------------------------------------------------------------|
| `SOTA_WINDOWS_SIGNING_CERT`                   | Path to a `.pfx` (PKCS#12) certificate file.                           |
| `SOTA_WINDOWS_SIGNING_PASSWORD`               | Password for the `.pfx`. Use this OR…                                  |
| `SOTA_WINDOWS_SIGNING_CERT_PASSWORD_FILE`     | Path to a file whose contents are the password. Preferred for CI.      |

Behaviour:

- If `SOTA_WINDOWS_SIGNING_CERT` is set AND `signtool.exe` is on
  PATH, the binary is signed with an RFC3161 timestamp from
  `http://timestamp.digicert.com` and a SHA-256 file digest.
- If `signtool` is not on PATH (typical on macOS / Linux build
  hosts), signing is skipped silently. The release workflow runs the
  Windows cross-build on `windows-2022`, where the Windows SDK ships
  `signtool` on PATH out of the box.
- Reading the password from a file is preferred: it stays out of
  the process environment table and out of `ps`/audit logs.

### Direct invocation from the release workflow

`signMacOs(binaryPath)` and `signWindows(binaryPath)` are exported from
`scripts/lib/sea-pipeline.mjs` so the release workflow (or a separate
post-build signing job) can call them on an already-built binary,
independent of the rest of the packaging pipeline. The pipeline's own
step 9 calls `signBinary({ target, binaryPath })` which dispatches to
the right helper based on `target.exeFormat`.

### Local testing without real certs

You don't need a real Developer ID or Authenticode cert to verify the
wiring works:

- **macOS**: set `SOTA_MACOS_SIGNING_IDENTITY=bogus-identity` and
  run a packaging command. `codesign` will print "no identity found"
  and the build will fail — which proves the env var is consumed and
  the codesign call is reached.
- **Windows**: on a Windows host with the SDK installed, set
  `SOTA_WINDOWS_SIGNING_CERT` to any `.pfx` (e.g. one generated by
  `New-SelfSignedCertificate` + `Export-PfxCertificate`) and a
  matching password. `signtool sign` will succeed and `signtool verify
  /pa` will warn that the cert chain doesn't terminate at a trusted
  root — fine for testing the pipeline.

## Self-update

`sota update` operates in one of two modes depending on how the binary was
installed:

| Mode  | Detected via                      | Source of truth      | Behaviour                                                                                          |
|-------|-----------------------------------|----------------------|----------------------------------------------------------------------------------------------------|
| npm   | `require('node:sea').isSea()` → false | npmjs.org registry  | Print the recommended `npm i -g son-of-anton-cli@latest` command — do not touch any files.        |
| SEA   | `require('node:sea').isSea()` → true  | GitHub Releases API | Fetch the latest `sota-v*` release, download the matching artefact, verify SHA256, swap in place. |

The SEA flow:

1. Maps `process.platform` + `process.arch` to one of the three release
   artefact names produced by the release workflow (`sota-macos-arm64`,
   `sota-linux-x64`, `sota-windows-x64.exe`).
2. Calls `GET /repos/<owner>/<repo>/releases` and picks the most recent
   non-draft release tagged `sota-v*`.
3. Downloads `SHA256SUMS.txt` from the release and reads the expected
   digest for the artefact. **A release without `SHA256SUMS.txt` is
   refused.**
4. Streams the artefact to a temp file while computing SHA256, then
   compares against the expected digest.
5. Atomically swaps the running binary:
   - `rename(<runningBinary>, <runningBinary>.old)`
   - `rename(<tempBinary>, <runningBinary>)`
   - `chmod +x <runningBinary>` (POSIX)

   The OS keeps the still-running process pointed at the now-renamed
   `.old` file via its open file descriptor, so the current invocation
   completes normally. The user re-runs `sota` to pick up the new binary.

### Windows quirk

On Windows, file handles to running executables prevent some rename
operations. The current implementation lets the OS surface the error
("Access is denied" or `EBUSY`) when it can't perform the swap; the
user is expected to re-run from a different shell window or after
closing other `sota` processes. This is documented in the post-update
output and in `update.ts` itself.

### Dry-run

`sota update --dry-run` prints the planned actions (release tag, asset
name, target path, swap commands) without touching any files. Useful for
verifying the URL plumbing in a sandboxed environment, or as a CI gate
against a release that hasn't been promoted yet.

### Cache

`sota update` and the background `maybeNagAboutUpdate` helper share a
cache file at `~/.son-of-anton/data/update-check.json` so the registry
isn't hit on every invocation. The cache TTL is 24 hours.

## Known limitations

- **First-run startup**: extracting `vendor.tgz` adds a one-time
  ~1–3 s delay on first invocation per `sota` version. Subsequent
  invocations skip extraction via the `.extracted` sentinel.
- **Trampoline limitations**: the `--sota-run-node` re-entry only
  loads the script as a CommonJS module via `Module.createRequire`.
  It will not work for ESM scripts that need top-level `await`
  outside of `import()` — but the vendored launcher shims are both
  CJS today, so this is not a current problem.
- **No `--inspect`**: the SEA flow disables the Node inspector by
  default (see `useCodeCache: true` on host builds). For debugging,
  run `node dist/cli.js` instead.
- **Binary is not portable across major Node versions**: the SEA blob
  format is keyed to the host Node major. The build pins
  `NODE_VERSION = v22.20.0` in `scripts/lib/sea-pipeline.mjs`; bump
  that constant in lockstep with the esbuild `target` field if you
  migrate.
- **Signing is opt-in** — production Authenticode signing on Windows
  and Developer ID + notarisation on macOS are bolted onto the
  pipeline via env vars (see [Signing](#signing)). Local builds with
  no env vars set produce an ad-hoc-signed Mach-O on macOS and
  unsigned ELF/PE on Linux/Windows.

## Troubleshooting

| Symptom                                                    | Fix                                                                                                                                       |
|------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `Could not find the sentinel NODE_SEA_FUSE_...`            | Your running Node lacks the SEA fuse (Homebrew strips it). The script will auto-download an official Node tarball into `~/.cache/sota-sea/`. |
| `code signature in ... not valid for use`                  | The re-sign step was skipped — re-run `npm run package:macos-arm64`.                                                                      |
| `Failed to load agent prompt for "..."`                    | A new prompt file was added to `son-of-anton-core/src/agents/prompts/` without rebuilding core. Run `npm --prefix ../son-of-anton-core run build` first. |
| Bundle size jumps by >20 MiB                               | Check what new transitive dep got pulled in — `npx esbuild --analyze src/seaEntry.ts > /tmp/analyze.txt` shows the per-import cost.       |
| `sota: failed to extract vendor.tgz`                       | The system `tar` is missing (very old Windows host, or stripped container). Install `tar` or roll back to a build without Stage 2.       |
| Vendored `claude` exits with `MODULE_NOT_FOUND`            | The cache may be from a previous SEA install whose binary path no longer exists. `rm -rf ~/.sota/cache/<version>/` and re-run.            |
| `npm install` step fails with `Unsupported platform` for an optional dep | The dep author didn't publish a binary for the target. Pin to an older version of that dep, or document the gap.                          |

## License manifest

The packager emits `dist-bundle/THIRD_PARTY_LICENSES.txt` covering
every package found under `vendor/node_modules/`. Ship it alongside
the binary. Re-run the packager after bumping `CLAUDE_CODE_VERSION` /
`CODEX_VERSION` in `scripts/lib/sea-pipeline.mjs` to refresh the
manifest.

`npm run package:all` produces per-target license files
(`THIRD_PARTY_LICENSES-{darwin-arm64,linux-x64,windows-x64}.txt`)
alongside the per-target binaries because the vendored native bins
differ by platform.

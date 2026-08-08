---
applyTo: 'build/azure-pipelines/{oss/**,common/downloadNotice.ts,{win32,linux,darwin}/steps/product-build-*-compile.yml}'
---

# VS Code OSS Third-Party-Notices pipeline

This directory contains the thin VS Code-specific layer around Component Governance (CG) for producing OSS third-party notices. It replaces the legacy custom OSS tool with CG plus a gap-filling scanner, so release owners do not need to babysit `ThirdPartyNotices.txt` every release. The generated output should be at least as good as the legacy tool: CG provides the base NOTICE, the local scanner fills known CG gaps, and human-authored overrides cover the small set that automation cannot safely resolve.

The pipeline has two halves: **generation** (this `oss/` directory — CG + scanner + merge, producing the `notice_output` artifact) and **application** (the cutover that swaps the merged notice into the shipped product — see "Applying the NOTICE (cutover)" below).

## Architecture

The product-quality pipeline in `build/azure-pipelines/product-quality-checks.yml` is the main CI entry point.

1. `notice@0` generates the CG base NOTICE at `ThirdPartyNotices.generated.txt`.
2. `scan-licenses.ts` scans local sources CG misses and writes `ThirdPartyNotices.extensions.txt`, plus sibling index files used by the merge step.
3. `merge-notices.ts` merges the CG output and scanner output, then applies `cglicenses.json` overrides through `apply-overrides.ts`.
4. `check-pr-dependencies.ts` is used by `pr-oss-check.yml` as a PR-time gate. It blocks dependency additions that have no license source.
5. If CG is down or `notice@0` emits an empty/non-trivial failure output, the pipeline substitutes the last good `ThirdPartyNotices.generated.txt` artifact from the same branch, then from `main`. Only the CG portion is cached; local scanning and overrides still run fresh against the current commit.

Final merge output is uploaded as `ThirdPartyNotices.new.txt` in the `notice_output` artifact.

## Pipeline flow in CI

In `product-quality-checks.yml`:

1. Component Detection runs with `ComponentGovernanceComponentDetection@0`.
2. `notice@0` writes `$(Build.SourcesDirectory)/ThirdPartyNotices.generated.txt` and is `continueOnError: true`.
3. The cache fallback checks whether the CG file exists and is larger than 1 KB. If not, it downloads the latest `notice_output` artifact for the current branch, then `main`, and copies the cached `ThirdPartyNotices.generated.txt` into place.
4. TypeScript compiles the OSS scripts into `.oss-build-out`:
   - `apply-overrides.ts`
   - `scan-licenses.ts`
   - `parse-notices.ts`
   - `merge-notices.ts`
5. `scan-licenses.js` runs with `--repo`, `--cg`, and `--output`.
6. `merge-notices.js` runs with `--cg`, `--extensions`, `--cglicenses`, and `--output`.
7. The generated CG file, scanner file, final merged file, and optional cache metadata are uploaded under `notice_output`.

## Applying the NOTICE (cutover)

Generation (above) produces the merged `ThirdPartyNotices.new.txt` in the `notice_output` artifact. **Application** is the cutover that makes that file the one VS Code actually ships, replacing the legacy mixin notice.

Consumer script: `build/azure-pipelines/common/downloadNotice.ts` (read its header comment for the full design rationale).

How it works, per desktop platform compile template (`build/azure-pipelines/{win32,linux,darwin}/steps/product-build-*-compile.yml`):

1. **Pull CG NOTICE (background)** — at compile start, `deemon --detach` launches `downloadNotice.ts` as a detached poller. It polls the parallel Quality stage's `notice_output` artifact while compilation runs, so the wait overlaps work already happening.
2. **Apply CG NOTICE** — right before gulp packages the app, `deemon --attach` blocks on that poller. It downloads, extracts, validates the merged notice, and **overwrites the repo-root `ThirdPartyNotices.txt`**. `build/gulpfile.vscode.ts` then packages whatever file is at that path → the CG notice ships.

Only the 7 desktop targets that bundle a notice run these steps (win32 x64/arm64, darwin universal, linux x64/arm64/armhf). REH/server/web/alpine are unaffected.

### Fallback chain (never fail the build)

`downloadNotice.ts` is **non-fatal — it always exits 0.** A notice problem must never break packaging. The outcomes, in order:

1. **CG fresh** — the `notice_output` artifact is present and valid → overwrite with it.
2. **Cached CG** — if CG generation failed upstream, the Quality stage substitutes the last good `ThirdPartyNotices.generated.txt` (same branch, then `main`) before the artifact is published — so the consumer still gets a CG notice.
3. **Legacy** — if no usable artifact is available, the legacy mixin notice that `mixin-quality.ts` already laid down is left in place. `mixin-quality.ts` is deliberately left untouched (it's a shared chokepoint used by 8+ pipelines), which is what guarantees we never ship with *no* notice.

The accept-gate validates the *extracted content* (file present AND non-trivial) inside the poll loop — it does not trust the artifact listing alone. A mid-upload miss re-polls rather than falling back, which prevents a "mixed notice" race where one platform ships legacy while its siblings ship CG.

### Rollback lever

A queue-time checkbox **"Use legacy OSS Notice"** (parameter `VSCODE_USE_LEGACY_OSS_NOTICE`, default `false`) is the instant rollback. When checked, it derives `VSCODE_OVERWRITE_TPN=false`, and `downloadNotice.ts` skips the overwrite so the legacy notice ships — no code change or redeploy needed.

> ⚠️ `downloadNotice.ts` normalizes the flag with `.trim().toLowerCase()` before comparing, so YAML casing (`true`/`false` vs `True`/`False`) can't break the rollback lever. The pipeline still derives `VSCODE_OVERWRITE_TPN` as a lowercase string literal (`'true'`/`'false'`) for clarity. See the comment in `product-build-variables.yml`.

### Diagnosing a build

`downloadNotice.ts` logs three greppable markers so a build log answers "did the cutover work?":

- `[notice-cutover] RESULT=fresh` — overwrote from `notice_output` (the happy path).
- `[notice-cutover] RESULT=fallback` — artifact missing → kept the legacy notice.
- `[notice-cutover] RESULT=disabled` — feature flag off → kept the legacy notice.

To confirm a shipped artifact carries the CG notice, the root `resources/app/ThirdPartyNotices.txt` should be the large CG-merged file (multi-MB) rather than the ~3 MB legacy notice. Validate *intra-build* parity — all platforms in one build should produce a byte-identical notice (same SHA-256) — rather than checking against a fixed byte count, since CG's exact output size varies run-to-run.

## Script reference

### `scan-licenses.ts`

Purpose: produces the supplemental NOTICE entries that CG misses.

Invocation in CI:

```sh
node .oss-build-out/scan-licenses.js \
  --repo "$(Build.SourcesDirectory)" \
  --cg "$(Build.SourcesDirectory)/ThirdPartyNotices.generated.txt" \
  --output "$(Build.ArtifactStagingDirectory)/ThirdPartyNotices.extensions.txt"
```

Key inputs:

- `--repo`: VS Code repo root.
- `--cg`: optional CG NOTICE. Used to build `cgCovered` and `cgBodies`, so scanner network work is bounded and Cargo stub bodies can be detected.
- `node_modules` trees under root, built-in extensions, `remote`, and `build`.
- `cgmanifest.json` files.
- `Cargo.lock` files.

Key outputs:

- Supplemental NOTICE text at `--output`.
- Presence index at `<output>.presence.json` unless `--presence` is supplied.
- Cargo stub override index at `<output>.stuboverride.json` unless `--stuboverride` is supplied.

Scanner sections:

- Section 1 scans built-in extension dependencies. CG skips npm packages with `engines.vscode`, but VS Code ships built-in extensions, so their bundled dependencies are scanned from extension `node_modules` folders.
- Section 2 scans root `node_modules` for packages whose LICENSE files exist on disk but whose ClearlyDefined coverage did not produce CG NOTICE text.
- Section 3 reads `licenseDetail` from `cgmanifest.json`, and for uncovered git components without inline text it tries `fetchLicenseFromGitRepo()` at the pinned `commitHash`.
- Section 4 harvests Rust crate licenses from `Cargo.lock`; details below.
- Section 5 enumerates platform-specific npm binary packages; details below.

### `merge-notices.ts`

Purpose: combines CG NOTICE entries, scanner entries, Cargo stub replacements, and `cglicenses.json` overrides into one NOTICE file.

Invocation in CI:

```sh
node .oss-build-out/merge-notices.js \
  --cg "$(Build.SourcesDirectory)/ThirdPartyNotices.generated.txt" \
  --extensions "$(Build.ArtifactStagingDirectory)/ThirdPartyNotices.extensions.txt" \
  --cglicenses "$(Build.SourcesDirectory)/cglicenses.json" \
  --output "$(Build.ArtifactStagingDirectory)/ThirdPartyNotices.new.txt"
```

Key behavior:

- Parses both input NOTICE files.
- Deduplicates by lowercased `<name>@<version>`, preserving multiple shipped versions of the same package.
- CG normally wins collisions.
- Exception: keys listed in `<extensions>.stuboverride.json` let scanner Cargo entries replace CG entries whose body is only an SPDX-expression stub.
- Reads `<extensions>.presence.json` so override injection can distinguish present-but-unlicensed packages from stale overrides.
- Applies `cglicenses.json` with `applyOverrides()`.
- Writes sorted NOTICE output with provenance markers for scanner, Cargo stub override, and manual override entries.

### `apply-overrides.ts`

Purpose: reads and applies human-authored `cglicenses.json` entries.

Key inputs:

- `cglicenses.json` parsed by `readCglicenses()` after `stripJsonComments()` removes JSONC line comments.
- The merged `Map<string, MergedEntry>` from `merge-notices.ts`.
- Optional `presentNames` from the scanner presence index.
- Optional URI fetching for `fullLicenseTextUri` entries.

Supported override shapes:

- `{ name, prependLicenseText }`
- `{ name, fullLicenseText }`
- `{ name, fullLicenseTextUri, prependLicenseText? }`
- Optional `version` narrows matching to one package version.
- Legacy `licenseDetail` is treated as an alias for `fullLicenseText`.

Key behavior:

- Matching is case-insensitive on `name` and exact on `version`.
- Matching overrides edit existing entries.
- Overrides with usable text and a present package inject a new `cglicenses-override` entry.
- Overrides for names absent from the presence index are stale: warn and skip.
- Overrides with no target and no usable text are unmatched; `--strict` in `merge-notices.ts` fails on unmatched entries or URI errors, but stale entries are warn-only.

### `parse-notices.ts`

Purpose: parses NOTICE text files for diagnostics and for scanner logic.

CLI modes:

```sh
node parse-notices.js --file <path>
node parse-notices.js --diff <pathA> <pathB>
```

Key behavior:

- `parseNoticeFile()` returns package name, version, license, line number, license text length, and optional `licenseText`.
- The parser recognizes separator-delimited NOTICE entries and uses `isPackageHeader()` heuristics to avoid treating license prose as package headers.
- Section 4 in `scan-licenses.ts` imports this parser to detect CG entries whose body is just an SPDX expression.

### `check-pr-dependencies.ts`

Purpose: PR-time license coverage gate for dependency changes.

Invocation in `pr-oss-check.yml`:

```sh
node .oss-build-out/check-pr-dependencies.js \
  --repo "$(Build.SourcesDirectory)" \
  --base "origin/main" \
  --head "HEAD" \
  --cglicenses "$(Build.SourcesDirectory)/cglicenses.json"
```

Key behavior:

- Diffs changed `package.json` files between `--base` and `--head`.
- For added dependencies, passes only if one of these is true:
  - ClearlyDefined has usable license metadata and a non-zero score.
  - A LICENSE file exists in local or hoisted `node_modules`.
  - `cglicenses.json` has an override for the package.
- For removed dependencies, fails if `cglicenses.json` still has an override for that package.
- `--no-clearlydefined` disables the HTTP lookup for offline runs.

### `cglicenses.json`

Purpose: last-resort manual override file at repo root.

Use this only when CG and direct source scanning genuinely cannot provide usable text. Entries are read by `readCglicenses()` and applied by `applyOverrides()` during merge.

Important: the contents must be human-authored. Do not machine-manufacture license or copyright text. If CG's raw output has wrong text, file an upstream bug and ship CG's output as-is rather than hand-authoring a replacement. Add an override only when CG has no usable text or when a package lacks text in a way CELA has approved for manual override.

## Notable scanner details

### Cargo Section 4

Section 4 closes two Rust gaps:

1. Crates in `Cargo.lock` that are absent from CG.
2. Crates where CG emitted the SPDX expression as the NOTICE body, such as `Zlib OR Apache-2.0 OR MIT`, instead of real license text.

Important functions and constants:

- `parseCargoLock()` extracts `name`, `version`, and `source` from `[[package]]` blocks.
- `fetchCratesIoJson()` calls the cargo registry metadata API with `CRATES_IO_USER_AGENT` (local/offline uses crates.io; CI prefers the Monaco feed registry endpoint).
- `getCrateRepository()` applies legacy repository URL overrides for crates such as `isatty`, `redox_syscall`, `redox_termios`, and `termion`.
- `crateLicenseRefs()` tries `v<version>`, `<version>`, `<name>-v<version>`, `<name>-<version>`, then `main` and `master`.
- `isSpdxStub()` detects CG bodies that are only SPDX expressions.
- `fetchCargoLicense()` uses SPDX IDs to fetch real per-license files such as `LICENSE-MIT` or `LICENSES/Apache-2.0.txt`, with `fetchLicenseFromGitRepo()` as a generic fallback.
- `hasSpdxAnd()` warns when the expression contains `AND`.

Maintenance rules:

- OR-license selection is first-in-expression wins: `spdxLicenseIds()` preserves order and `fetchCargoLicense()` returns the first SPDX ID that yields a real body. For `OR`, that is the licensee choice.
- Conjunctive `AND` expressions are not reduced to one safe body. The scanner warns with `AND-LICENSE INCOMPLETE`; add a human-authored `cglicenses.json` override with the combined required text if this appears.
- Cargo license fetch failures should warn and continue, not crash the build.

Tests:

- `cargo-section4.test.ts` covers `isSpdxStub()`, `parseCargoLock()`, `getCrateRepository()`, and `crateLicenseRefs()` without network.
- `cargo-section4.live.ts` is a bounded live check that hits crates.io and GitHub for representative crates.

### Platform-binary Section 5

Section 5 closes a parity gap with the legacy OSS tool for arch-specific npm packages. Packages such as `@img/sharp-win32-x64` or `@esbuild/linux-x64` are optional dependencies of an arch-independent parent. On a single-platform build agent, only the host arch may be installed, but VS Code ships multiple platform and arch combinations.

Important functions and constants:

- `ARCH_SUFFIX_RE` and `isArchPackageName()` identify arch-bearing npm package names.
- `VSCODE_SHIPPED_PLATFORMS` is currently `darwin`, `linux`, `linuxmusl`, and `win32`.
- `VSCODE_SHIPPED_ARCHS` is currently `x64`, `arm64`, and `arm`.
- `isShippedArch()` strips ABI suffixes like `-gnu`, `-musl`, `-msvc`, `-glibc`, `-gnueabihf`, `-eabihf`, and `-androideabi`, then checks the static shipped sets.
- `npmLicenseId()` reads npm license shapes: string, `{ type }`, `licenses: [{ type }]`, and `licenses: [string]`.
- `fetchNpmRegistryJson()` fetches a package packument when an arch child is not installed on disk.
- `familyText()` caches license text by repository URL and reuses it across arch siblings.
- `parentTextIfCompatible()` allows parent text fallback only when parent and child license IDs match exactly, case-insensitively.

Maintenance rules:

- The shipped-arch filter intentionally uses the static constants `VSCODE_SHIPPED_PLATFORMS` and `VSCODE_SHIPPED_ARCHS` in `scan-licenses.ts`.
- Do not import these constants from `build/agent-sdk/common.ts`. Agent SDK excludes `armhf` and uses `alpine` where npm package names use `linuxmusl`, so it is not a direct fit for this scanner.
- If VS Code adds or removes a shipped platform or arch, update those constants. The source of truth is noted in the code comment: `build/azure-pipelines/product-build.yml` plus `build/agent-sdk/common.ts`. Expect this to change about once a year.
- Each arch child's own license ID is authoritative. Do not blindly reuse parent license text across a different child license ID; that would repeat the legacy sharp/libvips defect.

Tests:

- `platform-binary.test.ts` covers arch suffix recognition, shipped-arch filtering, npm license shape parsing, family text reuse, and parent fallback compatibility.

## Running locally

A helper exists at `build/azure-pipelines/oss/run-local.ps1`.

From the oss directory:

```powershell
.\run-local.ps1
```

Useful options:

```powershell
.\run-local.ps1 -CgNotice C:\path\to\ThirdPartyNotices.generated.txt
.\run-local.ps1 -SkipScan
.\run-local.ps1 -RepoRoot C:\src\vscode.worktrees\oss-cg-validation -OutDir C:\path\to\oss-local
```

What it does:

1. Runs `scan-licenses.ts` through `npx --yes tsx`.
2. Writes `ext-notices.txt` and `ext-notices.txt.presence.json` under `-OutDir`.
3. Runs `merge-notices.ts` with `cglicenses.json`.
4. Writes `ThirdPartyNotices.new.txt` and a focused summary.

Notes:

- Pass `-CgNotice` with a cached CG NOTICE for realistic local validation. Without it, the merge still exercises override injection and stale detection, but it does not represent the full CG base.
- If root `node_modules` is missing, run `npm i` first or the presence index will be incomplete.
- Full validation is parity against the legacy OSS tool's `ThirdPartyNotices.txt`: the new output should be at least as good as legacy. Use `parse-notices.ts --diff` to compare NOTICE files and inspect package/version differences.

## Unit checks

Run from `build/azure-pipelines/oss`:

```powershell
npx tsx cargo-section4.test.ts
npx tsx platform-binary.test.ts
```

Optional live Cargo check:

```powershell
npx tsx cargo-section4.live.ts
```

The live check performs bounded network calls to crates.io and GitHub. It is useful for validating the real Section 4 fetch path without running a full scanner pass over every crate.

## Maintenance rules

- Keep `cglicenses.json` human-authored. Never synthesize license or copyright text by script, model, or other automation.
- Add `cglicenses.json` entries only for genuine no-usable-text gaps. If CG returns wrong raw text, file an upstream bug and ship CG's result as-is rather than replacing it with a hand-authored body.
- Preserve the `name@version` merge key behavior. Multiple shipped versions of a package must remain separate NOTICE entries.
- Treat stale overrides as warn-only in the release pipeline. The PR-time gate is the enforcement point for dependency additions/removals.
- When updating shipped platform or arch support, update `VSCODE_SHIPPED_PLATFORMS` and `VSCODE_SHIPPED_ARCHS` in `scan-licenses.ts`, then update `platform-binary.test.ts` expectations.
- When changing Cargo license logic, update `cargo-section4.test.ts`, and run `cargo-section4.live.ts` if the network fetch path changed.
- Scanner network failures should log and continue. A service outage should not crash the build unless a later explicit validation step chooses to fail.

## Pending

The scanner does not yet consume the bundled `ThirdPartyNotices` files from externally-built, pre-built built-in extensions downloaded into the product. The planned addition under investigation is to read those notices for `js-debug`, `js-debug-companion`, and `js-profile-table`, so their own bundled dependencies are covered even though those extensions are built outside this repo.

### `audit-notices.ts`

Purpose: pre-ship sanity check that validates a generated NOTICE file against the repo's declared dependencies.

Invocation:

```sh
npx tsx build/azure-pipelines/oss/audit-notices.ts \
  --notice <path-to-ThirdPartyNotices.new.txt> \
  --repo .
```

What it checks:

1. **NOTICE stats** — total entries, duplicate detection (same name@version = bug), multi-version packages (expected), license type breakdown.
2. **Repo manifest cross-reference** — walks all `package.json` (direct deps), `package-lock.json` (full transitive tree, dev filtered out), `Cargo.lock`, and `cgmanifest.json`. Reports overlap, NOTICE-only entries (CG transitive deps), and manifest-only gaps (packages missing from the NOTICE).
3. **Summary** — coverage percentage and actionable gap list.
4. **Package source breakdown** — per-lockfile package counts sorted by size. Shows which extensions/directories contribute the most dependencies (e.g., `extensions/copilot: 329 packages`).

Key behavior:

- Lockfile parsing filters out `dev: true` and `devOptional: true` entries — only non-dev (shipping) packages are counted.
- Cross-reference uses lowercase package names for matching.
- The "manifest-only" gap list is the primary ship-readiness signal: each gap should be explainable (binary component, known TODO, platform-specific absence).

When to use:

- Before opening a PR: download `notice_output` from the latest CI build and run locally.
- After a build: verify the .new.txt artifact covers all declared dependencies.
- The script does NOT require `node_modules` on disk — it reads lockfiles as the ground truth for the full transitive dependency tree.

# Rebuilding the SDK 1.0.13 canvas backport B3

B3 is a source-backed private follow-up to the accepted SDK 1.0.13 B2
candidate, not a new SDK release or bundled runtime upgrade. It fixes
launch-provider cancellation lifecycle cleanup without changing public APIs,
package metadata, dependencies, CLI selection, registration ownership, or
permission policy.

Relative to B2, only `nodejs/src/extensionLaunchProvider.ts` and its focused
test change. Only `dist/extensionLaunchProvider.js` and
`dist/cjs/extensionLaunchProvider.js` change in the package. All compiler-emitted
declarations, generated RPC bindings, client startup code, retention bindings,
and B2 initial `enableScriptSafety` forwarding remain byte-identical.

## Immutable inputs and outputs

| Input or output | Exact revision or SHA-256 |
| --- | --- |
| Public SDK source | `github/copilot-sdk` commit `f13e4a2cc7e4e220974d2333142234e162a3252e` |
| Inherited startup prerequisite | Node-only single-flight guard and two tests from `3dbd843e46771f99070221a85d83c85d8046d0bd` |
| Published npm archive | `https://registry.npmjs.org/@github/copilot-sdk/-/copilot-sdk-1.0.13.tgz` |
| Published archive SHA-256 | `238147f38bb7597bdd6864445e27137475ec034c831efb555655f3db28d50b3b` |
| Full portable source patch | `f57c9d4c8d800ed1093c7d9afb41191295bc719b4d11459906e771d5403bb456` |
| Published59-to-B3_62 emitted patch | `1684762ce6cc3d9e8642071aca323886b6f90f915b60c3c9296808faf3368e8a` |
| Published59-to-B3_62 manifest | `90d2825e5033b1a7f4684e806f5a0d7b2966904a9aca8c05f680040d54dbac41` |
| Accepted B2 manifest | `5475d02aecc64ec2a2f2911de9f8a07842edacfc54eca7a2834367f148b3d55a` |
| Narrow B2-to-B3 source patch | `527dad3bf32979564ad552b67365231e90db6e4f1359393ae0b4777b96add5bb` |
| B2_62-to-B3_62 emitted transition | `2e50caf7eece63ba086aac59d26553394b6e8920039cca811b5a72c537afdcfc` |
| B2_62-to-B3_62 transition manifest | `f1d99f8b7767cd2c4bd5981a2fbab8f71fb027d875f896795448a22e308deab5` |

The portable source patch contains only release-relative `nodejs/` and
`scripts/codegen/typescript.ts` paths. It includes the accepted launch/retain
bindings, R2 synchronous cancellation safety, B2 script-safety forwarding,
and B3 lifecycle fix/tests. It contains no private runtime/app code or original
extension fixtures. Source manifests, lockfiles, README, and CLI pin remain
at the public release commit.

## Cancellation change

The declared and actual VS-resolved `vscode-jsonrpc` version is `8.2.1`.
Its lazy `CancellationTokenSource` may install a frozen cancelled singleton
when cancelled before its token getter is accessed; a second cancellation then
attempts a nonexistent `_token.cancel()`. The analogous lazy disposal path
can install a frozen none singleton.

B3 materializes the owned lifetime token before cancellation and uses its
cancellation state to make disposal idempotent and reentrant. Request tokens
are materialized before either cancellation subscription can invoke its
callback, and overlapping cancellation is guarded by that stable token's
state. The R2 `withCancellation` implementation is unchanged: callback entry
remains synchronous, synchronous errors keep their identity, and cancelled
or late grants remain unusable. There is no broad catch, global rejection
listener, dependency patch, fallback grant, or client cleanup workaround.

The exact VS-resolved dependency was copied read-only into private test
layouts. Both ESM and CommonJS public-package probes verified their actual
SDK and JSON-RPC resolution paths and all 48 dependency-owned file hashes.
Its `lib/common/cancellation.js` SHA-256 is
`bddf9e8f3bf2db7907d3c2551a690328cc6f978b1342432105dcbd072080e935`.
No installed VS dependency was modified.

## Exact toolchain and build

The producer used macOS arm64, Node `24.18.0`, npm `11.16.0`, esbuild `0.28.1`,
TypeScript `5.9.3`, tsx `4.22.4`, Vitest `4.1.8`, and
json-schema-to-typescript `15.0.4`, from the unchanged release lockfile.

Use a fresh source export and private artifact paths. These commands are
fish-compatible. The archive command reads an existing repository containing
the exact public commit; it does not create a checkout or branch.

```fish
set source_dir /path/to/empty/source-export
set artifacts_dir /path/to/carrier-artifacts
set archive /path/to/release-source.tar

git archive --format=tar --output=$archive f13e4a2cc7e4e220974d2333142234e162a3252e
mkdir $source_dir
tar -xf $archive -C $source_dir
env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_COMMON_DIR git -C $source_dir apply --check --whitespace=error-all $artifacts_dir/copilot-sdk-canvas.source.patch
env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_COMMON_DIR git -C $source_dir apply --whitespace=error-all $artifacts_dir/copilot-sdk-canvas.source.patch
cd $source_dir/nodejs

# First try the existing build without installing anything.
env PATH=(string join : $PWD/node_modules/.bin $PATH) node --import=tsx esbuild-copilotsdk-nodejs.ts

# Only after a missing-dependency failure, restore this export's own lockfile.
# Never install through a shared or sibling node_modules symlink.
npm ci --ignore-scripts --no-audit --no-fund
env PATH=(string join : $PWD/node_modules/.bin $PATH) node --import=tsx esbuild-copilotsdk-nodejs.ts
npm run typecheck
npm test -- test/extension-launch-provider.test.ts
```

The unchanged build entry emits ES2022 ESM, CommonJS, and real `tsc`
declarations. `node --import=tsx` avoids the optional tsx CLI IPC socket that
can exceed macOS's socket-path limit in deeply nested private directories;
it does not change the compiler or build flags. The producer restored
dependencies only after an observed missing-esbuild build failure.

B3 also rebuilt a second fresh release export with the portable source patch.
All 55 emitted files matched the final candidate byte-for-byte and
mode-for-mode. That isolated rebuild reused only B3's own already-restored,
manifest-matched dependencies without installing through the private link.
The earlier reproduction of all 52 original published dist files remains
labeled B1 evidence. A separate B3 comparison build reproduced all 62
accepted B2 package files before changing the helper.

Do not hand-edit `dist/` or declarations, rewrite release versions, or copy the
source's `0.0.0-dev` package.json into the published-package image.

## Package assembly and controlled transitions

Verify and extract the exact published archive to a fresh regular directory.
Overlay only the built `nodejs/dist/`. Compare every package-owned regular
file, hash, and mode with the manifest's complete `after` and `afterModes`,
excluding nested `node_modules`.

The full payload maps 59 released files to 62 candidate files: nine changed
existing outputs and three new outputs, all under `dist/`. The seven non-dist
files remain identical: package.json, README.md, and five docs. The published
vector has no LICENSE file. Package version `1.0.13`, CLI pin `1.0.83`, export
map, declared dependency graph, and all eight platform optional dependencies
remain unchanged.

The main manifest and patch apply to the exact published beforeimage, not
directly to installed B2. The separate `transition/copilot-sdk-canvas.json`
and adjacent patch map the complete accepted B2_62 image to B3_62 and can be
passed through the existing carrier's `manifestPath` input. Only two emitted
JS files differ, but both manifests validate complete images. Do not replace
this with partial-file edits or weakened guards.

Both package routes were exercised with fresh application, complete before
and after validation, rejection of a second raw application, reverse to the
exact beforeimage, and reapplication. A carrier must recognize the complete
afterimage rather than blindly apply a patch twice. Installation, complete
root/remote replacement, and acceptance remain the consumer owner's actions.

## Unchanged schema, runtime, and trust boundaries

B3 does not regenerate schemas. The inherited generated TypeScript rebuilds
without private inputs. Regeneration is separate: released CLI `1.0.83` alone
does not contain the unreleased v1 launch acknowledgement/context and retain
contract. Preserve the reviewed canonical fragments; do not regenerate from
the release schemas and assume the bindings will survive.

The SDK caller must explicitly select a compatible runtime. The local
qualification used the unchanged frozen R4 runtime candidate, not the
release's bundled CLI. Admission opt-in still requires an explicit v1
acknowledgement; unsupported negotiation fails closed. Retention and
connection errors remain errors. Runtime connection ownership is unchanged.

B2's public `enableScriptSafety: true` setting enables read-only shell-command
classification under runtime/managed policy. It is not a security-policy
override, blanket tool approval, extension sandbox, or retroactive protection
for already-running work. Required hosts must supply it before each create
and cold resume. The scalar is not durable through retention: cold omission
defaults false, while resident omission preserves the current in-memory value.

B3's native scope is unchanged counter/SSE and offline triage domain
retention/cold-resume, plus a deliberately invalid CLI-option startup failure.
The latter preserves the original CLI exit diagnostic and safely repeats
stop/forceStop; it is not a reproduction of the consumer's preview-environment
configuration. Both runs use isolated profiles, blocked live-model traffic,
and exact PID/birth cleanup. Public loopbacks separately force pending-create
retention and cancellation overlaps. Prior B1/B2/R2 results are not relabeled
as B3 runs. No publication, production UI qualification, or automatic
Checkpoint A clearance follows from this candidate.

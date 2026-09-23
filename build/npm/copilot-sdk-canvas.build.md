# Public 1.0.13 B4 persisted-chat-only source backport

This is a private source-built candidate, not an SDK release or installed
adoption. The host must already own a durable chat before approving a launch.
Canvas-first/zero-turn persistence is deferred; no replacement persistence API
is introduced.

## Exact inputs and outputs

| Input/output | Identity |
| --- | --- |
| Public source commit | `f13e4a2cc7e4e220974d2333142234e162a3252e` |
| Public SDK package | `@github/copilot-sdk@1.0.13` |
| Published archive SHA-256 | `238147f38bb7597bdd6864445e27137475ec034c831efb555655f3db28d50b3b` |
| Unchanged package CLI pin | `1.0.83` |
| Canonical runtime source | `ef0ce220610ceedc7243e2eaedaf75ea403248b5` |
| Canonical API schema SHA-256 | `7f1a7491eb34b4b7552a2af49b993fe3718bb476d3ae241c6842048956126335` |
| Portable source patch SHA-256 | `6ef17f094cadaa720273c77dc0126b1f31719020a4447fabc0ca1fd639807b5c` |
| Published59-to-B4_62 payload SHA-256 | `ba5489168b1e12b2ab65ad1f532b1af61275961be72c42c88f39abbb8109e100` |
| Published59-to-B4_62 route manifest SHA-256 | `3b7f0e63c60cdf78c85e434badc2ef8d6643021972d5297ab8235ddad9b8fae0` |
| B3_62-to-B4_62 transition SHA-256 | `28ef8f554df47e103162dc8d78944f053e64bd50efe51f404f175b0f7b995698` |
| B3_62-to-B4_62 transition manifest SHA-256 | `b4fc39e7abe2a817b29206f94d9d8f3734d97804681b94121f8ee7e4d0265885` |
| Checked-in combined carrier manifest SHA-256 | `e0646903c09781d181817a596e5cda8c802a0fa54fd4ed6668d6da9802acf5c5` |

The source patch changes only 12 feature-related source/codegen/test files.
It does not transplant unrelated main changes or main's newer launch-handler
alias. The existing `ExtensionLaunchProviderHandler` remains available.
The seven launch-only projection fragments exactly match the canonical source.
Released session-event input is used unchanged.

## Reproduction

Export the exact source commit into a fresh, owned scratch directory using
`git archive`, then apply `copilot-sdk-canvas.source.patch` with `git apply --check`
followed by `git apply`. The patch is relative to the repository root.

Restore the exact checked-in lockfiles with `npm ci --ignore-scripts` in `nodejs`
and `scripts/codegen`, using real owned directories, not writable sibling links.
From `scripts/codegen`, run `npm run generate:ts`. From `nodejs`, run:

```text
npm run typecheck
node --import=tsx esbuild-copilotsdk-nodejs.ts
npm run lint
npm run format:check
```

The ordinary generator downloads the actual pinned CLI 1.0.83 release schemas
when not cached. The reviewed projection is local source input; no private
runtime build or invented release is required for generation. Unexpected schema
drift fails rather than replacing unreviewed definitions.

Qualified toolchain: Node 24.18.0, npm 11.16.0, TypeScript 5.9.3,
esbuild 0.28.1, tsx 4.22.4, Vitest 4.1.8, json-schema-to-typescript 15.0.4,
and vscode-jsonrpc 8.2.1. The fresh portable rebuild reproduced all 55 emitted
files byte-for-byte and mode-for-mode.

Do not copy development package metadata into a published-package image.
The complete 62-file afterimage consists of the actual 1.0.13 package's seven
unchanged non-dist files plus the 55 rebuilt emissions. Its manifest specifies
every file hash and mode. Package metadata, exports, dependency graph, and CLI
pin are unchanged. Do not run version-setting or release scripts.

For a consumer, use its unchanged complete-image guarded carrier with the
appropriate manifest/payload, not direct installed-dist edits or a partial
patch. This SDK task did not install either route.

## Qualification and limits

Passed 94 targeted source tests (191 unrelated client cases were not selected),
typecheck, lint/format, 22 strict public loopback groups for each ESM/CommonJS,
and compile-only public declaration consumers. Missing retention exports,
methods, and event listeners are compile errors. Ordinary save/resume, launch-v1,
session/default-launch context, initial script safety, startup failure,
overlapping cancellation, repeated teardown, reconnect and late-grant rejection
remain covered.

Both payload routes passed fresh application and complete-image/mode checks,
rejected repeated raw application without changing the image, and passed reverse
and reapplication. Relative to frozen B3, only six generated JS/declaration files
change. B3's client and cancellation helper source bytes are unchanged.

Earlier B1/B2/B3/R2/R4 receipts remain frozen and are not B4 evidence.
No new native OSS, platform, model-resume, or live-model matrix is claimed.
Consumer/native validation and a compatible version-1 runtime remain separate
gates. Script safety is read-only classification subject to runtime/managed
policy, not a sandbox or security-policy override.

# Public 1.0.15-preview.2 B4 persisted-chat-only source backport

This is a private source-built candidate, not an SDK release or installed
adoption. The host must already own a durable chat before approving a launch.
Canvas-first/zero-turn persistence is deferred; no replacement persistence API
is introduced.

## Exact inputs and outputs

| Input/output | Identity |
| --- | --- |
| Public source base | `075f027363fc3b1e904d09370763731c3ecd2d88` |
| Canvas source head | `499d4276ff4fda9d0dda87f05db84a77c34985d2` |
| Reproducible source merge | `972d49771039f183f5331c16fed3d9f96a294c21` |
| Public SDK package | `@github/copilot-sdk@1.0.15-preview.2` |
| Published archive SHA-256 | `f94ba91cb092f194b33377ae5f2ba646c23847961599349bdeb20aa7d99651dc` |
| Unchanged package CLI pin | `1.0.89-1` |
| Portable source patch SHA-256 | `b1f102e1c726438815476ff40bb0fa21effd93aeb0f2505b5a363e0e702ec118` |
| Published-to-B4 payload SHA-256 | `987c431f47a68ba6c10d20223405223ac745e4bcad00df62d0c450fdab16a6f9` |
| Checked-in carrier manifest SHA-256 | `b38e86462f3f490adc459c4979fb6aff3310fe6d781c17f93ee7ae228418f500` |

The source patch contains the canvas feature source, codegen, focused tests and
documentation from the merge ref. It excludes unrelated runtime-artifact and
subagent-fixture test changes from that branch. The package delta is built from
the merged source and preserves current-main SDK behavior.

## Reproduction

Export source base `075f0273`, apply `copilot-sdk-canvas.source.patch`, and
verify the resulting source tree matches merge ref `972d4977`. The patch is
relative to the SDK repository root.

Restore the exact checked-in lockfile with `npm ci --ignore-scripts` in `nodejs`,
using a real owned directory rather than a writable sibling link. From
`nodejs`, run:

```text
npm run typecheck
npm run build
npm run lint
npm run format:check
```

Qualified toolchain: Node 24.18.0, TypeScript 5.9.3, esbuild 0.28.1,
tsx 4.20.6, Vitest 4.0.18 and json-schema-to-typescript 15.0.4.

Do not copy development package metadata into a published-package image.
The complete 69-file afterimage consists of the actual 1.0.15-preview.2
package's unchanged non-dist files plus the rebuilt emissions. Its manifest
specifies every file hash and mode. Package metadata, exports, dependency graph,
and CLI pin are unchanged. Do not run version-setting or release scripts.

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

The payload route must pass fresh application and complete-image/mode checks,
reject repeated raw application without changing the image, and preserve exact
package bytes under supported Git line-ending configurations.
No new native OSS, platform, model-resume, or live-model matrix is claimed.
Consumer/native validation and a compatible version-1 runtime remain separate
gates. Script safety is read-only classification subject to runtime/managed
policy, not a sandbox or security-policy override.

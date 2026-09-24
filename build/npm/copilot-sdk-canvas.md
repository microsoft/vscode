# Copilot SDK canvas backport

VS Code depends on the published `@github/copilot-sdk@1.0.15-preview.2`. The adjacent
generated B4 delta supplies the launch-v1 admission and initial
script-classification bindings needed by the opt-in canvas integration. It is a
local source-backed backport, not a new published SDK or CLI version.

The SDK's internal CLI pin remains `1.0.89-1`. Applying this delta does not add
runtime support: the selected runtime must implement launch-provider contract
version 1 and the initial create/resume script-classification option. The caller
must already own a durable chat before extension admission. The client rejects
failed or unsupported negotiation rather than falling back to unadmitted
extension execution.

## Client/runtime boundary

The canvas client uses the public SDK JSON-RPC contract, not runtime-native
exports. Missing session/default-launch context denies execution. Cancellation
or loss of authority still rejects a late grant. The integration does not create
durability during launch admission and does not substitute `sessions.save`, a
dummy name, or a synthetic turn.

The focused `copilotCanvases.test.ts` suite covers these client-side boundaries.
It does not replace integration qualification against the actual selected runtime.

## Source and payload

| File | Purpose |
| --- | --- |
| `copilot-sdk-canvas.source.patch` | Portable Node SDK source changes against the published release's source commit, including its patched generated TypeScript. |
| `copilot-sdk-canvas.build.md` | Portable build recipe, immutable inputs, toolchain and regeneration boundary. |
| `copilot-sdk-canvas.patch` | Generated package-relative changes to ESM, CommonJS and declarations. Do not hand-edit. |
| `copilot-sdk-canvas.json` | Complete before/after package SHA-256 vectors, payload digest, source provenance and build-tool versions. |
| `copilotSdkCanvasPatch.ts` | Version-bound installation and verification of the emitted delta. |

The source is the merge of SDK main
`075f027363fc3b1e904d09370763731c3ecd2d88` and the canvas SDK branch
`499d4276ff4fda9d0dda87f05db84a77c34985d2`, recorded as
`972d49771039f183f5331c16fed3d9f96a294c21`. B4 preserves current-main SDK
behavior while adding strict v1 negotiation, session/default-launch context,
cancellation-safe callbacks and idempotent cleanup. It contains no retention
method or event bindings and keeps `enableScriptSafety` in initial create and
resume requests.

The emitted delta changes 11 paths, including three new files; the complete
package grows from 66 to 69 files. Package metadata, export map, CLI pin,
optional platform dependencies and documentation are unchanged.

Follow the [portable build recipe](copilot-sdk-canvas.build.md) to build the
patched checked-in TypeScript using the release's locked Node
tooling, not VS Code's TypeScript or esbuild versions. The exact versions and
source-patch digest are recorded in the manifest. Building those checked-in
sources does not require access to a private runtime checkout.

Regenerating the RPC TypeScript uses CLI `1.0.89-1` plus the reviewed launch-v1
schema overlay. No retention method or event is projected. An aligned runtime
release and regeneration remain prerequisites to replacing this backport with a
published SDK.

## Initial script classification

Use the public `SessionConfig` and `ResumeSessionConfig` types. Explicitly
provide `enableScriptSafety: true` on every create and resume path that needs
read-only shell-command classification, including cold restores and peer chats.
A post-create `options.update` cannot cover extension work that starts earlier.

The SDK preserves an explicit `false` and omits an undefined value. The
qualified runtime's scalar is not durable: omission on a resident session
preserves its current memory, while cold omission defaults to false. This is not
a persistence promise.

The option enables runtime classification of read-only shell commands; those
commands may run without a prompt subject to managed/runtime policy. It does
not approve extension source, grant general tool permissions, override policy,
or sandbox Node. Initial typed forwarding and native initialization ordering
are distinct from demonstrating a real extension model turn before create
returns.

## Installation

Normal root postinstall and the cached `fast-install.ts` path both enforce the
delta. The workbench and remote dependency trees are required; an existing
distro remote tree is included. Installation-state hashes include the
carrier, generated payload, manifest and installation scripts. Postinstall
records completion only after required patching succeeds.

For already installed, real dependency directories:

```sh
npm run copilot:patch-sdk
npm run copilot:patch-sdk -- --check
```

The first command applies or verifies the delta. The second is read-only and
fails if any target is not the complete expected after-image.

The carrier preflights every target before modifying any package. It rejects
unexpected or partially patched packages, symlinked dependency directories,
unsafe or undeclared patch paths, metadata changes and file removals. Nested
dependencies are preserved separately without following their links.

Each replacement is prepared in a sibling staging directory. The copied
before-image, complete after-image and original package are checked before
replacement. Git line-ending conversion is disabled for the patch subprocess
so Windows Git settings cannot rewrite the approved package bytes. The user's
Git configuration is not changed. A failed replacement restores the original;
a failed restoration reports and preserves its backup. Cleanup failures are
errors, not successful installation. Replacement is per package, not a
transaction across all trees.
A later repair can finish a mixed complete-before/complete-after installation.

The carrier recognizes the complete published `1.0.15-preview.2` package and
the complete B4 after-image. Dependency upgrades invalidate the install-state
hash, so older package images must be replaced by `npm ci` before the current
delta is applied. Do not apply the payload manually or relax the before-image
guard.

Do not disable the guards to repair a linked or unexpected installation.
Remove dependency links using the mechanism that created them, then restore
real dependencies with `npm ci`. Do not install or patch through a link into
another checkout. Inspect any reported retained backup before removing it.

These checks bind SDK package bytes; they are not an extension trust decision,
content-bound approval of extension directories, or a Node execution sandbox.

## Removing the backport

Move to an aligned published SDK/runtime pair only after its public
launch-provider negotiation, cancellation and initial script-safety behavior are
qualified. Remove the payload, source patch, carrier and repair command
together; remove both installation call sites, their explicit hash
inputs and the generated-patch Git attributes. Do not leave declaration-only
shims or a silent fallback behind.

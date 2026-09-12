# Copilot SDK canvas backport

VS Code still depends on the published `@github/copilot-sdk@1.0.13`. The adjacent
generated B2 delta supplies the public Node SDK launch-provider, turnless
retention, and initial script-classification bindings needed by the opt-in canvas integration. It is a local
source-backed backport, not a new published SDK or CLI version.

The SDK's internal CLI pin remains `1.0.83`. Applying this delta does not add
runtime support: the selected runtime must implement launch-provider contract
version 1, `session.retain`, and the initial create/resume script-classification option. The client rejects failed or unsupported
negotiation rather than falling back to unadmitted extension execution.

## Source and payload

| File | Purpose |
| --- | --- |
| `copilot-sdk-canvas.source.patch` | Portable Node SDK source changes against the published release's source commit, including its patched generated TypeScript. |
| `copilot-sdk-canvas.build.md` | Portable build recipe, immutable inputs, toolchain and regeneration boundary. |
| `copilot-sdk-canvas.patch` | Generated package-relative changes to ESM, CommonJS and declarations. Do not hand-edit. |
| `copilot-sdk-canvas.json` | Complete before/after package SHA-256 vectors, payload digest, source provenance and build-tool versions. |
| `copilotSdkCanvasPatch.ts` | Version-bound installation and verification of the emitted delta. |

The base is SDK source commit
`f13e4a2cc7e4e220974d2333142234e162a3252e`. The Node startup single-flight
prerequisite comes from `3dbd843e46771f99070221a85d83c85d8046d0bd`.
The backport adds connection-owned launch-provider attachment, strict v1
negotiation, cancellation-safe callbacks and global/scoped retention. B2 also
forwards the canonical optional `enableScriptSafety` field in the initial
create and resume requests, before newly loaded extension work can begin.
It does not transplant the newer SDK's unrelated APIs or dependency changes.

The unmodified release source reproduces all 52 published `dist` files.
The emitted delta changes 12 paths, including three new files; the complete
package grows from 59 to 62 files. Package metadata, export map, CLI pin,
optional platform dependencies and documentation are unchanged.

Follow the [portable build recipe](copilot-sdk-canvas.build.md) to build the
patched checked-in TypeScript using the release's locked Node
tooling, not VS Code's TypeScript or esbuild versions. The exact versions and
source-patch digest are recorded in the manifest. Building those checked-in
sources does not require access to a private runtime checkout.

Regenerating the RPC TypeScript is a separate operation: its schema baseline is
CLI `1.0.83` plus the canonical unreleased launch-v1/retain fragments. Running
the ordinary generator against only the published `1.0.83` schemas would
remove the new bindings. An aligned runtime release and regeneration remain
prerequisites to replacing this backport with a published SDK.

## Initial script classification

Use the public `SessionConfig` and `ResumeSessionConfig` types. Explicitly
provide `enableScriptSafety: true` on every create and resume path that needs
read-only shell-command classification, including cold restores and peer chats.
A post-create `options.update` cannot cover extension work that starts earlier.

The SDK preserves an explicit `false` and omits an undefined value. The
qualified runtime's scalar is not durable: omission on a resident session
preserves its current memory, but cold omission defaults to false even after
retention. This is not a persistence promise.

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
replacement. A failed replacement restores the original; a failed restoration
reports and preserves its backup. Cleanup failures are errors, not successful
installation. Replacement is per package, not a transaction across all trees.
A later repair can finish a mixed complete-before/complete-after installation.

The checked-in payload applies to the complete published package, not an older
development backport. A known older candidate requires its own reviewed
complete-image transition through the carrier's `manifestPath` option, followed
by verification against this final manifest. Do not apply a clean-release patch
over a previous backport or relax the before-image guard.

Do not disable the guards to repair a linked or unexpected installation.
Remove dependency links using the mechanism that created them, then restore
real dependencies with `npm ci`. Do not install or patch through a link into
another checkout. Inspect any reported retained backup before removing it.

These checks bind SDK package bytes; they are not an extension trust decision,
content-bound approval of extension directories, or a Node execution sandbox.

## Removing the backport

Move to an aligned published SDK/runtime pair only after its public
launch-provider negotiation, cancellation and turnless-retention behavior are
qualified. Remove the payload, source patch, carrier and repair command
together; remove both installation call sites, their explicit hash inputs and
the generated-patch Git attributes. Do not leave declaration-only shims or a
silent fallback behind.

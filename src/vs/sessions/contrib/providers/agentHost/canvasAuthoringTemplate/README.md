# Local canvas authoring starter

This is an original starting point for a **local canvas package**: a small
Node.js backend, served over loopback HTTP, that declares one canvas and one
action using the public `@github/copilot-sdk/extension` `createCanvas`/
`joinSession` contract. It is not a VS Code extension, is not wired into any
test suite, and does not depend on anything under `src/**/test`. Copy this
folder out to start a new package; do not edit it in place for a real package
(see "Getting started" below).

It is deliberately smaller than the SDK integration-test fixture at
[`localCanvas`](../../../../../platform/agentHost/test/node/providerIntegration/fixtures/localCanvas)
(same `createCanvas`/`joinSession` shape, but without that fixture's
audit-log, health-check, and process-generation-nonce machinery).
Read that fixture too if you need a second example, but do not import or
depend on it from a real package.

The normal-workspace preview is currently qualified only in local **macOS arm64
Code OSS source builds**, with the unreleased public SDK/runtime artifacts
described in [`scripts/local-canvas-sdk.md`](../../../../../../../scripts/local-canvas-sdk.md).
Windows, Linux, macOS x64 and built products cannot execute this preview; inert
authoring/review remains separate. Native and assistive-technology qualification
and explicit publication approval are required before widening that scope.

## What is in this folder

| File | Purpose |
| --- | --- |
| `extension.mjs` | The canvas backend: declares the canvas and its one `greet` action, serves the frontend, persists one JSON document per `documentId`. |
| `index.html` / `client.js` / `style.css` | The served frontend for the canvas's own instance URL. |
| `README.md` | This file. |

The frontend subscribes to same-origin Server-Sent Events. User submissions and
declared SDK actions publish the same saved document to every open instance of
that document, including after a reconnect. Closing the page releases its stream;
closing the logical canvas releases all streams for that instance.

The stylesheet consumes the host's fixed GitHub-compatible semantic colors
(`--fgColor-*`, `--bgColor-*`, `--borderColor-*`, and `--focus-outline-color`).
System-color fallbacks keep standalone authoring usable. It follows live host
light, dark, and high-contrast changes without reading editor state or running
injected scripts. The form wraps on narrow pages and preserves keyboard focus.

## Getting started

1. Copy this entire folder to a new location outside the VS Code repository
   (for example, alongside your other local projects). Never point the
   packages UI's "Choose source folder" at a location inside this repository
   or overwrite a non-empty destination when copying — pick or create an
   empty destination folder.
2. Rename the canvas: edit the `id`, `displayName`, and `description` fields
   passed to `createCanvas` in `extension.mjs`.
3. Replace the `greet` action (and the matching `/greet` HTTP route and
   `greet()` helper) with your own action(s). Keep each SDK-declared action a
   thin wrapper over a plain function shared with any HTTP route the
   frontend uses, so the two paths cannot disagree about behavior.
4. Edit `index.html`, `client.js`, and `style.css` for your own UI.
5. Add any additional runtime dependencies your backend needs as sibling
   files or a vendored `node_modules` folder next to `extension.mjs` — see
   "Bundled dependencies" below.

## Source, snapshot, and data are three different places

- **Source**: the folder you are editing right now (or your copy of it). You
  edit this freely; it is never executed directly by the packages UI.
- **Snapshot**: an inert, read-only copy of your source folder, made by
  "Prepare inert snapshot" in the packages UI. Preparing a snapshot never
  imports or runs your code — it is a bounded filesystem copy used so that
  what gets reviewed and approved is an exact, unchanging copy of what you
  authored, even if you keep editing the source afterwards. Symlinks in the
  source are rejected.
- **Data**: everything your backend writes at runtime (documents, any log
  you add) must live under `process.env.VSCODE_CANVAS_DATA_DIR`, never
  inside the source or snapshot folder. `VSCODE_CANVAS_DATA_DIR` is provided
  by the installed backend's launch environment and is scoped per package,
  local workspace and entrypoint, even for host-wide approval; do not read or write files next to `extension.mjs`
  at runtime (the fallback in this starter to a local `.local-data` folder
  next to the source exists only so you can run
  `node extension.mjs` directly while authoring, before the package has
  been prepared and approved).

## Lifecycle: edit → prepare → review/approve → restart

1. **Edit** your copy of this folder.
2. **Prepare a new snapshot** from the packages UI's manage-packages command,
   pointing "Choose source folder" at your copy. This makes (or updates) an
   inert, content-addressed revision of your source; a newly prepared
   revision starts out **not approved**, even if an older revision of the
   same package was previously approved.
3. **Review and approve** the new revision from the same UI: it shows the
   original source location, the exact prepared snapshot, size, and
   revision hash so you can confirm what you are approving before it can
   run. Approving asks you to explicitly pick a scope — the current local
   workspace (the safe default) or all workspaces on this local Agent Host —
   and shows an
   explicit warning that this backend runs as your OS user with **no
   sandbox**: it can do anything your own account can do. Approving a
   different revision **replaces** the previous revision's grants for that
   package; the previously approved revision does not stay approved
   alongside it (though it may keep running until the new revision is
   approved, per the platform's rollover behavior).
4. **Open Canvas** can be used before sending a message. For a package that
   has not run yet, choose the approved package, enter `starter` as the
   declared canvas type, and enter `{"documentId":"demo"}` as input. Browsing
   and reviewing do not execute the backend. The explicit open retains the
   session before code starts; no preparatory chat message is needed.
5. **Restart Canvas Provider** applies a newly approved snapshot to retained
   canvases. Execution requires the supported development SDK/runtime as well
   as the local-canvases preview setting; package management alone is not
   evidence of runtime support.

## No-turn support and approval limits

- This starter, and the packages UI that manages it, do not add any model
  tool, guest bridge, or other way for a running canvas package to reach
  outside the explicit action(s) it declares. Approving a package only
  grants it the ability to run as an installed backend under the scope you
  picked; it does not expose package management itself (list/prepare/
  approve/revoke/remove) as something a model or a guest canvas can invoke.
- Package approval covers one revision and either exact local workspace
  URIs or all workspaces on the local Agent Host. Both scopes apply across
  **all profiles sharing that host and its user-data directory**; they are
  not profile-isolated. Workspace approvals for the same revision accumulate,
  and approving one workspace does not narrow an existing host-wide grant.
  Revoke approval first to narrow its scope. A separate host/user-data
  directory does not inherit these grants. There is no "approve for all
  future revisions" option: every new revision needs its own explicit
  review and approval, and revoking or removing a package clears every
  scope it was approved for. Removal unregisters the package; inert cached
  snapshots and saved documents are preserved.
- If saved package approvals cannot be read or validated, package management
  and execution are unavailable. The host preserves those records for recovery
  rather than treating them as an empty registry. Restore valid host storage
  and restart the Agent Host; ordinary chat does not require canvas approvals.
- Runtime execution is still gated by the Agent Host runtime/SDK, and by
  normal VS Code workspace trust for the target session. Approving a
  package here is necessary but not sufficient for it to run; it does not
  bypass either of those checks.

## Bundled dependencies

`extension.mjs` in this starter only imports Node built-ins and
`@github/copilot-sdk/extension` (resolved from the installed backend's own
module resolution — do not vendor the SDK itself). If your real package
needs additional npm dependencies:

- Vendor them as a sibling `node_modules` folder next to `extension.mjs` (or
  otherwise ensure they resolve relative to your source folder), since a
  prepared snapshot is a plain filesystem copy with no install step of its
  own.
- Keep dependencies to what your declared action(s) actually need — anyone
  reviewing an approval only sees the size/revision/provenance of the
  snapshot, not its dependency tree, so an unnecessarily large bundle makes
  review harder without adding capability.
- Symlinks are rejected when preparing a snapshot, so a symlinked
  `node_modules` (as produced by some package managers/workspaces) will not
  prepare; vendor real copies instead.

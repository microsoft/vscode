# Optional editor-view renderer

`@vscode/editor-view` is a **desktop distro dependency**, not an OSS dependency.
The editor builds without it. The host-owned subset of its API is declared in
[`editorViewTypes.ts`](./editorViewTypes.ts); keep it compatible with the version
installed by the distro.

## Distro setup

Add the pinned runtime dependency to `npm/package.json` and its lockfile in
`microsoft/vscode-distro` (checked out as `.build/distro` during product builds):

```json
"@vscode/editor-view": "0.0.1"
```

The existing distro npm install/mixin and production-dependency packaging handle
the package. Ship all of `dist/` together: the JS entry point references its
hashed WASM asset relatively. Desktop packaging stores the JS in
`node_modules.asar` and unpacks WASM through the existing `**/*.wasm` rule.
No `product.json` opt-in flag or source `package.json` dependency is required.
This integration does not enable the renderer in standalone web/server builds.

## Availability and failure behavior

Desktop startup probes the application's `@vscode/editor-view/dist/index.js`
once, using ASAR-aware filesystem access and the same location as the runtime
loader. The detected `hasEditorView` value is passed to renderer windows in
their product configuration **before** editor settings are registered:

- Present: `editor.experimentalGpuAcceleration` offers `off`, `on`, `editorView`.
- Absent: it offers only `off`, `on`; a saved `editorView` value validates to
  `off`. DOM text, carets, selections and overlays remain active. No import or
  WASM request is attempted.
- Import or initialization failure: report the error, remove `editorView` for
  that renderer window, and rebuild affected editors using the DOM renderer.
  User settings are not rewritten.

The existing `on` renderer is independent of this package and is unchanged.
Availability is detected on application startup; restart after installing or
removing the optional package.

For local development, install the package without saving it to the source
manifest/lockfile, or hot-link a local build. The same startup detection applies.
Ordinary `npm install`/`npm ci` may remove such an undeclared local installation.

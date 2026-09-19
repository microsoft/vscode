# Optional editor-view renderer

`@vscode/editor-view` is a **desktop distro dependency**, not an OSS dependency.
The editor builds without it. The host-owned subset of its API is declared in
[`editorViewTypes.ts`](./editorViewTypes.ts); keep it compatible with the version
installed by the distro.

Bracket-pair guides require a renderer exposing `setBracketGuides`; this API is
not in the initial npm `0.0.1` release. Use the updated local build during
development and pin the next published release in the distro to enable it.

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
loader. Both detection and loading use the environment service's `isBuilt`
state, not the presence of `product.commit`: custom packaged builds without
commit metadata still use ASAR, and development runs use `node_modules`.
The detected `hasEditorView` value is passed to renderer windows in
their product configuration **before** editor settings are registered:

- Present: `editor.experimentalGpuAcceleration` offers `off`, `on`, `editorView`.
- Absent: it offers only `off`, `on`; a saved `editorView` value validates to
  `off`. DOM text, carets, selections and overlays remain active. No import or
  WASM request is attempted.
- Import or initialization failure: report the error, remove `editorView` for
  that renderer window, and rebuild affected editors using the DOM renderer.
  User settings are not rewritten.
- Older renderer without `setBracketGuides`: ordinary GPU rendering still works
  with bracket guides disabled. Enabling bracket guides reports an unsupported
  package error and returns to DOM rendering instead of hiding the guides.

The existing `on` renderer is independent of this package and is unchanged.
Availability is detected on application startup; restart after installing or
removing the optional package.

For local development, install the package without saving it to the source
manifest/lockfile, or hot-link a local build. The same startup detection applies.
Ordinary `npm install`/`npm ci` may remove such an undeclared local installation.

## Document size

The adapter mirrors the complete view model; there is no renderer-specific
line-count cap. Text, tokens, decorations, folding controls, and coordinate
queries use the same full document range, including soft-wrapped view lines.
Ordinary edits remain incremental regardless of document length. Initial loads
and complete view remaps still transfer the full document; indentation guides
and paint are restricted to the viewport. Large documents remain subject to
normal editor and available-memory limits, not silent truncation.

## Guide ownership

The GPU owns both indentation and bracket-pair guides through the shared
`guides` capability. VS Code supplies visible/overscan per-view-line guide
descriptions, including active/inactive filtering and wrap remapping, and resolves
the theme palette using the same transparent-color fallbacks as the DOM overlay.
Rust owns endpoint measurement, vertical/horizontal stroke geometry, clipping
and indentation overlap suppression. Both horizontal guide modes and all
bracket-pair settings remain host-controlled. Cursor moves, model edits, theme
changes and scrolling update the next visible batch.

## Decoration probes in auxiliary windows

Decoration probe elements are created in the main-window DOM realm even when
the editor root has already been adopted into an auxiliary document. Probes are
temporarily attached to that root and read through its current owner window's
`getComputedStyle`, so they retain main-realm identity while using the editor's
actual stylesheet and theme.

## Validation

Run the detector tests in both Node and the Electron unit runner: Electron loads
ES modules through an import map, so Node-only validation can miss import errors.

```sh
npm run test-node -- --run src/vs/platform/product/test/node/editorView.test.ts
./scripts/test.sh --run src/vs/platform/product/test/node/editorView.test.ts
npm run monaco-compile-check
npm run gulp monacodts-check
npm run gulp editor-distro
```

Changes to editor options must also preserve the generated Monaco declaration
surface. The declaration generator processes modules in isolation: explicitly
type the availability singleton and keep implementation classes `@internal`.
After intentional API changes, regenerate with `npm run gulp monacodts`.
The distro build also tree-shakes class members. GPU hit-test implementations
must explicitly implement `IViewLineHitTestProvider` so its methods are retained.

`editorViewModelSync.test.ts` covers complete mirrors and incremental edits
past 20,000 and 100,000 lines. The package's DOM-vs-GPU compare suite additionally
checks visible text, EOL measurements, pointer hit testing, insert/delete and
undo/redo across the old boundary, and 12,000 model lines wrapping to 60,000
view lines (`npm run test:compare` in the package).

# Optional editor-view renderer

`@vscode/editor-view` is a **desktop distro dependency**, not an OSS dependency.
The editor builds without it. The host-owned subset of its API is declared in
[`editorViewTypes.ts`](./editorViewTypes.ts); keep it compatible with the version
installed by the distro.

Bracket-pair guides and view zones require a renderer exposing
`setBracketGuides` and `setVerticalLayout`; these APIs are not in the initial
npm `0.0.1` release. Use the updated local build during development and pin the
next published release in the distro to enable them.

## Distro setup

In `microsoft/vscode-distro` (checked out as `.build/distro` during product
builds), add the pinned runtime dependency to `npm/package.json`:

```json
"@vscode/editor-view": "0.0.1"
```

Then refresh that folder's `pnpm-lock.yaml` by running `pnpm install` in `npm/`.
`npm/` is a separate pnpm install root. Its `minimumReleaseAge` exempts
`@vscode/*`, so a new renderer release can be pinned right after it is
published. The package has no install scripts, so it needs no `allowBuilds`
entry, and it has no runtime dependencies.

During the build, the root `pnpm install` installs the distro roots. Then
`build/azure-pipelines/distro/mixin-npm.ts` copies each distro dependency,
following symlinks, into the root `node_modules/@vscode/editor-view`, and
production-dependency packaging picks that copy up. Ship all of `dist/` together: the JS entry point references its
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
- Older renderer without `setVerticalLayout`: GPU rendering continues while the
  editor has no top padding or view zones. As soon as either is needed, it reports
  an unsupported package error and returns to DOM rendering instead of drawing
  lines in the wrong place.

The existing `on` renderer is independent of this package and is unchanged.
Availability is detected on application startup; restart after installing or
removing the optional package.

For local development, place the package at `node_modules/@vscode/editor-view`
without declaring it in `package.json` or `pnpm-lock.yaml`. pnpm does not remove
undeclared folders there, and the same startup detection applies. To use a
published release:

```sh
mkdir -p node_modules/@vscode/editor-view
npm pack @vscode/editor-view@0.0.1 --pack-destination /tmp
tar -xzf /tmp/vscode-editor-view-0.0.1.tgz -C node_modules/@vscode/editor-view --strip-components=1
```

To use a local renderer build, run `npm run build` in the package, then link it:
`ln -sfn /path/to/vscode-editor-view node_modules/@vscode/editor-view`.

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

## View zones and padding

View zones (CodeLens, peek views, inline chat, diff spacers) and
`editor.padding.top` move lines away from `lineNumber × lineHeight`. Before each
frame the adapter compares `viewLayout.getWhitespaces()` and the top padding
with what it last sent, and sends any change through one `setVerticalLayout`
call. The renderer then places all GPU paint, and computes its visible lines,
with the same offsets as `LinesLayout`, matching VS Code's hit testing. Guide
batches use `getLinesViewportDataAtScrollTop`, so they cover the lines visible
around zones. The renderer leaves zone rows transparent: zone DOM in the content
area and the margin stays beneath the opaque canvas everywhere else, but shows
through at the zone itself.

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
pnpm run test-node -- --run src/vs/platform/product/test/node/editorView.test.ts
./scripts/test.sh --run src/vs/platform/product/test/node/editorView.test.ts
pnpm run monaco-compile-check
pnpm run gulp monacodts-check
pnpm run gulp editor-distro
```

Changes to editor options must also preserve the generated Monaco declaration
surface. The declaration generator processes modules in isolation: explicitly
type the availability singleton and keep implementation classes `@internal`.
After intentional API changes, regenerate with `pnpm run gulp monacodts`.
The distro build also tree-shakes class members. GPU hit-test implementations
must explicitly implement `IViewLineHitTestProvider` so its methods are retained.

`editorViewModelSync.test.ts` covers complete mirrors and incremental edits
past 20,000 and 100,000 lines. The package's DOM-vs-GPU compare suite additionally
checks visible text, EOL measurements, pointer hit testing, insert/delete and
undo/redo across the old boundary, and 12,000 model lines wrapping to 60,000
view lines (`npm run test:compare` in the package).

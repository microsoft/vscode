---
description: Working notes and architecture documentation for the new esbuild-based build system in `build/next`. Use when making changes to the new build pipeline (transpile/bundle commands, NLS plugin, source-map handling, resource copying, or self-hosting watch tasks).
applyTo: 'build/next/**'
---

# Working Notes: New esbuild-based Build System

> These notes are for AI agents to help with context in new or summarized sessions.

## Important: Validating Changes

**The `VS Code - Build` task is NOT needed to validate changes in the `build/` folder!**

Build scripts in `build/` are TypeScript files that run directly with `node` (e.g., `node build/next/index.ts`). They are not compiled by the main VS Code build.

To test changes:
```bash
# Test transpile
node build/next/index.ts transpile --out out-test

# Test bundle (server-web target to test the auth fix)
node build/next/index.ts bundle --nls --target server-web --out out-vscode-reh-web-test

# Verify product config was injected
grep -l "serverLicense" out-vscode-reh-web-test/vs/code/browser/workbench/workbench.js
```

---

## Architecture Overview

### Files

- **[index.ts](index.ts)** - Main build orchestrator
  - `build-fast` command: Persistent non-watch incremental development build
  - `transpile` command: Fast TS → JS using `esbuild.transform()`
  - `bundle` command: TS → bundled JS using `esbuild.build()`
- **[build-fast.ts](../../build/next/build-fast.ts)** - Git change discovery, persistent state, lane planning, and orchestration
- **[transpile.ts](../../build/next/transpile.ts)** - Shared full/watch/incremental transpile and copy operations
- **[resources.ts](../../build/next/resources.ts)** - Curated production resource selection and copied JavaScript minification
- **[standalone.ts](../../build/next/standalone.ts)** - Unbundled desktop Electron preloads and their source-map publication
- **[nls-plugin.ts](nls-plugin.ts)** - NLS (localization) esbuild plugin
- **[private-to-property.ts](../../build/next/private-to-property.ts)** - Native private to property transformation
- **[svg.ts](../../build/next/svg.ts)** - Production-only SVG finishing, independent of the legacy gulp infrastructure

### Fast Non-Watch Incremental Builds

`npm run build-fast` stores its last successful input state in `.build/build-fast/state.json`. It uses scoped Git deltas plus content hashes for currently dirty/untracked inputs, so a repeated invocation can skip every build lane without running a watcher or scanning all source files.

- Client changes are transpiled/copied/deleted at file granularity.
- Built-in extension/media and Copilot builds run only when their inputs change.
- Missing, incompatible, or invalid state falls back to a full build.
- `npm run build-fast -- --force` forces all lanes to rebuild and refreshes state.
- State is invalidated before outputs change and published only after every selected lane succeeds. If inputs change during the build, the pre-build snapshot is saved so late changes are rebuilt on the next run.

### Gulp Integration and Retained Build Tooling

In [build/gulpfile.vscode.ts](../../build/gulpfile.vscode.ts), the `core-ci` task wires up these helpers (defined in [build/lib/esbuild.ts](../../build/lib/esbuild.ts)):
- `runEsbuildTranspile()` → transpile command
- `runEsbuildBundle()` → bundle command

Desktop, server, server-web, and standalone web packaging use the same `runEsbuildBundle()` helper. Minified bundles enable `--minify --mangle-privates --nls`. Local server and web builds generate API proposal names and the shared build date explicitly instead of compiling an intermediate production tree.

The canonical production entry points and product/built-in-extension injection live in [build/next/index.ts](../../build/next/index.ts); curated resource lists and copied-script minification live in [resources.ts](../../build/next/resources.ts). Build targets and bootstrap entry points are shared with packaging through [build/lib/esbuild.ts](../../build/lib/esbuild.ts), so package metadata is injected into the same files the bundler emits. Gulp still orchestrates compilation, extension builds, packaging, and translations; there is no separate legacy production bundle/minify chain.

Do not remove shared tooling based on its age:
- `editor-distro` still uses [createCompile()](../../build/lib/compilation.ts), the TypeScript stream compiler, and [nls.ts](../../build/lib/nls.ts) to emit Monaco ESM with English messages preserved.
- Development and extension transpilation still use the stream transpilers; declaration generation and editor extraction still use the TypeScript API.
- [i18n.ts](../../build/lib/i18n.ts) serves Monaco, translation export/import, and localization packages. `vscode-translations-export` obtains core metadata from `core-ci`.
- `source-map` is used by the current NLS/private-field transforms as well as the stream compiler. `gulp-sourcemaps` remains in the Monaco/development/extension pipelines; its type augmentation lives in [gulp-sourcemaps.d.ts](../../build/lib/typings/gulp-sourcemaps.d.ts).

### TypeScript Helpers in Production Bundles

[bundle.ts](../../build/next/bundle.ts) holds the shared ESM options for normal entries (`neutral`) and Node bootstraps (`node`). Both compile TypeScript source directly with esbuild, which emits, scopes, and minifies the helpers each input needs. Their JS and CSS banners contain only the Microsoft copyright comment; do not append executable `tslib` to them. Esbuild does not parse banner text, so it cannot tree-shake it, minify it, or protect it from name/export collisions.

- Desktop, server, server-web, and web entries do not consume the old banner's helpers or initialization. The public workbench and Sessions embedder exports are defined in their source entry points, not in tslib. Removing the banner intentionally removes its accidental 32 helper exports and default export, not any source-defined API.
- Explicit tslib imports still follow normal bundler resolution: package imports remain external, while explicitly bundled helpers can be tree-shaken. Already-generated JavaScript retains its own helper definitions.
- Non-minified bundles also omit the redundant library but retain readable esbuild-generated helpers. Development transpilation, standalone CommonJS preloads, and the separate Dev Tunnels bundle do not use the removed banner.
- The removed compiled-JavaScript pipeline stripped TypeScript boilerplate and replaced it with a tslib banner. Direct-from-TypeScript bundles instead use esbuild's scoped, tree-shaken helpers.
- Keep the copyright banner and existing license/notice packaging. Banner changes belong in esbuild's options so its source maps account for them; do not strip code after generating maps. Product integrity checksums continue to be computed from final bundled bytes during packaging.

Focused coverage uses the production options for helper-free entries, service decorators, disposal, compiler-generated JS, explicit tslib imports, export/name collisions, legal comments, and source maps in both minified and non-minified modes:

```bash
node --test build/next/test/bundle.test.ts build/next/test/nls-sourcemap.test.ts
```

### Production SVG Optimization

`bundle --minify` finishes every `.svg` file in the completed output tree through `optimizeSvgFiles()`. This runs after esbuild output writes, curated resource copying, standalone compilation, and additional web bundles, but before the bundle command resolves and downstream packaging computes checksums/integrity. Desktop, server-web, and standalone web share this stage; server outputs with no SVGs are a no-op.

- The stage and its direct `svgo` / `@types/svgo` dependencies belong to the new build tooling. It does not import the legacy optimizer, gulp, or the gulp facade.
- SVGO is pinned to **2.8.3**, matching the legacy `gulp-svgmin` dependency. Use its single-pass `preset-default`, not a newly upgraded optimizer or a discovered external config.
- Intentional safety overrides retain IDs (including external fragments and ARIA references), `viewBox`, titles/descriptions, hidden elements, unknown attributes such as `focusable`, roles, comments, and metadata. Style inlining/minification and group collapsing are disabled: the legacy CSS usage pruning drops spinner keyframes, collapsing groups changes positional selectors, and CSS comments can contain licensing information. Other preset optimizations, including path and number compaction, remain enabled.
- Only regular output files are considered. Sources are never rewritten, files are only replaced when smaller, and any optimization/read/write failure rejects the build with the affected path.
- Non-minified bundles and development/transpile/watch/build-fast resource copying remain byte-preserving. There is no extension-resource finishing change.

Focused validation (no client compilation required):

```bash
node --test build/next/test/svg.test.ts build/next/test/transpile.test.ts
node build/next/index.ts bundle --minify --nls --target server-web --out out-svg-test
```

The `[svg]` build log reports actual input/output byte counts. These are uncompressed asset-size savings, not a startup or latency measurement. When changing the optimizer configuration, also compare representative rendered icons, themed illustrations, and animations.

---

## Key Learnings

### 1. Comment Stripping by esbuild

**Problem:** esbuild strips comments like `/*BUILD->INSERT_PRODUCT_CONFIGURATION*/` during bundling.

**Solution:** Use an `onLoad` plugin to transform source files BEFORE esbuild processes them. See `fileContentMapperPlugin()` in index.ts.

**Why post-processing doesn't work:** By the time we post-process the bundled output, the comment placeholder has already been stripped.

### 2. Authorization Error: "Unauthorized client refused"

**Root cause:** Missing product configuration in browser bundle.

**Flow:**
1. Browser loads with empty product config (placeholder was stripped)
2. `productService.serverLicense` is empty/undefined
3. Browser's `SignService.vsda()` can't decrypt vsda WASM (needs serverLicense as key)
4. Browser's `sign()` returns original challenge instead of signed value
5. Server validates signature → fails
6. Server is in built mode (no `VSCODE_DEV`) → rejects connection

**Fix:** The `fileContentMapperPlugin` now runs during `onLoad`, replacing placeholders before esbuild strips them.

### 3. Build-Time Placeholders

Two placeholders that need injection:

| Placeholder | Location | Purpose |
|-------------|----------|---------|
| `/*BUILD->INSERT_PRODUCT_CONFIGURATION*/` | `src/vs/platform/product/common/product.ts` | Product config (commit, version, serverLicense, etc.) |
| `/*BUILD->INSERT_BUILTIN_EXTENSIONS*/` | `src/vs/workbench/services/extensionManagement/browser/builtinExtensionsScannerService.ts` | List of built-in extensions |

### 4. Server-web Target Specifics

- Removes `webEndpointUrlTemplate` from product config in `fileContentMapperPlugin()`
- Uses `.build/extensions` for builtin extensions (not `.build/web/extensions`)
- Bundles the browser shell `vs/code/browser/workbench/workbench`, which statically imports the web workbench. Do not also emit `vs/workbench/workbench.web.main.internal` as a separate server-web entry; standalone `web` still needs that entry.

### 5. Entry Point Parity with Old Build

**Problem:** The desktop target had `keyboardMapEntryPoints` as separate esbuild entry points, producing `layout.contribution.darwin.js`, `layout.contribution.linux.js`, and `layout.contribution.win.js` as standalone files in the output.

**Root cause:** In the old build (`gulpfile.vscode.ts`), `vscodeEntryPoints` does NOT include `buildfile.keyboardMaps`. These files are only separate entry points for server-web (`gulpfile.reh.ts`) and web (`gulpfile.vscode.web.ts`). For desktop, they're imported as dependencies of `workbench.desktop.main` and get bundled into it.

**Fix:** Removed `...keyboardMapEntryPoints` from the `desktop` case in `getEntryPointsForTarget()`. Keep for `server-web` and `web`.

**Lesson:** Keep target-specific entry points in `getEntryPointsForTarget()` in [build/next/index.ts](../../build/next/index.ts). Desktop keyboard layouts are bundled dependencies, not additional entry points.

### 6. NLS Output File Parity

`finalizeNLS()` writes `nls.messages.json`, `nls.keys.json`, `nls.metadata.json`, and `nls.messages.js`, matching the retained stream compiler's metadata formats. The JavaScript catalog is required by the localization upload pipeline; its shared ASCII serializer preserves decoded message values. Production bundles replace English strings with indices, while Monaco preserves English messages.

### Translated Message Cache Identity

Desktop, server, and server-web packaging compute `nlsMetadataHash` from the commit, ordered NLS keys, and default messages, and stamp it into the product configuration. Native bootstrap and remote language-pack resolution pass this identity to `resolveNLSConfiguration()`, so a cached localized startup does not read or hash the NLS tables. Products without the new field retain the legacy commit-based cache path. Different target tables get separate caches; identical tables at the same commit reuse one cache.

### 7. Resource Copying: Transpile vs Bundle

**Problem:** The new build used curated, specific resource pattern lists (e.g., `desktopResourcePatterns`) for **both** transpile/dev and production/bundle builds. Team members kept discovering missing resources because every new non-TS file in `src/` required manually adding its pattern.

**Root cause:** The old gulp build uses `gulp.src('src/**')` for dev/transpile — a catch-all glob that streams **every file** in `src/`. Non-TS files bypass the compiler via `tsFilter` + `tsFilter.restore` and land in `out/` untouched. This is inherently complete. The old build only uses curated resource lists for **production packaging** (`vscodeResourceIncludes`, `serverResourceIncludes` in the gulpfiles).

**Fix:**
- **Transpile/dev path** (`transpile` command, `--watch` mode): Now uses `copyAllNonTsFiles()` which copies ALL non-TS files from `src/` to the output, matching old `gulp.src('src/**')` behavior. No curated patterns needed.
- **Bundle/production path** (`bundle` command): Continues using `copyResources()` with curated per-target patterns, matching old `vscodeResourceIncludes` etc.
- Removed `devOnlyResourcePatterns` and `testFixturePatterns` — no longer needed since the broad copy handles all dev resources.
- Watch mode incremental copy now accepts **any** non-`.ts` file change (removed the `copyExtensions` allowlist).

**Lesson:** Dev builds should copy everything (completeness matters); production builds should be selective (size matters). Don't mix the two strategies.

### Production Copied JavaScript

[resources.ts](../../build/next/resources.ts) owns the per-target resource patterns. `bundle --minify` minifies each selected JavaScript resource while copying it from `src/`; it does not traverse or re-minify bundled/generated outputs. Without `--minify`, copying remains byte-for-byte. Transpile, watch, and incremental development builds still use the separate unmodified copy path.

The current JavaScript inventory is `vs/workbench/contrib/webview/browser/pre/service-worker.js` for desktop, server-web, and standalone web; server-only selects no JavaScript resources. The processing policy applies to JavaScript resources, not that filename, so additional scripts selected by the resource patterns receive the same handling.

- Minification does not bundle, wrap, force an output module format, or tree-shake the scripts. A resolver bypasses the repository's `package.json` module-type inference, so classic globals/top-level `this` and CommonJS contexts are preserved; explicit ESM imports/exports remain ESM.
- Legal comments and ordinary leading copyright/license headers are retained.
- esbuild composes local external and inline input source maps, embeds original sources, and emits a sibling map with a local or `--source-map-base-url` reference. Copied scripts and bundled outputs share [rewriteSourceMappingURL()](../../build/next/source-map-url.ts) to keep CDN references platform-independent. Source-map read/parse diagnostics (including missing files, malformed JSON/mappings, and unsupported URLs) are promoted to build errors.
- The standalone-web pipeline uploads all emitted core maps, including copied-script maps. Packaging still runs after resource processing and computes integrity checksums from final output bytes.
- Generated NLS, tslib banners, native-private/dependency mangling, SVG optimization, and extension minification remain separate concerns.

Focused regression tests (no workbench compilation required):

```bash
node --test build/next/test/resources.test.ts build/next/test/transpile.test.ts build/next/test/source-map-url.test.ts build/next/test/svg.test.ts
```

### Standalone Electron Preload Source Maps

[standalone.ts](../../build/next/standalone.ts) compiles all three desktop preloads: [preload.ts](../../src/vs/base/parts/sandbox/electron-browser/preload.ts), [preload-aux.ts](../../src/vs/base/parts/sandbox/electron-browser/preload-aux.ts), and [preload-browserView.ts](../../src/vs/platform/browserView/electron-browser/preload-browserView.ts). These special-context scripts retain `bundle: false`, `format: 'cjs'`, the existing target and copyright banner. They must not use the normal ESM bundle options or receive NLS/private-field post-processing.

- Both minified and non-minified bundle outputs embed the original TypeScript in `sourcesContent`. Finalization uses the existing [rewriteSourceMappingURL()](../../build/next/source-map-url.ts), including platform-independent URL separators, before writing JavaScript. Only the trailing map comment changes; executable bytes and esbuild's mappings are preserved.
- With an omitted or empty `--source-map-base-url`, the sibling `*.js.map` reference remains local. Development transpile/watch/build-fast paths remain separate and retain their inline maps without embedded sources.
- `core-ci` supplies `https://main.vscode-cdn.net/sourcemaps/<commit>/core`. [upload-sourcemaps.ts](../../build/azure-pipelines/upload-sourcemaps.ts) uploads each map under `sourcemaps/<commit>/core/<output-relative-path>.map`. No extra `out/` or `src/` belongs in the JavaScript's CDN URL.
- The bundle command awaits all standalone writes before downstream packaging. CI packaging strips local JS/CSS maps and computes the existing `preload.js` integrity checksum from final JavaScript bytes; do not move URL rewriting after checksum calculation.

Focused tests compile the real three entrypoints into temporary outputs and check CDN/local modes, exact original source content and identity, representative line/column mappings, unchanged CommonJS output, non-desktop omission, development maps, and the upload/map-stripping/checksum assumptions. The packaging check exercises the real file streams and filter, not a complete Electron distribution or a manual debugger session.

```bash
node --test build/next/test/standalone.test.ts build/next/test/source-map-url.test.ts
```

This repairs production debugging/source publication, not startup performance.

---

## Testing the Fix

```bash
# Build server-web with new system
node build/next/index.ts bundle --nls --target server-web --out out-vscode-reh-web-min

# Package it (uses gulp task)
npm run gulp vscode-reh-web-darwin-arm64-min

# Run server
./vscode-server-darwin-arm64-web/bin/code-server-oss --connection-token dev-token

# Open browser - should connect without "Unauthorized client refused"
```

---

## Production Build Responsibilities

1. **`BUILD_INSERT_PACKAGE_CONFIGURATION`** - Server bootstrap files ([bootstrap-meta.ts](../../src/bootstrap-meta.ts)) have this marker for package.json injection. It is handled by [inlineMeta.ts](../../build/lib/inlineMeta.ts) during packaging.

2. **Mangling** - TypeScript private/protected-name mangling is intentionally retired. Esbuild still minifies bundle-local identifiers. `--mangle-privates` and [private-to-property.ts](../../build/next/private-to-property.ts) lower native `#private` fields, except in extension-host bundles; they are not the removed TypeScript-to-TypeScript pass.

3. **Entry points and resources** - Per-target definitions are maintained in [index.ts](../../build/next/index.ts), not duplicated in packaging gulpfiles.

4. **Validation** - Official platform and web pipelines invoke `core-ci`, which checks the API proposal registry and type-checks with tsgo before bundling. Required bootstrap entries must fail the build if missing. Post-processing syntax checks remain enabled.

5. **Source maps** - Core bundles, copied JavaScript resources, standalone preloads, and the additional Dev Tunnels browser bundle preserve source content and honor the configured CDN map URL. Standalone preload publication lives in [standalone.ts](../../build/next/standalone.ts), which uses the shared `BuildTarget` type exported by [resources.ts](../../build/next/resources.ts). The SDK writer only touches its own emitted files.

6. **Deferred Unicode validation** - The legacy minifier's whole-output rejection of JS/CSS characters above U+00FF has not been ported. Keep that validation policy separate from infrastructure removal; the separate Unicode escaping work does not itself restore this check.

---

## Historical Build Comparison: OLD (gulp-tsb) vs NEW (esbuild) — Desktop Build

The following measurements and action items describe the initial migration, not the current production build.

### Summary

| Metric | OLD | NEW | Delta |
|--------|-----|-----|-------|
| Total files in `out/` | 3993 | 4301 | +309 extra, 1 missing |
| Total size of `out/` | 25.8 MB | 64.6 MB | +38.8 MB (2.5×) |
| `workbench.desktop.main.js` | 13.0 MB | 15.5 MB | +2.5 MB |

### 1 Missing File (in OLD, not in NEW)

| File | Why Missing | Fix |
|------|-------------|-----|
| `out/vs/platform/browserView/electron-browser/preload-browserView.js` | Not listed in `desktopStandaloneFiles` in index.ts. Only `preload.ts` and `preload-aux.ts` are compiled as standalone files. | **Add** `'vs/platform/browserView/electron-browser/preload-browserView.ts'` to the `desktopStandaloneFiles` array in `index.ts`. |

### 309 Extra Files (in NEW, not in OLD) — Breakdown

| Category | Count | Explanation |
|----------|-------|-------------|
| **CSS files** | 291 | `copyCssFiles()` copies ALL `.css` from `src/` to the output. The old bundler inlines CSS into the main `.css` bundle (e.g., `workbench.desktop.main.css`) and never ships individual CSS files. These individual files ARE needed at runtime because the new ESM system uses `import './foo.css'` resolved by an import map. |
| **Vendor JS files** | 3 | `dompurify.js`, `marked.js`, `semver.js` — listed in `commonResourcePatterns`. The old bundler inlines these into the main bundle. The new system keeps them as separate files because they're plain JS (not TS). They're needed. |
| **Web workbench bundle** | 1 | `vs/code/browser/workbench/workbench.js` (15.4 MB). This is the web workbench entry point bundle. It should NOT be in a desktop build — the old build explicitly excludes `out-build/vs/code/browser/**`. The `desktopResourcePatterns` in index.ts includes `vs/code/browser/workbench/*.html` and `callback.html` which is correct, but the actual bundle gets written by the esbuild desktop bundle step because the desktop entry points include web entry points. |
| **Web workbench internal** | 1 | `vs/workbench/workbench.web.main.internal.js` (15.4 MB). Similar: shouldn't ship in a desktop build. It's output by the esbuild bundler. |
| **Keyboard layout contributions** | 3 | `layout.contribution.{darwin,linux,win}.js` — the old bundler inlines these into the main bundle. These are new separate files from the esbuild bundler. |
| **NLS files** | 2 | `nls.messages.js` (new) and `nls.metadata.json` (new). The old build has `nls.messages.json` and `nls.keys.json` but not a `.js` version or metadata. The `.js` version is produced by the NLS plugin. |
| **HTML files** | 2 | `vs/code/browser/workbench/workbench.html` and `callback.html` — correctly listed in `desktopResourcePatterns` (these are needed for desktop's built-in web server). |
| **SVG loading spinners** | 3 | `loading-dark.svg`, `loading-hc.svg`, `loading.svg` in `vs/workbench/contrib/extensions/browser/media/`. The old build only copies `theme-icon.png` and `language-icon.svg` from that folder; the new build's `desktopResourcePatterns` uses `*.svg` which is broader. |
| **codicon.ttf (duplicate)** | 1 | At `vs/base/browser/ui/codicons/codicon/codicon.ttf`. The old build copies this to `out/media/codicon.ttf` only. The new build has BOTH: the copy in `out/media/` (from esbuild's `file` loader) AND the original path (from `commonResourcePatterns`). Duplicate. |
| **PSReadLine.psm1** | 1 | `vs/workbench/contrib/terminal/common/scripts/psreadline/PSReadLine.psm1` — the old build uses `*.psm1` in `terminal/common/scripts/` (non-recursive?). The new build uses `**/*.psm1` (recursive), picking up this subdirectory file. Check if it's needed. |
| **date file** | 1 | `out/date` — build timestamp, produced by the new build's `bundle()` function. The old build doesn't write this; it reads `package.json.date` instead. |

### Size Increase Breakdown by Area

| Area | OLD | NEW | Delta | Why |
|------|-----|-----|-------|-----|
| `vs/code` | 1.5 MB | 17.4 MB | +15.9 MB | Web workbench bundle (15.4 MB) shouldn't be in desktop build |
| `vs/workbench` | 18.9 MB | 38.7 MB | +19.8 MB | `workbench.web.main.internal.js` (15.4 MB) + unmangled desktop bundle (+2.5 MB) + individual CSS files (~1 MB) |
| `vs/base` | 0 MB | 0.4 MB | +0.4 MB | Individual CSS files + vendor JS |
| `vs/editor` | 0.3 MB | 0.5 MB | +0.1 MB | Individual CSS files |
| `vs/platform` | 1.7 MB | 1.9 MB | +0.2 MB | Individual CSS files |

### JS Files with >2× Size Change

| File | OLD | NEW | Ratio | Reason |
|------|-----|-----|-------|--------|
| `vs/workbench/contrib/webview/browser/pre/service-worker.js` | 7 KB | 15 KB | 2.2× | Not minified / includes more inlined code |
| `vs/code/electron-browser/workbench/workbench.js` | 10 KB | 28 KB | 2.75× | OLD is minified to 6 lines; NEW is 380 lines (not compressed, includes tslib banner) |

### Action Items

1. **[CRITICAL] Missing `preload-browserView.ts`** — Add to `desktopStandaloneFiles` in index.ts. Without it, BrowserView (used for Simple Browser) may fail.
2. **[SIZE] Web bundles in desktop build** — `workbench.web.main.internal.js` and `vs/code/browser/workbench/workbench.js` together add ~31 MB. These are written by the esbuild bundler and not filtered out. Consider: either don't bundle web entry points for the desktop target, or ensure the packaging step excludes them (currently `packageTask` takes `out-vscode-min/**` without filtering).
3. **[SIZE] No mangling** — The desktop main bundle is 2.5 MB larger due to no property mangling. Known open item.
4. **[MINOR] Duplicate codicon.ttf** — Exists at both `out/media/codicon.ttf` (from esbuild `file` loader) and `out/vs/base/browser/ui/codicons/codicon/codicon.ttf` (from `commonResourcePatterns`). Consider removing from `commonResourcePatterns` if it's already handled by the loader.
5. **[MINOR] Extra SVGs** — `desktopResourcePatterns` uses `*.svg` for extensions media but old build only ships `language-icon.svg`. The loading spinners may be unused in the desktop build.
6. **[MINOR] Extra PSReadLine.psm1** from recursive glob — verify if needed.

---

## Source Maps

### Principle: Every Code Transform Must Preserve Source Maps

Any step that modifies JS output - whether in an esbuild plugin or in post-processing - **must** update the source map accordingly. Failing to do so causes column drift that makes debuggers, crash reporters, and breakpoints point to wrong positions. The `source-map` library (v0.6.1, already a dependency) provides the `SourceMapConsumer`/`SourceMapGenerator` APIs for this.

### Root Causes (before fixes)

Source maps worked in transpile mode but failed in bundle mode. The observed pattern was "class-heavy files fail, simple utilities work" but the real cause was **"files with NLS calls vs files without"**. Class-heavy UI components use `localize()` extensively; utility files in `vs/base/` don't.

Two categories of corruption:

1. **NLS plugin `onLoad`** returned modified source without a source map. esbuild treated the NLS-transformed text as the "original" - `sourcesContent` embedded placeholders, and column mappings pointed to wrong positions.

2. **Post-processing** (`postProcessNLS`, `convertPrivateFields`) modified bundled JS output without updating `.map` files. Column positions drifted by the cumulative length deltas of all replacements.

### Fixes Applied

1. **`sourcesContent: true`** - Production bundles embed original TypeScript source content in `.map` files, matching the old build's `includeContent: true` behavior.

2. **`--source-map-base-url` option** - Rewrites JS and CSS `sourceMappingURL` comments to point to CDN URLs, using forward slashes for relative output paths on every platform. Without this option, existing comments are left unchanged. Tests in [source-map-url.test.ts](../../build/next/test/source-map-url.test.ts).

3. **NLS plugin inline source maps** (`nls-plugin.ts`) - The `onLoad` handler generates an inline source map (`//# sourceMappingURL=data:...`) mapping from NLS-transformed source back to original. esbuild composes this with its own bundle source map. `SourceMapGenerator.setSourceContent` embeds the original source so `sourcesContent` in the final `.map` has the real TypeScript. `generateNLSSourceMap` adds per-column identity mappings after each edit on a line so that esbuild's source-map composition preserves fine-grained column accuracy (source maps don't interpolate columns — they use binary search, so a single boundary mapping would collapse all subsequent columns to the edit-end position). Tests in `test/nls-sourcemap.test.ts`.

4. **`convertPrivateFields` source map adjustment** (`private-to-property.ts`) - `convertPrivateFields` returns its sorted edits as `TextEdit[]`. `adjustSourceMap()` uses `SourceMapConsumer` to walk every mapping, adjusts generated columns based on cumulative edit shifts per line, and rebuilds with `SourceMapGenerator`. The post-processing loop in `index.ts` saves pre-mangle content + edits per JS file, then applies `adjustSourceMap` to the corresponding `.map`. Tests in `test/private-to-property.test.ts`.

5. **`postProcessNLS` source map adjustment** (`nls-plugin.ts`, `index.ts`) — `postProcessNLS` now returns `{ code, edits }` where `edits` is a `TextEdit[]` tracking each replacement's byte offset. The bundle loop in `index.ts` chains `adjustSourceMap` calls: first for mangle edits, then for NLS edits, so both transforms are accurately reflected in the final `.map` file. Tests in `test/nls-sourcemap.test.ts`.

6. **`adjustSourceMap` unmapped segment preservation** (`private-to-property.ts`) — Previously, `adjustSourceMap()` silently dropped mappings where `source === null`. These unmapped segments create essential "gaps" that prevent `originalPositionFor()` from wrongly interpolating between distant valid mappings on the same minified line. Now emits them as generated-only mappings. Also preserves `sourceRoot` from the input map.

### Key Technical Details

**esbuild `onLoad` source map composition:** esbuild's `onLoad` return type does NOT have a `sourcemap` field (as of v0.27.2). The only way to provide input source maps is to embed them inline in the returned `contents`. esbuild reads this and composes it with its own transform/bundle map. With `sourcesContent: true`, esbuild uses the source content from the inline map, not the `contents` string.

**`adjustColumn` algorithm** handles three cases per edit on a line:
1. Edit entirely before the column: accumulate the delta (newLen - origLen)
2. Column falls inside the edit span: map to the start of the edit
3. Edit is after the column: stop (edits are sorted)

**Plugin interaction:** Both the NLS plugin and `fileContentMapperPlugin` register `onLoad({ filter: /\.ts$/ })`. In esbuild, the first `onLoad` to return non-`undefined` wins. The NLS plugin is `unshift`ed (runs first), so files with NLS calls skip `fileContentMapperPlugin`. This is safe in practice since `product.ts` (which has `BUILD->INSERT_PRODUCT_CONFIGURATION`) has no localize calls.

### Still Broken — Full Production Build (`npm run gulp vscode-min`)

**Symptom:** Source maps are totally broken in the minified production build. E.g. a breakpoint at `src/vs/editor/browser/editorExtensions.ts` line 308 resolves to `src/vs/editor/common/cursor/cursorMoveCommands.ts` line 732 — a completely different file. This is **cross-file** mapping corruption, not just column drift.

**Status of unit tests:** The fixes above pass in isolated unit tests (small 1–2 file bundles via `esbuild.build` with `minify: true`). The tests verify column drift ≤ 20 and correct line mapping for single-file bundles with NLS. **183 tests pass, 0 failing.** But the full production build bundles hundreds of files into huge minified outputs (e.g. `workbench.desktop.main.js` at ~15 MB) and the source maps break at that scale.

**Suspected root causes (need investigation):**

1. **`generateNLSSourceMap` per-column identity mappings may overwhelm esbuild's source-map composition.** The fix added one mapping per column from edit-end to end-of-line (or next edit). For a long TypeScript line with a `localize()` call near the beginning, this generates hundreds of identity mappings per line. Across hundreds of files, the inline source maps embedded in `onLoad` responses may be extremely large. esbuild must compose these with its own source maps during bundling — it may hit limits, silently drop mappings, or produce incorrect composed maps at this scale. **Mitigation to try:** Instead of per-column mappings, use sparser "checkpoint" mappings (e.g., every N characters) or rely only on boundary mappings and accept some column drift within the NLS-transformed region. The old boundary-only approach was wrong (collapsed all downstream columns), but per-column may be the other extreme.

2. **`adjustSourceMap` may corrupt source indices in large minified bundles.** In a minified bundle, the entire output is on one or very few lines. `adjustSourceMap()` walks every mapping via `SourceMapConsumer.eachMapping()` and adjusts `generatedColumn` using `adjustColumn()`. But when thousands of mappings all share `generatedLine: 1` and there are hundreds of NLS edits on that same line, there may be sorting/ordering bugs: `eachMapping()` returns mappings in generated order by default, but `adjustColumn()` binary-searches through edits sorted by column. If edits cover regions that interleave with mappings from different source files, the cumulative shift calculation might produce wrong columns that then resolve to wrong source files.

3. **Chained `adjustSourceMap` calls (mangle → NLS) may compound errors.** After the first `adjustSourceMap` for mangle edits, the source map's generated columns are updated. The second call for NLS edits uses `nlsEdits` which were computed against `preNLSCode` — but `preNLSCode` is the post-mangle JS, which is what the first `adjustSourceMap` maps from. This chaining _should_ be correct, but needs verification at scale with a real minified bundle.

4. **The `source-map` v0.6.1 library may have precision issues with very large VLQ-encoded maps.** The bundled outputs have source maps with hundreds of thousands of mappings. The library is old (2017) and there may be numerical precision or sorting issues with very large maps. Consider testing with `source-map` v0.7+ or the Rust-based `@aspect-build/source-map`.

5. **Alternative approach: skip per-column NLS plugin mappings, fix only `postProcessNLS`.** The NLS plugin `onLoad` replaces `"key"` with `"%%NLS:longPlaceholder%%"` — a length change that only affects columns on affected lines. The subsequent `postProcessNLS` then replaces the long placeholder with a short index. If the `adjustSourceMap` for `postProcessNLS` is correct, it should compensate for both expansions (plugin expansion + post-process contraction). We might not need per-column mappings in `generateNLSSourceMap` at all — just the boundary mapping. The column will drift in the intermediate representation but `adjustSourceMap` for NLS should fix it. **This hypothesis needs testing.**

6. **Alternative approach: do NLS replacement purely in post-processing.** Skip the `onLoad` two-phase approach (placeholder insertion + post-processing replacement) entirely. Instead, run `postProcessNLS` as a single post-processing step that directly replaces `localize("key", "message")` → `localize(0, null)` in the bundled JS output, with proper source-map adjustment via `adjustSourceMap`. This avoids both the inline source map composition complexity and the two-step replacement. The downside is that post-processing must parse/regex-match real `localize()` calls (not easy placeholders), which is more fragile.

**Summary of fixes applied vs status:**

| Bug | Fix | Unit test | Production |
|-----|-----|-----------|------------|
| `generateNLSSourceMap` only had boundary mappings → columns collapsed | Added per-column identity mappings after each edit | Pass (drift: 0) | **Broken** — may overwhelm esbuild composition at scale |
| `postProcessNLS` didn't track edits for source map adjustment | Returns `{ code, edits }`, chained in `index.ts` | Pass | **Broken** — `adjustSourceMap` may corrupt source indices on huge single-line minified output |
| `adjustSourceMap` dropped unmapped segments | Preserves generated-only mappings + `sourceRoot` | Pass (no regressions) | **Broken** — same cross-file mapping issue |

**Files involved:**
- `build/next/nls-plugin.ts` — `generateNLSSourceMap()` (per-column mappings), `postProcessNLS()` (returns edits), `replaceInOutput()` (regex replacement)
- `build/next/private-to-property.ts` — `adjustSourceMap()` (column adjustment)
- `build/next/index.ts` — bundle post-processing loop (lines ~899–975), chains adjustSourceMap calls
- `build/next/test/nls-sourcemap.test.ts` — unit tests (pass but don't cover production-scale bundles)

**How to reproduce:**
```bash
npm run gulp vscode-min
# Open out-vscode-min/ in a debugger, set breakpoints in editor files
# Observe breakpoints resolve to wrong files
```

**How to debug further:**
```bash
# 1. Build with just --nls (no mangle) to isolate NLS from mangle issues
node build/next/index.ts bundle --nls --minify --target desktop --out out-debug

# 2. Build with just --mangle-privates (no NLS) to isolate mangle issues
node build/next/index.ts bundle --mangle-privates --minify --target desktop --out out-debug

# 3. Build with neither (baseline — does esbuild's own map work?)
node build/next/index.ts bundle --minify --target desktop --out out-debug

# 4. Compare .map files across the three builds to find where mappings diverge

# 5. Validate a specific mapping in the large bundle:
node -e "
const {SourceMapConsumer} = require('source-map');
const fs = require('fs');
const map = JSON.parse(fs.readFileSync('./out-debug/vs/workbench/workbench.desktop.main.js.map','utf8'));
const c = new SourceMapConsumer(map);
// Look up a known position and see which source file it resolves to
console.log(c.originalPositionFor({line: 1, column: XXXX}));
"
```

---

## Self-hosting Setup

The default `VS Code - Build` task now runs three parallel watchers:

| Task | What it does | Script |
|------|-------------|--------|
| **Core - Transpile** | esbuild single-file TS→JS (fast, no type checking) | `watch-client-transpiled` → `node build/next/index.ts transpile --watch` |
| **Core - Typecheck** | tsgo `noEmit` watch (type errors only, no output) | `watch-clientd` → `gulp watch-client` (uses `watchTypeCheckTask`) |
| **Ext - Build** | Extension compilation (unchanged) | `watch-extensionsd` |

### Key Changes

- **`build/lib/compilation.ts`**: `watchTypeCheckTask()` runs tsgo with `noEmit: true` in response to source changes, alongside Monaco declaration generation.
- **`build/gulpfile.ts`**: `watchClientTask` is now `task.parallel(compilation.watchTypeCheckTask('src'), ...)` — no `rimraf('out')` (the transpiler owns that), no JS emit.
- **`build/next/index.ts`**: Watch mode emits `Starting transpilation...` / `Finished transpilation with N errors after X ms` for VS Code problem matcher.
- **`.vscode/tasks.json`**: Old "Core - Build" split into "Core - Transpile" + "Core - Typecheck" with separate problem matchers (owners: `esbuild` vs `typescript`).
- **`package.json`**: Added `watch-client-transpile`, `watch-client-transpiled`, `kill-watch-client-transpiled` scripts.

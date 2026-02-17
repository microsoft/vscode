# Working Notes: New esbuild-based Build System

> These notes are for AI agents to help with context in new or summarized sessions.

## Important: Validating Changes

**The `VS Code - Build` task is NOT needed to validate changes in the `build/` folder!**

Build scripts in `build/` are TypeScript files that run directly with `tsx` (e.g., `npx tsx build/next/index.ts`). They are not compiled by the main VS Code build.

To test changes:
```bash
# Test transpile
npx tsx build/next/index.ts transpile --out out-test

# Test bundle (server-web target to test the auth fix)
npx tsx build/next/index.ts bundle --nls --target server-web --out out-vscode-reh-web-test

# Verify product config was injected
grep -l "serverLicense" out-vscode-reh-web-test/vs/code/browser/workbench/workbench.js
```

---

## Architecture Overview

### Files

- **[index.ts](index.ts)** - Main build orchestrator
  - `transpile` command: Fast TS → JS using `esbuild.transform()`
  - `bundle` command: TS → bundled JS using `esbuild.build()`
- **[nls-plugin.ts](nls-plugin.ts)** - NLS (localization) esbuild plugin

### Integration with Old Build

In [gulpfile.vscode.ts](../gulpfile.vscode.ts#L228-L242), the `core-ci` task uses these new scripts:
- `runEsbuildTranspile()` → transpile command
- `runEsbuildBundle()` → bundle command

Old gulp-based bundling renamed to `core-ci-OLD`.

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

- Removes `webEndpointUrlTemplate` from product config (see `tweakProductForServerWeb` in old build)
- Uses `.build/extensions` for builtin extensions (not `.build/web/extensions`)

### 5. Entry Point Parity with Old Build

**Problem:** The desktop target had `keyboardMapEntryPoints` as separate esbuild entry points, producing `layout.contribution.darwin.js`, `layout.contribution.linux.js`, and `layout.contribution.win.js` as standalone files in the output.

**Root cause:** In the old build (`gulpfile.vscode.ts`), `vscodeEntryPoints` does NOT include `buildfile.keyboardMaps`. These files are only separate entry points for server-web (`gulpfile.reh.ts`) and web (`gulpfile.vscode.web.ts`). For desktop, they're imported as dependencies of `workbench.desktop.main` and get bundled into it.

**Fix:** Removed `...keyboardMapEntryPoints` from the `desktop` case in `getEntryPointsForTarget()`. Keep for `server-web` and `web`.

**Lesson:** Always verify new build entry points against the old build's per-target definitions in `buildfile.ts` and the respective gulpfiles.

### 6. NLS Output File Parity

**Problem:** `finalizeNLS()` was generating `nls.messages.js` (with `globalThis._VSCODE_NLS_MESSAGES=...`) in addition to the standard `.json` files. The old build only produces `nls.messages.json`, `nls.keys.json`, and `nls.metadata.json`.

**Fix:** Removed `nls.messages.js` generation from `finalizeNLS()` in `nls-plugin.ts`.

**Lesson:** Don't add new output file formats that create parity differences with the old build. The old build is the reference.

### 7. Resource Copying: Transpile vs Bundle

**Problem:** The new build used curated, specific resource pattern lists (e.g., `desktopResourcePatterns`) for **both** transpile/dev and production/bundle builds. Team members kept discovering missing resources because every new non-TS file in `src/` required manually adding its pattern.

**Root cause:** The old gulp build uses `gulp.src('src/**')` for dev/transpile — a catch-all glob that streams **every file** in `src/`. Non-TS files bypass the compiler via `tsFilter` + `tsFilter.restore` and land in `out/` untouched. This is inherently complete. The old build only uses curated resource lists for **production packaging** (`vscodeResourceIncludes`, `serverResourceIncludes` in the gulpfiles).

**Fix:**
- **Transpile/dev path** (`transpile` command, `--watch` mode): Now uses `copyAllNonTsFiles()` which copies ALL non-TS files from `src/` to the output, matching old `gulp.src('src/**')` behavior. No curated patterns needed.
- **Bundle/production path** (`bundle` command): Continues using `copyResources()` with curated per-target patterns, matching old `vscodeResourceIncludes` etc.
- Removed `devOnlyResourcePatterns` and `testFixturePatterns` — no longer needed since the broad copy handles all dev resources.
- Watch mode incremental copy now accepts **any** non-`.ts` file change (removed the `copyExtensions` allowlist).

**Lesson:** Dev builds should copy everything (completeness matters); production builds should be selective (size matters). Don't mix the two strategies.

---

## Testing the Fix

```bash
# Build server-web with new system
npx tsx build/next/index.ts bundle --nls --target server-web --out out-vscode-reh-web-min

# Package it (uses gulp task)
npm run gulp vscode-reh-web-darwin-arm64-min

# Run server
./vscode-server-darwin-arm64-web/bin/code-server-oss --connection-token dev-token

# Open browser - should connect without "Unauthorized client refused"
```

---

## Open Items / Future Work

1. **`BUILD_INSERT_PACKAGE_CONFIGURATION`** - Server bootstrap files ([bootstrap-meta.ts](../../src/bootstrap-meta.ts)) have this marker for package.json injection. Currently handled by [inlineMeta.ts](../lib/inlineMeta.ts) in the old build's packaging step.

2. **Mangling** - The new build doesn't do TypeScript-based mangling yet. Old `core-ci` with mangling is now `core-ci-OLD`.

3. **Entry point duplication** - Entry points are duplicated between [buildfile.ts](../buildfile.ts) and [index.ts](index.ts). Consider consolidating.

---

## Build Comparison: OLD (gulp-tsb) vs NEW (esbuild) — Desktop Build

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

### Fixes Applied

1. **`sourcesContent: true`** — Production bundles now embed original TypeScript source content in `.map` files, matching the old build's `includeContent: true` behavior. Without this, crash reports from CDN-hosted source maps can't show original source.

2. **`--source-map-base-url` option** — The `bundle` command accepts an optional `--source-map-base-url <url>` flag. When set, post-processing rewrites `sourceMappingURL` comments in `.js` and `.css` output files to point to the CDN (e.g., `https://main.vscode-cdn.net/sourcemaps/<commit>/core/vs/...`). This matches the old build's `sourceMappingURL` function in `minifyTask()`. Wired up in `gulpfile.vscode.ts` for `core-ci-esbuild` and `vscode-esbuild-min` tasks.

### NLS Source Map Accuracy (Decision: Accept Imprecision)

**Problem:** `postProcessNLS()` replaces `"%%NLS:moduleId#key%%"` placeholders (~40 chars) with short index values like `null` (4 chars) in the final JS output. This shifts column positions without updating the `.map` files.

**Options considered:**

| Option | Description | Effort | Accuracy |
|--------|-------------|--------|----------|
| A. Fixed-width placeholders | Pad placeholders to match replacement length | Hard — indices unknown until all modules are collected across parallel bundles | Perfect |
| B. Post-process source map | Parse `.map`, track replacement offsets per line, adjust VLQ mappings | Medium | Perfect |
| C. Two-pass build | Assign NLS indices during plugin phase | Not feasible with parallel bundling | N/A |
| **D. Accept imprecision** | NLS replacements only affect column positions; line-level debugging works | Zero | Line-level |

**Decision: Option D — accept imprecision.** Rationale:

- NLS replacements only shift **columns**, never lines — line-level stack traces and breakpoints remain correct.
- Production crash reporting (the primary consumer of CDN source maps) uses line numbers; column-level accuracy is rarely needed.
- The old gulp build had the same fundamental issue in its `nls.nls()` step and used `SourceMapConsumer`/`SourceMapGenerator` to fix it — but that approach was fragile and slow.
- If column-level precision becomes important later (e.g., for minified+NLS bundles), Option B can be implemented: after NLS replacement, re-parse the source map, walk replacement sites, and adjust column offsets. This is a localized change in the post-processing loop.

---

## Self-hosting Setup

The default `VS Code - Build` task now runs three parallel watchers:

| Task | What it does | Script |
|------|-------------|--------|
| **Core - Transpile** | esbuild single-file TS→JS (fast, no type checking) | `watch-client-transpiled` → `npx tsx build/next/index.ts transpile --watch` |
| **Core - Typecheck** | gulp-tsb `noEmit` watch (type errors only, no output) | `watch-clientd` → `gulp watch-client` (with `noEmit: true`) |
| **Ext - Build** | Extension compilation (unchanged) | `watch-extensionsd` |

### Key Changes

- **`compilation.ts`**: `ICompileTaskOptions` gained `noEmit?: boolean`. When set, `overrideOptions.noEmit = true` is passed to tsb. `watchTask()` accepts an optional 4th parameter `{ noEmit?: boolean }`.
- **`gulpfile.ts`**: `watchClientTask` no longer runs `rimraf('out')` (the transpiler owns that). Passes `{ noEmit: true }` to `watchTask`.
- **`index.ts`**: Watch mode emits `Starting transpilation...` / `Finished transpilation with N errors after X ms` for VS Code problem matcher.
- **`tasks.json`**: Old "Core - Build" split into "Core - Transpile" + "Core - Typecheck" with separate problem matchers (owners: `esbuild` vs `typescript`).
- **`package.json`**: Added `watch-client-transpile`, `watch-client-transpiled`, `kill-watch-client-transpiled` scripts.

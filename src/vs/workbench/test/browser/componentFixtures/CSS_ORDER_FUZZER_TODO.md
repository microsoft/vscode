# CSS Cascade-Order Dependency Fuzzer — TODO

Tooling to detect and localize CSS cascade-order dependencies in VS Code
component fixtures. Fixtures render through `@vscode/component-explorer` over an
rspack `serve-out` build that concatenates all CSS into one native-CSS bundle,
so the cascade order of source files can silently affect rendering.

## What's done (in this branch)

- **Input-driven stylesheet reversal** — `installGlobalStyles` accepts a
  `reverseStylesheets` option (`true` = reverse all documents, or
  `{ fromIndex, toIndex }` = reverse only that index window). Driven per-run via
  the render `--input` flag (`parseStyleOptions` in `fixtureUtils.ts`), not via
  global state. See `fixtureUtilsCss.ts`.
- **`@css-source` marker loader** — `build/rspack/cssSourceMarkerLoader.ts`
  prepends each CSS module's repo-relative source path as a comment that native
  CSS preserves, so tooling can map concatenated bundle "documents" back to
  source files. Wired into the `.css` rule in `rspack.serve-out.config.mts`.

## What's still missing

### 1. Verify the `.ts` loader actually runs (blocker)
The loader was converted from `.cjs` to `.ts` to satisfy
`local/code-no-new-javascript-files`. Confirm rspack/`@rspack/cli` can load a
`.ts` loader directly in the `serve-out` setup:
- Do one clean rebuild and check that `/bundled/workbench.css` still contains
  `@css-source` markers (expected ~294 across the bundle, ~153 within a single
  fixture's sheets).
- If rspack cannot transpile a `.ts` loader directly, fall back to inlining the
  loader function in `rspack.serve-out.config.mts` (it's already `.mts`/ESM).

### 2. Apply the known CSS specificity fix (validation case)
Fixture `aiCustomizationManagementEditor/LocalHarness/Dark` has an exact
specificity tie `(0,2,0)` on `display` between:
- `out/vs/workbench/contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css`
  (`.ai-customization-management-editor .section-icon { display: flex }`, etc.)
- `out/vs/base/browser/ui/codicons/codicon/codicon.css`
  (`.codicon[class*="codicon-"] { display: inline-block }`)

Product order makes `inline-block` win; reversing `[80..84]` flips icons.
Fix: raise specificity on the icon rules, e.g.
`.ai-customization-management-editor .section-icon.codicon { display: flex; }`,
then re-verify under reversal that the order-dependency is gone.

### 3. Bisection driver
Add an `applyReversedRange` helper + a driver that does in-page binary search
against the live `serve` (no rebuilds) to automatically localize which two
source documents form an order-dependency. Uses the browser as oracle
(computed-style diff under reversal) — static cascade analysis was abandoned
(~100% false-positive rate due to `:has`/`:is`/`:where` specificity that can't
be reconstructed in-page).

### 4. CI guard
`build/lib/checkStylesheetOrder.ts` + a daily workflow that renders each fixture
normally and with `--input '{"reverseStylesheets":true}'`, then diffs the
manifest `imageHash`. A diff means the fixture's appearance depends on CSS
source order — flag it.

### 5. Component-explorer CLI feature request
Either of these would remove the need for the bisection driver to boot its own
rspack server (the expensive part — the bundle is identical for every probe):
- render input-matrix support (run one fixture across many `--input` values), and/or
- a `--server-url` attach mode so `render`/bisection can reuse an already-running
  `serve` instance.

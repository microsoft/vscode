# OSS Contributions Batch Plan

## Triage Summary

Scanned 12 "good first issue" issues across 8 projects. After checking for assignees, competing PRs, and feasibility, **4 issues are viable** and **8 should be skipped**.

### Dropped Issues (already taken or too crowded)

| Issue | Reason |
|-------|--------|
| TypeScript #37782 | 5 closed PRs — heavily attempted, complex scope |
| Grafana #120727 | 2 open competing PRs (#120739, #120734) |
| Grafana #119789 | 2 open competing PRs (#121269 updated today, #119902) |
| Bitwarden #12439 | Open PR #19216 in active development |
| Directus #22416 | Assigned to `ngotuanthanh299-hue` + open PR #26937 |
| Appwrite #8659 | Assigned to `DH-555` with 4 linked PRs |
| Prisma #8548 | 4 open competing PRs (#29299, #29373, #29245, #28974) |
| Mattermost #21901 | Go codebase (not TypeScript); 2 closed PRs already attempted |

---

## Viable Issues — Implementation Plans

### 1. TypeScript #20183 — Sort JSDoc parameter suggestions by argument position

**Repo:** `microsoft/TypeScript`
**Issue:** https://github.com/microsoft/TypeScript/issues/20183
**Labels:** Good First Issue, Help Wanted, Domain: LS: Completion Lists
**Competing PRs:** None (0 PRs in 9 years!)
**Language:** TypeScript

#### Problem
When writing JSDoc `@param`, the completions for parameter names are sorted alphabetically instead of by their position in the function signature.

```ts
/**
 * @param |   <-- completions show: a, z (alphabetical)
 */
function foo(z, a) {}
```

**Expected:** `z` first, then `a` (matching function parameter order via `sortText`).

#### Root Cause
The completion entries for JSDoc `@param` tags all use the same `sortText: "0"`, so VS Code sorts them alphabetically by name.

#### Fix Strategy
1. Find the JSDoc parameter completion provider in the TypeScript compiler services
2. Look for where completions are generated for `@param` tags
3. Set `sortText` to the parameter's index (e.g., `"0"`, `"1"`, `"2"`) instead of a fixed `"0"` for all

#### Key Files (expected)
- `src/services/completions.ts` — main completions logic
- `src/services/jsDoc.ts` — JSDoc-specific helpers
- Look for functions that produce `CompletionEntry` objects with `kind === "parameter"`

#### Testing
- Add/update fourslash tests (TypeScript's test framework)
- Test file: create `tests/cases/fourslash/jsdocParameterSortOrder.ts`
- Verify parameter order in multi-param functions, rest params, destructured params

#### Estimated Complexity
Low — changing a `sortText` value from fixed to index-based.

---

### 2. Bitwarden #17810 — Vertical misalignment of "Beta" badge

**Repo:** `bitwarden/clients`
**Issue:** https://github.com/bitwarden/clients/issues/17810
**Labels:** bug, good first issue, browser
**Competing PRs:** None
**Language:** TypeScript/Angular, SCSS

#### Problem
In Settings → Appearance, the "Beta" badge next to "Compact mode" checkbox is vertically misaligned — it doesn't sit on the same baseline as the checkbox text. Also, the row is too close to the "Extension width" component above it.

#### Fix Strategy
1. Find the Appearance settings component in the browser extension
2. Locate the "Compact mode" row with the "Beta" badge
3. Fix CSS: ensure `vertical-align: middle` or use flexbox `align-items: center` on the row
4. Add appropriate `margin-top` or `gap` to separate it from the "Extension width" component above

#### Key Files (expected)
- Search for "compact" or "compactMode" in `apps/browser/` or `apps/desktop/`
- Look in settings/appearance component templates (`.html`) and styles (`.scss`)
- Badge component may be in `libs/components/`

#### Testing
- Visual verification in browser extension
- Check alignment with badge visible and hidden states
- Test in multiple browsers (Chrome, Firefox)

#### Estimated Complexity
Low — CSS alignment fix.

---

### 3. Directus #24803 — Decimal input shows wrong separator

**Repo:** `directus/directus`
**Issue:** https://github.com/directus/directus/issues/24803
**Labels:** Bug, Good First Issue, Studio
**Competing PRs:** 2 closed (both failed) — #26897 and #26685
**Language:** TypeScript/Vue.js

#### Problem
When editing a Decimal field, the input shows the value with locale-specific separator (e.g., `300,44` for Belgian locale) even though:
- The API returns `300.44` (correct)
- The overview list shows `300.44` (correct)
- The user's browser and Directus profile are set to `en-US`

The input's `type="text"` combined with `toLocaleString()` or similar is using the OS locale instead of the user's configured locale.

#### Why Previous PRs Failed
- PR #26897 (closed): Approach was "normalize decimal separator in v-input display value"
- PR #26685 (closed): Similar approach of normalizing in float input

Both likely failed because they treated the symptom (normalizing on display) rather than using the correct locale from Directus user settings.

#### Fix Strategy
1. Find the decimal/float input component in `app/src/` (likely `v-input` or `interface-input`)
2. Identify where the value is formatted for display — look for `toLocaleString()`, `Intl.NumberFormat`, or native `<input type="number">` behavior
3. The fix should use the user's configured Directus language (from user store/settings) as the locale for formatting, NOT `navigator.language` or OS locale
4. Ensure the value roundtrips correctly: display `300.44` → user edits → save `300.44`

#### Key Files (expected)
- `app/src/interfaces/input/input.vue` — likely the decimal input interface
- `app/src/composables/use-locale.*` — locale helper
- `packages/data/src/types/` — field type definitions

#### Testing
- Set OS locale to a comma-decimal locale (e.g., `nl-BE`, `de-DE`)
- Set Directus user profile to `en-US`
- Create a decimal field, enter `300.44`, save
- Re-open the record — should display `300.44`, not `300,44`

#### Estimated Complexity
Medium — requires understanding Directus's locale system and input component architecture. Previous PRs failed, so care needed.

---

### 4. Logseq #9515 — Inappropriate alignment for numbered list

**Repo:** `logseq/logseq`
**Issue:** https://github.com/logseq/logseq/issues/9515
**Labels:** enhancement, good first issue, css
**Competing PRs:** 1 open but stale (#9574 from May 2023, likely abandoned)
**Language:** ClojureScript, CSS

#### Problem
In numbered lists, the numbers are left-aligned to the first character position. As numbers grow (10+, 100+), the number gets too close to the content. Numbers should be right-aligned to the dot `.` with consistent spacing.

Current:
```
1. Content
2. Content
...
10. Content   ← "10." overlaps with content
100. Content  ← even worse
```

Expected:
```
  1. Content
  2. Content
...
 10. Content
100. Content
```

#### Fix Strategy
1. Find the CSS for ordered lists in Logseq's styles
2. Change from default `list-style-position: inside` (or equivalent) to proper `list-style-position: outside`
3. Or use CSS counters with `text-align: right` on the `::before` pseudo-element
4. Ensure consistent padding/margin between number and content

#### Key Files (expected)
- `src/main/frontend/` — look for CSS/SCSS files with `.ls-block` or `ol` styles
- `resources/css/` or `style/` — global stylesheet
- Search for `order-list`, `numbered`, or `list-style` in CSS files

#### Testing
- Create a numbered list with 100+ items
- Verify alignment at 1, 10, 100
- Check nested numbered lists
- Verify no regression in bullet lists

#### Estimated Complexity
Low — CSS-only change, but needs to handle the ClojureScript block structure.

---

## Execution Order (recommended)

| Priority | Issue | Reason |
|----------|-------|--------|
| 1 | **TypeScript #20183** | Zero competition, high visibility, clean scope |
| 2 | **Bitwarden #17810** | No competition, trivial CSS fix, good portfolio piece |
| 3 | **Logseq #9515** | CSS fix, existing PR is stale (3 years), clear improvement |
| 4 | **Directus #24803** | Medium difficulty, 2 failed PRs = we need to be smarter |

## Pre-requisites for Each

| Project | Fork | Clone | Build System | Test Command |
|---------|------|-------|-------------|-------------|
| TypeScript | `Vi-Ku/TypeScript` | `~/oss/TypeScript` | `npx hereby` | `npx hereby runtests` / fourslash |
| Bitwarden | `Vi-Ku/clients` | `~/oss/bitwarden-clients` | `npm ci` | `npm test` |
| Logseq | `Vi-Ku/logseq` | `~/oss/logseq` | `yarn install` | Visual testing |
| Directus | `Vi-Ku/directus` | `~/oss/directus` | `pnpm install` | `pnpm test` |

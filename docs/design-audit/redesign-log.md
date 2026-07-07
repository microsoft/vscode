# Design-match log — Abstract UI Redesign (plans 21-25)

Scores each built surface against its region of the companion pixels
`Abstract - UI Redesign.dc.html` (claude.ai/design project
`d198ca07-9eef-4d05-96e1-b383e6c19c03`), using the Part B tokens + Part C px specs in
`docs/plans/20-abstract-ui-redesign-handoff.md` as the rubric.

Reuse the conventions from the existing `docs/design-audit/` logs (v2/v3/v4): per-surface score,
a short gap backlog, and the iteration that closed each gap.

> The per-iteration PRs below carry the before/after + comp side-by-side images. The work landed on
> `main` via the three re-land PRs (#81 plan 21, #82 plans 22-24, #83 plan 25) after a stacked-merge
> mishap, plus #85 for the rails-are-editor-companions follow-up. **0 new core patches** across the
> whole redesign (the predicted plan-25 nav core seam needed none - the 76px activity-bar width
> already existed).

| Surface (plan / iter) | Comp region | Baseline % | Final % | PR | Notes |
|---|---|---|---|---|---|
| Provenance gutter (21 i1) | Editor gutter (30px column, 9px dot, 3px bar) | ~60 | 94 | #66 | Real reserved gutter column; prose never shifts; hover opens source-peek. -6 = reading ramp (i2). |
| Reading ramp 4b sans (21 i2) | Editor reading column | ~85 | 97 | #67 | H1 30/1.12/600/-0.02em, H2 16/1.3/600, body 15.5/1.7; 720px column. -3 = system-ui vs the comp webfont (handoff accepts system-ui). |
| Skill composer (21 i3) | Chat composer | n/a | 87 | #68 | + Skill + @ Mention + accent send, reusing the existing skill list + run path; rail stays 3 tabs. -13 = plan-18 working-set chrome absent from the comp clip (diminishing returns). |
| Home: NEEDS YOU (22 i1) | Home dashboard | n/a | 93 | #69 | Greeting + NEEDS YOU cards from real `pendingCount`; hidden when in sync. |
| Home: ALL PROJECTS grid (22 i2) | Home dashboard | n/a | 88 | #70 | Avatar + name + health badge + mono counts, real (current folder) + recent folders; empty state. -12 = single-project full-width tile (diminishing returns). |
| ISMS sample project (23 i1) | n/a (data) | n/a | data | #71 | 14 real ISMS docs + transcript + schema-matched bindings; `summariseProjectRun` selector. |
| Project-run scaffold (23 i2) | ISMS fan-out shell | n/a | 92 | #72 | `project-run` screen + command strip + truthful idle + Agents entry + route stub. |
| Swarm grid + totals (23 i3) | ISMS fan-out (swarm) | n/a | 93 | #73 | 4-col live per-doc status + progress + real bottom-bar totals (matched the rail exactly). |
| Decisions column (23 i4) | ISMS fan-out (decisions) | n/a | 93 | #74 | Real transcript source lines threaded through `IProposedChange`; `groupDecisions`; truthful degrade. |
| Cross-doc review screen (24 i1) | Cross-doc review | n/a | 93 | #75 | 292px doc-nav rail + change cards (source chip + confidence chip) from real pending; read-only. |
| Review actions (24 i2) | Cross-doc review | n/a | 92 | #76 | Accept/Reject/Tweak + sticky bar drive the existing engine; rail + C6 stay in sync; end state. |
| Wire entry + E2E (24 i3) | Cross-doc review | n/a | 93 | #77 | "Review across the project" opens the screen on the first changed doc; full E2E. |
| 76px labeled nav (25 i1) | Icon-nav (C1) | ~48px unlabeled | 93 | #78 | 76px labeled bar, order Home Editor Templates Knowledge Agents; Editor opens last doc/picker. D25-A: 0 new core. |
| Active chip + pins + tidy (25 i2) | Icon-nav (C1) | n/a | 93 | #79 | Active white-chip tracks the surface; account/settings bottom-pinned; tidied to the comp's 5 items. |
| Regression + polish (25 i3) | Icon-nav (C1) | 93 | 96 | #80 | Sweep clean at 76px (rails 264/392 intact); both logged gaps closed in CSS; desktop smoke deferred. |
| Rails are editor companions (post) | Shell (C1) | n/a | n/a | #85 | Both rails hidden on the screen surfaces, shown only on the editor surface; verified live. |
| Review framing line (31 i2) | Proposal region (C2) | n/a | not live-verified | (this PR) | Inline widget + rail + cross-doc cards share one `reviewFraming`: kind tag, `● High` / `◐ Inferred` chip, rationale, source chip - built per the C2 spec order. Design-match >= 90% could NOT be scored: the web bundle will not build in this environment (`esbuild` absent from node_modules), so the live widget could not be rendered against the comp. Structure + strings unit-verified; honest blocker at `docs/plans/31-verify/README.md`. |

## Per-surface gap backlogs

### Provenance gutter (plan 21 iter 1) — final 94%

Closed this iteration:
- 30px `flex:none` gutter column left of the 720px reading column; prose never shifts when markers toggle (verified: prose text left edge identical across plain / bound / edited paragraphs).
- 9px accent dot (`oklch(0.55 0.13 255)`) vertically centred on a source-bound line (was an 8px dot at `left:-20px` in the prose padding).
- 3px attention bar (`oklch(0.66 0.16 45)`) spanning the rows of a multi-line edited paragraph (was absent).
- Hover a marker → source-peek drawer (same `reveal` message the bound figure fires; was not wired).
- No line numbers anywhere.

Remaining gap:
- Reading type ramp: closed in plan 21 iteration 2 (#67, 97%).
- A *bound* multi-line paragraph under a pending edit uses the edit-widget bar (not a node-anchored bar) because PM reports an atom's label as empty text; acceptable and matches how the inline edit widget already anchors. No visible gap.

### Recurring cross-surface gaps (logged, not blocking)

- **Body font**: the live UI uses `system-ui`; the comp uses a loaded webfont (Instrument Sans). The handoff (4b) explicitly accepts `system-ui` as the shipping choice, so this small delta is intentional across every surface.
- **Home ALL PROJECTS** renders the single open project as a full-width tile (not a compact grid cell) because a folder is normally one project; the compact grid reads best with several. Truthful, diminishing returns.
- **Skill composer** carries the plan-18 working-set chips + attach row that the comp's minimal composer clip omits; these are real functional additions, not style drift.

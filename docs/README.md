# Living Documents / Opportunity OS — research-spike documentation

This `docs/` folder captures **everything** about the VS Code-fork spike for "Opportunity OS"
(a.k.a. "Living Documents" / "Agentic Workbench"): what it is, what we built, what we learned,
what is likely to become problematic, the open decisions, and the design intent.

> **This is a throwaway research spike.** The code will be discarded; this documentation is the
> thing worth keeping. It exists so the thinking can be picked up later — whether we continue on
> the fork or start greenfield. Treat every claim here as "true as of the spike," not as product
> commitment.

## Read in this order

| Doc | What it covers |
|---|---|
| [00-overview.md](00-overview.md) | The product idea, the defensible wedge, why VS Code, what the spike was for |
| [01-architecture.md](01-architecture.md) | How the code is structured, the core loop, the reuse map, file formats |
| [02-what-we-built.md](02-what-we-built.md) | Items 0-5 in detail: what each did, status, how verified |
| [03-learnings.md](03-learnings.md) | What worked, what didn't, surprises — engine vs shell |
| [04-risks-and-predictions.md](04-risks-and-predictions.md) | What will get painful: technical debt, scaling, the strategic risk |
| [05-open-questions.md](05-open-questions.md) | Unresolved decisions: file format, editor maturity, **fork vs greenfield** |
| [06-design-notes.md](06-design-notes.md) | UI/UX intent vs reality: provenance gutter redesign, header issues, the calm shell |
| [07-decision-log.md](07-decision-log.md) | Decisions made during the spike, with rationale (ADR-style) |
| [08-living-documents-format-spec.md](08-living-documents-format-spec.md) | The raw-Markdown format + dependency model design spec (clean file + lock file); resolves Q1, with full decision log. Companion visual: [option-10-living-docs-format.html](option-10-living-docs-format.html) |
| [09-orchestration-and-automation.md](09-orchestration-and-automation.md) | How agents/skills run: trigger taxonomy, the graph-propagation rule, policy model, verify gate, and the LangChain/LangGraph-vs-built-in tech-stack call. Companion visual: [orchestration-automations.html](orchestration-automations.html) |
| [10-model-integration.md](10-model-integration.md) | How the agentic features became model-backed: the localhost Anthropic OAuth proxy (credential server-side, no CSP changes), the service wiring, request shape, config, the no-model fallback, and the OpenRouter dev test backend. Live captures: [model-verify/](model-verify/) |
| [11-product-review-2026-07.md](11-product-review-2026-07.md) | The July 2026 full review: sweep of all 85 PRs/branches since the fork, honest surface-by-surface state, ranked findings (P0-P3) across usability/UI/performance/technical debt, and the suggested execution order for plans 26-33 |
| [12-north-star-and-future-features.md](12-north-star-and-future-features.md) | The north-star write-up of the AI-native word processor (narrative + binding principles) and the future-feature roadmap beyond plans 26-33: trust deepening, liveness, collaboration, platform |
| [lwd-pm-bundle-build.md](lwd-pm-bundle-build.md) | How to rebuild the vendored ProseMirror editor bundle (`prosemirrorBundle.ts`): the offline esbuild recipe + the full `lwdpm-entry.js` (incl. the `bound_figure` atom node, decision 46) and `build.mjs` sources, so the bundle is always reproducible |
| [plans/](plans/) | The handoff prompts that drove (and will drive) the work. The Abstract UI Redesign set (spec `plans/20`, build plans `21`-`25`) is **done**; the **live set is plans `26`-`33`** (history/undo, streaming, templates, knowledge/MCP, performance, review quality, orchestration, shell integrity), motivated by `11-product-review-2026-07.md`. |

## Status at a glance (2026-06-21)

- **Built:** items 0-5 (`living-docs-spike`, PR #1 -> `main`); the Studio de-IDE pass
  (`living-docs-studio`, PR #2 -> `main`); and a design-match + build-out round
  (`living-docs-design-match`) that implemented the rest of the Workbench comp — Home dashboard,
  Templates / Knowledge / Agents (with workflow canvas), the Present & export modal, the
  Chat / Review / History / Skills panel, and a clean icon nav. 15 unit tests passing.
- **Proven:** the engine (agent loop, figure-auto-apply / meaning-change-approve, provenance,
  multi-doc fan-out, live source kinds incl. a real HTTP API, export) **and** that the full hi-fi
  shell is reachable with **0 added core patches** (see [plans/03-merge-tax-ledger.md](plans/03-merge-tax-ledger.md)).
- **Decided:** the document format (Q1) — clean `<doc>.md` + generated `<doc>.lock.json` with a
  dependency graph; see [08-living-documents-format-spec.md](08-living-documents-format-spec.md).
- **Also built:** the clean-file + lock format and dependency graph (`living-docs-format`); the
  orchestration layer — triggers, graph event-bus, policy, verify gate (`living-docs-orchestration`);
  a design-audit round (`living-docs-design-audit`, PR #9); and **model-backed agentic features via a
  localhost Anthropic OAuth proxy** (`living-docs-model`, PR #11) — Review-impact rewrites and the
  Strategy grader now call Claude, with the no-model heuristic fallback intact. See
  [10-model-integration.md](10-model-integration.md).
- **Next phase (foundational):** implement that format + dependency graph — handoff
  [plans/06-format-implementation-handoff.md](plans/06-format-implementation-handoff.md).
- **Still open:** editor depth (Q2) and **fork vs greenfield** (Q3) — see
  [05-open-questions.md](05-open-questions.md). The chosen format is built to survive either.

# 12 - North star: the beautiful AI-native word processor (and what comes after)

This document writes down, in full, the product we are building towards, so that every future plan can be checked against it.
Section 1 is the north star as a narrative; section 2 grounds it in the principles the spike already proved; section 3 is the future-feature roadmap beyond the current plan set (plans 26-33); section 4 says what we will deliberately not build.
The current-state assessment that motivates this document is [11-product-review-2026-07.md](11-product-review-2026-07.md).

## 1. The north star, as a user would live it

Monday, 8:55am.
Priya runs operations at a 40-person company.
She opens Abstract and lands on Home: "Good morning, Priya. Two documents need you."
Overnight, the week-27 metrics landed in the finance sheet, and the agent already did the mechanical work: every figure in the Weekly Operating Summary is current, each one auto-applied, logged, and traceable.
What waits for her is only what deserves a human: the agent wants to change "churn remains elevated" to "churn has stabilised", and it shows her why - the source row, the trend, a one-line rationale, and a confidence tag.
She reads the diff in the document itself, exactly where it will land.
She tweaks one word, accepts, and moves on.
Ninety seconds after sitting down, the report is done, and the History rail records "Week-27 refresh · 11 figures auto-applied · 2 meaning changes approved by Priya".

Nothing about this felt technical.
There was no palette, no panes to arrange, no terminal, no YAML.
It felt like Google Docs, if Google Docs had a colleague who worked nights and showed receipts.

That is the product: **a word processor where documents are alive, and trust is the interface.**

The three sentences that define it:

1. **Documents stay bound to reality.** A number in a document is not a keystroke; it is a live reference to a cell, an API field, a CRM record. When reality changes, the document knows.
2. **An agent does the mechanical work; a human makes the meaning calls.** The figure/meaning boundary (auto-apply vs review) is the product's central mechanic, and it is policy the user can dial.
3. **Every change has a receipt.** Who/what changed it, from which source, when, and why - visible in the gutter, browsable in History, provable in the audit trail.

## 2. The principles (proven, now binding)

These emerged over decisions 1-68 and the redesign; new work must not regress them.

- **Calm by construction.** One document surface, no splits ever (G1, decisions 19/20/35). Layout is a product decision, not a user choice (decision 27). Colour only ever means something (Part B of [plans/20](plans/20-abstract-ui-redesign-handoff.md)).
- **One editor.** ProseMirror is the single surface for every `.md`, plain or living (decisions 49/53). "Living" is a badge, not a gate (decision 48).
- **The folder is the project** (decision 39). Files on disk, clean Markdown, a rebuildable lock sidecar ([08-living-documents-format-spec.md](08-living-documents-format-spec.md)). The user can always walk away with their documents.
- **Everything routes through the review engine** (decisions 17/45/52). Chat, skills, agents, fan-outs - one proposal model, one approve path, one audit trail. No second-class writes.
- **Real data only.** No fabricated counts, no fake versions, no dead buttons without a "Soon" label (plan 17's rule). The demo is the product.
- **Honest engineering economics.** Core patches are counted and fail-soft ([plans/03](plans/03-merge-tax-ledger.md)); features are built our-surface so they survive fork-vs-greenfield either way.

## 3. Future features (beyond plans 26-33)

Plans 26-33 complete the promised product (trust spine, streaming, templates, knowledge, scale, orchestration, shell polish).
What follows is the roadmap after that, grouped by the promise each feature deepens, roughly in dependency order within each group.
Effort keys: S = days, M = 1-2 weeks, L = multi-week.

### 3.1 Deepening trust (the wedge)

- **Semantic staleness (M).** Today a source edit flips a hash and flags every dependent doc. Grade the *salience* of the change (did a number the doc cites actually move?) so "may be affected" is rare and true (spec'd in doc 08 §3.6, deferred).
- **Point-in-time provenance (M).** Store the source value *as of* apply time in the lock (schema already carries `resolved`/`syncedAt`); source-peek gains a "then vs now" view, and a pinned/published doc can prove what it said when it said it.
- **Citations and claim coverage (L).** Extend the claims model (`IClaimEntry`) into a visible layer: any prose claim can be bound to a source with an inline citation chip; a "coverage" skill reports the percentage of quantitative claims that are source-backed. This is the auditor-grade story.
- **The numbers-audit skill (S).** A deterministic grader that recomputes every derived figure (percentages, deltas, sums) from the bound raw values and flags arithmetic drift. Deterministic-first, like the Financial skill (doc 09 §5).
- **Guardrail policies per document class (M).** "Board notes: nothing auto-applies." "Ops dashboard: figures auto-apply, prose drafts only." Policy templates on top of the per-edge policy engine (doc 09 §4), settable at template level.

### 3.2 Deepening liveness (the agent)

- **The inbox model / notifications (M).** Home's NEEDS YOU is the seed of an inbox. Add a cross-project attention queue, badge counts on the nav, and (desktop) OS notifications on heartbeat findings: "Week-28 data landed; Weekly Summary has 2 meaning changes waiting."
- **Chat over the audit trail (S).** A model tool that reads lock audit + snapshots so chat can answer "what changed in this doc last week and who approved it?" - the trust data becoming conversational.
- **Watch-mode agents on external events (M).** Webhook trigger kind (doc 09 taxonomy) so a CRM stage change or a form submission wakes the graph, not just file saves and cron.
- **Cross-source reconciliation (L).** When two bound sources disagree (the CRM says 412 customers, the billing export says 407), the agent raises a *conflict* proposal type with both provenances, instead of silently choosing one.
- **Drafting from meetings (M).** Bind a transcript folder as a source kind; the weekly report's "decisions" section derives from this week's transcripts with line-level provenance (the plan-23 decisions column already proves the UI grammar for this).

### 3.3 Deepening the word processor (the surface)

- **Comments and suggestions from people (L).** The review engine treats human collaborators as first-class proposal authors: a colleague's suggestion is a pending change with provenance "Sam, 3:12pm", reviewed in the same rail as agent changes. One review grammar for humans and agents is a genuine differentiator over Docs + a bolted-on AI.
- **Real-time co-editing (L).** The format spec's identity-keyed design is CRDT-ready (doc 08 §3.7). Sequence after comments; multiplayer without the review grammar would just be Docs again.
- **Tables as first-class living blocks (M).** GFM tables render today (plan 17); make table cells bindable (`[42k](bind:metrics.mrr)` in a cell), and let a whole table derive from a source query. The beachhead documents are full of tables.
- **Images and figures (M).** The PM bundle already carries a `bound_figure` atom; add image nodes with source-bound charts (a chart spec + bound data = a living chart, re-rendered on sync).
- **Document outline and long-doc ergonomics (S).** The tree-rail Outline tab exists; wire smooth scroll-sync, collapsible sections, and a reading-position memory. Board packs are long.
- **Export fidelity: Word and Google Docs (M).** Beachhead users must hand documents to people who live in Word. `.docx` export with provenance stripped (clean) or footnoted (audited) alongside the existing HTML/Markdown exports.
- **Present mode, real (S).** The `↗ Present` button becomes a full-screen, read-only, beautifully typeset render with a "verified as of <date>" footer - the audit trail as a presentation asset.

### 3.4 Deepening the platform (growth surface)

- **Template + skill sharing (M).** Templates and skills as files in the folder (consistent with folder-is-the-project), shareable as a directory; later, an org library in Knowledge.
- **A connector catalogue (L).** MCP makes every connector "someone else's server"; the product work is the catalogue UX, auth flows (plan 29's secret store), and per-connector provenance renderers (a CRM record peek looks different from a CSV row peek).
- **Abstract as an MCP server (M).** Expose documents, bindings and audit as MCP tools so *other* agents (Claude Code, a company's internal agents) can read/propose against Abstract documents - proposals landing, as ever, in the review rail.
- **Headless/CI mode (M).** `abstract verify <folder>` runs the graders and freshness checks in CI for teams who treat reports as build artefacts. The verify gate (doc 09 §5) already defines the semantics.

### 3.5 Sequencing sketch

1. **Trust deepening first** (3.1: semantic staleness, point-in-time provenance, numbers-audit) - it compounds the wedge and is mostly lock-schema work.
2. **Inbox + audit chat** (3.2) - makes the daily habit.
3. **Comments** (3.3) - the collaboration unlock, before multiplayer.
4. **Word export + present mode** (3.3) - required for real-world circulation of the beachhead documents.
5. **Platform** (3.4) - once 5-10 design partners are living in it.

## 4. What we deliberately do not build

- **A general chat assistant.** Chat exists to produce reviewable document changes, not to be a destination.
- **A no-code automation builder.** Triggers and policies stay a small, opinionated set (doc 09's taxonomy); Zapier is not the competition, trust is.
- **IDE affordances, ever.** No command palette, no split editors, no draggable layout - already removed at the source (decisions 30/31), and they stay removed.
- **A proprietary binary format.** The clean-Markdown-plus-lock contract (doc 08) is permanent; any richer canonical format must still flatten to portable Markdown in one click.

# Editor Intelligence

> CodeLens, hover, decorations, inline suggestions, and diagnostics — three-universe intelligence in the editor.

## Desired Outcome
The code editor itself becomes narrative-aware — showing universe insights as CodeLens above functions, providing narrative context on hover, decorating files with coherence indicators, offering three-universe inline suggestions, and surfacing diagnostic messages from all three lenses.

## Current Reality
VS Code editor has standard CodeLens (for references/tests), hover (for types/docs), and diagnostics (for errors/warnings). None are narrative-aware.

## Structural Tension
The editor is where developers spend most of their time. Bringing three-universe intelligence directly into the editor surface makes it ambient and effortless.

---

## Components

### NarrativeCodeLens
CodeLens provider for three-universe annotations.
- **Behavior:** Register a `CodeLensProvider` that adds lenses above functions, classes, and significant code blocks:
  - `🔧 Engineer: {analysis}` — Technical quality insight
  - `🌿 Ceremony: {analysis}` — Relational accountability insight
  - `📖 Story: {analysis}` — Narrative coherence insight
  - Lenses clickable: opens full analysis in agent panel
  - Analysis results cached per file, invalidated on save
  - Respects `mia.decorations.level` setting: minimal (functions only), moderate (functions + classes), rich (all significant blocks)

### NarrativeHover
Hover provider for narrative context.
- **Behavior:** Register a `HoverProvider` that augments standard hover with:
  - **File-level**: Hover over file name in breadcrumb → shows file's narrative role (if analyzed)
  - **Symbol-level**: Hover over function/class → shows last three-universe analysis snippet
  - **STC reference**: Hover over `// STC: chart-id` comments → shows chart progress inline
  - Hover content rendered as markdown with universe-colored headers

### InlineAnnotations
Editor decorations for narrative indicators.
- **Behavior:** Register `TextEditorDecorationType` decorations:
  - **File gutter**: Small colored dot (blue/green/purple) indicating which universe has the most relevant insight for each code section
  - **Line-end annotations**: Faded inline text showing significance score for changed lines (like Git blame but for narrative significance)
  - **Block highlights**: Subtle background tint for code blocks with active three-universe analysis
  - All decorations togglable via `mia.decorations.enabled` setting

### ThreeUniverseInlineCompletion
Inline completion provider.
- **Behavior:** Register `InlineCompletionItemProvider` that provides code completions informed by three-universe analysis:
  - Completions annotated with which universe informed the suggestion
  - Engineer completions: technically optimal, performance-focused
  - Ceremony completions: following established patterns, respecting conventions
  - Story completions: maintaining narrative coherence of the codebase's story
  - Triggered on explicit request (`mia.quickAnalysis` keybinding) — not on every keystroke

### ThreeUniverseDiagnostics
Diagnostic collection for universe insights.
- **Behavior:** Register a `DiagnosticCollection` named `mia`:
  - Severity levels map to significance: Error (significance ≥ 4), Warning (≥ 2), Information (≥ 1)
  - Each diagnostic tagged with source universe: `mia-engineer`, `mia-ceremony`, `mia-story`
  - Code actions provided via `CodeActionProvider`:
    - "Show full analysis" → opens agent panel with detail
    - "Create chart from issue" → creates STC chart from the diagnostic
    - "Dismiss" → suppresses this diagnostic for the file
  - Diagnostics refreshed on file save when `mia.autoAnalyze` is enabled

---

## Creative Advancement Scenario: Narrative-Aware Editing

**Desired Outcome**: Developer writes code with ambient three-universe awareness
**Current Reality**: Editor shows only syntax and type information
**Natural Progression**:
  1. Developer opens a file that has been analyzed
  2. CodeLens shows universe insights above key functions
  3. Hovering reveals narrative context alongside type information
  4. Gutter dots indicate which sections have active insights
  5. Diagnostics panel shows universe observations alongside TypeScript errors
**Resolution**: Code editing is enriched with narrative intelligence without interrupting flow

---

## Supporting Structures
- Extension directory: `extensions/mia-editor-intelligence/`
- Activation: `onLanguage:*` (all languages)
- Depends on: `mia.three-universe` (shared API, analysis results cache)
- Analysis results fetched from server or cache — never blocks editor rendering
- Fulfills: `mia-code-server/rispecs/agentic-ide/02-inline-suggestions`, `05-file-decorations`, `08-diagnostic-provider`, `mia-vscode/05-editor-overlays`

# Extension API Limitations Assessment

Assessment of `extensions/son-of-anton/docs/extension-api-limitations.md` for Phase 2 fork modifications.

**Date:** 2026-03-08
**Assessed against:** VS Code 1.96+ API surface

---

## 1. Inline Diff Overlay with Accept/Reject

**Status:** Needed
**Tier:** Tier 2
**Rationale:** The inline chat diff experience (introduced by Copilot) is still not exposed as a public extension API. The `InlineChatController` and related diff widgets are internal. Our agents produce code changes that need accept/reject inline — the notification dialog workaround is unacceptable UX for a production editor.
**Decision:** Implement as Tier 2 — add hooks into the editor diff rendering system to support agent-proposed changes as first-class diffs. See `docs/modifications/tier2-inline-diff.md`.

---

## 2. Real-time Streaming in Editor Decorations

**Status:** Nice-to-have
**Tier:** N/A (defer)
**Rationale:** While `InlineCompletionItemProvider` still does not support streaming, VS Code 1.96 added improvements to the inline completions API. The current workaround (stream to chat panel, show full completion in editor) is acceptable. Streaming into the editor is a polish item, not a blocker.
**Decision:** Defer. Revisit after the core fork modifications are stable.

---

## 3. Custom Activity Bar Icon with Dynamic Badge

**Status:** Not needed
**Tier:** N/A
**Rationale:** The `vs/sessions` layer provides its own dedicated window with a custom layout. The activity bar icon limitation only matters in the standard workbench, which is secondary to the sessions window. The status bar workaround is sufficient for the standard workbench.
**Decision:** Skip. Not worth the merge cost.

---

## 4. Editor Gutter Annotations for Agent Activity

**Status:** Nice-to-have
**Tier:** Tier 2 (if implemented)
**Rationale:** Per-line agent attribution is valuable for trust and traceability, but the CodeLens workaround is functional. This is a UX improvement, not a capability blocker.
**Decision:** Defer to a future iteration. The CodeLens approach works for now.

---

## 5. Terminal Output Capture

**Status:** Needed
**Tier:** Tier 2
**Rationale:** `window.onDidWriteTerminalData` is still a proposed API. Agents need real-time terminal output for test runners, build tools, and deployment scripts. The `child_process` workaround creates a dual execution path that is confusing and error-prone. Having a structured terminal output stream accessible from the agent system is critical for the sandbox execution model.
**Decision:** Implement as Tier 2 — add event emitters in the terminal contrib that expose structured output. See `docs/modifications/tier2-terminal-output.md`.

---

## 6. Webview Panel Positioning

**Status:** Not needed
**Tier:** N/A
**Rationale:** The `vs/sessions` layer solves this entirely. It provides a dedicated agentic workbench with custom panel positions (chatBarPart, projectBarPart, etc.). The standard workbench panel positioning limitation is no longer relevant.
**Decision:** Skip. Solved by the sessions layer architecture.

---

## Summary

| # | Limitation | Vote | Tier | Action |
|---|-----------|------|------|--------|
| 1 | Inline diff overlay | Needed | Tier 2 | Implement |
| 2 | Streaming decorations | Nice-to-have | — | Defer |
| 3 | Dynamic activity bar badge | Not needed | — | Skip |
| 4 | Gutter annotations | Nice-to-have | — | Defer |
| 5 | Terminal output capture | Needed | Tier 2 | Implement |
| 6 | Panel positioning | Not needed | — | Solved by sessions |

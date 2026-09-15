# 18 — Enforce Issue Wizard stage handoffs

**What to build:** Make the bundled Issue Wizard skill enforce a clear intake → investigation → user-directed next-step flow, with structured handoffs that keep later routes from repeating completed work or starting diagnostics and source setup too early.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** ready-for-agent

- [ ] The bundled Issue Wizard skill is the single source of truth for orchestration across support outcomes.
- [ ] Stage 1 gathers a concise problem brief containing actual and expected behavior plus the triggering action when known; reproduction frequency or persistence may remain unknown when they are not needed to begin investigating.
- [ ] Diagnostic tools are not invoked until actual and expected behavior are understood; an adequate description or screenshot completes intake without forcing another question or reproduction.
- [ ] Stage 2 produces an investigation summary containing collected evidence, the likely owner or cause, confidence, and unresolved questions.
- [ ] After Stage 2, the agent first applies a supported setting, update, or extension outcome when evidence warrants it; otherwise it routes to an issue or a user-approved source fix.
- [ ] Source setup begins only when the evidence indicates a credible VS Code bug and the user explicitly chooses the source-fix route.
- [ ] The source-fix route invokes the bundled `vscode-bug-fix` skill with the structured problem brief and investigation summary, and does not repeat satisfied intake.
- [ ] Transcript and tool-order evaluations cover vague initial reports, screenshot-assisted intake, already-sufficient reproduction, declined diagnostics, cheap setting and update outcomes, the issue route, and the source-fix route.
- [ ] The MVP uses explicit skill contracts and evaluations rather than a host-side phase state machine.
- [ ] One implementation session owns edits to `src/vs/workbench/contrib/chat/common/promptSyntax/builtinSkills/issue-wizard/SKILL.md`; parallel route work must avoid editing that file.

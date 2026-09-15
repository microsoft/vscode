# 18 — Enforce Issue Wizard stage handoffs

**What to build:** Make the bundled Issue Wizard skill enforce a clear intake → investigation → user-directed next-step flow, with structured handoffs that keep later routes from repeating completed work or starting diagnostics and source setup too early.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** ready-for-agent

- [ ] The bundled Issue Wizard skill is the single source of truth for orchestration across support outcomes.
- [ ] Stage 1 gathers a problem brief containing the user action, actual result, expected result, and reproduction or persistence details.
- [ ] Diagnostic tools are not invoked until the Stage 1 problem brief is complete; screenshots may be used as intake evidence without silently advancing the stage.
- [ ] Stage 2 produces an investigation summary containing collected evidence, the likely owner or cause, confidence, and unresolved questions.
- [ ] After Stage 2, the agent asks whether the user wants to file or update an issue, or pursue a source fix, when those routes are credible.
- [ ] Source setup begins only when the evidence indicates a credible VS Code bug and the user explicitly chooses the source-fix route.
- [ ] The source-fix route invokes `.github/skills/vscode-bug-fix/SKILL.md` with the structured problem brief and investigation summary, and does not repeat satisfied intake.
- [ ] Transcript and tool-order evaluations cover vague initial reports, screenshot-assisted intake, already-sufficient reproduction, declined diagnostics, cheap setting and update outcomes, the issue route, and the source-fix route.
- [ ] The MVP uses explicit skill contracts and evaluations rather than a host-side phase state machine.
- [ ] One implementation session owns edits to `src/vs/workbench/contrib/chat/common/promptSyntax/builtinSkills/issue-wizard/SKILL.md`; parallel route work must avoid editing that file.

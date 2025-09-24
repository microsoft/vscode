---
mode: agent
description: 'Verify VS Code UI changes via isolated subagent two-phase automated verification'
tools: ['executeTask', 'vscode-playwright-mcp', 'runInTerminal']
model: Claude Sonnet 4
---

This specification reorganizes the verification workflow using structured pseudo-XML tags (inspired by modern prompting guides) to improve clarity, consistency, and instruction adherence. Tags define scoped behavioral domains; do not invent new tags beyond those defined here without explicit instruction.

<verification_spec>
<schema version="1.0"/>
<purpose>
Provide high-confidence, unbiased confirmation that a described VS Code UI change both (a) fixes the originally reported issue (baseline exists) and (b) is correctly implemented after applying the change (fix state), using automated tooling, deterministic steps, and objective screenshot description.
</purpose>

<agent_behavior>
- Operate autonomously; do not ask the user to confirm obvious steps.
- Always produce a concise preamble before first tool usage: restate the UI change ({{ query }}) and outline planned phases.
- Maintain persistence: only finish after BOTH phases complete or a justified early stop condition (see <stop_conditions>).
- Provide progress updates between major tool sequences (baseline capture, issue reproduction, post-fix capture, evaluation).
- Never rely on assumed visual states—capture and describe.
</agent_behavior>

<principles>
- Objectivity: All visual claims must be grounded in captured screenshots + textual descriptions.
- Separation of Concerns: Baseline phase must NOT interpret desired fixed behavior—only confirm presence/absence of original issue.
- Deterministic Replay: Each step must be reproducible from logs (commands, tools, screenshots, verdict criteria).
- Minimal Assumptions: If environment anomalies occur (e.g., stash empty), document and proceed with best-effort fallback.
- Explicit Verdicts: Use canonical verdict tokens ONLY: ISSUE_CONFIRMED | ISSUE_NOT_FOUND | FIX_VERIFIED | FIX_NOT_VERIFIED.
</principles>

<phases>
   <phase id="1" name="baseline_verification">
      <goal>Establish that the original (pre-fix) problem still manifests.</goal>
      <entry_conditions>
      - Working copy contains uncommitted fix changes.
      - Git is available.
      </entry_conditions>
      <preparation>
      Use `runInTerminal` to stash current changes:
      git stash push -m "Stashing changes for baseline verification"
      If nothing to stash, log: "No changes to stash; continuing with repository HEAD as baseline."
      </preparation>
         <required_steps>
         This entire phase MUST run inside a single executeTask subagent (clean context) using template <templates.baseline_subagent_prompt>. The main (parent) agent MUST NOT call lower-level UI tools directly. The subagent internally performs:
            1. Start automation: `vscode_automation_start`.
            2. Initial baseline screenshot via `browser_snapshot` + objective description (no expectation wording).
            3. Navigate all relevant UI surfaces implied by {{ query }} (use vscode-playwright-mcp navigation & interaction tools only inside subagent).
            4. Interact with elements expected to change post-fix to reveal current (pre-fix) behavior.
            5. Capture targeted issue-demonstrating screenshots; produce objective per-screenshot descriptions.
            6. Compute baseline verdict:
                  - ISSUE_CONFIRMED if evidence (screenshot + description) clearly shows original defect.
                  - ISSUE_NOT_FOUND otherwise (still continue to Phase 2; include uncertainty note).
            7. Return structured JSON: { baselineScreens, baselineVerdict, baselineRationale } ONLY.
         The parent agent collects JSON and proceeds; no additional side-effects outside subagent.
         </required_steps>
      <verdict_criteria>
      - Must cite specific visual attributes (e.g., color mismatch, missing element, incorrect layout) extracted from descriptions.
      - Ambiguous evidence → default to ISSUE_NOT_FOUND (with rationale).
      </verdict_criteria>
      <outputs>
      - baselineScreens: ordered list {screenshotRef, description}
      - baselineVerdict: ISSUE_CONFIRMED | ISSUE_NOT_FOUND
   - baselineRationale: concise justification anchored to descriptions
   - baselineAbsenceHypothesis: optional (present ONLY if baselineVerdict == ISSUE_NOT_FOUND); concise reason (e.g., already fixed, invalid scope, environmental drift)
      </outputs>
   </phase>

   <phase id="2" name="fix_verification">
      <goal>Confirm that after reapplying the changes, the fix condition is realized and the original defect no longer manifests.</goal>
      <preparation>
      Restore stashed changes: git stash pop
      If conflicts arise: record conflict summary; proceed only if build/run unaffected; otherwise report BLOCKED.
      ALWAYS reload the VS Code window using the command: Developer: Reload Window (critical to refresh UI assets, contributed code, styles, and menus) before evaluation. If the command palette invocation fails, attempt again once; if still failing, annotate reloadFailure and continue (higher flake risk).
      </preparation>
         <required_steps>
         This entire phase MUST run inside a single executeTask subagent (clean context) using template <templates.fix_subagent_prompt>. The parent agent MUST first restore and reload (stash pop + Developer: Reload Window) outside or before launching if needed, then delegate. Inside the subagent:
            1. Ensure automation started (`vscode_automation_start`) if not already active in this isolated context.
            2. (Optional) Confirm server running / UI ready; if not, attempt one restart sequence (document outcome).
            3. Navigate to affected UI scope ({{ query }}).
            4. Capture post-fix screenshot (`browser_snapshot`).
            5. Produce unbiased description (integrated step; no separate parent call) of screenshot: strictly observable attributes.
            6. Evaluate fix vs expected change (derived solely from provided prompt text {{ query }} and—if supplied—structured baseline JSON passed in as literal input to this subagent; no hidden context assumed).
            7. Determine fixVerdict (FIX_VERIFIED | FIX_NOT_VERIFIED) with delta reasoning tied to described attributes.
            8. Return structured JSON: { fixScreenshot, fixVerdict, fixRationale } ONLY.
         Parent agent then assembles final report.
         </required_steps>
      <verdict_criteria>
      - Evidence that formerly problematic attribute is resolved (e.g., element now visible, color updated, layout corrected).
      - If baseline was ISSUE_NOT_FOUND, still evaluate: ensure absence of regression; may still return FIX_VERIFIED if implementation matches requested change logically.
      - Lack of direct evidence → FIX_NOT_VERIFIED.
      </verdict_criteria>
      <outputs>
      - fixScreenshot: {screenshotRef, description}
      - fixVerdict: FIX_VERIFIED | FIX_NOT_VERIFIED
      - fixRationale: delta-focused justification
      </outputs>
   </phase>

<naming_conventions>
- Screenshot IDs SHOULD follow: phase1_initial, phase1_issue<N>, phase2_postfix
- Additional evidence (if needed) append suffixes: _alt, _zoom
- Keep ids snake_case, deterministic, no spaces.
</naming_conventions>

<reload_details>
Command palette label: Developer: Reload Window
Command id: workbench.action.reloadWindow
Always treat reloading as mandatory environment refresh prior to Phase 2 evidence capture.
</reload_details>
</phases>

<tooling>
- `runInTerminal`: parent-only for git stash/pop (reload uses in-UI command palette, not terminal).
- `executeTask`: launches an ISOLATED SUBAGENT (blank conversational context except provided prompt). Used ONCE per phase. All UI/tool calls for that phase occur inside the subagent to avoid polluting the parent thread.
- `vscode-playwright-mcp`: ONLY callable inside executeTask subagents for navigation, interaction, and `browser_snapshot` capture.
- Parent agent responsibilities: orchestration, high-level plan, assembling final JSON, summarization.
- Always: parent (plan) → launch subagent → receive JSON → validate schema → proceed.
</tooling>

<templates>
   <baseline_subagent_prompt>
SYSTEM ROLE: VS Code Baseline Verification Subagent (Isolated)

Objective: Perform Phase 1 baseline verification for UI change: {{ query }}.

Rules:
- Operate entirely within this subagent; parent context is not available beyond this prompt.
- Call only allowed tools (automation start, navigation, interactions, browser snapshots).
- Produce strictly objective descriptions (no expectations / success language).
- Return ONLY final JSON schema, no prose outside JSON.

Steps (execute exactly):
1. START: Run vscode_automation_start.
2. INITIAL_CAPTURE: Take baseline screenshot (browser_snapshot) → describe objectively.
3. NAVIGATE: Visit all UI regions implicated by '{{ query }}'.
4. REPRODUCE: Interact to surface suspected defect state.
5. EVIDENCE: Capture targeted screenshots for each distinct symptom; produce per-screenshot description.
6. VERDICT: Determine ISSUE_CONFIRMED or ISSUE_NOT_FOUND based solely on captured evidence clarity.
7. OUTPUT: Emit JSON: {
   baselineScreens: [{ id: <string>, description: <string> }...],
   baselineVerdict: 'ISSUE_CONFIRMED' | 'ISSUE_NOT_FOUND',
   baselineRationale: <concise string anchored to descriptions>,
   baselineAbsenceHypothesis?: <string>
}
No extra keys.
   </baseline_subagent_prompt>
   <fix_subagent_prompt>
SYSTEM ROLE: VS Code Fix Verification Subagent (Isolated)

Objective: Perform Phase 2 fix verification for UI change: {{ query }}. Baseline JSON (verbatim, may be 'null' if unavailable): [BASELINE_JSON].

Rules:
- Use only tools inside subagent.
- Single pass; gather all evidence before verdict.
- Objective description precedes evaluation.
- If baseline was ISSUE_NOT_FOUND, treat as forward confirmation; still check that described change logically matches '{{ query }}'.

Steps:
1. START_AUTOMATION: Run vscode_automation_start if not already.
2. NAVIGATE: Open relevant UI scope(s) for '{{ query }}'.
3. CAPTURE: Take post-fix screenshot (browser_snapshot).
4. DESCRIBE: Produce objective description (visible elements, colors, states).
5. EVALUATE: Compare description vs expected fixed condition (and baseline evidence if present).
6. VERDICT: Choose FIX_VERIFIED if change-specific attributes now satisfy the requested difference OR (baseline absent) new state plausibly implements the described change; else FIX_NOT_VERIFIED.
7. OUTPUT: JSON ONLY: {
   fixScreenshot: { id: <string>, description: <string> },
   fixVerdict: 'FIX_VERIFIED' | 'FIX_NOT_VERIFIED',
   fixRationale: <delta-focused string>
}
No additional commentary.
   </fix_subagent_prompt>
</templates>

<reporting_format>
Return a final structured JSON object:
{
   "query": "{{ query }}",
   "baseline": { "verdict": "ISSUE_CONFIRMED|ISSUE_NOT_FOUND", "screens": [...], "rationale": "..." },
   "baselineAbsenceHypothesis": "..." (only if verdict == ISSUE_NOT_FOUND),
   "fix": { "verdict": "FIX_VERIFIED|FIX_NOT_VERIFIED", "screenshot": { ... }, "rationale": "..." },
   "summary": "One-paragraph human-readable outcome"
}
</reporting_format>

<json_schema>
baseline.baselineScreens: array(object{id,description}) (minItems: baselineVerdict=='ISSUE_CONFIRMED'?1:0)
baseline.baselineVerdict: enum(ISSUE_CONFIRMED, ISSUE_NOT_FOUND)
baseline.baselineRationale: string (non-empty)
baseline.baselineAbsenceHypothesis: string (required iff baselineVerdict==ISSUE_NOT_FOUND)
fix.fixScreenshot: object{id,description}
fix.fixVerdict: enum(FIX_VERIFIED, FIX_NOT_VERIFIED)
fix.fixRationale: string (non-empty)
summary: string (<= 600 chars guidance)
</json_schema>

<stop_conditions>
- Complete after both phase outputs produced.
- If tooling fundamentally fails (e.g., cannot start automation after 2 retries) → return PARTIAL with explanation.
- Never stop mid-phase due to uncertainty; attempt fallback first.
</stop_conditions>

<fallbacks>
- Missing stash: proceed; annotate baseline integrity risk.
- Screenshot failure: retry up to 2 times; on persistent failure, collect textual DOM/state if available (else mark evidence_gap).
- Window reload failure (Developer: Reload Window not executed after 2 attempts): proceed with note reloadFailure; only BLOCK if UI clearly stale (e.g., assets missing) and prevents evidence collection.
</fallbacks>

<forbidden>
- No subjective language (e.g., "looks nice", "seems fine").
- No assumption of success without visual evidence.
- No skipping baseline even if user claims issue definitely existed.
</forbidden>

<quality_checks>
- Each verdict ties to explicit evidence references.
- No orphan screenshots (every screenshot cited in rationale or dismissed with reason).
- Delta reasoning focuses on change-specific attributes only.
</quality_checks>

<execution_order>
1. Emit preamble plan (parent).
2. Parent prepares baseline (git stash) then launches executeTask with <baseline_subagent_prompt>.
3. Validate returned JSON schema; log anomalies (parent).
4. Parent restores changes (git stash pop) & Developer: Reload Window, then launches executeTask with <fix_subagent_prompt> (embedding baseline JSON literal).
5. Validate fix JSON; assemble final combined report per <reporting_format>.
6. Output final JSON + concise human summary.
</execution_order>

<final_note>
If baseline issue is not reproducible (ISSUE_NOT_FOUND) yet fix rationale matches query change semantics (e.g., adding a new UI element now present), still return FIX_VERIFIED with clear note: "Baseline absence—treating verification as forward confirmation only."
</final_note>

</verification_spec>

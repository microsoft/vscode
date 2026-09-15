# Source-fix handoff and draft-PR review

## State and purpose

Resolve → source-fix route after the user explicitly started source investigation. The structured brief is handed to a normal Agent Host session; the wizard does not fake implementation work. The candidate fix is shown only after that session returns. This final frame is after explicit original-repro confirmation, so the exact draft PR review is unlocked while PR creation still awaits its own approval.

## Exact intended copy

- `Issue Wizard`; `Understand`; `Investigate`; `Resolve`; `Source fix`; `Review candidate fix`
- `Agent Host session · source investigation`; `Structured brief sent`; `Work continues in normal Agent Host`; `Open Agent Host`
- `Candidate fix ready`; `microsoft/vscode`; `issue-wizard/word-wrap-preview`; `Diff summary  +18  −6 across 3 files`
- `Normalizes markdown preview wrapping`; `Adds regression coverage`
- `Original repro verification`; `Reproduced original symptom`; `Ran candidate build`; `Markdown preview wraps long lines`
- `I tested the original repro — fixed`; `Still broken — keep investigating`; `Draft PR preparation unlocked after your confirmation`
- `Draft PR review`; `Ready after user confirmation`; `Fix word wrap in Markdown preview`; `Diff summary: +18 −6 across 3 files`
- `Files: src/vs/workbench/contrib/...; extensions/markdown-language-features/...`
- `Attachments: repro-editor.png; markdown-preview-fixed.png; test-results.txt`
- `Collaborator/fork path will be chosen at creation`; `Create draft PR`; `Edit draft`
- `Evidence (4)`; `Host state: awaiting PR approval`

## Actions and events

- Starting the route emits `chooseResolveRoute({ route: "source" })` then `startSourceInvestigation({ brief, evidence })`.
- `Open Agent Host` emits `openAgentHostSession({ sessionId })`; the host owns setup, reproduce, diagnose, implement, and test.
- When the external session returns, host emits `candidateFixReady({ branch, diffSummary, checks, attachments })`.
- `I tested the original repro — fixed` emits `confirmOriginalRepro({ result: "fixed", evidence })`; only then may host emit `prepareDraftPR({ payload, attachments })`.
- `Still broken — keep investigating` emits `reportVerification({ result: "stillBroken" })` and preserves the draft for the Agent Host.
- `Edit draft` emits `editDraftPR({ field })`; `Create draft PR` emits `approveDraftPR({ payload, attachments })`, then host handles collaborator/fork selection and `createDraftPR({ destination, branch, payload, attachments })`.

## Keyboard, focus, and accessibility

Tab order is handoff link → candidate summary → verification checks → verification actions → expanded PR review → PR actions → evidence rail. The fixed-confirmation control is the visible primary focus target. Accessible names include `Open normal Agent Host session`, `Confirm original repro is fixed`, `Report original repro still broken`, `Review draft PR`, `Create draft PR`, and each evidence attachment. Announce `Agent Host handoff started`, `Candidate fix returned; verify the original repro`, and `Draft PR review unlocked after your confirmation`. Do not announce or expose PR creation as available before the fixed confirmation event.


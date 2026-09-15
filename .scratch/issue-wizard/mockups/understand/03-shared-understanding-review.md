# 03 — Shared understanding review

## Intended copy

- Shell: `Issue Wizard`, `1 Understand`, `2 Investigate`
- Heading: `Review shared understanding`
- Subheading: `Correct anything before we investigate.`
- Editable fields: `Actual behavior` — `Inline completion disappears after pressing Tab.`; `Expected behavior` — `The completion should be inserted into the editor.`; `Triggering action` — `Press Tab while an inline suggestion is visible.`; `Frequency` — `Every time in TypeScript files`
- Per-field affordance: `Edit`
- Confirmation: `This is the problem we will investigate.`
- Evidence: `Evidence`; `screen-2026-09-15.png`; `Preview`; `Remove`
- Secondary: `Back to brief`
- Primary: `Start investigation`; keyboard hint: `⌘↵`

## Actions and behavior

- Each brief field is editable in place; edits invalidate the prior confirmation until revalidated.
- `Back to brief` returns to the drafting state while preserving all fields and evidence.
- `Start investigation` is the single leading action and requires explicit confirmation shown in the callout.
- Evidence remains attached and previewable when investigation begins.

## Keyboard and focus

- Tab order: Actual behavior → Expected behavior → Triggering action → Frequency → Back to brief → Start investigation.
- Enter commits the focused field edit; Escape cancels the field edit and restores its prior value.
- `⌘↵` activates Start investigation only when the brief is valid and confirmed.
- Focus ring remains visible on the edited field and moves to the primary after successful start.

## Accessibility

- Each field has an accessible name combining its label and `Edit` action.
- Confirmation is a status/live region: `This is the problem we will investigate.`
- Primary accessible name: `Start investigation`.
- On success, announce: `Investigation started. Moving to Investigate.`
- Preview accessible name: `Preview screenshot screen-2026-09-15.png`; Remove announces completion after host confirmation.

## Typed host events

- `editBriefField(key, value)` → `understandingDraftUpdated({ [key]: value })`
- `backToBrief()` → `understandingReviewBackRequested()`
- `previewEvidence(id)` → `evidencePreviewRequested({ id })`
- `removeEvidence(id)` → `evidenceRemovalRequested({ id })`
- `startInvestigation()` → `startInvestigation({ brief, evidence })` after explicit user confirmation and host validation.

# 02 — Screenshot-assisted brief

## Intended copy

- Shell: `Issue Wizard`, `1 Understand`, `2 Investigate`
- Heading: `Preparing the problem brief`
- Status: `Preparing the problem brief from your description and screenshot`
- Section: `Draft fields from your context`
- Draft fields: `Actual behavior` — `Inline completion disappears after pressing Tab.`; `Expected behavior` — `The completion should be inserted into the editor.`; `Triggering action` — `Press Tab while an inline suggestion is visible.`
- Draft marker: `Draft` on each derived field
- Blocking clarification: `Does the status ever finish, or does it remain indefinitely?`; placeholder `e.g. remains indefinitely`; action `Answer`
- Secondary context action: `Add context`
- Evidence: `Evidence`; `screen-2026-09-15.png`; `Preview`; `Remove`
- Disabled primary: `Continue to Understand`
- Helper: `Answer the clarification to continue`

## Actions and behavior

- The AI derives provisional structured fields from the existing description and screenshot; they are not yet confirmed.
- Exactly one inline clarification blocks continuation: whether the status ever finishes or remains indefinitely.
- `Answer` commits the clarification and allows the host to revalidate the draft.
- `Add context` lets the user append more context without opening a modal or chat surface.
- `Preview` opens the retained screenshot in the host preview surface; `Remove` requests explicit evidence removal.
- `Continue to Understand` remains disabled until the clarification is answered and the host validates the draft. No final confirmation or investigation action appears here.

## Keyboard and focus

- Tab order: draft fields → clarification input → Answer → Add context → Preview → Remove → Continue to Understand.
- Enter submits the clarification when its input is focused; Escape leaves the draft unchanged.
- Focus is retained in the clarification input after validation errors.
- Draft fields support keyboard editing without changing their provisional `Draft` state.

## Accessibility

- Status is a polite live region: `Preparing the problem brief from your description and screenshot`.
- Each draft field exposes its label, value, and state: `Draft`.
- Clarification accessible name: `Does the status ever finish, or does it remain indefinitely?`.
- Evidence preview accessible name: `Preview screenshot screen-2026-09-15.png`.
- `Answer` announces `Clarification saved`; `Add context` announces `Additional context field opened`; removal announces `Screenshot removed` after host confirmation.
- Disabled primary is exposed as unavailable with help text: `Answer the clarification to continue`.

## Typed host events

- `answerClarification(value)` → `clarificationAnswered({ key: "statusCompletion", value })`
- `addContext(text)` → `understandingContextAdded({ text })`
- `updateDraftField(key, value)` → `understandingDraftUpdated({ [key]: value, provisional: true })`
- `previewEvidence(id)` → `evidencePreviewRequested({ id })`
- `removeEvidence(id)` → `evidenceRemovalRequested({ id })`
- `continueToUnderstand()` → `completeUnderstanding({ actual, expected, trigger, clarification, evidence })` only after host validation; no `startInvestigation` event is emitted from this screen.

# 01 — Fresh intake

## Intended copy

- Shell: `Issue Wizard`, `1 Understand`, `2 Investigate`
- Heading: `Understand the problem`
- Subheading: `Agree on what happened before we investigate.`
- Field label: `What went wrong?`
- Placeholder: `Describe the unexpected behavior in a few sentences`
- Evidence actions: `Take screenshot`, `Add evidence`
- Guidance: `Useful details`; `What did you expect to happen?`; `What happened instead?`; `What action triggered it?`
- Evidence rail: `Evidence`; `No evidence attached`
- Primary: `Continue to Understand`

## Actions and behavior

- Primary action is disabled until the host has enough context to form a brief.
- `Take screenshot` captures the current host window and adds it to evidence.
- `Add evidence` opens the host-owned evidence picker.
- Textarea accepts multiline input and preserves user text.

## Keyboard and focus

- Tab order: description field → Take screenshot → Add evidence → Continue to Understand.
- Enter inserts a newline in the description field; primary activation uses the host’s standard form shortcut only when enabled.
- Focus uses a visible 2px theme-token outline with no focus loss on validation.

## Accessibility

- Textarea accessible name: `What went wrong?`.
- Buttons have the visible labels as accessible names.
- Disabled primary is exposed as unavailable, with help text: `Add enough context to continue.`
- Live region announces: `Screenshot added to evidence` or `Evidence picker opened`.

## Typed host events

- `captureScreenshot()` → `evidenceAdded({ kind: "screenshot", uri })`
- `addEvidence()` → `evidencePickerRequested()`
- `updateDescription(text)` → `understandingDraftUpdated({ description: text })`
- `continueToUnderstand()` → `completeUnderstanding({ description, evidence })` only after host validation.

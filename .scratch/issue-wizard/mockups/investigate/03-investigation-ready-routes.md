# 03 — Investigation ready routes

## State and purpose

Investigation is complete and Resolve is active. The host shows an evidence-backed summary and asks the user to choose a route. No setting change, source setup, issue publication, or Agent Host session has started.

## Exact intended copy

- `Investigation ready`
- `Evidence collected • no changes made`
- `What we know`
- `Settings Sync enabled` / `Verified in settings on both devices.`
- `Mismatch reproduced on second device` / `Same settings missing after sign in.`
- `Relevant log entry found` / `Sync conflict entry in sync log.`
- `Likely cause`
- `Sync conflict in profile state`
- `Settings Sync / profile service`
- `A conflict in the profile state is preventing settings from synchronizing to the second device.`
- `Confidence` / `High` / `3 corroborating signals`
- `Open questions`
- `Does the conflict recur after profile reset?`
- `Is the account signed in to the same identity?`
- `Choose the next step`
- `Direct resolution` / `Recommended`
- `Apply the supported profile refresh and verify the original symptom.` / `Review resolution`
- `Prepare an issue`
- `Package sanitized evidence for review before publication.` / `Prepare issue`
- `Explore source fix`
- `Hand context to an Agent Host session for setup and diagnosis.` / `Explore source fix`
- `Collected evidence · 3 items`
- `No source setup or publication has started.`

## Actions and state-machine events

- `Review resolution` emits `chooseRoute({ route: "direct-resolution" })`, then the host presents the exact evidence-backed action for user approval. It must not apply the change yet.
- `Prepare issue` emits `chooseRoute({ route: "issue" })`; the host may begin duplicate search or prepare a sanitized publication payload, but publication still requires later review and approval.
- `Explore source fix` emits `chooseRoute({ route: "source-fix" })`; the host may offer a structured handoff, but source setup starts only after the explicit route choice.

## Keyboard and focus behavior

Tab order is summary references, route cards in recommended-first order, then each route action. The recommended `Direct resolution` card is selected by default but is not committed. Enter or Space on a card or its action emits the corresponding route event. Arrow keys move among the three route options when rendered as a radiogroup; Escape leaves the selection unchanged.

## Accessibility

- Stepper announces `Issue Wizard steps, Resolve, step 3 of 3`.
- Summary cards expose headings and values as grouped regions; `Confidence: High, 3 corroborating signals` is a single labelled value.
- Route chooser is a radiogroup labelled `Choose the next step`; the recommended option is announced as `Direct resolution, recommended`.
- Live region announcements: `Investigation ready. Three evidence items collected`; on selection, `Direct resolution selected. Review is required before applying changes`; and `No source setup or publication has started`.


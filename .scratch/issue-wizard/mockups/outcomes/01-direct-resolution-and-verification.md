# Direct resolution and verification

## State and purpose

Resolve → direct route, after the host applied the proposed setting and while it awaits explicit original-action verification. The setting proposal is `editor.wordWrap: off → on`; the wizard must remain “Not resolved yet” until the user confirms the repro is gone.

## Exact intended copy

- `Issue Wizard`; `Understand`; `Investigate`; `Resolve`; `Direct resolution`
- `Fix the setting, then verify`
- `Evidence-backed action`; `Editor: Word Wrap`; `Current: off`; `Proposed: on`; `Effect: long lines wrap in the editor`
- `Apply change`; `Choose another route`
- `Repeat the original action`; `Original repro: long markdown line in editor`; `Ready for your confirmation`; `I repeated it — symptom gone`
- `Resolved only after explicit confirmation`
- `Evidence (3)`; `repro-editor.png`; `settings.json`; `wrap-after.png`; `Host state: awaiting user verification`; `Not resolved yet`

## Actions and events

- Primary `Apply change` emits `applyDirectAction({ kind: "setting", key: "editor.wordWrap", from: "off", to: "on" })`; host persists the applied state and moves to verification.
- Secondary `Choose another route` emits `chooseResolveRoute({ route: "issue" | "source" })` and preserves evidence.
- `I repeated it — symptom gone` emits `confirmOriginalRepro({ result: "fixed" })`; only the host may then emit `markResolved({ route: "direct" })`.

## Keyboard, focus, and accessibility

Tab order is stepper → proposal controls → route choice → verification controls → evidence items. The verification button has the visible blue focus ring in the mockup. Enter/Space activates a focused button; Escape does not dismiss the wizard or discard evidence. Accessible names: `Apply setting change`, `Choose another resolve route`, `Confirm original repro is fixed`, and each attachment filename. Announce `Setting applied. Repeat the original action to verify.` after apply, and `Verification recorded. Issue resolved.` only after the explicit fixed confirmation.


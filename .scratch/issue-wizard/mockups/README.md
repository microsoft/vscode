# Issue Wizard UI mockup brief

These mockups explore a dedicated Issue Wizard editor that is a sibling of the existing Issue Reporter. They are design artifacts, not implementation assets.

## Product model

- The host owns and persists the state machine.
- The AI proposes typed actions with structured payloads; it cannot set an arbitrary stage.
- User questions, choices, progress, evidence, approvals, and results remain visible in the Issue Wizard UI. Do not model this as a chat transcript and do not use hidden `ask_user` interactions.
- The macro-flow is **Understand → Investigate → Resolve**, where Resolve branches into:
  - a direct setting, update, or extension action followed by user verification;
  - an existing/new issue route with duplicate search and exact publication review;
  - a source-fix route that hands structured context to a normal Agent Host session, followed by user verification and draft-PR review.
- Closing or reloading preserves the exact wizard state.

See the editable architecture diagram at `../architecture/issue-wizard-state-machine.excalidraw`.

## Shared visual direction

- High-fidelity VS Code desktop UI in a dark theme, 3:2 landscape composition.
- Show a dedicated `Issue Wizard` editor tab inside recognizable VS Code workbench chrome. Keep surrounding chrome accurate but visually quiet.
- Modern VS Code styling: calm information density, theme-token-like colors, one clear leading action, 1px separators only where useful, control/inner/outer corner tiers, normal VS Code font scale, 16px primary and 12px compact codicon sizing.
- Use a compact top stepper for **Understand**, **Investigate**, and **Resolve**. Resolve may display the selected route without inventing five sequential global steps.
- The central surface should feel like a support case workspace: stable cards, editable summaries, evidence/attachment areas, progress rows, and explicit actions—not chat bubbles.
- Keep screenshot attachments visible and reusable across stages.
- Avoid gradients, giant headings, glassmorphism, marketing-dashboard styling, excessive cards, fake macOS traffic lights inside the editor, and standalone web-app chrome.
- Include a visible keyboard focus treatment in at least one mockup. Prefer visible text labels; every icon-only affordance must have an obvious tooltip/accessible-label intent recorded in the companion notes.

## Required deliverables

Each final PNG must have a same-basename Markdown companion describing:

- state and purpose;
- exact UI copy where image generation rendered text imperfectly;
- primary and secondary actions;
- keyboard/focus behavior and accessibility labels/announcements;
- what state-machine event each action emits.

Every creator must visually inspect generated output and revise until it is legible, native-looking, internally consistent, and useful as an implementation reference.

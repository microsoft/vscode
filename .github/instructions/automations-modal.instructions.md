---
description: "Boundaries for the opt-in Automations modal and its tests."
applyTo: "src/vs/sessions/contrib/automations/browser/automationsEditor*.ts,src/vs/sessions/contrib/automations/browser/automationsModal*.ts,src/vs/sessions/contrib/automations/browser/automationsTableRenderers.ts,src/vs/sessions/contrib/automations/browser/media/automationsModal.css,src/vs/sessions/contrib/automations/test/browser/automationsTable*.ts"
---

# Automations modal

- Preserve the default Automations view; modal-only UX changes must stay scoped to the modal.
- Add actions through the modal's menu IDs and reuse existing guarded commands.
- Keep modal styling local, including history styling. Do not change shared session-list rendering for a modal-only need.
- At narrow widths, stack categories, catalogue and details vertically so every control remains reachable.
- Keep visual content, keyboard navigation and Accessible View consistent.
- Follow [AUTOMATIONS.md](../../src/vs/sessions/AUTOMATIONS.md) for shared ownership and lifecycle contracts.

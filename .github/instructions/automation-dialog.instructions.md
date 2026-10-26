---
description: "Use when changing the Automations create/edit dialog. Keeps status messages in one notification center and loading states as spinner hovers."
applyTo: "src/vs/sessions/contrib/automations/browser/{automationDialog.ts,automationDialogService.ts,media/automationDialog.css}"
---

# Automations dialog messages

- Show visible warnings, validation failures, operation failures, and save failures only in the footer notification center. Do not add another visible inline message or workbench notification for dialog-owned feedback.
- Keep notification-center messages on the dialog's neutral background with normal foreground text. Express severity through the themed outline and icon only; do not add a severity-colored fill or recolor the message text. Informational notices use a foreground-colored outline and an info icon rather than warning or error styling.
- Keep the notification body non-interactive: clicking its outline, icon, or text must not move focus or add a focus highlight. Only an explicit action button inside the notification is interactive.
- Keep control-specific accessible descriptions when needed, but do not duplicate their text visually outside the notification center.
- Show loading beside the control that owns it as a spinning progress icon. Put the localized loading message in a delayed custom hover and accessible label instead of visible text.

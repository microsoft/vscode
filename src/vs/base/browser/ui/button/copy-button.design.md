---
title: "Copy button"
kind: "primitive"
status: "draft"
---

# Copy button

A standalone copy action needs brief confirmation that the clipboard write succeeded.

## Overview

Use CopyButton when copying is the control's primary action. It pairs the clipboard operation with temporary success feedback.

## Usage

- Supply `copy` with the clipboard operation and resolve only after the clipboard write succeeds. CopyButton owns activation; do not add another click handler for the same action.
- For copy within an existing control, use CopyFeedback. Call `show()` only after the write succeeds and render success without changing the control's purpose.
- Do not show success after a failed write. Direct `copy()` calls reject to the caller; pointer and keyboard activation report failures through the unexpected-error handler.
- Repeated successes restart feedback. Register the button or helper with the owning disposable store.
- For product usage, see [chat debug details](../../../../workbench/contrib/chat/browser/chatDebug/chatDebugDetailPanel.ts).

## Accessibility

- CopyButton uses the localized accessible name and hover "Copy" at rest, then "Copied" on success. Supply `title` or `ariaLabel` when a contextual name is needed.
- Success also announces "Copied to clipboard". Use `copiedStatusMessage` for a contextual announcement.
- The icon and label change preserves focus. Enter and Space activate the enabled button; disabled buttons do not copy.
- CopyFeedback supplies the success announcement but leaves the host control's accessible name, focus, keyboard behavior, and rendering to its owner.

## Preview

The CopyButton fixture compares resting, successful, and disabled states. The checkmark does not change the control's size or placement.

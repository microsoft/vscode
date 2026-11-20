---
title: "Content"
kind: "foundation"
status: "stable"
order: 3
legacyPaths:
  - ".github/design-system/content.design.md"
  - ".github/design-system/guidance/writing.md"
---

# Content

Write UI content that explains the task or next action in plain language. Keep every user-visible string meaningful, concise, and ready for localization.

Sources: [coding guidelines](../../../instructions/coding-guidelines.instructions.md), [accessibility](accessibility.design.md).

## Introduction

Use plain language that explains the task or next action. Keep labels meaningful, consistent, and ready for localization.

## Write for the task

Prefer concrete verbs and familiar words. Name the outcome rather than the implementation. Keep a label short enough to scan, but do not replace useful meaning with an unexplained icon or abbreviation.

Use the same term for the same action throughout a workflow. Distinguish an action from its result, and make errors say what happened and how the user can recover.

## Localize visible text

Externalize user-visible strings with the repository's localization APIs. Use placeholders for values; do not build a translated sentence by concatenating fragments. Keep source text grammatically complete so translators can reorder it naturally.

Do not treat UI labels, accessible names, tooltips, error messages, or status announcements as implementation details. Follow the [coding guidelines](../../../instructions/coding-guidelines.instructions.md) for localization and label capitalization, and the [accessibility foundation](accessibility.design.md) for spoken names and feedback.

## Preserve meaning across layouts

Test long translations, narrow panes, and zoom. Let labels wrap or truncate only according to the owning component's behavior; provide access to the full label when the UI truncates it.

Keep the information needed to understand an action visible. A tooltip may add context, but should not be the only way to discover a required label or explanation.

## Build and review

- The next action and its result are clear without unexplained jargon.
- Equivalent actions use consistent terms and capitalization.
- Every user-visible string is localizable and remains meaningful when translated.
- Labels remain understandable in constrained layouts and assistive technology.
- Errors and unavailable states provide a truthful reason and useful next step.

Review the complete interaction and its accessible names, not only the isolated string.

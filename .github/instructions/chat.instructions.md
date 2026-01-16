---
applyTo: '**/chat/**'
description: Chat feature area coding guidelines
---

## Adding chat/AI-related features

- When adding a new chat/AI feature like a new surface where chat or agents appear, a new AI command, etc, these features must not show up for users when they've disabled AI features. The best way to do this is to gate the feature on the context key `ChatContextKeys.enabled` via a when clause.
- When doing a code review for code that adds an AI feature, please ensure that the feature is properly gated.

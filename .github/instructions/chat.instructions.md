---
description: Chat feature area coding guidelines
---

## Adding chat/AI-related features

- When adding a new chat/AI feature like a new surface where chat or agents appear, a new AI command, etc, these features must not show up for users when they've disabled AI features. The best way to do this is to gate the feature on the context key `ChatContextKeys.enabled` via a when clause.
- When doing a code review for code that adds an AI feature, please ensure that the feature is properly gated.

### Hiding AI Features When Disabled

When surfacing a UI AI feature, ensure the feature hides when `chat.disableAIFeatures` is set:

- **UI Hiding**: Use `ChatContextKeys.enabled` in `when` conditions to conditionally show/hide UI elements (commands, views, menu items, etc.)
  - Example: `when: ChatContextKeys.enabled` in action/command registration
  - This context key is `false` when AI features are disabled
- **Programmatic Hiding**: Check `IChatEntitlementService.sentiment.hidden` to determine if AI features should be hidden
  - `sentiment.hidden` is `true` when the user signals no intent in using Chat
  - This should not only disable Chat but also hide all of its UI

This ensures consistency when implementing AI-powered UI functionality across the codebase.

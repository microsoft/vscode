---
name: create-hook
description: 'Create a hook (.json) to enforce policy or automate agent lifecycle events.'
argument-hint: What should be enforced or automated?
agent: agent
---
Related skill: `agent-customization`. Load and follow **hooks.md** for template and principles.

Guide the user to create a hook in `.github/hooks/`.

## Extract from Conversation
First, review the conversation history. If the user has been expressing concerns about agent behavior (e.g., "don't run this command", "always check before doing X", "inject this context"), generalize that into a hook. Extract:
- Actions that should be blocked or gated
- Context that should be injected at certain points
- Automation needs at session start/end or tool use

## Clarify if Needed
If no clear policy need emerges from the conversation, clarify:
- What event should trigger this hook? (e.g. PreToolUse, SessionStart, Stop)
- Should it block, warn, or inject context?
- Does it need a companion script?

## Iterate
1. Draft the hook JSON (and any scripts) and save them.
2. Identify the most ambiguous or weak parts and ask about those.
3. Once finalized, summarize what the hook enforces, suggest ways to test it, and propose related customizations to create next.

Remember to follow the `agent-customization` guidelines to create highly effective hooks.

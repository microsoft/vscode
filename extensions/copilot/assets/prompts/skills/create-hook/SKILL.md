---
name: create-hook
description: 'Create a hook (.json) to enforce policy or automate agent lifecycle events.'
argument-hint: What should be enforced or automated?
disable-model-invocation: true
---
Related skill: `agent-customization`. Load and follow **hooks.md** for template and principles.

Guide the user to create a hook in the GitHub Copilot hooks format, either for the repository in `.github/hooks/` at the root of the git repository or for the user in `~/.copilot/hooks/` (`$COPILOT_HOME/hooks/` when `COPILOT_HOME` is set). Use `"version": 1` and the camelCase event names from the [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference), and take input and output fields from that reference.

## Extract from Conversation
First, review the conversation history. If the user has been expressing concerns about agent behavior (e.g., "don't run this command", "always check before doing X", "inject this context"), generalize that into a hook. Extract:
- Actions that should be blocked or gated
- Context that should be injected at certain points
- Automation needs at session start/end or tool use

## Clarify if Needed
If no clear policy need emerges from the conversation, clarify:
- What event should trigger this hook? (e.g. preToolUse, sessionStart, agentStop)
- Should it block, warn, or inject context?
- Does it need a companion script?

## Path Conventions
- Check the reference for the directory hook commands run in, and which directory relative paths resolve from. Absolute paths are fine when intentional — just be deliberate about which you use.
- Do not use environment variables for pathing. The only exception is plugin-provided environment variables in hooks shipped as part of an agent plugin; never use environment variables for pathing outside of a plugin context.

## Iterate
1. Draft the hook JSON (and any scripts) and save them.
2. Identify the most ambiguous or weak parts and ask about those.
3. Once finalized, summarize what the hook enforces, suggest ways to test it, and propose related customizations to create next.

Remember to follow the `agent-customization` guidelines to create highly effective hooks.

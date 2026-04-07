---
name: create-instructions
description: 'Create an instructions file (.instructions.md) for a project rule or convention.'
argument-hint: What rule or convention to enforce?
agent: agent
---
Related skill: `agent-customization`. Load and follow **instructions.md** for template and principles.

Guide the user to create an instructions file.

## Extract from Conversation
First, review the conversation history. If the user has been correcting the agent's output or asking for specific patterns (e.g., "always use X", "never do Y", "follow this style"), generalize that into a persistent instruction. Extract:
- Corrections or preferences mentioned during the conversation
- Coding patterns the user enforced or requested
- Project-specific conventions referenced

## Clarify if Needed
If no clear rule emerges from the conversation, clarify:
- Should this apply everywhere or only to specific files?
- Which technologies or file types are affected?
- Is this a hard rule or a preference?

Explore the codebase using subagents if you need more context.

## Iterate
1. Draft the instruction and save it.
2. Identify the most ambiguous or weak parts and ask about those.
3. Once finalized, summarize what the instruction enforces, suggest example prompts to see it in action, and propose related customizations to create next.

Remember to follow the `agent-customization` guidelines to create highly effective instructions.

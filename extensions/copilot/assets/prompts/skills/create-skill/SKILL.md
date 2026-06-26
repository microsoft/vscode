---
name: create-skill
description: 'Create a reusable skill (SKILL.md) that packages a workflow.'
argument-hint: What should this skill produce?
disable-model-invocation: true
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../../../../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

Related skill: `agent-customization`. Load and follow **skills.md** for template and principles.

Guide the user to create a `SKILL.md`.

## Extract from Conversation
First, review the conversation history. If the user has been following a multi-step workflow or methodology (e.g., debugging approach, review checklist, implementation pattern), generalize that into a reusable skill. Extract:
- The step-by-step process being followed
- Decision points and branching logic
- Quality criteria or completion checks

## Clarify if Needed
If no clear workflow emerges from the conversation, clarify:
- What outcome should this skill produce?
- Workspace-scoped or personal?
- Quick checklist or full multi-step workflow?

## Iterate
1. Draft the skill and save it.
2. Identify the most ambiguous or weak parts and ask about those.
3. Once finalized, summarize what the skill produces, suggest example prompts to try it, and propose related customizations to create next.

Remember to follow the `agent-customization` guidelines to create highly effective skills.

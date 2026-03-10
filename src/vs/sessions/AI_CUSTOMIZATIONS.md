# AI Customizations

This document is now a lightweight sessions entry point. The shared guidance lives in [`../../../.github/skills/chat-customizations-editor/SKILL.md`](../../../.github/skills/chat-customizations-editor/SKILL.md), which replaces the older spec-style writeup.

## Sessions-Specific Structure

- Shared editor/model code stays in `src/vs/workbench/contrib/chat/browser/aiCustomization/`.
- Sessions-only views live in `src/vs/sessions/contrib/aiCustomizationTreeView/browser/`.
- Sessions overrides customization scoping and creation behavior in:
  - `src/vs/sessions/contrib/chat/browser/aiCustomizationWorkspaceService.ts`
  - `src/vs/sessions/contrib/chat/browser/promptsService.ts`
  - `src/vs/sessions/contrib/sessions/browser/customizationCounts.ts`

## Sessions Rules

- Scope workspace behavior to the active session worktree/repository.
- Preserve built-in prompt handling and CLI-user-root behavior.
- Keep the tree, overview, and toolbar counts aligned with the same data sources as the management editor.
- Keep the surface browser-compatible and `WindowVisibility.Sessions` where appropriate.

---
description: Architecture documentation for VS Code AI Customization view. Use when working in `src/vs/workbench/contrib/chat/browser/aiCustomization`
applyTo: 'src/vs/workbench/contrib/chat/browser/aiCustomization/**'
---

# AI/Chat Customizations

Use [`../skills/chat-customizations-editor/SKILL.md`](../skills/chat-customizations-editor/SKILL.md) for the shared architecture across core VS Code and Agent Sessions. This file stays intentionally lightweight for the core workbench surface.

## Core Structure

- Shared customization context and filtering live in `src/vs/workbench/contrib/chat/common/aiCustomizationWorkspaceService.ts`.
- The main core UI lives in `src/vs/workbench/contrib/chat/browser/aiCustomization/`.
- `IPromptsService` remains the source of truth for discovery, parsing, storage grouping, and refresh events.

## Dependencies

- Reuse `IPromptsService` and `IAICustomizationWorkspaceService` before adding new plumbing.
- Most UI changes should stay on top of `IEditorService`, `IFileService`/`ITextFileService`, `ICommandService`, `IMenuService`, `IChatService`, and `IMcpService`.
- Prefer existing management-editor widgets and list/tree patterns over adding parallel surfaces.

## Rules

- Keep the surface browser-compatible; do not add Node.js-specific filesystem logic.
- Do not hardcode storage roots. Use prompts-service queries plus workspace-service filters.
- Keep AI customization UI gated consistently with existing chat feature gating.
- Treat the current code as the source of truth when older docs disagree.

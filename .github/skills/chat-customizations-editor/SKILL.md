---
name: chat-customizations-editor
description: Guidance for the Chat Customizations editor in core VS Code and Agent Sessions, including discovery, storage scoping, creation flows, and related customization surfaces.
---

Use this skill for anything touching AI/chat customizations. Older spec docs may lag; prefer current code plus this guide.

## Structure

### Core VS Code
- Shared customization model and window-agnostic filtering live in `src/vs/workbench/contrib/chat/common/aiCustomizationWorkspaceService.ts`.
- The main management UI lives in `src/vs/workbench/contrib/chat/browser/aiCustomization/`.
- `IPromptsService` is the source of truth for discovery, parsing, storage grouping, and change events.

### Agent Sessions
- Follow the `sessions` skill for the app-level structure.
- Sessions adds window-only customization surfaces under `src/vs/sessions/contrib/aiCustomizationTreeView/browser/`.
- Sessions-specific scoping and creation behavior live in `src/vs/sessions/contrib/chat/browser/aiCustomizationWorkspaceService.ts` and `src/vs/sessions/contrib/chat/browser/promptsService.ts`.

## Dependencies
- Reuse `IPromptsService` for discovery, parsing, file enumeration, slash-command data, and refresh events.
- Reuse `IAICustomizationWorkspaceService` for active project root, storage filtering, creation targets, and window-specific behavior.
- UI work usually depends on `IEditorService`, `IFileService`/`ITextFileService`, `ICommandService`, `IMenuService`, `IChatService`, and `IMcpService`.
- Sessions-specific work also depends on the active session/worktree service (`ISessionsManagementService` and related session services).

## Assumptions
- Browser-compatible only; do not add Node.js-specific filesystem logic.
- Do not hardcode discovery roots. Express visibility with workspace-service filters and prompts-service queries.
- Keep AI UI gated consistently with existing chat feature gating.
- In sessions, scope workspace behavior to the active session worktree/repository, preserve built-in prompt behavior, and keep counts/toolbars aligned with the same data sources as the editor/tree.
- Prefer extending the existing core management editor or sessions tree/overview/toolbar over adding parallel customization surfaces.

## How to Work
1. Decide whether the change is shared core behavior or sessions-only behavior.
2. If discovery, visibility, or storage changes, start with `IPromptsService` and the workspace-service plumbing before touching UI.
3. If UI changes, update the existing core management editor or the sessions tree/overview/toolbar instead of creating bespoke flows.
4. Keep core and sessions aligned intentionally: shared model in `vs/workbench`, sessions overrides only where scoping or session UX differs.
5. Update lightweight docs/tests when behavior changes.

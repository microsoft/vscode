# Plan: Promote Codex `Sandbox` and `Approval Policy` chips to the left toolbar lane

## Problem

For Copilot CLI sessions, the "Default Approvals" chip sits **on the left** of the chat-input secondary toolbar (with a shield icon) in both the new-session view and the running-session view (screenshots 1 & 2). For Codex sessions (screenshot 3) all the codex.* config chips (`codex.approvalPolicy`, `codex.sandboxMode`, `codex.webSearchMode`, `codex.networkAccessEnabled`) currently fall through to the generic **right-side** chip lane, so the Sandbox chip lives on the right with no shield icon.

We want the Codex `Sandbox` AND `Approval Policy` chips to:

- Render in the same left-side lane as Default Approvals (sessions window: `Menus.NewSessionControl` + `MenuId.ChatInputSecondary`; workbench: `MenuId.ChatInputSecondary` before `OpenPermissionPickerAction`).
- Use the same chip styling as Default Approvals (shield-style chip rather than the smaller generic pill).
- Show per-mode icons for Sandbox (`shield` / `edit` / `warning`); use `shield` for Approval Policy.
- Show a warning confirmation dialog when switching Sandbox to `danger-full-access` (mirroring Bypass / Autopilot, with persistent "Don't show again").
- Hide from the generic right-side lane (so we don't render twice).
- Work in **both** the Agents window and the normal editor window.
- Work in **both** the new-session view (sessions window) and the running-session view (both windows).
- Leave `codex.networkAccessEnabled` / `codex.webSearchMode` / `codex.modelReasoningEffort` on the right-side lane unchanged. Network chip continues to show only when sandbox = `workspace-write`.

## Resolved design decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Chip structure | Two separate chips: Sandbox + Approval Policy |
| 2 | Sessions-side class layout | Two subclasses of `AgentHostSessionEnumPicker`, mirroring `AgentHostClaudePermissionModePicker` |
| 3 | Confirmation helper approach | Add parallel `maybeConfirmCodexSandboxLevel` in the shared `chatPermissionWarnings.ts` (same UX as Bypass/Autopilot, no risk to existing helper) |
| 4 | Codex key enum location | Move `CodexSessionConfigKey` from `node/codex/codexSessionConfigKeys.ts` to `common/codexSessionConfigKeys.ts` (mirror Claude's layout) |
| 5 | "Don't show again" storage key | `chat.permissions.codexSandbox.dontShowWarningAgain` |
| 6 | Confirmation trigger | Only when switching FROM a safer mode TO `danger-full-access` |
| 7 | Order in `MenuId.ChatInputSecondary` | 0.81 Sandbox, 0.82 Approval Policy (grouped, sandbox first) |
| 8 | Visual L→R order | `[Sandbox] [Approval Policy] [Default Approvals]` (Codex has no Mode chip) |
| 9 | Mobile variants | None — mirror Claude |
| 10 | Telemetry IDs | `NewChatAgentHostCodexSandboxPicker` + `NewChatAgentHostCodexApprovalPolicyPicker` |
| 11 | Chip tooltips | `Sandbox` + `Approval Policy` (no Codex prefix) |
| 12 | Dangerous-value set | `danger-full-access` only |
| 13 | Trigger CSS class | `warning` only for `danger-full-access` |
| 14 | Predicate strictness | Anchor on `workspace-write` (sandbox) / `on-request` (approvals); require every advertised enum value to narrow via `narrowSandboxMode` / `narrowApprovalPolicy` (mirrors `isWellKnownClaudePermissionModeSchema`) |

## Architecture context

Two parallel chip implementations because the chat input has two host environments:

| Surface | Picker classes |
| --- | --- |
| Agents window (`src/vs/sessions`) | `PermissionPicker` / `MobilePermissionPicker`, `AgentHostSessionEnumPicker` subclasses (`AgentHostClaudePermissionModePicker`, `AgentHostModePicker`), generic loop in `AgentHostSessionConfigPicker` |
| Workbench / editor (`src/vs/workbench/contrib/chat/browser/agentSessions/agentHost`) | `PermissionPickerActionItem` (Default Approvals), `AgentHostChatInputPicker` (one per well-known property + generic), `AgentHostGenericConfigChips` (right-lane fallback) |

Both layers already have the `claimed-by-dedicated-picker` mechanism — `WELL_KNOWN_PICKER_PROPERTIES` (workbench) / `isWellKnown*Schema` predicate (sessions) — so a property can be removed from the generic right-side lane and re-rendered as a dedicated left-side chip. Replicate the Claude permission-mode pattern.

## Approach

### Phase 0 — Shared platform changes

1. **NEW `src/vs/platform/agentHost/common/codexSessionConfigKeys.ts`** — move `CodexSessionConfigKey` enum + `narrowApprovalPolicy` + `narrowSandboxMode` + `narrowAdditionalDirectories` + `narrowBoolean` + `narrowWebSearchMode` + `narrowReasoningEffort` from the node-layer file. Keep `isCodexSupportedModel` / `normalizeCodexModelId` / `CodexApprovalPolicy` type alias here too (no node-only deps).
2. **`src/vs/platform/agentHost/node/codex/codexSessionConfigKeys.ts`** — collapse to a re-export of the `common/` file (preserves existing imports without churn).

### Phase 1 — Sessions window (`src/vs/sessions/contrib/providers/agentHost/browser/`)

1. **`agentHostPermissionPickerDelegate.ts`** — add two predicates:
   - `isWellKnownCodexSandboxSchema(schema)` — `schema.type === 'string'`, includes `'workspace-write'`, every enum value narrows via `narrowSandboxMode`.
   - `isWellKnownCodexApprovalPolicySchema(schema)` — `schema.type === 'string'`, includes `'on-request'`, every enum value narrows via `narrowApprovalPolicy`.

2. **NEW `agentHostCodexSandboxPicker.ts`** — `AgentHostCodexSandboxPicker extends AgentHostSessionEnumPicker`
   - `_property = CodexSessionConfigKey.SandboxMode`.
   - Icon per value: `read-only` → `Codicon.shield`, `workspace-write` → `Codicon.edit`, `danger-full-access` → `Codicon.warning`.
   - Override `_selectValue` (or whichever lifecycle hook is exposed for value selection) to call `maybeConfirmCodexSandboxLevel(...)` when newValue === `'danger-full-access'` AND oldValue !== `'danger-full-access'`; abort selection if user cancels.
   - Trigger DOM customization: apply `'warning'` CSS class when current value is `danger-full-access`.
   - Aria label: `"Pick Sandbox, {0}"`.
   - Telemetry id: `NewChatAgentHostCodexSandboxPicker`.

3. **NEW `agentHostCodexApprovalPolicyPicker.ts`** — `AgentHostCodexApprovalPolicyPicker extends AgentHostSessionEnumPicker`
   - `_property = CodexSessionConfigKey.ApprovalPolicy`.
   - Icon always `Codicon.shield`.
   - No confirmation dialog.
   - Aria label: `"Pick Approval Policy, {0}"`.
   - Telemetry id: `NewChatAgentHostCodexApprovalPolicyPicker`.

4. **`agentHostSessionConfigPicker.ts`**
   - In `_renderConfigPickers()` skip `codex.sandboxMode` / `codex.approvalPolicy` when their schema is well-known (parallel to existing `isWellKnownAutoApproveSchema` / `isWellKnownModeSchema` skips).
   - Register four new `Action2`s:
     - `NEW_SESSION_CODEX_SANDBOX_PICKER_ID` → `Menus.NewSessionControl`, order 0.5 (immediately before existing `NEW_SESSION_APPROVE_PICKER_ID` order 1)
     - `NEW_SESSION_CODEX_APPROVAL_PICKER_ID` → `Menus.NewSessionControl`, order 0.6
     - `RUNNING_SESSION_CODEX_SANDBOX_PICKER_ID` → `MenuId.ChatInputSecondary`, order 0.81
     - `RUNNING_SESSION_CODEX_APPROVAL_PICKER_ID` → `MenuId.ChatInputSecondary`, order 0.82
   - Each action's `when` clause: `IsActiveSessionLocalAgentHost OR IsActiveSessionRemoteAgentHost` (matches existing AgentHost menu items). The well-known-schema predicate gates rendering inside the picker.
   - Wire `actionViewItemService.register` for each (menu, id) pair to instantiate the new pickers via `PickerActionViewItem(picker)`.

### Phase 2 — Shared confirmation helper

5. **`src/vs/workbench/contrib/chat/common/chatPermissionStorageKeys.ts`** — add:
   ```ts
   export const CODEX_SANDBOX_DONT_SHOW_AGAIN_KEY = 'chat.permissions.codexSandbox.dontShowWarningAgain';
   ```

6. **`src/vs/workbench/contrib/chat/common/chatPermissionWarnings.ts`** — add parallel `maybeConfirmCodexSandboxLevel(sandboxMode, dialogService, storageService): Promise<boolean>`:
   - Returns `true` immediately if `sandboxMode !== 'danger-full-access'` (only the dangerous value triggers the dialog).
   - Uses its own in-memory `Set<string>` (or a `boolean` flag) for session-scoped suppression.
   - Persists "Don't show again" in `CODEX_SANDBOX_DONT_SHOW_AGAIN_KEY` under `StorageScope.PROFILE`.
   - Dialog copy:
     - Title: `"Enable Full Access (Dangerous)?"`.
     - Detail (MarkdownString): `"Full Access removes sandbox restrictions: tool calls can read, write, and network anywhere on your system. This bypasses the workspace boundary that normally protects files outside the workspace."` — no settings-link footer (Codex sandbox is per-session config, not a global setting).
     - Confirm button: `"Enable"`. Cancel button: `"Cancel"`.
     - Checkbox: `"Don't show again"`.
     - Icon: `Codicon.warning`. Severity: `Warning`.

### Phase 3 — Workbench / editor (`src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/`)

7. **`agentHostChatInputPicker.ts`**
   - Add `'codex.sandboxMode'` and `'codex.approvalPolicy'` to `WELL_KNOWN_PICKER_PROPERTIES` so `AgentHostGenericConfigChips` stops rendering them in the right-side lane.
   - Extend `getConfigIcon()` to map codex values to icons (mirror sessions-window mapping).
   - Apply `'warning'` CSS class on the trigger when `_property === 'codex.sandboxMode'` and `value === 'danger-full-access'`.
   - In the value-selection handler, if `_property === 'codex.sandboxMode'` and selected value === `'danger-full-access'` and current value !== `'danger-full-access'`, await `maybeConfirmCodexSandboxLevel(...)`; abort if false.
   - Add `isWellKnownCodexSandboxSchema` / `isWellKnownCodexApprovalPolicySchema` calls inside the existing "is the picker applicable to this schema?" gate so dedicated chips only render for the well-known shape (mirror the AutoApprove pattern at line 353).

8. **`agentHostChatInputPicker.contribution.ts`** — register two new actions:
   - `OpenAgentHostCodexSandboxPickerAction` — id `agentHost.codexSandbox.pick`, order **0.81**.
   - `OpenAgentHostCodexApprovalPolicyPickerAction` — id `agentHost.codexApprovalPolicy.pick`, order **0.82**.
   - Update the order header comment.
   - Both gated by `ChatContextKeyExprs.isAgentHostSession`.

9. **`chatInputPart.ts`**
   - Add the two new action IDs to `agentHostShortPickerMinWidths` (use `22` like the other picker chips).
   - Extend the action-view-item provider branch to handle the two new IDs, mapping them to `AgentHostChatInputPicker` with the respective `codex.*` property string.

### Phase 4 — Verification (`launch` skill + Playwright + screenshots)

Build via `runTask` (`VS Code - Build`), wait for both watch tasks to settle, then run the launch skill against a temporary user profile. Drive Code OSS with `@playwright/cli`:

1. **Sessions window, new-session view (Codex)** — open Agents window, click "+", select Codex harness. Screenshot: Sandbox + Approval Policy chips on LEFT with shield/edit icons. Right-side lane only has Web Search.
2. **Sessions window, running-session view (Codex)** — send a stub message. Screenshot: chips persist on LEFT under chat input.
3. **Normal editor window, Codex session** — open chat in editor, pick Codex harness, send message. Screenshot: chips appear on LEFT.
4. **Per-mode icon verification** — open Sandbox picker, select each of read-only / workspace-write / danger-full-access. 3 screenshots showing icon changes.
5. **Confirmation dialog** — from workspace-write, click danger-full-access. Screenshot the warning dialog. Cancel — verify sandbox stays at workspace-write. Re-trigger and accept — verify sandbox switches.
6. **Network chip visibility** — switch sandbox to read-only and danger-full-access. Confirm Network chip disappears from right-side lane. Switch back to workspace-write. Confirm Network chip reappears.
7. **Right-lane residual chips** — screenshot the right-side lane in all 3 sandbox modes; confirm Web Search remains visible.

If anything misbehaves, use the `code-oss-logs` skill for renderer logs; use `dap-cli` only for hard-to-diagnose runtime issues.

### Phase 5 — Layering + final checks

- Run `npm run valid-layers-check` to catch any sessions↔workbench layering regressions introduced by the Phase 0 file move.
- Run `npm run compile-check-ts-native` (or the build task — already covered above).
- Visually confirm the diff has no stray TODO/console.log/unused imports.

## Notes / follow-up (NOT this task)

- **Isolation chips for Codex new sessions** (Folder / Worktree): currently only Copilot CLI's new-session view exposes the Worktree/Branch chips. Adding them for Codex is the follow-up the user wants to do after this lands. The current plan does NOT add them, but the menu order numbers are left with headroom (0.5 / 0.6 in `Menus.NewSessionControl` is well before the existing 1.0 slot; 0.81 / 0.82 in `MenuId.ChatInputSecondary` leaves room before 100/101 for the isolation/branch chips).

## Todos

Tracked in the session SQL `todos` table — see `id` column for stable handles.

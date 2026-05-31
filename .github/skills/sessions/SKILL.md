---
name: sessions
description: Agents window architecture — covers the agents-first app, layering, folder structure, chat widget, menus, contributions, entry points, and development guidelines. Use when implementing features or fixing issues in the Agents window.
---

## Before Making Any Changes

**MANDATORY:** Before writing or modifying any code in `src/vs/sessions/`, you **must** read these documents:

1. **`.github/instructions/coding-guidelines.instructions.md`** — Naming conventions, code style, string localization, disposable management, and DI patterns.
2. **`.github/instructions/source-code-organization.instructions.md`** — Layers, target environments, dependency injection, and folder structure conventions.

Then read the relevant spec for the area you are changing (see table below). If you modify the implementation, you **must** update the corresponding spec to keep it in sync.

## Specification Documents

| Document | Path | When to read |
|----------|------|-------------|
| Layer rules | `src/vs/sessions/LAYERS.md` | Before adding any cross-module imports. Defines the internal layer hierarchy (`core` → `services` → `contrib` → `providers`) with ESLint-enforced import restrictions. Key rule: `contrib/*` must NOT import from `contrib/providers/*`. |
| Layout spec | `src/vs/sessions/LAYOUT.md` | Before changing any part, grid structure, titlebar, or CSS. Documents the fixed grid layout (Sidebar \| ChatBar \| AuxiliaryBar), part positions, the modal editor system, per-session layout state persistence, and the titlebar's three-section design. |
| Sessions spec | `src/vs/sessions/SESSIONS.md` | Before changing session/provider interfaces or data flow. Covers the pluggable provider model (`ISessionsProvider` → `ISessionsProvidersService` → `ISessionsManagementService`), `ISession`/`IChat` interfaces, observable state propagation, workspace/folder model, and session type system. |
| Sessions list spec | `src/vs/sessions/SESSIONS_LIST.md` | Before changing the sessions sidebar list. Covers the tree widget (`WorkbenchObjectTree`), renderers, grouping (workspace/date), filtering (type/status/archived/read), pinning, read/unread state, workspace capping, mobile adaptations, storage keys, and registered actions. |
| Mobile spec | `src/vs/sessions/MOBILE.md` | Before adding any phone-specific UI. Covers the mobile part subclass architecture, viewport classification (phone < 640px), `MobileTitlebarPart`, drawer-based sidebar, `MobilePickerSheet`, view/action gating with `IsPhoneLayoutContext`, and the desktop → mobile component mapping. |
| AI Customizations | `src/vs/sessions/AI_CUSTOMIZATIONS.md` | Before working on the customization editor or tree view. Documents the management editor (in `vs/workbench`) and the tree view/overview (in `vs/sessions/contrib/aiCustomizationTreeView`). |

## Common Pitfalls

- **Wrong menu IDs**: Never use `MenuId.*` from `vs/platform/actions` for Agents window UI. Always use `Menus.*` from `browser/menus.ts`.
- **Events instead of observables**: Session state must flow through `IObservable`, not `Event`. Use `autorun`/`derived` for reactive UI, not `onDid*` event listeners.
- **Importing from providers**: Non-provider `contrib/*` code must never import from `contrib/providers/*`. Extract shared interfaces to `services/` or `common/`.
- **Missing entry point import**: New contribution files must be imported in the appropriate `sessions.*.main.ts` entry point to be loaded (for example `sessions.common.main.ts`, `sessions.desktop.main.ts`, `sessions.web.main.ts`, or `sessions.web.main.internal.ts`).
- **Modifying workbench code**: Prefer extending/wrapping workbench classes in the sessions layer over modifying shared workbench components.

## Validating Changes

You **must** run these checks before declaring work complete:

1. `npm run compile-check-ts-native` — TypeScript compilation check. **Do not run `tsc` directly.**
2. `npm run valid-layers-check` — **MANDATORY.** Catches layering violations. If this fails, fix the imports before proceeding.
3. `scripts/test.sh --grep <pattern>` — unit tests for affected areas

---
name: sessions
description: Agents window architecture — covers the agents-first app, layering, folder structure, chat widget, menus, contributions, entry points, and development guidelines. Use when implementing features or fixing issues in the Agents window.
---

When working on the Agents window (`src/vs/sessions/`), always read the relevant specification document before making changes. If you modify the implementation, you **must** update the corresponding spec to keep it in sync.

## Specification Documents

| Document | Path | Covers |
|----------|------|--------|
| Overview | `src/vs/sessions/README.md` | Architecture overview, folder conventions |
| Layer rules | `src/vs/sessions/LAYERS.md` | Import restriction rules for all sessions layers (enforced by ESLint) |
| Layout spec | `src/vs/sessions/LAYOUT.md` | Grid structure, parts, titlebar, per-session layout state, CSS |
| Mobile spec | `src/vs/sessions/MOBILE.md` | Mobile component architecture, phone-specific UI patterns |
| Sessions spec | `src/vs/sessions/SESSIONS.md` | Sessions architecture — layers, provider model, core interfaces, data flow |
| AI Customizations | `src/vs/sessions/AI_CUSTOMIZATIONS.md` | AI customization editor and tree view design |

## Engineering Principles

### Layering and Dependencies

- **Respect the layer hierarchy.** `vs/sessions` sits above `vs/workbench` — it may import from workbench and below, but workbench must never import from sessions. See `LAYERS.md` for the full internal layer rules.
- **Keep providers isolated.** Session providers (`contrib/providers/*`) are implementation details of specific backends. Non-provider contributions (`contrib/*`) must not import from providers — extract shared symbols to `services/` or `common/` instead.
- **Validate layers before committing.** Run `npm run valid-layers-check` to catch violations. Run `npm run compile-check-ts-native` for TypeScript errors — never use raw `tsc`.

### Separation of Concerns

- **Use the contribution model.** Features register through `registerWorkbenchContribution2` and `registerAction2`, imported by entry points (`sessions.common.main.ts`, `sessions.desktop.main.ts`). Don't wire features directly into core workbench code.
- **Prefer composition over modification.** Extend existing classes (e.g., `AgentSessionsChatWidget` wraps `ChatWidget`) rather than modifying shared workbench components. This keeps the sessions layer decoupled.
- **Use services for cross-cutting concerns.** Shared state belongs in services (`ISessionsManagementService`, `ISessionsProvidersService`), not passed through component hierarchies. Declare service dependencies in constructors via dependency injection.

### Reactive State and Observables

- **Expose mutable state as observables.** Session properties (`title`, `status`, `changes`, etc.) use `IObservable` for reactive UI binding. Use `observableValue`, `derived`, and `autorun` — not events — for state that drives UI updates.
- **Batch related state changes in transactions.** When updating multiple observables together, wrap in `transaction(tx => { ... })` to avoid intermediate renders.

### Window Isolation

- **Scope registrations to the Agents window.** Views and contributions that should not appear in regular VS Code use `WindowVisibility.Sessions` in their registration.
- **Use dedicated menu IDs.** The Agents window defines its own menus in `browser/menus.ts` (`Menus.*`). Never use shared `MenuId.*` constants for Agents window UI.
- **Use dedicated storage keys.** Prefix with `workbench.agentsession.*` or `workbench.chatbar.*` to avoid conflicts with regular workbench state.

### Layout Stability

- **Maintain fixed positions.** The Agents layout is intentionally non-configurable — no settings-based position customization. New parts go in the right section of the grid.
- **Preserve no-op stubs.** Unsupported workbench features (zen mode, centered layout, etc.) remain as no-ops — never throw errors for unsupported API calls.
- **Manage pane composite lifecycle.** When toggling part visibility, always manage the associated pane composites (open default view container on show, dispose on hide).

### Code Organization

- **Core** (layout, parts, shell services) → `browser/`
- **Feature contributions** (views, actions, editors) → `contrib/<featureName>/browser/`
- **Session providers** (compute backends) → `contrib/providers/<providerName>/`
- **Shared service interfaces** → `services/<serviceName>/common/`

## General VS Code Guidelines

The Agents window follows all standard VS Code engineering practices. See these instruction files for the full rules:

- **Source Code Organization** — `.github/instructions/source-code-organization.instructions.md` (layers, target environments, DI, contribution rules)
- **Coding Guidelines** — `.github/instructions/coding-guidelines.instructions.md` (naming conventions, code style, string localization, disposable management, DI patterns)
- **Writing Tests** — `.github/instructions/writing-tests.instructions.md` (unit/integration tests, `ensureNoDisposablesAreLeakedInTestSuite`, snapshot testing, clean teardown)

## Validating Changes

1. `npm run compile-check-ts-native` — TypeScript compilation check. **Do not run `tsc` directly.**
2. `npm run valid-layers-check` — layering violations (see `LAYERS.md`)
3. `scripts/test.sh --grep <pattern>` — unit tests (see Writing Tests instructions)

# Sessions Layer Rules

> **Specification change gate:** Do not update this document for a bug fix that restores the existing import hierarchy. Update it only when the enforced layering contract intentionally changes.

This document describes the import layering rules for `src/vs/sessions/`, enforced by the `local/code-import-patterns` ESLint rule.

The sessions layer sits above `vs/workbench` in the VS Code source code hierarchy. For the broader VS Code layer rules (base → platform → editor → workbench → sessions), see `.github/instructions/source-code-organization.instructions.md`.

## Layer Hierarchy

```
┌─────────────────────────────────────────────────────┐
│  Entry Points                                       │
│  sessions.common.main.ts / .desktop.main.ts /       │
│  .web.main.ts / .web.main.internal.ts               │
│  (can import everything below)                      │
└──────────────────────┬──────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
┌────────────┐  ┌────────────┐  ┌────────────────┐
│ contrib/*  │  │ contrib/   │  │                │
│ (chat,     │  │ providers/ │  │  services/*    │
│  sessions, │  │ (agentHost,│  │                │
│  changes,  │  │  copilot,  │  │                │
│  ...)      │  │  remote)   │  │                │
└─────┬──────┘  └─────┬──────┘  └───────┬────────┘
      │               │                │
      │               │                │
      ▼               ▼                ▼
┌─────────────────────────────────────────────────────┐
│  sessions/~  (core: browser/, common/, electron-browser/) │
└─────────────────────────────────────────────────────┘
```

## Rules by Target

### `sessions/~` — Sessions Core

**Path:** `src/vs/sessions/{browser,common,electron-browser}/**`

The foundational layer. It may import from the sessions **services** layer, but not from any `contrib/` code above it.

**Can import from:**
- `vs/base/~`, `vs/base/parts/*/~`
- `vs/platform/*/~`
- `vs/editor/~`, `vs/editor/contrib/*/~`
- `vs/workbench/~`, `vs/workbench/browser/**`, `vs/workbench/services/*/~`
- `vs/workbench/contrib/sessions/~`, `vs/workbench/contrib/sessionChanges/~` (the shared sessions code; see below)
- `vs/sessions/~` (self), `vs/sessions/services/*/~`

> **Note:** The desktop bootstrap entry `src/vs/sessions/electron-browser/sessions.ts` has its own, **more restrictive** rule: it may import only `vs/base/~`, `vs/base/parts/*/~`, `vs/platform/*/~`, `vs/sessions/~`, and `vs/sessions/sessions.desktop.main.js`.

**Cannot import from:**
- ❌ `vs/sessions/contrib/*` — no contrib dependencies
- ❌ `vs/sessions/contrib/providers/*` — no provider dependencies

---

### `sessions/services/*/~` — Sessions Services

**Path:** `src/vs/sessions/services/*/{browser,common}/**`

Service layer sits alongside core. Provides shared service interfaces and implementations.

**Can import from:**
- Everything `sessions/~` can import (**except** `vs/workbench/browser/**`, which is not granted to services), plus:
- `vs/sessions/services/*/~` (sibling services)
- `vs/workbench/contrib/*/~`

**Cannot import from:**
- ❌ `vs/sessions/contrib/*` — no contrib dependencies
- ❌ `vs/sessions/contrib/providers/*` — no provider dependencies

---

### `sessions/contrib/*/~` — Contributions (non-provider)

**Path:** `src/vs/sessions/contrib/*/{browser,common}/**` (excluding `contrib/providers/`)

Feature contributions like `chat`, `sessions`, `changes`, `terminal`, etc.

**Can import from:**
- Everything `sessions/services/*/~` can import, plus:
- `vs/sessions/contrib/*/~` (sibling contributions)

**Cannot import from:**
- ❌ `vs/sessions/contrib/providers/*/~` — **providers are isolated from non-provider contribs**

---

### `sessions/contrib/providers/*/~` — Session Providers

**Path:** `src/vs/sessions/contrib/providers/*/{browser,common}/**`

Provider implementations (`agentHost`, `copilotChatSessions`, `remoteAgentHost`). These are the compute backends that register with `ISessionsProvidersService`.

**Can import from:**
- Everything `sessions/contrib/*/~` can import, plus:
- `vs/sessions/contrib/providers/*/~` (sibling providers)

This is the **most permissive** contrib layer — providers can reach into non-provider contribs and sibling providers, but not vice versa.

---

### Entry Points

| File | Layer | Notes |
|------|-------|-------|
| `sessions.common.main.ts` | `browser` | Shared contributions for all platforms |
| `sessions.desktop.main.ts` | `electron-browser` | Desktop-specific, imports `sessions.common.main.js` |
| `sessions.web.main.ts` | `browser` | Web-specific, imports `sessions.common.main.js` |
| `sessions.web.main.internal.ts` | `browser` | Internal web variant, imports `sessions.web.main.js` |

Entry points can import from all sessions layers: `sessions/~`, `services/*/~`, `contrib/*/~`, and `contrib/providers/*/~`.

---

## Shared sessions code in `vs/workbench`

The shared sessions code lives in `vs/workbench` so that other workbench windows can host it. Every layer of `vs/sessions` may import it. It follows the workbench rules and **never** imports `vs/sessions`:

| Home | Contents | May import |
|------|----------|------------|
| `vs/workbench/services/sessions/` | The provider-neutral session model (`session.ts`, `sessionPane.ts`, `workspaceSelection.ts`), session host routing, visible sessions, the Sessions part service and host layout contracts, and session services that depend only on the model | What any workbench service may import: no contributions |
| `vs/workbench/browser/parts/sessions/` | The Sessions part frame, its content contract and registry, the session grid widget and the empty-state widgets | What any workbench part may import: no contributions |
| `vs/workbench/contrib/sessions/` | The management and provider contracts, the services and UI that build on chat or canvases, the session grid content, and the session providers | What any workbench contribution may import |
| `vs/workbench/contrib/sessionChanges/` | The Changes editor and view | What any workbench contribution may import. It depends on `contrib/sessions`, never the reverse |

- `vs/workbench/contrib/sessions/providers/*/~` may additionally import sibling providers. Nothing else in `vs/workbench` may import a provider; in `vs/sessions`, only provider contributions and the entry points may.
- Modules there register nothing at module level. Their services, contributions, actions, menus, keybindings and Sessions part content kinds are registered from `vs/sessions` (for example `services/sessions/browser/sessionsServices.registration.ts`, `browser/parts/sessionsPartContent.registration.ts` and the `*.contribution.ts` modules), so only the windows whose entry points import those modules load them.

## Key Constraint

```
contrib/*  ──✕──▶  contrib/providers/*
```

Non-provider contributions **must not** import from provider code. If a provider exposes a symbol needed by non-provider code, that symbol should be extracted to a shared location (`vs/sessions/services/`, `vs/sessions/common/`, or a shared contrib module).

Providers **can** import from non-provider contributions and from sibling providers.

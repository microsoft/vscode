# Liquid App Platform -- Vision Document

**Date:** 2026-03-08
**Author:** Alessio Cazzaniga
**Status:** Active pitch material

---

## Core Concept

A **Liquid App** is an application that composes itself from modules at runtime, guided by an LLM. The user describes what they need; the AI assembles it from available components. No fixed layouts, no rigid navigation -- the app is fluid, personal, adaptive.

## Architecture: Three Layers

```
LAYER 3 -- USER
  Canvas full-screen, sidebar, chat
  Sees: cards, data, actions
  Does: talks to Claude, customizes, works

LAYER 2 -- CARD DEVELOPER (any language)
  Sandboxed card API
  Sees: card SDK, templates, marketplace
  Does: builds cards in React/Vue/Svelte/vanilla/Python+WASM/anything
  Publishes: to Liquid Module marketplace

LAYER 1 -- PLATFORM DEVELOPER (owner)
  Full VS Code + Claude
  Sees: everything -- source code, extension points, internals
  Does: builds the platform itself, creates macro modules
```

## Language-Agnostic Card Development

**This is the key differentiator.**

Traditional app platforms bind developers to one stack (React, Swift, Flutter). Liquid App cards are **sandboxed webview components** communicating through a typed message API. The card's internal implementation is invisible to the platform.

A card developer can use:
- **JavaScript/TypeScript** -- React, Vue, Svelte, vanilla
- **Python** -- via Pyodide/WASM, for data science cards
- **Rust/Go/C++** -- via WASM compilation
- **Any language that compiles to WASM or JS**

The platform guarantees:
- **Sandboxing** -- cards run in isolated webview contexts, no direct access to VS Code APIs
- **Typed bridge API** -- `window.phonon.data.fetch()`, `window.phonon.navigate()`, `window.phonon.intent()`
- **Schema validation** -- entity data conforms to JSON Schema declared by the module
- **Permission model** -- cards declare what they need (entity read, entity write, navigation, external API)

```
Card (any language)
    |
    | postMessage (typed, validated)
    |
    v
Phonon Bridge (renderer)
    |
    | IPC (validated, permissioned)
    |
    v
Data Provider (extension host)
    |
    v
Backend (Supabase, REST, GraphQL, local DB)
```

## Why This Matters (Pitch Points)

### 1. Any Developer Can Build Cards
A restaurant owner's nephew who knows React can build a "daily specials" card. A data scientist who knows Python can build an "analytics" card. A design agency can build a "brand dashboard" card. No VS Code extension knowledge required.

### 2. Safe by Default, Powerful When Needed
- **Card level**: sandboxed, safe, marketplace-publishable
- **Module level**: VS Code extension, more power, reviewed
- **Platform level**: full source access, maximum power

Each layer has its own SDK, docs, and publishing path.

### 3. AI-Native Composition
The LLM doesn't just help you code -- it IS the runtime composer. Onboarding: Claude asks what you need, assembles your dashboard from available cards. Daily use: "aggiungi il food cost" and a new card appears. The UI is a conversation outcome, not a design artifact.

### 4. Marketplace as Business Model
- **Free cards**: community-built, open source
- **Premium cards**: specialized (accounting, compliance, analytics)
- **Module bundles**: "Gestionale Ristorazione Complete" = 30 cards + entities + data providers
- **Platform licensing**: Liquid App runtime is the engine, modules are the content

### 5. Not Locked to One Domain
The same platform serves:
- Restaurant management
- Hotel management
- Freelance CRM
- Inventory systems
- Any domain where data + views + AI composition makes sense

## Card SDK (Future -- Fase 4+)

```typescript
// card-sdk/index.ts -- what card developers import

interface PhononCardSDK {
  // Data
  data: {
    fetch(entity: string, query?: CardQuery): Promise<any[]>;
    subscribe(entity: string, callback: (rows: any[]) => void): Unsubscribe;
    mutate(entity: string, operation: 'create' | 'update' | 'delete', data: any): Promise<void>;
  };

  // Navigation
  navigate(viewId: string, params?: Record<string, unknown>): void;

  // AI interaction
  intent(description: string): void;  // ask Claude to compose something

  // Card lifecycle
  onParams(callback: (params: Record<string, unknown>) => void): void;
  setTitle(title: string): void;
  setLoading(loading: boolean): void;

  // Permissions (declared in card manifest, granted at install)
  permissions: {
    canRead(entity: string): boolean;
    canWrite(entity: string): boolean;
    canNavigate(): boolean;
  };
}
```

Card manifest (in the card's `package.json`):
```json
{
  "liquidCard": {
    "id": "food-cost-summary",
    "label": "Food Cost Summary",
    "entity": "dish",
    "permissions": ["entity:dish:read"],
    "size": { "minWidth": 200, "minHeight": 150 },
    "tags": ["analytics", "cost", "dashboard"]
  }
}
```

## Naming Options

| Name | Pro | Con |
|------|-----|-----|
| **Liquid App** | Descriptive, memorable | Generic? |
| **Liquid Code** | Developer-facing | Sounds like a language |
| **Phonon Apps** | Brand unity | Tied to IDE name |
| **Organic App** | Evocative, natural | Doesn't explain mechanism |
| **Fluid Platform** | Clear metaphor | Fluid UI is taken |

Decision pending. The technology is the asset, not the name.

## Relationship to PTI

Liquid App is PTI applied to application architecture. Just as PTI organizes code as relationships (not sequences), Liquid App organizes UIs as compositions (not fixed layouts). The LLM is the first non-serial reader of code (PTI) AND the first non-serial composer of interfaces (Liquid App).

Patent IT 102026000002875 covers the underlying paradigm. Liquid App is a product expression of it.

## Roadmap

| Phase | What | Status |
|-------|------|--------|
| 0-2 | Phonon IDE base (Claude + agents + MCP) | DONE |
| 3 | Module Manifest System | DONE |
| 3.5 | Micro-cards + onboarding flow | NEXT |
| 4 | Card SDK + data bus + user mode | PLANNED |
| 5 | Marketplace + multi-tenant | PLANNED |
| 6 | Language-agnostic WASM cards | PLANNED |

# Liquid App Platform -- Vision Document

**Date:** 2026-03-08
**Author:** Alessio Cazzaniga
**Status:** Active pitch material

---

## Core Concept

A **Liquid App** is a **composition platform** where the AI is the runtime composer and developers at every level contribute to their layer. It is not an IDE. It is not a framework. It is an ecosystem that gives life back to developers.

A Liquid App composes itself from modules at runtime, guided by an LLM. The user describes what they need; the AI assembles it from available components. No fixed layouts, no rigid navigation -- the app is fluid, personal, adaptive.

The platform enables the full spectrum: from the industrial SaaS with senior backend engineers writing high-level services in Rust/Go/Python, to the small frontend developer building cards in React/HTML, to the end user who simply talks to Claude. Each layer is independent, connected through the bridge API (`window.phonon`). This is no longer exclusive -- anyone can contribute at their level.

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

## Value Proposition

### The Problem with Building Apps

The market already has products for known needs. But every business has a *contingent* need -- the specific, contextual, "next step" that no off-the-shelf product covers. Today, that next step requires hiring a dev team, building from scratch, or living without it.

Liquid App doesn't replace existing products. It lets any business take the next step -- customize, extend, compose -- on top of a liquid infrastructure. Not building garbage from zero. Making the incremental step that matters.

### Who Benefits and How

**The restaurateur / shop owner / freelancer** (Layer 3): Doesn't write code. Doesn't need technical language. Talks to Claude: "Ho bisogno di sapere il food cost di ogni piatto". Claude assembles the dashboard. The need is met without a dev team.

**The junior frontend developer** (Layer 2): Knows HTML and React. Can build a card, publish it, get paid. No VS Code extension knowledge, no backend complexity. Just `window.phonon.data.fetch()` and render.

**The senior backend engineer / agency** (Layer 1): Full access. Custom data providers in Rust/Go/Python. Deep integrations. The serious, industrial customization for enterprises that need it.

**Everyone earns.** The platform distributes value across all levels. The ragazzino who builds a card earns alongside the agency that builds the module infrastructure. Access is universal.

### Pitch Points

1. **Not from zero, the next step.** Existing market products cover the known needs. Liquid App covers the contingent, specific, contextual need -- the one that differs between every business.

2. **Any developer can contribute.** From HTML-only card developer to full-stack platform engineer. Each level has its own SDK, publishing path, and revenue share.

3. **AI-native composition.** The LLM IS the runtime composer. Not a helper -- the runtime. "Aggiungi il food cost" and a card appears. The UI is a conversation outcome, not a design artifact.

4. **Safe by default, powerful when needed.** Card level: sandboxed, safe, marketplace-publishable. Module level: VS Code extension, more power, reviewed. Platform level: full source access, maximum power.

5. **Domain-agnostic.** Restaurant, hotel, freelance CRM, inventory, compliance -- any domain where data + views + AI composition makes sense.

6. **Marketplace as business model.** Free cards (community), premium cards (specialized), module bundles ("Gestionale Ristorazione Complete"), platform licensing.

## Onboarding: Meeting Users Where They Are

The critical insight: most users (Layer 3) cannot express their need in technical language. They know what they want ("voglio sapere quanto mi costa ogni piatto") but not how to ask for it ("I need a food cost analytics dashboard with entity filtering").

### Onboarding Flow Design

```
Step 1: WHO ARE YOU?
  "Che tipo di attività gestisci?"
  [ ] Ristorante / Bar
  [ ] Hotel / B&B
  [ ] Negozio / Alimentari
  [ ] Freelancer / Consulente
  [ ] Altro: ___________

Step 2: WHAT DO YOU NEED?
  Based on Step 1, Claude asks 2-3 domain-specific questions in plain language.

  For Ristorante:
  "Cosa vorresti tenere sotto controllo?"
  [ ] Quanto spendo per ogni piatto (food cost)
  [ ] Ordini e servizio in tempo reale
  [ ] Fornitori e consegne
  [ ] Menu del giorno e disponibilità
  [ ] Incassi e statistiche

  Multiple selection. No technical jargon.

Step 3: BUILD
  Claude generates a composition intent based on selections.
  Installs the relevant module (e.g., "Gestionale Ristorazione").
  Composes the initial dashboard from selected cards.
  User sees their app. Ready to use.
```

### Design Principles for Onboarding

- **Zero technical language.** Every question in the user's domain vocabulary.
- **2-3 questions max.** Respect the user's time. Claude can refine later.
- **Visual result immediately.** After onboarding, the user sees their dashboard. Not a configuration page. Not a "getting started" guide. Their data, their cards, working.
- **Iterative refinement.** "Non mi serve il food cost, aggiungimi gli ordini" -- Claude adapts in real-time. Onboarding is the start, not the end.
- **Domain-specific question banks.** Each module bundle declares its onboarding questions in the manifest. The platform composes the right questions for the right user.

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

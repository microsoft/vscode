# Mobile Agent Sessions — Architecture

## Core Principle

**Every feature accessible in the desktop window must be accessible on mobile — same functionality, different presentation.** Mobile is NOT "desktop minus stuff." It is a parallel UI layer where the same services, views, and actions are rendered through mobile-native interaction patterns.

## Architecture

### Mobile Part Subclasses

Desktop Parts (`ChatBarPart`, `SidebarPart`, `PanelPart`, `AuxiliaryBarPart`) remain unchanged. Each has a **mobile subclass** that extends it and overrides only `layout()` and/or `updateStyles()`. `AgenticPaneCompositePartService` conditionally instantiates the mobile or desktop variant at startup based on viewport width (`< 640px` → phone).

Each mobile Part checks the current layout class (via `isPhoneLayout(layoutService)`) at every call. When the viewport is phone it applies mobile behavior (full-cell layout, no card chrome, no session-bar subtraction). When the viewport is tablet/desktop — which happens when a real phone rotates past the 640px breakpoint — it delegates to the desktop `super` implementation. This means a `Mobile*Part` instance is safe to keep through a viewport-class transition without producing wrong layout math.

This means:
- Desktop code has **zero** phone-layout checks — all mobile logic lives in mobile subclasses, `MobileTopBar`, and CSS.
- Phone-instantiated parts adapt correctly to rotation across the 640px breakpoint by delegating to `super`.

After a viewport-class transition the workbench calls `updateStyles()` on each pane composite part so card-chrome inline styles get re-applied (desktop) or cleared (phone) for the new class.

### View & Action Gating

Views, menu items, and actions use `when` clauses with the `sessionsIsPhoneLayout` context key to control visibility in phone layout. This follows a **default-deny** approach for phone:

- **Desktop-only features** add `when: IsPhoneLayoutContext.negate()` to their view descriptors and menu registrations. They simply don't appear on phone.
- **Phone-compatible features** (chat, sessions list) have no phone gate — they render on all viewports.
- **Phone-specific replacements** (when ready) register with `when: IsPhoneLayoutContext` and live in separate files under `parts/mobile/contributions/`.

Tablet and larger viewports currently fall back to the desktop layout; no separate tablet design exists yet.

Two registrations can target the same slot with opposite `when` clauses, pointing to different view classes in different files — giving full file separation with no internal branching.

#### Current Gating Status

| Feature | Phone Status | Mechanism |
|---------|--------------|-----------|
| Sessions list (sidebar) | ✅ Compatible | No gate |
| Chat views (ChatBar) | ✅ Compatible | No gate |
| Changes view (AuxiliaryBar) | ❌ Gated | `when: !sessionsIsPhoneLayout` on view descriptor |
| Files view (AuxiliaryBar) | ❌ Gated | `when: !sessionsIsPhoneLayout` on view descriptor |
| Logs view (Panel) | ❌ Gated | `when: !sessionsIsPhoneLayout` on view descriptor |
| Terminal actions | ❌ Gated | `when: !sessionsIsPhoneLayout` on menu item |
| "Open in VS Code" action | ❌ Gated | `when: !sessionsIsPhoneLayout` on menu item |
| Code review toolbar | ❌ Gated | `when: !sessionsIsPhoneLayout` on menu item |
| Customizations toolbar | ❌ Hidden | CSS `display: none` on phone |
| Titlebar | ❌ Hidden | Grid `visible: false` + CSS + MobileTopBar replacement |

### Phone Layout

On phone-sized viewports (`< 640px` width):

```
┌──────────────────────────────────┐
│  [☰]  Session Title          [+] │  ← MobileTopBar (prepended before grid)
├──────────────────────────────────┤
│                                  │
│     Chat (edge-to-edge)          │  ← Grid: ChatBarPart fills 100%
│                                  │
│                                  │
│                                  │
│  ┌──────────────────────────┐    │
│  │  Chat input              │    │  ← Pinned to bottom
│  └──────────────────────────┘    │
└──────────────────────────────────┘
```

- **MobileTopBar** is a DOM element prepended above the grid. It has a hamburger (☰), session title, and new session (+) button.
- **Sidebar** is hidden by default and opens as an **85% width drawer overlay** with a backdrop when the hamburger is tapped. CSS makes its `split-view-view` absolutely positioned with `z-index: 250`. The workbench manually calls `sidebarPart.layout()` with drawer dimensions after opening. Closing the drawer clears the navigation stack.
- **Titlebar** is hidden in the grid (`visible: false`) and via CSS — replaced by MobileTopBar.
- **SessionCompositeBar** (chat tabs) is hidden via CSS.
- The grid uses `display: flex; flex-direction: column` and all `split-view-view:has(> .part)` containers are positioned absolutely at `100% width/height`.

### Viewport Classification

`SessionsLayoutPolicy` classifies the viewport:
- **phone**: `width < 640px`
- **tablet**: `640px ≤ width < 1024px` (treated as desktop; no phone-specific chrome)
- **desktop**: `width ≥ 1024px`

The workbench toggles the `phone-layout` CSS class on `layout()` and creates/destroys mobile components when the viewport class changes at runtime (e.g., DevTools device emulation, or a real phone rotating across the 640px breakpoint). MobileTopBar lifecycle is managed via a `DisposableStore` that is cleared on viewport transitions to prevent leaks.

### Context Keys

| Key | Type | Purpose |
|-----|------|---------|
| `sessionsIsPhoneLayout` | `boolean` | `true` when the viewport is phone (< 640px) |
| `sessionsKeyboardVisible` | `boolean` | `true` when the virtual keyboard is visible |

### Desktop → Mobile Component Mapping

| Desktop Component | Mobile Equivalent | How Accessed |
|---|---|---|
| **Titlebar** (3-section toolbar) | **MobileTopBar** (☰ / title / +) | Always visible at top |
| **Sidebar** (sessions list) | Drawer overlay (85% width) | Hamburger button (☰) |
| **ChatBar** (chat widget) | Same Part, edge-to-edge, no card chrome | Default view (always visible) |
| **AuxiliaryBar** (files, changes) | Gated — not shown on mobile | Planned: mobile-specific view |
| **Panel** (terminal, output) | Gated — not shown on mobile | Planned: mobile-specific view |
| **SessionCompositeBar** (chat tabs) | Hidden on phone | — |
| **New Session** (sidebar button) | + button in MobileTopBar | Always visible in top bar |

## File Map

### Mobile Part Subclasses

| File | Purpose |
|------|---------|
| `browser/parts/mobile/mobileChatBarPart.ts` | Extends `ChatBarPart`. Overrides `layout()` (no card margins) and `updateStyles()` (no inline card styles). |
| `browser/parts/mobile/mobileSidebarPart.ts` | Extends `SidebarPart`. Overrides `updateStyles()` (no inline card/title styles). |
| `browser/parts/mobile/mobileAuxiliaryBarPart.ts` | Extends `AuxiliaryBarPart`. Overrides `layout()` and `updateStyles()` (no card margins or inline styles). |
| `browser/parts/mobile/mobilePanelPart.ts` | Extends `PanelPart`. Overrides `layout()` and `updateStyles()` (no card margins or inline styles). |

### Mobile Chrome Components

| File | Purpose |
|------|---------|
| `browser/parts/mobile/mobileTopBar.ts` | Phone top bar: hamburger (☰), session title, new session (+). Emits `onDidClickHamburger`, `onDidClickNewSession`, `onDidClickTitle`. |
| `browser/parts/mobile/mobileChatShell.css` | **Single source of truth** for all phone-layout CSS: flex column layout, split-view-view absolute positioning, card chrome removal, part/content width overrides, sidebar title hiding, composite bar hiding, welcome page layout, sash hiding, button focus overrides, mobile pickers. |

### Layout & Navigation

| File | Purpose |
|------|---------|
| `browser/layoutPolicy.ts` | `SessionsLayoutPolicy`: observable viewport classification (phone/tablet/desktop), platform flags (isIOS, isAndroid, isTouchDevice), part visibility and size defaults. |
| `browser/mobileNavigationStack.ts` | `MobileNavigationStack`: Android back button integration via `history.pushState` / `popstate`. Supports `push()`, `pop()`, and `clear()`. |
| `common/contextkeys.ts` | Phone context keys: `IsPhoneLayoutContext`, `KeyboardVisibleContext`. |

### Part Instantiation

| File | Purpose |
|------|---------|
| `browser/paneCompositePartService.ts` | `AgenticPaneCompositePartService`: checks viewport width at construction time and instantiates `Mobile*Part` vs desktop `*Part` classes accordingly. |

### Workbench Integration

| File | Key Changes |
|------|-------------|
| `browser/workbench.ts` | Layout policy integration, MobileTopBar creation/destruction (via `DisposableStore`), sidebar drawer open/close with backdrop, viewport-class-change detection, window resize listener, grid height calculation (subtracts MobileTopBar height), titlebar grid visibility toggle, `ISessionsManagementService` for new session button. |
| `browser/parts/chatBarPart.ts` | `_lastLayout` changed from `private` to `protected` for mobile subclass access. |

### Styling

| File | Purpose |
|------|---------|
| `browser/parts/mobile/mobileChatShell.css` | All phone-layout CSS (see above). |
| `browser/parts/media/sidebarPart.css` | Sidebar drawer overlay CSS: 85% width, z-index 250, slide-in animation, backdrop. |
| `browser/media/style.css` | Mobile overscroll containment, 44px touch targets, quick pick bottom sheets, context menu action sheets, dialog sizing, notification positioning, hover card suppression, editor modal full-screen. |

## Remaining Work

- **Session title sync**: MobileTopBar shows hardcoded "New Session" — needs to subscribe to `sessionsManagementService.activeSession` and update title when session changes.
- **Files & Terminal access**: Should become phone-specific views gated with `when: IsPhoneLayoutContext`.
- **iOS keyboard handling**: Adjust layout when virtual keyboard appears (context key exists, but no layout response yet).
- **Session list inline actions**: Make always-visible on touch devices (no hover-to-reveal).
- **Customizations on mobile**: Currently hidden — needs a mobile-friendly alternative.

# Mobile Agent Sessions — Architecture

## Core Principle

**Every feature accessible in the desktop window must be accessible on mobile — same functionality, different presentation.** Mobile is NOT "desktop minus stuff." It is a parallel UI layer where the same services, views, and actions are rendered through mobile-native interaction patterns.

## Architecture

### Mobile Part Subclasses

Desktop Parts (`ChatBarPart`, `SidebarPart`, `PanelPart`, `AuxiliaryBarPart`) remain unchanged. Each has a **mobile subclass** that extends it and overrides only `layout()` and/or `updateStyles()`. `AgenticPaneCompositePartService` conditionally instantiates the mobile or desktop variant at startup based on viewport width (`< 640px` → phone).

Each mobile Part checks the current layout class (via `isPhoneLayout(layoutService)`) at every call. When the viewport is phone it applies mobile behavior (full-cell layout, no card chrome, no session-bar subtraction). When the viewport is tablet/desktop — which happens when a real phone rotates past the 640px breakpoint — it delegates to the desktop `super` implementation. This means a `Mobile*Part` instance is safe to keep through a viewport-class transition without producing wrong layout math.

This means:
- Desktop code has **zero** phone-layout checks — all mobile logic lives in mobile subclasses, `MobileTitlebarPart`, and CSS.
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
| Changes view (AuxiliaryBar) | ❌ Gated (with mobile equivalent) | `when: !sessionsIsPhoneLayout` on view descriptor; phone uses `MobileChangesView` overlay reachable from the title-bar Changes pill |
| Files view (AuxiliaryBar) | ❌ Gated | `when: !sessionsIsPhoneLayout` on view descriptor |
| Logs view (Panel) | ❌ Gated | `when: !sessionsIsPhoneLayout` on view descriptor |
| Terminal actions | ❌ Gated | `when: !sessionsIsPhoneLayout` on menu item |
| "Open in VS Code" action | ❌ Gated | `when: !sessionsIsPhoneLayout` on menu item |
| Code review toolbar | ❌ Gated | `when: !sessionsIsPhoneLayout` on menu item |
| Customizations toolbar | ❌ Hidden | CSS `display: none` on phone |
| Titlebar | ❌ Hidden | Grid `visible: false` + CSS + MobileTitlebarPart replacement |

### Phone Layout

On phone-sized viewports (`< 640px` width):

```
┌──────────────────────────────────┐
│  [☰]  Session Title      [+|👤] │  ← MobileTitlebarPart (prepended before grid)
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

- **MobileTitlebarPart** is a DOM element prepended above the grid. It has a hamburger (☰), session title, and a contextual right slot that swaps between the new session (+) button (when in a chat) and the account indicator 👤 (on the welcome / new session screen).
- **Sidebar** is hidden by default and opens as an **85% width drawer overlay** with a backdrop when the hamburger is tapped. CSS makes its `split-view-view` absolutely positioned with `z-index: 250`. The workbench manually calls `sidebarPart.layout()` with drawer dimensions after opening. Closing the drawer clears the navigation stack.
- **Titlebar** is hidden in the grid (`visible: false`) and via CSS — replaced by MobileTitlebarPart.
- **SessionCompositeBar** (chat tabs) is hidden via CSS.
- The grid uses `display: flex; flex-direction: column` and all `split-view-view:has(> .part)` containers are positioned absolutely at `100% width/height`.

### Viewport Classification

`SessionsLayoutPolicy` classifies the viewport:
- **phone**: `width < 640px`
- **tablet**: `640px ≤ width < 1024px` (treated as desktop; no phone-specific chrome)
- **desktop**: `width ≥ 1024px`

The workbench toggles the `phone-layout` CSS class on `layout()` and creates/destroys mobile components when the viewport class changes at runtime (e.g., DevTools device emulation, or a real phone rotating across the 640px breakpoint). MobileTitlebarPart lifecycle is managed via a `DisposableStore` that is cleared on viewport transitions to prevent leaks.

### Context Keys

| Key | Type | Purpose |
|-----|------|---------|
| `sessionsIsPhoneLayout` | `boolean` | `true` when the viewport is phone (< 640px) |
| `sessionsKeyboardVisible` | `boolean` | `true` when the virtual keyboard is visible |

### Desktop → Mobile Component Mapping

| Desktop Component | Mobile Equivalent | How Accessed |
|---|---|---|
| **Titlebar** (3-section toolbar) | **MobileTitlebarPart** (☰ / title / +|👤) | Always visible at top |
| **Sidebar** (sessions list) | Drawer overlay (85% width) | Hamburger button (☰) |
| **ChatBar** (chat widget) | Same Part, edge-to-edge, no card chrome | Default view (always visible) |
| **AuxiliaryBar** (files, changes) | Gated — not shown on mobile | Planned: mobile-specific view |
| **Panel** (terminal, output) | Gated — not shown on mobile | Planned: mobile-specific view |
| **SessionCompositeBar** (chat tabs) | Hidden on phone | — |
| **New Session** (sidebar button) | + button in MobileTitlebarPart | Visible in top bar when in a chat |
| **Account indicator** (titlebar) | Account button in MobileTitlebarPart | Visible in top bar on welcome/new session |

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
| `mobileTitlebarPart.ts` | Phone top bar: hamburger (☰), session title, contextual right slot (+ for in-chat, account indicator for welcome). Emits `onDidClickHamburger`, `onDidClickNewSession`, `onDidClickTitle`. Includes account state tracking, avatar loading, and account panel with copilot dashboard. |
| `mobileChatShell.css` | **Single source of truth** for all phone-layout CSS: flex column layout, split-view-view absolute positioning, card chrome removal, part/content width overrides, sidebar title hiding, composite bar hiding, welcome page layout, sash hiding, button focus overrides, chip row styling. |
| `mobilePickerSheet.ts` | Reusable phone-friendly bottom sheet for picker-style choices. Promise-based overlay with backdrop, drag handle, header (title + Done button + optional header actions), sectioned listbox, and optional inline search with debounced cancellable loads. Uses `DisposableStore` for lifecycle. |
| `media/mobilePickerSheet.css` | Styling for the bottom sheet widget (backdrop, slide-up animation, row layout, search input, section dividers, checkmarks). |
| `mobileChipLaneScroll.ts` | Pointer-event-based horizontal scroll helper for the config chip row. Overcomes monaco's `Gesture.addTarget` eating `touchmove` by translating `pointermove` into `scrollLeft` updates. Phone-gated via `isPhoneLayout()` — no-ops on desktop. |
| `contributions/mobileChangesView.ts` | Full-screen overlay listing every file changed in the active session (master view). Reactive over `ISessionsManagementService.activeSession.changes`. Each row uses a codicon change-type icon (`diffAdded` / `diffModified` / `diffRemoved` via `ThemeIcon.asClassNameArray`), filename, relative path, an A/M/D pill, and `+N -N` counters. Tapping a row invokes `MOBILE_OPEN_DIFF_VIEW_COMMAND_ID` with the per-file payload **plus** the full sibling list and index — the diff view uses that for prev/next chevrons. Replaces the legacy QuickPick the title-bar Changes pill used to open. |
| `contributions/mobileDiffView.ts` | Full-screen overlay rendering a unified diff for one file (detail view). Uses `linesDiffComputers.getDefault()` for hunk computation and async `tokenizeToString` from `editor/common/languages/textToHtmlTokenizer.ts` for Monaco-quality syntax highlighting. After tokenization, a per-render `<style>` block is injected from `TokenizationRegistry.getColorMap()` so `<span class="mtkN">` token classes resolve to the active theme's colors. When no TextMate grammar is registered for the language (the agents window doesn't load language extensions), falls back to a regex tokenizer that emits `<span class="mobile-diff-tok-{kind}">` CSS-class spans; per-theme colors for those classes are defined in `mobileOverlayViews.css`. Header includes prev/next chevrons + "N / M" position when multiple siblings are passed; horizontal-swipe gesture as an alt navigation. Supports deletion-only diffs (`modifiedURI` undefined). |
| `contributions/media/mobileOverlayViews.css` | Shared CSS for both overlays — the `mobile-overlay-*` chrome (header, back button, body, scroll wrapper), diff-specific styles (sticky hunk header, `min-width: max-content` on lines so horizontal scroll engages, 3px coloured left-edge bar on add/remove rows, prev/next nav buttons), and the master-list row styles (file-icon themable container, A/M/D pill, +/− counters). |

### Mobile Picker Subclasses

Mobile picker subclasses live in `contrib/` alongside their base classes (not in `browser/parts/mobile/`), because VS Code's layering rules prohibit `browser/` from importing `contrib/`. Each subclass extends the desktop picker and overrides the `_showPicker()` method to use `showMobilePickerSheet()` on phone, falling back to `super._showPicker()` on desktop. This means:

- The mobile subclass is always instantiated (even on desktop), so viewport-class transitions (rotation) work without re-creation.
- Desktop code has zero phone-layout checks — all phone branching lives in the mobile subclass's override.
- The base class promotes only the members the subclass needs from `private` to `protected`.

| File | Base class | Purpose |
|------|-----------|---------|
| `contrib/copilotChatSessions/browser/mobilePermissionPicker.ts` | `PermissionPicker` | Renders Default/Bypass/Autopilot as a bottom sheet on phone. |
| `contrib/chat/browser/mobileSessionTypePicker.ts` | `SessionTypePicker` | Renders session-type choices as a bottom sheet on phone. |
| `contrib/chat/browser/webWorkspacePicker.ts` | `WorkspacePicker` | Web variant: scopes to active host filter and renders as a bottom sheet on phone. Note: this is the only "mobile" picker that lives in a non-`mobile*`-named file because the same class also handles the desktop-web case (host scoping). |
| `contrib/chat/browser/mobileWorkspacePickerSheet.ts` | (helper) | Builds `IMobilePickerSheetItem[]` from workspace picker items + browse actions. Used by `WebWorkspacePicker` on phone. |
| `contrib/chat/browser/agentHost/mobileAgentHostSessionConfigPicker.ts` | `AgentHostSessionConfigPicker` | Routes Isolation + Branch to a unified bottom sheet on phone. Defined in the same file as the base to avoid a circular ESM import. |
| `contrib/chat/browser/agentHost/mobileChatInputConfigPicker.ts` | (standalone) | Phone-only chat-input chip that combines Mode + Model into a unified bottom sheet. Replaces the desktop mode + model pickers (gated off via `when:` clauses) on phone-layout viewports. |

### Layout & Navigation

| File | Purpose |
|------|---------|
| `layoutPolicy.ts` | `SessionsLayoutPolicy`: observable viewport classification (phone/tablet/desktop), platform flags (isIOS, isAndroid, isTouchDevice), part visibility and size defaults. |
| `mobileNavigationStack.ts` | `MobileNavigationStack`: Android back button integration via `history.pushState` / `popstate`. Supports `push()`, `pop()`, and `clear()`. |
| `mobileLayout.ts` | `isPhoneLayout(layoutService)`: synchronous one-shot phone check (DOM class read on `mainContainer`). Use for layout passes and `showPicker()` handlers. For reactive change notifications, use `IsPhoneLayoutContext` context key. |
| `common/contextkeys.ts` | Phone context keys: `IsPhoneLayoutContext`, `KeyboardVisibleContext`. |

### Part Instantiation

| File | Purpose |
|------|---------|
| `browser/paneCompositePartService.ts` | `AgenticPaneCompositePartService`: checks viewport width at construction time and instantiates `Mobile*Part` vs desktop `*Part` classes accordingly. |

### Workbench Integration

| File | Key Changes |
|------|-------------|
| `browser/workbench.ts` | Layout policy integration, MobileTitlebarPart creation/destruction (via `DisposableStore`), sidebar drawer open/close with backdrop, viewport-class-change detection, window resize listener, grid height calculation (subtracts MobileTitlebarPart height), titlebar grid visibility toggle, `ISessionsManagementService` for new session button. |
| `browser/parts/chatBarPart.ts` | `_lastLayout` changed from `private` to `protected` for mobile subclass access. |

### Styling

| File | Purpose |
|------|---------|
| `browser/parts/mobile/mobileChatShell.css` | All phone-layout CSS (see above). |
| `browser/parts/media/sidebarPart.css` | Sidebar drawer overlay CSS: 85% width, z-index 250, slide-in animation, backdrop. |
| `browser/media/style.css` | Mobile overscroll containment, 44px touch targets, quick pick bottom sheets, context menu action sheets, dialog sizing, notification positioning, hover card suppression, editor modal full-screen. |

## Remaining Work

- **Files & Terminal access**: Should become phone-specific views gated with `when: IsPhoneLayoutContext`. (The Changes view already has its phone equivalent — see `MobileChangesView`.)
- **iOS keyboard handling**: Adjust layout when virtual keyboard appears (context key exists, but no layout response yet).
- **Session list inline actions**: Make always-visible on touch devices (no hover-to-reveal).
- **Customizations on mobile**: Currently hidden — needs a mobile-friendly alternative.
- **Inline word-level diff highlighting** in `MobileDiffView`: the per-file tokenization cache is already in place to make this straightforward to layer on later.

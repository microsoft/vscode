# Agent Sessions Workbench Layout Specification

This document is the **authoritative specification** for the Agent Sessions workbench layout. All implementation changes must be reflected here, and all development work should reference this document.

---

## 1. Overview

The Agent Sessions Workbench (`Workbench` in `sessions/browser/workbench.ts`) provides a simplified, fixed layout optimized for agent session workflows. Unlike the default VS Code workbench, this layout:

- Does **not** support settings-based customization
- Has **fixed** part positions
- Excludes several standard workbench parts

---

## 2. Layout Structure

### 2.1 Visual Representation

```
┌─────────┬───────────────────────────────────────────────────────┐
│         │                    Titlebar                           │
│         ├────────────────────────────────────┬──────────────────┤
│ Sidebar │              Chat Bar              │  Auxiliary Bar   │
│         ├────────────────────────────────────┴──────────────────┤
│         │                      Panel                            │
└─────────┴───────────────────────────────────────────────────────┘

         ┌───────────────────────────────────────┐
         │     ╔═══════════════════════════╗     │
         │     ║    Editor Modal Overlay   ║     │
         │     ║  ┌─────────────────────┐  ║     │
         │     ║  │ [header]        [X] │  ║     │
         │     ║  ├─────────────────────┤  ║     │
         │     ║  │                     │  ║     │
         │     ║  │    Editor Part      │  ║     │
         │     ║  │                     │  ║     │
         │     ║  │                     │  ║     │
         │     ║  └─────────────────────┘  ║     │
         │     ╚═══════════════════════════╝     │
         └───────────────────────────────────────┘
               (shown when editors are open)
```

### 2.2 Parts

#### Included Parts

| Part | ID Constant | Position | Default Visibility | ViewContainerLocation |
|------|-------------|----------|------------|----------------------|
| Titlebar | `Parts.TITLEBAR_PART` | Top of right section | Always visible | — |
| Sidebar | `Parts.SIDEBAR_PART` | Left, spans full height from top to bottom | Visible | `ViewContainerLocation.Sidebar` |
| Chat Bar | `Parts.CHATBAR_PART` | Top-right section, takes remaining width | Visible | `ViewContainerLocation.ChatBar` |
| Editor | `Parts.EDITOR_PART` | **Modal overlay** (not in grid) | Hidden | — |
| Auxiliary Bar | `Parts.AUXILIARYBAR_PART` | Top-right section, right side | Visible | `ViewContainerLocation.AuxiliaryBar` |
| Panel | `Parts.PANEL_PART` | Below Chat Bar and Auxiliary Bar (right section only) | Hidden | `ViewContainerLocation.Panel` |

#### Excluded Parts

The following parts from the default workbench are **not included**:

| Part | ID Constant | Reason |
|------|-------------|--------|
| Activity Bar | `Parts.ACTIVITYBAR_PART` | Simplified navigation; global activities (Accounts, Manage) are in titlebar instead |
| Status Bar | `Parts.STATUSBAR_PART` | Reduced chrome |
| Banner | `Parts.BANNER_PART` | Not needed |

---

## 3. Titlebar Configuration

The Agent Sessions workbench uses a fully independent titlebar part (`TitlebarPart`) with its own title service (`TitleService`), implemented in `sessions/browser/parts/titlebarPart.ts`. This is a standalone implementation (not extending `BrowserTitlebarPart`) with a simple three-section layout driven entirely by menus.

### 3.1 Titlebar Part Architecture

The titlebar is divided into three sections, each rendered by a `MenuWorkbenchToolBar`:

| Section | Menu ID | Purpose |
|---------|---------|--------|
| Left | `Menus.TitleBarLeft` | Toggle sidebar and other left-aligned actions |
| Center | `Menus.CommandCenter` | Session picker widget (rendered via `IActionViewItemService`) |
| Right | `Menus.TitleBarRight` | Run script split button, open submenu, toggle secondary sidebar |

No menubar, no editor actions, no layout controls, no `WindowTitle` dependency.

### 3.2 Command Center

The Agent Sessions titlebar includes a command center with a custom title bar widget (`SessionsTitleBarWidget`). It uses custom menu IDs separate from the default workbench command center to avoid conflicts:

- **`Menus.CommandCenter`** — The center toolbar menu (replaces `MenuId.CommandCenter`)
- **`Menus.TitleBarControlMenu`** — A submenu registered in the command center whose rendering is intercepted by `IActionViewItemService` to display the custom widget

The widget:
- Extends `BaseActionViewItem` and renders a clickable label showing the active session title
- Shows kind icon (provider type icon), session title, repository folder name, and changes summary (+insertions -deletions)
- On click, opens the `AgentSessionsPicker` quick pick to switch between sessions
- Gets the active session label from `IActiveSessionService.getActiveSession()` and the live model title from `IChatService`, falling back to "New Session" if no active session is found
- Re-renders automatically when the active session changes via `autorun` on `IActiveSessionService.activeSession`, and when session data changes via `IAgentSessionsService.model.onDidChangeSessions`
- Is registered via `SessionsTitleBarContribution` (an `IWorkbenchContribution` in `contrib/sessions/browser/sessionsTitleBarWidget.ts`) that calls `IActionViewItemService.register()` to intercept the submenu rendering

### 3.3 Left Toolbar

The Agent Sessions titlebar includes a custom left toolbar that appears after the app icon. This toolbar:

- Uses `Menus.TitleBarLeft` for its actions
- Uses `HiddenItemStrategy.NoHide` so actions cannot be hidden by users
- Displays actions registered to `Menus.TitleBarLeft`

### 3.4 Titlebar Actions

| Action | ID | Location | Behavior |
|--------|-----|----------|----------|
| Toggle Sidebar | `workbench.action.agentToggleSidebarVisibility` | Left toolbar (`TitleBarLeft`) | Toggles primary sidebar visibility |
| Run Script | `workbench.action.agentSessions.runScript` | Right toolbar (`TitleBarRight`) | Split button: runs configured script or shows configure dialog |
| Open... | (submenu) | Right toolbar (`TitleBarRight`) | Split button submenu: Open Terminal, Open in VS Code |
| Toggle Secondary Sidebar | `workbench.action.agentToggleSecondarySidebarVisibility` | Right toolbar (`TitleBarRight`) | Toggles auxiliary bar visibility |

The toggle sidebar action:
- Shows `layoutSidebarLeft` icon when sidebar is visible
- Shows `layoutSidebarLeftOff` icon when sidebar is hidden
- Bound to `Ctrl+B` / `Cmd+B` keybinding
- Announces visibility changes to screen readers

The Run Script action:
- Displayed as a split button via `RunScriptDropdownMenuId` submenu on `Menus.TitleBarRight`
- Primary action runs the configured script command in a terminal
- Dropdown includes "Configure Run Action..." to set/change the script
- Registered in `contrib/chat/browser/runScriptAction.ts`

The Open... action:
- Displayed as a split button via `Menus.OpenSubMenu` on `Menus.TitleBarRight`
- Contains "Open Terminal" (opens terminal at session worktree) and "Open in VS Code" (opens worktree in new VS Code window)
- Registered in `contrib/chat/browser/chat.contribution.ts`

### 3.5 Panel Title Actions

The panel title bar includes actions for controlling the panel:

| Action | ID | Icon | Order | Behavior |
|--------|-----|------|-------|----------|
| Hide Panel | `workbench.action.agentTogglePanelVisibility` | `close` | 2 | Hides the panel |

### 3.6 Account Widget

The account widget has been moved from the titlebar to the **sidebar footer**. It is rendered as a custom `AccountWidget` action view item:

- Registered in `contrib/accountMenu/browser/account.contribution.ts`
- Uses the `Menus.SidebarFooter` menu
- Shows account button with sign-in/sign-out and an update button when an update is available
- Account menu shows signed-in user label from `IDefaultAccountService` (or Sign In), Sign Out, Settings, and Check for Updates

---

## 4. Grid Structure

The layout uses `SerializableGrid` from `vs/base/browser/ui/grid/grid.js`.

### 4.1 Grid Tree

The Editor part is **not** in the grid — it is rendered as a modal overlay (see Section 4.3).

```
Orientation: HORIZONTAL (root)
├── Sidebar (leaf, size: 300px default)
└── Right Section (branch, VERTICAL, size: remaining width)
    ├── Titlebar (leaf, size: titleBarHeight)
    ├── Top Right (branch, HORIZONTAL, size: remaining height - panel)
    │   ├── Chat Bar (leaf, size: remaining width)
    │   └── Auxiliary Bar (leaf, size: 300px default)
    └── Panel (leaf, size: 300px default, hidden by default)
```

This structure places the sidebar at the root level spanning the full window height. The titlebar, chat bar, auxiliary bar, and panel are all within the right section.

### 4.2 Default Sizes

| Part | Default Size |
|------|--------------|
| Sidebar | 300px width |
| Auxiliary Bar | 300px width |
| Chat Bar | Remaining space |
| Editor Modal | 80% of workbench (min 400x300, max 1200x900), calculated in TypeScript |
| Panel | 300px height |
| Titlebar | Determined by `minimumHeight` (~30px) |

### 4.3 Editor Modal

The Editor part is rendered as a **modal overlay** rather than being part of the grid. This provides a focused editing experience that hovers above the main workbench layout.

#### Modal Structure

```
EditorModal
├── Overlay (semi-transparent backdrop)
├── Container (centered dialog)
│   ├── Header (32px, contains close button)
│   └── Content (editor part fills remaining space)
```

#### Behavior

| Trigger | Action |
|---------|--------|
| Editor opens (`onWillOpenEditor`) | Modal shows automatically |
| All editors close | Modal hides automatically |
| Click backdrop | Close all editors, hide modal |
| Click close button (X) | Close all editors, hide modal |
| Press Escape key | Close all editors, hide modal |

#### Modal Sizing

Modal dimensions are calculated in TypeScript rather than CSS. The `EditorModal.layout()` method receives workbench dimensions and computes the modal size with constraints:

| Property | Value | Constant |
|----------|-------|----------|
| Size Percentage | 80% of workbench | `MODAL_SIZE_PERCENTAGE = 0.8` |
| Max Width | 1200px | `MODAL_MAX_WIDTH = 1200` |
| Max Height | 900px | `MODAL_MAX_HEIGHT = 900` |
| Min Width | 400px | `MODAL_MIN_WIDTH = 400` |
| Min Height | 300px | `MODAL_MIN_HEIGHT = 300` |
| Header Height | 32px | `MODAL_HEADER_HEIGHT = 32` |

The calculation:
```typescript
modalWidth = min(MODAL_MAX_WIDTH, max(MODAL_MIN_WIDTH, workbenchWidth * MODAL_SIZE_PERCENTAGE))
modalHeight = min(MODAL_MAX_HEIGHT, max(MODAL_MIN_HEIGHT, workbenchHeight * MODAL_SIZE_PERCENTAGE))
contentHeight = modalHeight - MODAL_HEADER_HEIGHT
```

#### CSS Classes

| Class | Applied To | Notes |
|-------|------------|-------|
| `editor-modal-overlay` | Overlay container | Positioned absolute, full size |
| `editor-modal-overlay.visible` | When modal is shown | Enables pointer events |
| `editor-modal-backdrop` | Semi-transparent backdrop | Clicking closes modal |
| `editor-modal-container` | Centered modal dialog | Width/height set in TypeScript |
| `editor-modal-header` | Header with close button | Fixed 32px height |
| `editor-modal-content` | Editor content area | Width/height set in TypeScript |
| `editor-modal-visible` | Added to `mainContainer` when modal is visible | — |

#### Implementation

The modal is implemented in `EditorModal` class (`parts/editorModal.ts`):

```typescript
class EditorModal extends Disposable {
    // Events
    readonly onDidChangeVisibility: Event<boolean>;

    // State
    get visible(): boolean;

    // Methods
    show(): void;   // Show modal using stored dimensions
    hide(): void;   // Hide modal
    close(): void;  // Close all editors, then hide
    layout(workbenchWidth: number, workbenchHeight: number): void; // Store dimensions, re-layout if visible
}
```

The `Workbench.layout()` passes the workbench dimensions to `EditorModal.layout()`, which calculates and applies the modal size with min/max constraints. Dimensions are stored so that `show()` can use them when the modal becomes visible.

---

## 5. Feature Support Matrix

| Feature | Default Workbench | Agent Sessions | Notes |
|---------|-------------------|----------------|-------|
| Activity Bar | ✅ Configurable | ❌ Not included | — |
| Status Bar | ✅ Configurable | ❌ Not included | — |
| Sidebar Position | ✅ Left/Right | 🔒 Fixed: Left | `getSideBarPosition()` returns `Position.LEFT` |
| Panel Position | ✅ Top/Bottom/Left/Right | 🔒 Fixed: Bottom | `getPanelPosition()` returns `Position.BOTTOM` |
| Panel Alignment | ✅ Left/Center/Right/Justify | 🔒 Fixed: Justify | `getPanelAlignment()` returns `'justify'` |
| Maximize Panel | ✅ Supported | ✅ Supported | Excludes titlebar when maximizing |
| Maximize Auxiliary Bar | ✅ Supported | ❌ No-op | `toggleMaximizedAuxiliaryBar()` does nothing |
| Zen Mode | ✅ Supported | ❌ No-op | `toggleZenMode()` does nothing |
| Centered Editor Layout | ✅ Supported | ❌ No-op | `centerMainEditorLayout()` does nothing |
| Menu Bar Toggle | ✅ Supported | ❌ No-op | `toggleMenuBar()` does nothing |
| Resize Parts | ✅ Supported | ✅ Supported | Via grid or programmatic API |
| Hide/Show Parts | ✅ Supported | ✅ Supported | Via `setPartHidden()` |
| Window Maximized State | ✅ Supported | ✅ Supported | Tracked per window ID |
| Fullscreen | ✅ Supported | ✅ Supported | CSS class applied |

---

## 6. API Reference

### 6.1 Part Visibility

```typescript
// Check if a part is visible
isVisible(part: Parts): boolean

// Show or hide a part
setPartHidden(hidden: boolean, part: Parts): void
```

**Behavior:**
- Hiding a part also hides its active pane composite
- Showing a part restores the last active pane composite
- **Panel Part:**
  - If the panel is maximized when hiding, it exits maximized state first
- **Editor Part Auto-Visibility:**
  - Automatically shows when an editor is about to open (`onWillOpenEditor`)
  - Automatically hides when the last editor closes (`onDidCloseEditor` + all groups empty)

### 6.2 Part Sizing

```typescript
// Get current size of a part
getSize(part: Parts): IViewSize

// Set absolute size of a part
setSize(part: Parts, size: IViewSize): void

// Resize by delta values
resizePart(part: Parts, sizeChangeWidth: number, sizeChangeHeight: number): void
```

### 6.3 Focus Management

```typescript
// Focus a specific part
focusPart(part: Parts): void

// Check if a part has focus
hasFocus(part: Parts): boolean

// Focus the Chat Bar (default focus target)
focus(): void
```

### 6.4 Container Access

```typescript
// Get the main container or active container
get mainContainer(): HTMLElement
get activeContainer(): HTMLElement

// Get container for a specific part
getContainer(targetWindow: Window, part?: Parts): HTMLElement | undefined
```

### 6.5 Layout Offset

```typescript
// Get offset info for positioning elements
get mainContainerOffset(): ILayoutOffsetInfo
get activeContainerOffset(): ILayoutOffsetInfo
```

Returns `{ top, quickPickTop }` where `top` is the titlebar height.

---

## 7. Events

| Event | Fired When |
|-------|------------|
| `onDidChangePartVisibility` | Any part visibility changes |
| `onDidLayoutMainContainer` | Main container is laid out |
| `onDidLayoutActiveContainer` | Active container is laid out |
| `onDidLayoutContainer` | Any container is laid out |
| `onDidChangeWindowMaximized` | Window maximized state changes |
| `onDidChangeNotificationsVisibility` | Notification visibility changes |
| `onWillShutdown` | Workbench is about to shut down |
| `onDidShutdown` | Workbench has shut down |

**Events that never fire** (unsupported features):
- `onDidChangeZenMode`
- `onDidChangeMainEditorCenteredLayout`
- `onDidChangePanelAlignment`
- `onDidChangePanelPosition`
- `onDidChangeAuxiliaryBarMaximized`

---

## 8. CSS Classes

### 8.1 Visibility Classes

Applied to `mainContainer` based on part visibility:

| Class | Applied When |
|-------|--------------|
| `nosidebar` | Sidebar is hidden |
| `nomaineditorarea` | Editor modal is hidden |
| `noauxiliarybar` | Auxiliary bar is hidden |
| `nochatbar` | Chat bar is hidden |
| `nopanel` | Panel is hidden |
| `editor-modal-visible` | Editor modal is visible |

### 8.2 Window State Classes

| Class | Applied When |
|-------|--------------|
| `fullscreen` | Window is in fullscreen mode |
| `maximized` | Window is maximized |

### 8.3 Platform Classes

Applied during workbench render:
- `monaco-workbench`
- `agent-sessions-workbench`
- `windows` / `linux` / `mac`
- `web` (if running in browser)
- `chromium` / `firefox` / `safari`

---

## 9. Agent Session Parts

The Agent Sessions workbench uses specialized part implementations that extend the base pane composite infrastructure but are simplified for agent session contexts.

### 9.1 Part Classes

| Part | Class | Extends | Location |
|------|-------|---------|----------|
| Sidebar | `SidebarPart` | `AbstractPaneCompositePart` | `sessions/browser/parts/sidebarPart.ts` |
| Auxiliary Bar | `AuxiliaryBarPart` | `AbstractPaneCompositePart` | `sessions/browser/parts/auxiliaryBarPart.ts` |
| Panel | `PanelPart` | `AbstractPaneCompositePart` | `sessions/browser/parts/panelPart.ts` |
| Chat Bar | `ChatBarPart` | `AbstractPaneCompositePart` | `sessions/browser/parts/chatBarPart.ts` |
| Titlebar | `TitlebarPart` / `MainTitlebarPart` | `Part` | `sessions/browser/parts/titlebarPart.ts` |
| Project Bar | `ProjectBarPart` | `Part` | `sessions/browser/parts/projectBarPart.ts` |
| Editor Modal | `EditorModal` | `Disposable` | `sessions/browser/parts/editorModal.ts` |

### 9.2 Key Differences from Standard Parts

| Feature | Standard Parts | Agent Session Parts |
|---------|----------------|---------------------|
| Activity Bar integration | Full support | No activity bar; account widget in sidebar footer |
| Composite bar position | Configurable (top/bottom/title/hidden) | Fixed: Title |
| Composite bar visibility | Configurable | Sidebar: hidden (`shouldShowCompositeBar()` returns `false`); ChatBar: hidden; Auxiliary Bar & Panel: visible |
| Auto-hide support | Configurable | Disabled |
| Configuration listening | Many settings | Minimal |
| Context menu actions | Full set | Simplified |
| Title bar | Full support | Sidebar: `hasTitle: true` (with footer); ChatBar: `hasTitle: false`; Auxiliary Bar & Panel: `hasTitle: true` |
| Visual margins | None | Auxiliary Bar: 8px top/bottom/right (card appearance); Panel: 8px bottom/left/right (card appearance); Sidebar: 0 (flush) |

### 9.3 Part Creation

The agent sessions pane composite parts are created and registered via the `AgenticPaneCompositePartService` in `sessions/browser/paneCompositePartService.ts`. This service is registered as a singleton for `IPaneCompositePartService` and directly instantiates each part:

```typescript
// In AgenticPaneCompositePartService constructor
this.registerPart(ViewContainerLocation.Panel, instantiationService.createInstance(PanelPart));
this.registerPart(ViewContainerLocation.Sidebar, instantiationService.createInstance(SidebarPart));
this.registerPart(ViewContainerLocation.AuxiliaryBar, instantiationService.createInstance(AuxiliaryBarPart));
this.registerPart(ViewContainerLocation.ChatBar, instantiationService.createInstance(ChatBarPart));
```

This architecture ensures that:
1. The agent sessions workbench uses its own part implementations rather than the standard workbench parts
2. Each part is instantiated eagerly in the constructor, as the service delegates all operations to the appropriate part by `ViewContainerLocation`

### 9.4 Storage Keys

Each agent session part uses separate storage keys to avoid conflicts with regular workbench state:

| Part | Setting | Storage Key |
|------|---------|-------------|
| Sidebar | Active viewlet | `workbench.agentsession.sidebar.activeviewletid` |
| Sidebar | Pinned viewlets | `workbench.agentsession.pinnedViewlets2` |
| Sidebar | Placeholders | `workbench.agentsession.placeholderViewlets` |
| Sidebar | Workspace state | `workbench.agentsession.viewletsWorkspaceState` |
| Auxiliary Bar | Active panel | `workbench.agentsession.auxiliarybar.activepanelid` |
| Auxiliary Bar | Pinned views | `workbench.agentsession.auxiliarybar.pinnedPanels` |
| Auxiliary Bar | Placeholders | `workbench.agentsession.auxiliarybar.placeholderPanels` |
| Auxiliary Bar | Workspace state | `workbench.agentsession.auxiliarybar.viewContainersWorkspaceState` |
| Panel | Active panel | `workbench.agentsession.panelpart.activepanelid` |
| Panel | Pinned panels | `workbench.agentsession.panel.pinnedPanels` |
| Panel | Placeholders | `workbench.agentsession.panel.placeholderPanels` |
| Panel | Workspace state | `workbench.agentsession.panel.viewContainersWorkspaceState` |
| Chat Bar | Active panel | `workbench.chatbar.activepanelid` |
| Chat Bar | Pinned panels | `workbench.chatbar.pinnedPanels` |
| Chat Bar | Placeholders | `workbench.chatbar.placeholderPanels` |
| Chat Bar | Workspace state | `workbench.chatbar.viewContainersWorkspaceState` |

### 9.5 Part Borders and Card Appearance

Parts manage their own border and background styling via the `updateStyles()` method. The auxiliary bar and panel use a **card appearance** with CSS variables for background and border:

| Part | Styling | Notes |
|------|---------|-------|
| Sidebar | Right border via `SIDE_BAR_BORDER` / `contrastBorder` | Flush appearance, no card styling |
| Chat Bar | Background only, no borders | `borderWidth` returns `0` |
| Auxiliary Bar | Card appearance via CSS variables `--part-background` / `--part-border-color` | Uses `SIDE_BAR_BACKGROUND` / `SIDE_BAR_BORDER`; transparent background on container; margins create card offset |
| Panel | Card appearance via CSS variables `--part-background` / `--part-border-color` | Uses `PANEL_BACKGROUND` / `PANEL_BORDER`; transparent background on container; margins create card offset |

---

### 9.6 Auxiliary Bar Run Script Dropdown

The `AuxiliaryBarPart` provides a custom `DropdownWithPrimaryActionViewItem` for the run script action (`workbench.action.agentSessions.runScript`). This is rendered as a split button with:

- **Primary action**: Runs the main script action
- **Dropdown**: Shows additional actions from the `AgentSessionsRunScriptDropdown` menu
- The dropdown menu is created from `MenuId.for('AgentSessionsRunScriptDropdown')` and updates dynamically when menu items change

### 9.7 Sidebar Footer

The `SidebarPart` includes a footer section (35px height) positioned below the pane composite content. The sidebar uses a custom `layout()` override that reduces the content height by `FOOTER_HEIGHT` and renders a `MenuWorkbenchToolBar` driven by `Menus.SidebarFooter`. The footer hosts the account widget (see Section 3.6).

On macOS native, the sidebar title area includes a traffic light spacer (70px) to push content past the system window controls, which is hidden in fullscreen mode.

---

## 10. Workbench Contributions

The Agent Sessions workbench registers contributions via module imports in `sessions.desktop.main.ts` (and `sessions.common.main.ts`). Key contributions:

| Contribution | Class | Phase | Location |
|-------------|-------|-------|----------|
| Run Script | `RunScriptContribution` | `AfterRestored` | `contrib/chat/browser/runScriptAction.ts` |
| Title Bar Widget | `SessionsTitleBarContribution` | `AfterRestored` | `contrib/sessions/browser/sessionsTitleBarWidget.ts` |
| Account Widget | `AccountWidgetContribution` | `AfterRestored` | `contrib/accountMenu/browser/account.contribution.ts` |
| Active Session Service | `ActiveSessionService` | Singleton | `contrib/sessions/browser/activeSessionService.ts` |
| Prompts Service | `AgenticPromptsService` | Singleton | `contrib/chat/browser/promptsService.ts` |

Additionally, `BranchChatSessionAction` is registered in `contrib/chat/browser/chat.contribution.ts`.

### 10.1 Changes View

The Changes view is registered in `contrib/changesView/browser/changesView.contribution.ts`:

- **Container**: `CHANGES_VIEW_CONTAINER_ID` in `ViewContainerLocation.AuxiliaryBar` (default, hidden if empty)
- **View**: `CHANGES_VIEW_ID` with `ChangesViewPane`
- **Window visibility**: `WindowVisibility.Sessions` (only visible in agent sessions workbench)

### 10.2 Sessions View

The Sessions view is registered in `contrib/sessions/browser/sessions.contribution.ts`:

- **Container**: Sessions container in `ViewContainerLocation.Sidebar` (default)
- **View**: `SessionsViewId` with `AgenticSessionsViewPane`
- **Window visibility**: `WindowVisibility.Sessions`

---

## 11. File Structure

```
src/vs/sessions/
├── README.md                               # Layer specification
├── LAYOUT.md                               # This specification
├── AI_CUSTOMIZATIONS.md                    # AI customization design document
├── sessions.common.main.ts                 # Common entry point (browser + desktop)
├── sessions.desktop.main.ts                # Desktop entry point (imports all contributions)
├── common/
│   └── contextkeys.ts                      # ChatBar context keys
├── browser/                                # Core workbench implementation
│   ├── workbench.ts                        # Main layout implementation (Workbench class)
│   ├── menus.ts                            # Agent sessions menu IDs (Menus export)
│   ├── layoutActions.ts                    # Layout actions (toggle sidebar, secondary sidebar, panel)
│   ├── paneCompositePartService.ts         # AgenticPaneCompositePartService
│   ├── style.css                           # Layout-specific styles (including editor modal)
│   ├── widget/                             # Agent sessions chat widget
│   │   ├── AGENTS_CHAT_WIDGET.md           # Chat widget architecture documentation
│   │   ├── agentSessionsChatWidget.ts      # Main chat widget wrapper
│   │   ├── agentSessionsChatTargetConfig.ts # Target configuration (observable)
│   │   ├── agentSessionsTargetPickerActionItem.ts # Target picker for input toolbar
│   │   └── media/
│   │       └── agentSessionsChatWidget.css
│   └── parts/
│       ├── titlebarPart.ts                 # Simplified titlebar part, MainTitlebarPart, AuxiliaryTitlebarPart, and TitleService
│       ├── sidebarPart.ts                  # Agent session sidebar (with footer and macOS traffic light spacer)
│       ├── auxiliaryBarPart.ts             # Agent session auxiliary bar (with run script dropdown)
│       ├── panelPart.ts                    # Agent session panel
│       ├── chatBarPart.ts                  # Chat Bar part implementation
│       ├── projectBarPart.ts              # Project bar part (folder entries, icon customization)
│       ├── editorModal.ts                  # Editor modal overlay implementation
│       ├── parts.ts                        # AgenticParts enum
│       ├── agentSessionsChatInputPart.ts   # Chat input part adapter
│       ├── agentSessionsChatWelcomePart.ts # Chat welcome part
│       └── media/
│           ├── titlebarpart.css
│           ├── sidebarPart.css
│           ├── chatBarPart.css
│           ├── projectBarPart.css
│           └── agentSessionsChatWelcomePart.css
├── electron-browser/                       # Desktop-specific entry points
│   ├── sessions.main.ts
│   ├── sessions.ts
│   ├── sessions.html
│   └── sessions-dev.html
├── contrib/                                # Feature contributions
│   ├── accountMenu/browser/                # Account menu widget for sidebar footer
│   │   ├── account.contribution.ts
│   │   └── media/
│   ├── aiCustomizationManagement/browser/  # AI customization management editor
│   ├── aiCustomizationTreeView/browser/    # AI customization tree view sidebar
│   ├── changesView/browser/                # File changes view
│   │   ├── changesView.contribution.ts
│   │   ├── changesView.ts
│   │   └── media/
│   ├── chat/browser/                       # Chat actions and services
│   │   ├── chat.contribution.ts            # Open in VS Code, Open Terminal, branch chat, run script, prompts service
│   │   ├── branchChatSessionAction.ts      # Branch chat session action
│   │   ├── runScriptAction.ts              # Run script contribution and split button
│   │   └── promptsService.ts              # Agentic prompts service override
│   ├── configuration/browser/              # Configuration contribution
│   │   └── configuration.contribution.ts
│   └── sessions/browser/                   # Sessions view and title bar widget
│       ├── sessions.contribution.ts        # Sessions view container, view, and title bar widget registration
│       ├── sessionsViewPane.ts             # Sessions list view pane
│       ├── sessionsTitleBarWidget.ts       # Title bar widget (SessionsTitleBarWidget, SessionsTitleBarContribution)
│       ├── activeSessionService.ts         # IActiveSessionService implementation
│       └── media/
│           └── sessionsTitleBarWidget.css
```

---

## 12. Implementation Requirements

When modifying the Agent Sessions layout:

1. **Maintain fixed positions** — Do not add settings-based position customization
2. **Panel must span the right section width** — The grid structure places the panel below Chat Bar and Auxiliary Bar only
3. **Sidebar spans full window height** — Sidebar is at the root grid level, spanning from top to bottom independently of the titlebar
4. **New parts go in right section** — Any new parts should be added to the right section alongside Titlebar, Chat Bar, and Auxiliary Bar
5. **Update this spec** — All changes must be documented here
5. **Preserve no-op methods** — Unsupported features should remain as no-ops, not throw errors
6. **Handle pane composite lifecycle** — When hiding/showing parts, manage the associated pane composites
7. **Use agent session parts** — New functionality for parts should be added to the agent session part classes, not the standard parts

---

## 13. Lifecycle

### 13.1 Startup Sequence

1. `constructor()` — Register error handlers
2. `startup()` — Initialize services and layout
3. `initServices()` — Set up service collection (including `TitleService`), register singleton services, set lifecycle to `Ready`
4. `initLayout()` — Get services, register layout listeners, register editor open/close listeners
5. `renderWorkbench()` — Create DOM, create parts, create editor modal, set up notifications
6. `createWorkbenchLayout()` — Build the grid structure
7. `createWorkbenchManagement()` — (No-op in agent sessions layout)
8. `layout()` — Perform initial layout
9. `restore()` — Restore parts (open default view containers), set lifecycle to `Restored`, then `Eventually`

Note: Contributions are registered via module imports in `sessions.desktop.main.ts` (through `registerWorkbenchContribution2`, `registerAction2`, `registerSingleton` calls), not via a central registration function.

### 13.2 Part Restoration

During the `restore()` phase, `restoreParts()` is called to open the default view container for each visible part:

```typescript
private restoreParts(): void {
    const partsToRestore = [
        { location: ViewContainerLocation.Sidebar, visible: this.partVisibility.sidebar },
        { location: ViewContainerLocation.Panel, visible: this.partVisibility.panel },
        { location: ViewContainerLocation.AuxiliaryBar, visible: this.partVisibility.auxiliaryBar },
        { location: ViewContainerLocation.ChatBar, visible: this.partVisibility.chatBar },
    ];

    for (const { location, visible } of partsToRestore) {
        if (visible) {
            const defaultViewContainer = this.viewDescriptorService.getDefaultViewContainer(location);
            if (defaultViewContainer) {
                this.paneCompositeService.openPaneComposite(defaultViewContainer.id, location);
            }
        }
    }
}
```

This ensures that when a part is visible, its default view container is automatically opened and displayed.

### 13.3 State Tracking

```typescript
interface IPartVisibilityState {
    sidebar: boolean;
    auxiliaryBar: boolean;
    editor: boolean;
    panel: boolean;
    chatBar: boolean;
}
```

**Initial state:**

| Part | Initial Visibility |
|------|--------------------|
| Sidebar | `true` (visible) |
| Auxiliary Bar | `true` (visible) |
| Chat Bar | `true` (visible) |
| Editor | `false` (hidden) |
| Panel | `false` (hidden) |

---

## 14. Sidebar Reveal Buttons

> **Note:** Sidebar reveal buttons (`SidebarRevealButton`) have been removed from the implementation. The corresponding file `parts/sidebarRevealButton.ts` no longer exists. Sidebar visibility is controlled via the toggle actions in the titlebar (see Section 3.4).

---

## Revision History

| Date | Change |
|------|--------|
| 2026-02-17 | Added `-webkit-app-region: drag` to sidebar title area so it can be used to drag the window; interactive children (actions, composite bar, labels) marked `no-drag`; CSS rules scoped to `.agent-sessions-workbench` in `parts/media/sidebarPart.css` |
| 2026-02-13 | Documentation sync: Updated all file names, class names, and references to match current implementation. `AgenticWorkbench` → `Workbench`, `AgenticSidebarPart` → `SidebarPart`, `AgenticAuxiliaryBarPart` → `AuxiliaryBarPart`, `AgenticPanelPart` → `PanelPart`, `agenticWorkbench.ts` → `workbench.ts`, `agenticWorkbenchMenus.ts` → `menus.ts`, `agenticLayoutActions.ts` → `layoutActions.ts`, `AgenticTitleBarWidget` → `SessionsTitleBarWidget`, `AgenticTitleBarContribution` → `SessionsTitleBarContribution`. Removed references to deleted files (`sidebarRevealButton.ts`, `floatingToolbar.ts`, `agentic.contributions.ts`, `agenticTitleBarWidget.ts`). Updated pane composite architecture from `SyncDescriptor`-based to `AgenticPaneCompositePartService`. Moved account widget docs from titlebar to sidebar footer. Added documentation for sidebar footer, project bar, traffic light spacer, card appearance styling, widget directory, and new contrib structure (`accountMenu/`, `chat/`, `configuration/`, `sessions/`). Updated titlebar actions to reflect Run Script split button and Open submenu. Removed Toggle Maximize panel action (no longer registered). Updated contributions section with all current contributions and their locations. |
| 2026-02-13 | Changed grid structure: sidebar now spans full window height at root level (HORIZONTAL root orientation); Titlebar moved inside right section; Grid is now `Sidebar \| [Titlebar / TopRight / Panel]` instead of `Titlebar / [Sidebar \| RightSection]`; Panel maximize now excludes both titlebar and sidebar; Floating toolbar positioning no longer depends on titlebar height |
| 2026-02-11 | Simplified titlebar: replaced `BrowserTitlebarPart`-derived implementation with standalone `TitlebarPart` using three `MenuWorkbenchToolBar` sections (left/center/right); Removed `CommandCenterControl`, `WindowTitle`, layout toolbar, and manual toolbar management; Center section uses `Menus.CommandCenter` which renders session picker via `IActionViewItemService`; Right section uses `Menus.TitleBarRight` which includes account submenu; Removed `commandCenterControl.ts` file |
| 2026-02-11 | Removed activity actions (Accounts, Manage) from titlebar; Added `AgenticAccount` submenu to `TitleBarRight` with account icon; Menu shows signed-in user label from `IDefaultAccountService` (or Sign In action if no account), Settings, and Check for Updates; Added `AgenticAccountContribution` workbench contribution for dynamic account state; Added `AgenticAccount` menu ID to `Menus` |
| 2026-02-10 | Titlebar customization now uses class inheritance with protected getter overrides on `BrowserTitlebarPart`; Base class retains original API — no `ITitlebarPartOptions`/`ITitlebarPartConfiguration` removed; `AgenticTitlebarPart` and `AgenticTitleService` in `parts/agenticTitlebarPart.ts` override `isCommandCenterVisible`, `editorActionsEnabled`, `installMenubar()`, and menu ID getters |
| 2026-02-07 | Comprehensive spec update: fixed widget class names (`AgenticTitleBarWidget`/`AgenticTitleBarContribution`), corrected click behavior (uses `AgentSessionsPicker` not `FocusAgentSessionsAction`), corrected session label source (`IActiveSessionService`), fixed toggle terminal details (uses standard `toggleTerminal` command via `MenuRegistry.appendMenuItem` on right toolbar), added sidebar/chatbar storage keys, added chatbar to part classes table, documented contributions section with `RunScriptContribution`/`AgenticTitleBarContribution`/Changes view, added `agent-sessions-workbench` platform class, documented auxiliary bar run script dropdown, updated file structure with `actions/`, `views/`, `media/` directories, fixed lifecycle section numbering, corrected `focus()` target to ChatBar |
| 2026-02-07 | Moved `ToggleTerminalAction` to `contrib/terminal/browser/terminalAgentSessionActions.ts`; Menu item registered via `MenuRegistry.appendMenuItem` from `agenticLayoutActions.ts` to avoid layering violation |\n| 2026-02-07 | Added `TitleBarLeft`, `TitleBarCenter`, `TitleBarRight` menu IDs to `AgenticWorkbenchMenus`; Added `titleBarMenuId` option to `ITitlebarPartOptions` for overriding the global toolbar menu; Actions now use agent-session-specific menu IDs instead of shared `MenuId.TitleBarLeft` / `MenuId.TitleBar` |
| 2026-02-07 | Moved agent sessions workbench menu IDs to `agenticWorkbenchMenus.ts`; Renamed `AgentSessionMenus` to `AgenticWorkbenchMenus` |
| 2026-02-07 | Added `MenuId.AgentSessionsTitleBarContext` as a separate titlebar context menu ID; `contextMenuId` option now set in both main and auxiliary titlebar configurations |
| 2026-02-07 | Added `ToggleTerminalAction` to left toolbar; toggles panel with terminal view; bound to `` Ctrl+` `` |
| 2026-02-06 | `AgentSessionsTitleBarStatusWidget` now shows active chat session title instead of workspace label; Clicking opens sessions view via `FocusAgentSessionsAction`; Removed folder picker and recent folders |
| 2026-02-06 | Replaced command center folder picker with `AgentSessionsTitleBarStatusWidget` (custom `BaseActionViewItem`); Uses `IActionViewItemService` to intercept `AgentSessionsTitleBarControlMenu` submenu; Shows workspace label pill with quick pick for recent folders |
| 2026-02-06 | Added Command Center with custom `AgenticCommandCenter` menu IDs; Dropdown shows recent folders and Open Folder action; Added `AgenticCommandCenterContribution` |
| 2026-02-06 | Added sidebar reveal buttons (`SidebarRevealButton`) — round edge-hover buttons that appear when sidebars are hidden; implemented in `parts/sidebarRevealButton.ts` |
| 2026-02-06 | Auxiliary Bar now visible by default; Removed `AuxiliaryBarVisibilityContribution` (no longer auto-shows/hides based on chat state) |
| 2026-02-06 | Removed Command Center and Project Bar completely; Layout is now: Sidebar \| Chat Bar \| Auxiliary Bar; Global activities (Accounts, Settings) in titlebar via `supportsActivityActions` |
| 2026-02-06 | ~~Removed Project Bar; Added Command Center to titlebar~~ (superseded) |
| 2026-02-06 | ~~Project Bar now stores folder entries in workspace storage~~ (superseded) |
| 2026-02-05 | Auxiliary Bar now hidden by default; Added `AuxiliaryBarVisibilityContribution` to auto-show when chat session has requests, auto-hide when empty |
| 2026-02-05 | Hiding panel now exits maximized state first if panel was maximized |
| 2026-02-05 | Added panel maximize/minimize support via `toggleMaximizedPanel()`; Uses `Grid.maximizeView()` with exclusions for titlebar; Added `TogglePanelMaximizedAction` and `TogglePanelVisibilityAction` to panel title bar |
| 2026-02-05 | Changed layout structure: Panel is now below Chat Bar and Auxiliary Bar only (not full width); Sidebar spans full height |
| 2026-02-05 | Added configurable titlebar via `ITitlebarPartOptions` and `ITitlebarPartConfiguration`; Titlebar now disables command center, menubar, and editor actions; Added left toolbar with `MenuId.TitleBarLeft`; Added `ToggleSidebarVisibilityAction` in `agenticLayoutActions.ts` |
| 2026-02-04 | Modal sizing (80%, min/max constraints) moved from CSS to TypeScript; `EditorModal.layout()` now accepts workbench dimensions |
| 2026-02-04 | Editor now renders as modal overlay instead of in grid; Added `EditorModal` class in `parts/editorModal.ts`; Closing modal closes all editors; Grid layout is now Sidebar \| Chat Bar \| Auxiliary Bar |
| 2026-02-04 | Changed part creation to use `SyncDescriptor0` for lazy instantiation—parts are created when first accessed, not at service construction time |
| 2026-02-04 | Refactored part creation: each layout class now creates and passes parts to `PaneCompositePartService` via `IPaneCompositePartsConfiguration`, removing `isAgentSessionsWorkspace` dependency from the service |
| 2026-02-04 | Added `restoreParts()` to automatically open default view containers for visible parts during startup |
| 2026-02-04 | Restored Editor part; Layout order is now Sidebar \| Chat Bar \| Editor \| Auxiliary Bar |
| 2026-02-04 | Removed Editor part; Chat Bar now takes max width; Layout order changed to Sidebar \| Auxiliary Bar \| Chat Bar |
| 2026-02-04 | Added agent session specific parts (AgenticSidebarPart, AgenticAuxiliaryBarPart, AgenticPanelPart) in `sessions/browser/parts/`; PaneCompositePartService now selects parts based on isAgentSessionsWorkspace |
| 2026-02-04 | Editor and Panel hidden by default; Editor auto-shows on editor open, auto-hides when last editor closes |
| 2026-02-04 | Added Chat Bar part with `ViewContainerLocation.ChatBar` |
| Initial | Document created with base layout specification |

# Mobile UI Design Specification for VS Code

This document outlines the design and behavior of a mobile-friendly interface for Visual Studio Code. It builds upon the analysis of the existing desktop components (`component_analysis.md`).

## 1. Core Principles

*   **Touch-First:** Interactions should be optimized for touch input.
*   **Responsive:** The UI must adapt to various screen sizes (phones, tablets) and orientations (portrait, landscape).
*   **Content-Focused:** Maximize space for the code editor and relevant tools.
*   **VS Code DNA:** Maintain the core functionality and feel of VS Code, ensuring a familiar experience.
*   **Accessibility:** Adhere to accessibility best practices.

## 2. Key UI Components & Layout

### 2.1. Collapsible Primary Sidebar (Drawer)

*   **Replaces/Merges:** Desktop `ActivitybarPart` and `SidebarPart`.
*   **Behavior:**
    *   Acts as a slide-out drawer, typically from the left.
    *   Opened by a "Menu" or "Hamburger" icon (likely in a new top header/app bar) or a swipe gesture from the left edge of the screen.
    *   Contains:
        *   **Activity Icons:** A vertically arranged list of activity icons (Explorer, Search, SCM, Debug, Extensions, etc.) similar to the desktop `Activitybar`. Tapping an icon switches the content of the drawer.
        *   **Viewlet Content:** The content of the active viewlet (e.g., file tree for Explorer, search input and results for Search) will be displayed below the activity icons within the drawer.
*   **Layout:**
    *   When closed, it's off-screen or only a thin touch target is visible.
    *   When open, it overlays a portion of the screen or pushes content to the side (depending on screen width).
*   **Styling:** Should align with VS Code's theming, potentially with Material Design influences for animations and elevation.

### 2.2. Bottom Navigation Bar

*   **New Component:** `BottomNavigationBarPart`.
*   **Purpose:** Provides quick access to core tools/views, especially those traditionally found in the `Activitybar` or `PanelPart`.
*   **Behavior:**
    *   Fixed at the bottom of the screen.
    *   Contains 3-5 primary actions/icons. Examples:
        *   Explorer (opens Sidebar drawer to Explorer)
        *   Search (opens Sidebar drawer to Search)
        *   Run/Debug (opens Sidebar drawer to Debug or a dedicated debug panel)
        *   Git/SCM (opens Sidebar drawer to SCM)
        *   Editor / Terminal toggle (switches between editor and a panel, or opens a panel)
    *   Tapping an icon activates the respective tool or view. The active tab should be visually highlighted.
*   **Layout:**
    *   Standard height (e.g., 56dp).
    *   Icons with optional text labels (labels might only appear for the active tab or if space permits).
*   **Styling:** Themed, clear touch targets.

### 2.3. Code Editor Area

*   **Adapts:** `EditorPart`.
*   **Behavior:**
    *   Occupies the main content area.
    *   Optimized for touch:
        *   Pinch-to-zoom for font size.
        *   Improved text selection handles.
        *   Context menus adapted for touch (e.g., larger tap targets).
        *   Consider a "read-only" mode toggle for easier scrolling/viewing.
    *   Minimap: May need to be off by default or have a toggle, as it consumes horizontal space.
*   **Layout:** Takes up the remaining space not used by the bottom navigation or opened drawer/panel.

### 2.4. Panel Area (Integrated or On-Demand)

*   **Adapts/Replaces:** `PanelPart` (Terminal, Output, Debug Console, Problems).
*   **Behavior:**
    *   Instead of a persistent bottom panel, these views might be:
        *   Integrated into the Sidebar drawer as separate activities/viewlets if appropriate.
        *   Opened as full-screen overlays or modal views, triggered from the Bottom Navigation Bar or command palette.
        *   A dedicated "Terminal" or "Console" action in the Bottom Navigation Bar could toggle its visibility as an overlay from the bottom, similar to how panels currently work but optimized for touch dismissal.
*   **Layout:** When visible, could slide up from the bottom, potentially obscuring the Bottom Navigation Bar or part of the editor.

### 2.5. Status Bar (Simplified or Integrated)

*   **Adapts/Replaces:** `StatusbarPart`.
*   **Behavior:**
    *   The traditional status bar might be too cluttered for mobile.
    *   Essential information (e.g., Git branch, errors/warnings count, language mode) could be:
        *   Integrated into a new minimal top header/app bar.
        *   Displayed contextually (e.g., errors only visible when a problem occurs or when a "Problems" view is active).
        *   Accessible via a specific action or information icon.
*   **Layout:** If a top header is used, it would be at the top of the screen.

### 2.6. Floating Action Button (FAB) - Optional

*   **New Component:**
*   **Purpose:** For a primary contextual action (e.g., "New File" in Explorer, "Commit" in SCM view).
*   **Behavior:**
    *   Standard FAB behavior (e.g., bottom right).
    *   Action changes based on the current context.

## 3. Responsive Behavior

*   **Phone (Portrait):**
    *   Sidebar Drawer: Slides over content.
    *   Bottom Navigation: Visible.
    *   Editor: Main area.
    *   Panel: Overlay, triggered on demand.
*   **Phone (Landscape):**
    *   Sidebar Drawer: Might push content if screen width allows, or still slide over.
    *   Bottom Navigation: Visible.
    *   Editor: Wider main area.
    *   Panel: Overlay.
*   **Tablet (Portrait & Landscape):**
    *   Sidebar Drawer: Could be persistently visible on larger tablets (acting more like the desktop sidebar) or remain a drawer.
    *   Bottom Navigation: May or may not be necessary if a persistent sidebar is used. If present, it would function similarly to phones.
    *   Editor: Largest area.
    *   Panel: Could be a split view with the editor or an overlay.

## 4. Navigation and Interaction

*   **Touch-First:** All UI elements must have adequate touch target sizes.
*   **Gestures:**
    *   **Swipe Left/Right:** Open/close Sidebar drawer.
    *   **Pinch-to-Zoom:** In the editor.
    *   **Long Press:** For context menus.
*   **Context Menus & Dialogs:** Should be mobile-friendly (e.g., Material Design style bottom sheets or full-screen dialogs).
*   **Command Palette:** Remains a key interaction model, accessible via an icon or gesture.

## 5. Theming and Accessibility

*   **Theming:**
    *   Continue to support existing VS Code themes.
    *   Ensure new mobile-specific components are fully themeable using CSS variables and theme service.
    *   Consider Material 3 Dynamic Theming aspects if Android is a primary target (though initial implementation should be theme-agnostic).
*   **Accessibility:**
    *   Adhere to WCAG AA guidelines.
    *   Proper ARIA attributes for all custom components (drawer, bottom navigation, etc.).
    *   Keyboard navigation support (for connected keyboards).
    *   Focus management for drawers, dialogs, and panels.
    *   Screen reader compatibility.

## 6. Future Considerations / Advanced Features

*   Multi-window / Split Editor on tablets.
*   Drag-and-drop for file management (if feasible on touch).
*   Settings UI adaptation for mobile.

This document will evolve as implementation progresses.

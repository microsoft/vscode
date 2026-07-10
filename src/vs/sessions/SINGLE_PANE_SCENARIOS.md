# Single-Pane Detail Panel — Scenarios

This document enumerates the user-facing scenarios, states, and transitions for the **single-pane
detail panel** layout of the Agents window (the third pane redesigned as one pane with a single tab
bar spanning the editor content and a docked detail panel).

- The whole feature is gated behind the experimental setting **`sessions.layout.singlePaneDetailPanel`**
  (const `DOCK_DETAIL_PANEL_SETTING`), read **once at startup** — a window reload applies a change.
  The setting is read only by `createSessionsWorkbench` (which selects the workbench/parts); the
  resulting choice is published as `IAgentWorkbenchLayoutService.isSinglePaneLayoutEnabled` (read by
  imperative code) and the `SinglePaneLayoutEnabledContext` context key (read only by declarative
  `when` clauses). Features must gate on those — never read the setting or the context key directly
  in imperative code.
- When the setting is **OFF** (default), the Agents window renders exactly as before (auxiliary bar as
  its own grid column with its composite tab strip; the standard multi-diff Changes editor). Nothing in
  this document applies.
- Companion specs: [LAYOUT.md](LAYOUT.md) §5, [LAYOUT_CONTROLLER.md](LAYOUT_CONTROLLER.md), and
  [contrib/layout/browser/desktopSessionLayoutController.md](contrib/layout/browser/desktopSessionLayoutController.md).

---

## 1. The three regions

The third pane is a single visual card containing three regions:

| Region | What it is | Owner |
|--------|-----------|-------|
| **Tab bar** | One tab strip spanning the full width (Changes / File / Browser tabs + trailing `+`) | Editor group title (`MainEditorPart` / `EditorGroupView`) |
| **Editor content** | The editor pane below the tab bar (multi-diff Changes, a file, a browser) | Editor part, inset on the right by the detail width |
| **Detail panel** | The docked auxiliary bar on the right (Branch Changes + Checks, or Explorer) | `DockedAuxiliaryBarController` (docks the aux bar inside the editor part) |

**Invariant:** the **tab bar is always visible** whenever the pane is shown — including when the editor
content is hidden and in the new-session view. It is kept laid out by `MainEditorPart.layout`'s
`keepForDockedTabBar` path (single-pane + detail visible), even while the editor part is logically
hidden.

---

## 2. Pane visibility states

Let **E** = editor content visible, **D** = detail panel visible. The pane supports:

| State | E | D | Meaning |
|-------|---|---|---------|
| **Editor + Detail** | ✅ | ✅ | Normal working state: editor content on the left, detail on the right, tab bar across the top. |
| **Detail only** | ❌ | ✅ | Editor content collapsed (Hide Editor); tab bar + detail shown; the chat reclaims the freed editor width. The detail **keeps its width** (it does not stretch to fill the pane). |
| **Editor only** | ✅ | ❌ | Detail toggled off; editor content fills the pane; tab bar across the top. **This is the default state for a created session** — opening the side pane shows the Changes editor with the detail panel closed; the detail is opened only via **Toggle Details** (or restored per-session). |
| **Side pane closed** | ❌ | ❌ | The whole third pane is closed (chat-only). Reached via **Toggle Side Panel** or when the last editor tab closes; never via the detail toggle. |

A created session opens the side pane to **Editor only** (Changes editor, detail closed) by default; a Changes/file editor becoming active never force-opens the detail (the one exception is restoring the detail after a transient browser-tab hide). Opening the empty **Files placeholder** (making it the **active editor** — via the `+` Files entry or by selecting its tab) reveals the Files detail, because the placeholder's content (the Files tree) lives there. The detail-panel strategy keys this on the active-editor signal, so the managed auto-ensured Files tab (opened *inactive* as a background tab) never triggers it — the Editor-only default is preserved — and hiding the detail afterwards sticks (hiding does not change the active editor). It is also skipped while the whole side pane is closed (editor content hidden) or during a session-switch restore. A new-session view opens to the **Files detail** (its editor content stays hidden by R1).

**Size distribution when opening the side pane.** Opening the side pane from *closed* (e.g. clicking
**Changes** while the chat is full-width) gives it a comfortable width of **60% of the full window width**
(`SIDE_PANE_WIDTH_RATIO` in `parts/editorPartSizing.ts`) **the first time it is opened**, so the editor content is readable
beside the detail — never the collapsed detail-only width. After that, side-pane sizes are **workbench-level,
not per session**: the editor grid node width is owned by the workbench grid and persisted globally
(`workbench.sessions.partSizes`), so once the user resizes the side pane it keeps that width — including
across **session switches** (switching sessions does not change the side-pane width) and across reloads.

**Reload is flicker-free (workbench owns the geometry).** On reload the workbench restores the editor node
width from its own persisted part-sizes (`workbench.sessions.partSizes`, consumed by
`createDesktopGridDescriptor`), so the grid is painted at the correct size in a single pass. (At the
workbench level, hiding the editor still collapses the grid node to the detail width and caches it, and a
captured "Hide Editor" width `_dockedEditorSizeBeforeHide` takes precedence for the immediate re-show.)

**Reopening after the sessions list is collapsed.** Closing the **whole** side pane collapses the editor
grid node to `0px`, so its size at that moment is **not** a real user width — closing the whole pane
therefore does **not** capture `_dockedEditorSizeBeforeHide` (and clears any stale sidebar-collapse grow
snapshots). Reopening the side pane falls through to the last persisted width, or the **60%-of-window
default** if none; because the default is computed from the full window width (not the remaining main area),
it is a **comfortable** width — not the cramped/narrow node that a captured `0px` (or a stale pre-collapse
snapshot) would otherwise restore. Only **Hide Editor** (detail stays visible, node stays visible at a real
width) captures a width to restore later.

---

## 3. Controls

| Control | Location | Effect |
|---------|----------|--------|
| **Hide Editor** (chevron `>`) | Editor title bar, primary inline, **before** Maximize | Closes the editor content, keeps the detail (→ *Detail only*). The docked side pane shrinks to the detail width so the freed editor width goes to the **chat** (not the detail), and the **sessions list is reshown** (it may have been auto-collapsed when details was opened). Shown **only** when the active tab is **Changes or Files** (not Browser). Hidden when the editor is already closed, and hidden while the editor area is **maximized**. |
| **Toggle Details** (`≡`) | Editor title bar, primary inline, after Maximize | Shows/hides the detail panel (default keybinding **`⌥⌘L`**). Hiding the detail **while the editor is hidden reveals the editor** (→ *Editor only*), so the pane is never left empty — this applies in the **new-session view** too (revealing the empty editor rather than closing the whole pane). Opening the detail panel via this action auto-collapses the **sessions list** to free width for the editor area; closing it restores the sessions list. Its `toggled` state (`AuxiliaryBarVisibleContext`) is kept **in sync with the actual rendering**: the toggle reads "on" iff the detail panel is rendered with an active view container — an empty (gated-off) container is never shown, and the layout controller (D10) reconciles the part away if it becomes visible with nothing to render. Shown **only** when the active tab is **Changes or Files** (not Browser or Search, which have no detail). |
| **Maximize / Restore** | Editor title bar, primary inline | Maximizes the editor area (forces the Changes detail while maximized; restores on un-maximize). Default keybinding **`⌥⌘E`** toggles maximize/restore while the editor area is visible. |
| **Collapse All Diffs** | Changes editor header, primary inline | Collapses every file in the Changes multi-diff (`SessionChangesEditor.collapseAllDiffs`). |
| **`+` Add Tab** | End of the tab strip | Opens the Add Tab menu (Browser `⇧⌘K B`, Search `⌘K S`; a **Changes** entry when the Changes editor tab is closed, and a **Files** entry `⌘K B` when the Files tab is closed — both for a created workspace session). Re-added managed Changes/Files tabs are inserted at the **end** of the tab strip. Search opens a new Search editor. **Hidden when the editor area is closed.** |
| **Toggle Side Panel** | Command / keybinding | Closes/opens the **whole** side pane (editor + detail together) → chat-only and back. |
| **Toggle Sessions List** | Title bar / command | Collapses/opens the left sessions list. Collapsing it gives the freed width to the editor/detail side pane (not the chat); reopening restores the previous editor/detail width so the chat gets that space back. The list is **also** auto-collapsed when the user opens the detail panel via **Toggle Details**, or when they open a real file/diff into the editor area **in an existing (created) session while the editor area is currently closed** (and restored when they close it), unless the user has since reopened it manually. An auto-collapsed list is **also restored once the side pane becomes fully hidden** (both editor and detail closed) — e.g. switching to a quick chat, which has no side pane — so the list is never left collapsed with nothing to make room for. A list the user closed **manually** stays closed. |
| **Grid sash** | Between the chat and the third pane | In a **created** session, dragging it wider re-reveals the editor content and re-syncs state (the Hide Editor chevron reappears); dragging it narrow enough that the editor content is squeezed to the detail width **hides** the editor content (mirroring the reveal), which hides all editor-title actions. In the **new-session** view a width reveal is momentary — R1 re-hides the editor, which stays closed until a file is opened. |
| **Changes pill** | Session header meta row | Opens the managed Changes multi-diff editor and explicitly reveals the editor area when the side pane was closed or in detail-only mode. The managed Changes tab still remains excluded from automatic reveal-on-open, so merely activating its tab does not reveal the editor. |

**Editor-title action visibility.** All single-pane editor-title actions (Maximize/Restore, Toggle Details, Hide Editor, Open in Modal) are hidden while the **editor area is closed** (`MainEditorAreaVisibleContext`). Hide Editor and Toggle Details are additionally shown only when the active tab is **Changes or Files** (`SinglePaneDetailChangesOrFilesActiveContext`); Hide Editor is further hidden only while the editor area is **not maximized** (`EditorMaximizedContext` negated).

**Managed Files tab.** The empty Files placeholder tab is shown only when the editor area is **closed** or **no real (non-managed) editor is open**; once a real file/diff is opened into a visible editor area it is removed as redundant, and re-added when the editor area closes again.

**Closing managed tabs.** The user can close the managed Changes and Files tabs (they are non-preview, not sticky). A user-initiated close is remembered (`_dismissedManagedTabs`) so the controller does not immediately re-create it; the dismissal is cleared — and the tabs re-populate — on a **session change** or when the **side pane is reopened** from fully closed. While a managed tab is closed for a created workspace session, the `+` Add Tab menu offers a matching entry to reopen it — **Changes** (gated on `SinglePaneChangesTabMissingContext`) and **Files** (gated on `SinglePaneFilesTabMissingContext`); reopening clears its dismissal so the controller resumes managing it.

**Per-session detail state.** A created session's detail-panel (aux-bar) visible/hidden choice is captured per session and restored on switch-back and reload (a detail-closed session stays detail-closed when returning to it), even if an external component transiently reveals the aux bar during the working-set restore or a queued detail-container sync from the previous session runs later.

**Reopening after closing all tabs.** Closing all tabs closes the whole side pane; the managed Changes (created) / Files (new-session) tabs are re-ensured, so reopening the side pane shows the Changes editor or Files tab — never an empty editor.

**Side-pane-closed persists across reload.** Closing the whole side pane is remembered across a window reload. On reload the restored managed tab does **not** re-reveal the detail: the detail-panel forced reveal is gated on the editor content being visible, so a fully-closed side pane stays closed until the user reopens it.

**Opening a file.** The **Files** add-tab entry opens its tab **pinned** (not a preview tab).

Actions **not** present in single-pane mode: **Close Editor Area**, **Show Editor** (the standard
layout keeps *Close Editor Area*).

---

## 4. Tabs

- **Changes** — a custom `SessionChangesEditor` (Branch Changes dropdown + diff stats + embedded
  multi-diff). Pinned first, present for **created** sessions with a workspace.
- **File** — the empty File tab (`EmptyFileEditorInput`) as a landing tab, plus real file editors the
  user opens. Opened **pinned, inactive, preserve-focus** so it never steals focus from the chat.
- **Browser** — the integrated browser (`BrowserEditorInput`).

The **auto-managed** tabs (the pinned Changes tab and the default File tab) are opened under
`suppressEditorPartAutoVisibility()` — they **never reveal the editor content**. Only a user action
(opening an actual file/diff, or dragging the sash) reveals the editor.

---

## 5. Detail panel content (driven by the active tab)

The single-pane layout controller (`SinglePaneLayoutController`) maps the active editor tab to the detail content. By default the detail panel is **closed** for a created session (Editor-only); it is opened via **Toggle Details** (or restored per-session), and while visible its container follows the active tab (the one exception is restoring the detail after a transient browser-tab hide):

| Active tab | Detail panel |
|-----------|--------------|
| **Changes** | Branch Changes file list + Checks — shown (Changes container) while the detail is visible |
| **File** (Explorer) | Files/Explorer tree — shown (Files container) while the detail is visible |
| **Browser** | **Hidden** (transiently) while the Browser tab is active; restored when switching back |

Rules:
- **Reveal on activate, respect after.** Switching to a Changes/File tab reveals the detail with the
  right container. While the **same** tab stays active, an explicit user hide of the detail (via the
  detail toggle) is **respected** — it is not re-forced. Switching tabs reveals it again.
- **Browser is transient.** A Browser tab hides the detail panel; switching back to Files/Changes
  **restores** it.

---

## 6. Layout rules (new-session lifecycle)

### R1 — New-session (uncreated) view
When the new-session composer is active (uncreated session, has a workspace, not a quick chat):
- **Initial state:** **File tab** active + **Files detail** open + **editor content closed** (*Detail
  only*). Tab bar visible. The composer keeps focus (the File tab is inactive/preserve-focus).
- The editor is kept hidden while this view is active, but the hide is **transition-triggered**: it fires
  when the editor **just became visible**, or when the new-session view was **just entered** with the editor
  already visible (an inherited-visible editor from the previous session) — where *real content* is a real
  file (`FileEditorInput`) or the integrated browser (`BrowserEditorInput`); the managed empty landing tab
  (`EmptyFileEditorInput`) and "no active editor" are **not** real content. Any **spurious reveal** (a
  session-switch working-set restore, a layout race, the 60%-of-window split) is **re-hidden** —
  fixing the case where reopening a new session after visiting a created session left the editor open.
  Crucially, **switching to a managed tab (e.g. the Files placeholder) while the editor is already visible
  does NOT hide it** — only a visibility transition or entering the view does, so the user can keep the
  editor open and switch tabs. R1 wins in the new-session view: the editor stays closed until the user
  **explicitly opens a file/diff**. A width-based reveal (e.g. a sash drag) may momentarily reveal the
  editor, but R1 re-hides it (it was a non-explicit reveal). Once a real file is the active editor the hide
  **short-circuits**, so a user action that reveals the editor via a real editor open **sticks**:
  - **Opening a file** from the Files view → editor content shows (via `onWillOpenEditor` →
    `setEditorHidden(false)`) (→ *Editor + Detail* or *Editor only*).
  - **Detail toggle** → reveals the editor (→ *Editor only*).
  - **Sash drag** in the new-session view does **not** keep the editor revealed (the sash-reveal sticks for
    *created* sessions only); R1 re-hides it.
- **Collapsing the sessions list** while the editor is closed gives the freed width to the **detail
  panel** (not the editor node), keeping the editor node width equal to the detail width so it is never
  mistaken for a revealed editor. Reopening the sessions list restores the pre-collapse detail width.

### R2 — New session submitted (uncreated → created)
When the new session is submitted:
- A **Changes tab** is added and the **Changes detail** is shown.
- The **editor content stays closed** (*Detail only*) — neither the submit nor the auto-opened Changes
  editor reveals it. This also applies when the provider commits the draft by replacing it with a new
  session resource. The user opens the editor when they want it (open a file/diff, or drag the sash).

### Quick chats / no workspace
No side pane at all — the detail panel and managed tabs are not shown; the chat is
full-width. Switching to a quick chat never auto-reveals the docked editor part
(`_shouldRevealEditorPartOnApply` excludes quick chats), and if a prior session left the
editor part visible it is hidden once the quick chat's editor group is empty
(`_registerQuickChatEditorHide`), so the whole side pane collapses. Because the side pane is
then hidden, an auto-collapsed **sessions list** is restored (see Toggle Sessions List).

---

## 7. Transition matrix (single-session, not maximized)

| From | Action | To |
|------|--------|-----|
| — | Enter new-session view | *Detail only* (File tab + Files detail, editor closed) |
| *Detail only* (new session) | Open a file from Files | *Editor + Detail* (editor revealed, stays open) |
| *Detail only* / *Side pane closed* (created session) | Click **Changes** pill | *Editor only* (Changes editor revealed, detail stays closed unless separately restored/opened) |
| *Detail only* (new session) | Toggle Details (hide detail) | *Editor only* (empty editor revealed — the side pane does not vanish) |
| *Detail only* (new session) | Drag grid sash wider | *Detail only* (editor stays closed; a momentary width reveal is re-hidden by R1 in the new-session view) |
| *Detail only* (new session) | Toggle Sessions List closed | *Detail only*; the **detail panel** widens by the sessions-list width (editor stays closed) |
| *Detail only* | Toggle Details (hide detail) | *Editor only* (editor revealed) |
| *Editor + Detail* | Hide Editor chevron | *Detail only* (detail keeps width, chat expands) |
| *Editor + Detail* | Toggle Details (hide detail) | *Editor only* |
| *Editor only* | Toggle Details (show detail) | *Editor + Detail* |
| *Detail only* / *Editor only* / *Editor + Detail* | Toggle Side Panel | *Side pane closed* |
| *Side pane closed* | Toggle Side Panel | previous state restored |
| *Side pane closed* (session A) | Switch to session B (side pane open), then back to A | A's *Side pane closed* is restored (the editor part is actively re-hidden on switch, not left open from B) |
| editor/detail side pane visible | Toggle Sessions List closed | same pane state; editor/detail side pane widens by the sessions-list width |
| sessions list closed after side-pane growth | Toggle Sessions List open | same pane state; editor/detail side pane returns to its pre-collapse width |
| any | Close the last editor tab | *Side pane closed* (chat-only; opening a tab restores the pane) |
| *Detail only* (created session) | Drag grid sash wider | *Editor + Detail* (editor content re-revealed) |
| any | Activate **Browser** tab | detail hidden (transient) |
| Browser active (detail hidden) | Activate **Files/Changes** tab | detail restored |
| new-session *Detail only* | **Submit** the session | *Detail only* + Changes tab + Changes detail |

---

## 8. Manual validation checklist

1. **New session view:** File tab + Files detail open + **no editor content**; tab bar visible; the
   "What are you building?" composer keeps focus.
2. **Open a file** from the Files view in the new-session view → the editor content appears and stays.
3. **Detail toggle** in the new-session view → the editor content appears (detail hides).
4. **Submit** a new session → a Changes tab appears with the Changes detail; the editor content is
   **still closed**.
5. **Hide Editor** chevron → editor content closes, detail **keeps its width**, chat expands, tab bar
   stays; the chevron then hides.
6. **Detail toggle** from *Editor + Detail* → detail hides, editor stays (*Editor only*); toggle again
   → detail returns.
7. **Toggle Side Panel** → the whole side pane closes (chat-only); toggle again → it restores.
8. **Browser tab** → detail hides; switch back to Files/Changes → detail restores.
9. **File tab** active → the Explorer detail is shown (revealed on activation).
10. **Close the last editor tab** → the whole side pane closes (chat-only); opening any tab restores it.
11. **`+` button** hidden while the editor area is closed; reappears when the editor is open.
12. **Sash drag** to widen the third pane in a **created** session while the editor is closed → editor
    content re-reveals and the Hide Editor chevron reappears; hiding the editor never leaves a
    corrupted/overlapping layout. In the **new-session** view the same drag widens the detail panel and
    the editor stays closed.
13. **Toggle Sessions List** while the side pane is visible → when the editor content is visible the
    editor/detail pane widens by the sessions-list width; when the editor is closed (new-session /
    detail-only) the **detail panel** widens instead and the editor stays closed. Toggle it back → the
    pane returns to its previous width and the chat regains the space.
14. **Setting OFF** → the Agents window is the original layout, unchanged.

---

## 9. Where it lives (implementation map)

| Concern | File |
|---------|------|
| Docked layout, hide/show editor, detail width, sash-reveal sync, grid | `browser/workbench.ts` |
| Docked panel overlay + resize sash | `browser/dockedAuxiliaryBarController.ts` |
| Editor tab bar kept visible when content hidden; sash-reveal trigger | `browser/parts/editorPart.ts` |
| Active tab → detail container mapping (browser transient) | `contrib/layout/browser/singlePaneLayoutController.ts` |
| Managed Changes + File tabs (suppressed opens) | `contrib/layout/browser/singlePaneLayoutController.ts` |
| Startup controller selection | `contrib/layout/browser/sessions.layout.contribution.ts` |
| New-session transition-triggered editor hide (R1) | `contrib/layout/browser/singlePaneLayoutController.ts` |
| Hide Editor chevron, Maximize, add-tab actions | `contrib/editor/browser/editor.contribution.ts`, `contrib/editor/browser/addTabActions.ts` |
| Toggle Details command + editor-title item | `contrib/layout/browser/singlePaneLayoutController.ts` |

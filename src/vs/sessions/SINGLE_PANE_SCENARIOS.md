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
| **Detail only** | ❌ | ✅ | Editor content collapsed (Hide Editor); tab bar + detail shown; the chat reclaims the freed editor width. The detail **keeps its width** (it does not stretch to fill the pane). **Entering this state closes every non-docked editor tab** (keeping only the docked Changes/Files tabs); reopenable ones are captured and restored when the editor area is shown again, non-restorable ones (e.g. a dirty untitled Search editor) are dropped. |
| **Editor only** | ✅ | ❌ | Detail toggled off; editor content fills the pane; tab bar across the top. |
| **Side pane closed** | ❌ | ❌ | The whole third pane is closed (chat-only). Reached via **Toggle Side Panel** or when the last editor tab closes; never via the detail toggle. **Closing the whole side pane does NOT close editors** — only a *Detail-only* collapse (editor hidden while the detail stays open) closes them; when both parts hide the editors are left intact so they return when the side pane is reopened. |

Editor/detail visibility is shared through two lifecycle profiles: one for **New Sessions** and one for **Existing Sessions**. Same-type navigation keeps the matching profile; entering the other type restores its profile. Submit is the exception: it preserves the current composition and seeds the Existing profile from it. The active editor still selects the detail content: every diff editor selects Changes, every file editor selects Files, and opening the empty **Files placeholder** reveals Files because that tab's content lives in the detail panel.

**Size distribution when opening the side pane.** Opening the side pane from *closed* (e.g. clicking
**Changes** while the chat is full-width) reveals the editor with `Sizing.Distribute`. The grid uses
the revealed view's location to distribute its containing split. The Sessions part and side pane therefore
receive equal space without either part computing a width. After that, side-pane sizes are **workbench-level,
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
snapshots). Reopening the side pane falls through to the last persisted width, or the **equal split**
if none. This avoids the cramped/narrow node that a captured `0px` (or a stale pre-collapse
snapshot) would otherwise restore. Only **Hide Editor** (detail stays visible, node stays visible at a real
width) captures a width to restore later.

---

## 3. Controls

| Control | Location | Effect |
|---------|----------|--------|
| **Toggle Details** (`≡`) | Editor header layout toolbar, after the actions overflow and a separator | Shows/hides the detail panel (default keybinding **`⌥⌘L`**). Hiding the detail **while the editor is hidden reveals the editor** (→ *Editor only*), so the pane is never left empty. It never changes the Sessions sidebar; that remains under explicit user control. Its `toggled` state (`AuxiliaryBarVisibleContext`) is kept **in sync with the actual rendering**. Shown **only** when the active tab is **Changes or Files** (not Browser or Search, which have no detail). |
| **Hide Editor** (chevron `>`) | Editor header, trailing inline group after Toggle Details | Closes the editor content and keeps the detail (→ *Detail only*). The docked side pane shrinks to the detail width so the freed editor width goes to the **chat**, not the detail. Shown whenever Toggle Details is shown and disabled while the detail panel is hidden. |
| **Maximize / Restore** | Editor title bar, primary inline | Maximizes the editor area (forces the Changes detail while maximized; restores on un-maximize). Default keybinding **`⌥⌘E`** toggles maximize/restore while the editor area is visible. |
| **Collapse All Diffs** | Changes editor header, primary inline | Collapses every file in the Changes multi-diff (`SessionChangesEditor.collapseAllDiffs`). |
| **`+` Add Tab** | End of the tab strip | Opens the Add Tab menu (Browser `⇧⌘K B`, Search `⌘K S`; a **Changes** entry when the Changes editor tab is absent, and a **Files** entry `⌘K B` when the Files tab is absent — both for any workspace session). Restored managed Changes/Files tabs are inserted at the **end** of the tab strip. Search opens a new Search editor. **Hidden when the editor area is closed.** |
| **Toggle Side Panel** | Command / keybinding | Closes/opens the **whole** side pane (editor + detail together) → chat-only and back. The mechanics live on the workbench layout service (`toggleSidePane`); while the editor area is maximized, the shared `Workbench.toggleSidePane()` emits its will event, un-maximizes, then performs the collapse so the restored detail is also hidden. Hiding a focused side pane moves focus to the sessions list. |
| **Toggle Sessions List** | Title bar / command | Collapses/opens the left sessions list. Collapsing it gives the freed width to the editor/detail side pane (not the chat); reopening restores the previous editor/detail width so the chat gets that space back. No single-pane editor or detail action changes this visibility. |
| **Grid sash** | Between the chat and the third pane | Dragging a detail-only side pane wider keeps the editor content closed. When editor content and details are visible but no longer fit, the detail panel hides; widening past the hysteresis threshold restores it. |
| **Changes pill** | Session header meta row | Opens the managed Changes multi-diff editor and explicitly reveals the editor area when the side pane was closed or in detail-only mode. The managed Changes tab still remains excluded from automatic reveal-on-open, so merely activating its tab does not reveal the editor. |

**Editor action visibility.** All single-pane editor actions (Maximize/Restore, Toggle Details, Hide Editor, Open in Modal) are hidden while the **editor area is closed** (`MainEditorAreaVisibleContext`). Hide Editor and Toggle Details share the same visibility condition: the active editor **has a docked detail panel** (`HasDockedDetailsContext`) — a managed Changes/Files tab or a text file editor. Hide Editor uses `AuxiliaryBarVisibleContext` as its precondition, so hiding details disables it without shifting the toolbar.

**Managed Files tab.** The empty Files placeholder tab (and the Changes tab) is opened only when the editor group is **empty** on a view-open trigger (a session switch or a side-pane reveal). Opening a real workspace file **tidies away** the empty placeholder (a `[Changes][file]` strip) as a **one-shot reaction to that open** — not a standing rule — so the user can still add the Files tab via **`+` Files** while a real file is open (that opens an `EmptyFileEditorInput`, not a real file, so it is not tidied away). The placeholder is **not** re-added when the real file closes; the defaults return only when the group empties and the side pane is reopened.

**Layout-driven vs user editor changes.** The default docked tabs are (re)opened into an empty group on a **settled** session-switch restore — the base controller fires `onDidEndSessionLayoutRestore` once the restore epoch (working-set apply + aux restore) completes, and the strategy reconciles off that. This matters for a new session: its **empty** working set closes the previous session's docked tabs, emptying the group *after* the switch; reconciling on the settled restore-end reads the reliably-empty group and re-opens both managed tabs. Reacting to the transient editor-change *during* the async apply would race the empty state. A **user-driven** editor change is not a restore and never re-opens missing defaults; standard close actions cannot remove the managed tabs while the editor area is hidden.

**Folder-less composer to workspace draft.** Opening **New Session** first exposes a folder-less composer and then seeds its concrete workspace draft. The first step removes the previous session's Changes tab while the shared Files placeholder can keep the editor group non-empty, so the second step explicitly ensures Changes when `wantsChangesTab` becomes true. When the selected session folder differs from the new-session default folder, the workspace-gated working-set restore can settle later and remove that early Changes tab while retaining Files; the settled restore therefore repeats the one-shot Changes ensure for the uncreated session. Relying only on the empty-group rule or only on the initial eligibility transition leaves Files as the sole tab until another reveal or New Session gesture.

**New-session submit.** Submit preserves the current editor/detail visibility and seeds the Existing Sessions profile from that composition, avoiding any layout jump. The Files tab remains active until the submitted session reports its first file changes; then Changes becomes active without revealing Editor. This pending activation is scoped to the submitted session, so switching away cannot activate Changes in another session.

**Details-only reveal.** When the side pane is opened as **details-only** (the aux-bar detail panel is revealed without the editor area — e.g. the new-session view, or a created session whose editor was hidden), the docked details panel *shows* the managed docked inputs, so they must always be present. On such a reveal the Changes and Files inputs are ensured **even when the group is non-empty**, restoring either input when lifecycle work left it absent. An editor-included reveal (the editor area is visible) keeps the strict "add only into an empty group" rule.

**Closing managed tabs.** While the editor area is hidden, the managed Changes and Files tabs adopt `EditorInputCapabilities.CannotClose`, so close commands and tab affordances consistently leave the detail panel's backing inputs open. Revealing the editor area removes the capability and makes both tabs normally closeable. Internal lifecycle work can still force-close either input while applying a working set, switching sessions, or cleaning up stale managed tabs. If lifecycle work leaves a managed tab absent, the missing-tab context and `+` Add Tab entries still allow it to be restored; reopening the side pane with an empty group restores both defaults.

**Per-session detail state.** A created session's detail-panel (aux-bar) visible/hidden choice is captured per session and restored on switch-back and reload (a detail-closed session stays detail-closed when returning to it), even if an external component transiently reveals the aux bar during the working-set restore or a queued detail-container sync from the previous session runs later.

**Reopening after lifecycle cleanup.** If lifecycle work force-closes every tab, the whole side pane can close; the managed Changes and Files tabs are re-ensured when the side pane reopens.

**Side-pane-closed persists across reload.** Closing the whole side pane is remembered across a window reload. On reload the restored managed tab does **not** re-reveal the detail: the detail-panel forced reveal is gated on the editor content being visible, so a fully-closed side pane stays closed until the user reopens it.

**Opening a file.** The **Files** add-tab entry opens its tab **pinned** (not a preview tab).

Actions **not** present in single-pane mode: **Close Editor Area**, **Show Editor** (the standard
layout keeps *Close Editor Area*).

---

## 4. Tabs

- **Changes** — a custom `SessionChangesEditor` (Branch Changes dropdown + diff stats + embedded
  multi-diff). Pinned first, present for every session with a workspace.
- **File** — the empty File tab (`EmptyFileEditorInput`) as a landing tab, plus real file editors the
  user opens. Opened **pinned, inactive, preserve-focus** so it never steals focus from the chat.
- **Browser** — the integrated browser (`BrowserEditorInput`).

The **auto-managed** tabs (the pinned Changes tab and the default File tab) are opened under
`suppressEditorPartAutoVisibility()` — they **never reveal the editor content**. Only a user action
(opening an actual file/diff, or dragging the sash) reveals the editor.

---

## 5. Detail panel content (driven by the active tab)

The single-pane layout controller (`SinglePaneLayoutController`) maps the active editor tab to the detail content. Its visibility is global; while visible, its container follows the active tab:

| Active tab | Detail panel |
|-----------|--------------|
| **Changes or any diff editor** | Branch Changes file list + Checks — shown (Changes container) while the detail is visible |
| **Any file or Markdown preview editor** (Explorer) | Files/Explorer tree — shown (Files container) while the detail is visible |
| **Browser** | **Hidden** (transiently) while the Browser tab is active; restored when switching back |

Rules:
- **Reveal on activate, respect after.** Switching to a Changes/File tab reveals the detail with the
  right container. While the **same** tab stays active, an explicit user hide of the detail (via the
  detail toggle) is **respected** — it is not re-forced. Switching tabs reveals it again.
- **Browser is transient.** A Browser tab hides the detail panel; switching back to Files/Changes
  **restores** it.

---

## 6. Layout rules (session lifecycle)

New Sessions and Existing Sessions each share an independent editor/detail visibility profile. Ordinary navigation between the two types restores the matching profile. Submitting preserves the current composition and updates the Existing Sessions profile to match it.

### Quick chats / no workspace
No side pane at all — the detail panel and managed tabs are not shown; the chat is
full-width. This is a temporary effective hide: the matching New/Existing profile is
restored when returning to a workspace session.

---

## 7. Transition matrix (single-session, not maximized)

| From | Action | To |
|------|--------|-----|
| any workspace-session state | Switch to another session of the same type | same shared editor/detail profile; per-session tabs are restored |
| New ↔ Existing | Navigate between lifecycle types | restore the target type's shared profile |
| New | Submit | preserve current visibility; seed Existing profile |
| *Detail only* (new session) | Open a file from Files | *Editor + Detail* (editor revealed, stays open) |
| *Detail only* / *Side pane closed* (created session) | Click **Changes** pill | *Editor only* (Changes editor revealed, detail stays closed unless separately restored/opened) |
| *Detail only* (new session) | Toggle Details (hide detail) | *Editor only* (empty editor revealed — the side pane does not vanish) |
| *Detail only* (new session) | Drag grid sash wider | *Detail only* (editor stays closed) |
| *Detail only* (new session) | Toggle Sessions List closed | *Detail only*; the **detail panel** widens by the sessions-list width (editor stays closed) |
| *Detail only* | Toggle Details (hide detail) | *Editor only* (editor revealed) |
| *Editor + Detail* | Hide Editor chevron | *Detail only* (detail keeps width, chat expands) |
| *Editor + Detail* | Toggle Details (hide detail) | *Editor only* |
| *Editor only* | Toggle Details (show detail) | *Editor + Detail* |
| *Detail only* / *Editor only* / *Editor + Detail* | Toggle Side Panel | *Side pane closed* |
| *Side pane closed* | Toggle Side Panel | previous state restored |
| any | Switch to another workspace session | same editor/detail visibility |
| editor/detail side pane visible | Toggle Sessions List closed | same pane state; editor/detail side pane widens by the sessions-list width |
| sessions list closed after side-pane growth | Toggle Sessions List open | same pane state; editor/detail side pane returns to its pre-collapse width |
| any | Close the last editor tab | *Side pane closed* (chat-only; opening a tab restores the pane) |
| *Detail only* (created session) | Drag grid sash wider | *Detail only* (editor content stays closed) |
| any | Activate **Browser** tab | detail hidden (transient) |
| Browser active (detail hidden) | Activate **Files/Changes** tab | detail restored |
| any new-session pane state | **Submit** the session | same visibility and active tab; Changes becomes active after file changes arrive |

---

## 8. Manual validation checklist

1. **New session view:** Changes and File tabs shown + File active + Files detail open + **no editor
   content**; tab bar visible; the "What are you building?" composer keeps focus.
2. **Open a file** from the Files view in the new-session view → the editor content appears and stays.
3. **Detail toggle** in the new-session view → the editor content appears (detail hides).
4. **Submit** a new session → the Changes tab becomes active with the Changes detail; the editor
   content is **still closed**.
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
| Global editor/detail visibility and quick-chat suppression | `contrib/layout/browser/singlePane/singlePaneSidePaneVisibilityStrategy.ts` |
| Hide Editor chevron, Maximize, add-tab actions | `contrib/editor/browser/editor.contribution.ts`, `contrib/editor/browser/addTabActions.ts` |
| Toggle Details command + editor-title item | `contrib/layout/browser/singlePaneLayoutController.ts` |

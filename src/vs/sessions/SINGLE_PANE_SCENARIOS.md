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

Only **Existing Sessions** share a persisted Editor/Details visibility profile. A New Session does not apply or capture that profile; on entry it hides Editor once only when the restored editor set contains no input other than Empty Files. Submit seeds the Existing profile. The active editor selects the detail content: every diff editor selects Changes and every file editor selects Files.

**Size distribution when opening the side pane.** Opening the side pane from *closed* (e.g. clicking
**Changes** while the chat is full-width) reveals the editor with `Sizing.Distribute`. The grid uses
the revealed view's location to distribute its containing split. The Sessions part and side pane therefore
receive equal space without either part computing a width. After that, side-pane sizes are **workbench-level,
not per session**: the editor grid node width is owned by the workbench grid and persisted globally
(`workbench.sessions.partSizes`), so once the user resizes the side pane it keeps that width — including
across **session switches** (switching sessions does not change the side-pane width) and across reloads.

**Size distribution when toggling Details.** While Editor is visible, opening Details grows the editor
grid node by the current Details width, taking that space from Sessions/chat. Hiding Details shrinks the
node by the rendered Details width and returns that space to Sessions/chat. Grid minimum widths still take
precedence when Sessions cannot yield the full width.

**Reload is flicker-free (workbench owns the geometry).** On reload the workbench restores the editor node
width from its own persisted part-sizes (`workbench.sessions.partSizes`, consumed by
`createDesktopGridDescriptor`), so the grid is painted at the correct size in a single pass. (At the
workbench level, hiding the editor still collapses the grid node to the detail width and caches it, and a
captured editor-hide width `_dockedEditorSizeBeforeHide` takes precedence for the immediate re-show only
when Details remains visible; Editor-only restoration uses the persisted pure Editor-content width.)
**Reopening after the sessions list is collapsed.** Closing the **whole** side pane collapses the editor
grid node to `0px`, but its Editor-before-Details close order first captures the current combined width
while the node is still visible. Reopening restores that composition without treating `0px` as a user
width. If a New Session then settles to Files-only, hiding Editor while Details remains visible shrinks the
node to the Details width and captures the combined width for the next file open. Returning instead to an
Existing Session's Editor-only profile restores its pure Editor width, so repeated session switches do not
add the hidden Details width.

---

## 3. Controls

| Control | Location | Effect |
|---------|----------|--------|
| **Toggle Details** (`≡`) | Editor header layout toolbar, after the actions overflow and a separator | Shows/hides the detail panel (default keybinding **`⌥⌘L`**). Hiding the detail **while the editor is hidden reveals the editor** (→ *Editor only*), so the pane is never left empty. It never changes the Sessions sidebar; that remains under explicit user control. Its `toggled` state (`AuxiliaryBarVisibleContext`) is kept **in sync with the actual rendering**. Shown **only** when the active tab is **Changes or Files** (not Browser or Search, which have no detail). |
| **Maximize / Restore** | Editor title bar, primary inline | Maximizes the editor area (forces the Changes detail while maximized; restores on un-maximize). Default keybinding **`⌥⌘E`** toggles maximize/restore while the editor area is visible. |
| **Hide Editor** (`right-panel-hide`) | Editor title bar (tab strip), after Maximize/Restore | Closes the editor content and keeps the detail (→ *Detail only*). The docked side pane shrinks to the detail width so the freed editor width goes to the **chat**, not the detail. Always shown and always enabled, regardless of whether a detail panel is currently visible. |
| **Show Editor** (`right-panel-show`) | Editor title bar (tab strip), same slot as Hide Editor | Reveals the (possibly empty) editor content again. Always shown whenever the editor area is closed, regardless of the active tab's detail support. |
| **Collapse All Diffs** | Changes editor header, primary inline | Collapses every file in the Changes multi-diff (`SessionChangesEditor.collapseAllDiffs`). |
| **`+` Add Tab** | End of the tab strip | Opens the Add Tab menu (Browser `⇧⌘K B`; Search `⌘K S` for workspace-backed sessions; a **Changes** entry when the Changes editor tab is absent, and a **Files** entry `⌘K B` when the Files tab is absent — both for any workspace session). Restored managed Changes/Files tabs are inserted at the **end** of the tab strip. Search opens a new Search editor and is unavailable for Quick Chats. **Hidden when the editor area is closed.** |
| **Toggle Side Panel** | Command / keybinding | Closes/opens the **whole** side pane (editor + detail together) → chat-only and back. The mechanics live on the workbench layout service (`toggleSidePane`); while the editor area is maximized, the shared `Workbench.toggleSidePane()` remembers maximization, un-maximizes, then performs the collapse so the restored detail is also hidden. Reopening restores the complete side-pane composition before re-maximizing the editor. Hiding a focused side pane moves focus to the sessions list. |
| **Toggle Sessions List** | Title bar / command | Collapses/opens the left sessions list. Collapsing it gives the freed width to the editor/detail side pane (not the chat); reopening restores the previous editor/detail width so the chat gets that space back. No single-pane editor or detail action changes this visibility. |
| **Grid sash** | Between the chat and the third pane | Dragging a detail-only side pane wider keeps the editor content closed. When editor content and details are visible but no longer fit, the detail panel hides; widening until the pane can restore details without shrinking the expanded editor restores it. Double-clicking with Details visible preserves the current Details width and splits all remaining width equally between chat and editor content, with no 600px cap. Grid minimum widths take precedence in narrow layouts. Hiding Details after a reset restores an equal chat/Editor split even when the reset itself did not visibly move the sash. With Details hidden it uses the native equal split, and in detail-only mode it resets Details to 300px. |
| **Changes pill** | Session header meta row | Opens the managed Changes multi-diff editor and explicitly reveals the editor area when the side pane was closed or in detail-only mode. The managed Changes tab still remains excluded from automatic reveal-on-open, so merely activating its tab does not reveal the editor. |

**Editor action visibility.** Maximize/Restore, Toggle Details, and Open in Modal are hidden while the **editor area is closed** (`MainEditorAreaVisibleContext`). Hide Editor and Show Editor are the mutually-exclusive pair that controls that very state: both render in the tab strip's editor-title layout cluster (`MenuId.EditorTitleLayout`), immediately after Maximize/Restore, gated only on `MainEditorAreaVisibleContext` being true/false respectively — unlike Toggle Details, they always show and are always enabled regardless of whether the active tab has a docked detail panel or the detail panel is currently visible (no `HasDockedDetailsContext` gate and no `AuxiliaryBarVisibleContext` precondition), consistent with Maximize/Restore's own always-shown behavior in that same cluster. Hide Editor unconditionally reveals the auxiliary bar as part of its `run()`, so it always has somewhere to fall back to even if the detail panel was hidden beforehand — the New/Existing Session strategy's detail-panel mapping (via the shared `SinglePaneDetailPanelCoordinator`) decides what that panel actually shows (the active tab's own detail, or the Changes/Files fallback for a Browser tab with none of its own; see §5). Show Editor reveals the editor via the same explicit-reveal API (`revealEditorPartExplicitly()`) used by the session-header Changes pill, then focuses the editor group. Toggle Details remains alone in its own trailing editor-header cluster and keeps its **has a docked detail panel** (`HasDockedDetailsContext`) gating — a managed Changes/Files tab or a text file editor — since toggling a nonexistent detail panel is never meaningful.

**Managed Files tab.** The empty Files placeholder tab (and the Changes tab) is opened when the editor group is **empty** on a view-open trigger (a session switch or a side-pane reveal), and both remain present whenever the layout is **Detail only**. The agent-feedback navigation overlay is hidden while the empty Files placeholder is active. Opening a real workspace file **tidies away** the empty placeholder (a `[Changes][file]` strip) as a **one-shot reaction to that open** — not a standing rule — so the user can still add the Files tab via **`+` Files** while a real file is open (that opens an `EmptyFileEditorInput`, not a real file, so it is not tidied away). Existing Sessions do not re-add the placeholder when that file closes while Editor is visible; a New Session instead uses its close fallback to replace the last non-Empty input with Empty Files while preserving Editor/Detail visibility.

**New-session transitions have separate owners.** Entry owns only the one-shot redundant-Editor hide after session restoration. A completed closed-to-open **Toggle Side Panel** transition owns only the dock-only Files conversion after managed tabs settle. Last-editor close listens to the editor service's did-close event and uses the shared all-main-groups-empty predicate; it ignores programmatic closes while editor-part auto-visibility is suppressed, then installs Empty Files in the exact closing group, preserves Editor visibility, and opens Files Details. Generic side-pane reveal notifications never start the toggle rule, so editor opens and close-fallback restoration cannot feed back into it.

**Empty editor groups are lifecycle-owned.** `SinglePaneWorkbench` does not change visibility when all editors close. New Session replaces a last non-Empty editor with Empty Files, but closing Empty Files itself closes the whole side pane; Existing Session closes the whole side pane when its last editor closes; Quick Chat leaves the side pane open.

**Layout-driven vs user editor changes.** The default docked tabs are (re)opened into an empty group on a **settled** session-switch restore — the base controller fires `onDidEndSessionLayoutRestore` once the restore epoch (working-set apply + aux restore) completes, and the strategy reconciles off that. This matters for a new session: its **empty** working set closes the previous session's docked tabs, emptying the group *after* the switch; reconciling on the settled restore-end reads the reliably-empty group and re-opens both managed tabs. Reacting to the transient editor-change *during* the async apply would race the empty state. A **user-driven** editor change (opening a file, closing a tab) does not re-open defaults while Editor is visible; in Detail only, standard close actions cannot remove the managed inputs and every reconcile restores either input removed by lifecycle work.

Existing→Existing navigation replaces the outgoing session-specific Changes input in place with the incoming Changes input, preserving tab position and active state. It does not visibly close the Changes tab and open another one.

**Folder-less composer to workspace draft.** Opening **New Session** first exposes a folder-less composer and then seeds its concrete workspace draft. The first step removes the previous session's Changes tab while the shared Files placeholder can keep the editor group non-empty, so the second step explicitly ensures Changes when `wantsChangesTab` becomes true. When the selected session folder differs from the new-session default folder, the workspace-gated working-set restore can settle later and remove that early Changes tab while retaining Files; the settled restore therefore repeats the one-shot Changes ensure for the uncreated session. Relying only on the empty-group rule or only on the initial eligibility transition leaves Files as the sole tab until another reveal or New Session gesture.

**New-session submit.** Submit preserves the current Editor/Details composition and seeds the Existing Sessions profile. The Files tab remains active until the submitted session reports its first file changes; then Changes becomes active without revealing Editor. This pending activation is scoped to the submitted session, so switching away cannot activate Changes in another session.

**Details-only invariant.** Whenever the side pane is **Detail only** (the aux-bar detail panel is visible without the editor area — e.g. the new-session view, or a created session whose editor was hidden), the side pane shrinks to the persisted Details width and the docked details panel *shows* the managed docked inputs, so Changes and Files are always present. Opening a file restores the preceding combined Editor + Details width without changing the Details width. Both inputs adopt `EditorInputCapabilities.CannotClose`, and every reconcile reads the settled, current part visibility and restores either input removed by lifecycle work even when the group is non-empty. When Editor is visible, the capability is removed and the strict "add only into an empty group" rule remains.

**Closing managed tabs.** The user can close the managed Changes and Files tabs (they are non-preview, not sticky) while Editor is visible. Those closes are respected without any dismissal bookkeeping: the default tabs are opened **only into an empty editor group** on a view-open trigger (plus the one-shot submit activation above), so closing one tab while another (or a real file) remains leaves the group non-empty and it is not re-created. In Detail only, close commands and tab affordances consistently leave the backing inputs open, while internal lifecycle work can still force-close either input during working-set application, session switches, or stale-tab cleanup. Closing the last tab while Editor is visible closes the whole side pane; reopening it (empty group) restores the defaults. While a managed tab is closed for a workspace session with Editor visible, the `+` Add Tab menu offers a matching entry to reopen it — **Changes** (gated on `SinglePaneChangesTabMissingContext`) and **Files** (gated on `SinglePaneFilesTabMissingContext`); the re-added tab makes the group non-empty, so it survives.

**Reopening after lifecycle cleanup.** If lifecycle work force-closes every tab, the whole side pane can close; the managed Changes and Files tabs are re-ensured when the side pane reopens.

**Side-pane-closed persists across reload.** Closing the whole side pane is remembered across a window reload. On reload the restored managed tab does **not** re-reveal the detail: the detail-panel forced reveal is gated on the editor content being visible, so a fully-closed side pane stays closed until the user reopens it.

**Opening a file.** The **Files** add-tab entry opens its tab **pinned** (not a preview tab).

Actions **not** present in single-pane mode: **Close Editor Area** (the standard
layout keeps it; single-pane's own **Show Editor** action is its counterpart to Hide Editor).

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
| **Browser** | **Hidden** (transiently) while the Browser tab is active *and the editor area stays visible*; restored when switching back. If the editor area itself is hidden while Browser is active (e.g. via **Hide Editor**), the panel instead shows the Changes/Files fallback, since it is the only thing left on screen. |

Rules:
- **Reveal on activate, respect after.** Switching to a Changes/File tab reveals the detail with the
  right container. While the **same** tab stays active, an explicit user hide of the detail (via the
  detail toggle) is **respected** — it is not re-forced. Switching tabs reveals it again.
- **Browser is transient, but only while the editor area is visible.** A Browser tab hides the detail
  panel while the editor content stays on screen; switching back to Files/Changes **restores** it.
  Hiding the editor area (Hide Editor) while Browser is active does **not** leave the panel blank: it
  shows the same Changes/Files fallback a session with no active editor gets, and reveals the editor
  area again (Show Editor) restores the "Browser hides the detail" rule.

---

## 6. Layout rules (session lifecycle)

Existing Sessions share an Editor/Details visibility profile. New Sessions do not own lifecycle visibility state; their one-time entry rule hides redundant Editor content only when Empty Files is the sole input. Submitting preserves the current composition and updates the Existing profile.

### Quick chats / no workspace
Quick Chats with saved editors share overall side-pane visibility with Existing Sessions. A visible
Existing composition maps to Editor-only because Quick Chats have no Details; a hidden composition
stays hidden. Opening a first editor and visibility changes made in an editor-bearing Quick Chat
update the shared profile before the chat's first switch.
A Quick Chat without editors hides the side pane transiently without overwriting that profile, so
navigating to an Existing Session or another Quick Chat with editors restores the shared visibility.

### Multiple visible sessions
Visibility restoration is reveal-only while multiple sessions are visible. Focusing a workspace
session reveals the parts enabled by its matching profile, while focusing a quick chat or another
session without side-pane content does not hide Editor. Collapsing back to one Quick Chat keeps
Editor visible; collapsing to a workspace session restores that session type's complete shared profile.
Reveal-only preservation applies only to panel synchronization: active Changes/Files editors still
publish their docked-details capability so **Toggle Details** remains available.

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
| *Editor + Detail* | Hide Editor | *Detail only* (detail keeps width, chat expands) |
| *Editor + Detail* | Toggle Details (hide detail) | *Editor only* |
| *Editor only* | Toggle Details (show detail) | *Editor + Detail* |
| *Detail only* / *Editor only* / *Editor + Detail* | Toggle Side Panel | *Side pane closed* |
| *Side pane closed* | Toggle Side Panel | previous editor/detail state and maximization restored |
| any | Switch to another workspace session | same editor/detail visibility |
| editor/detail side pane visible | Toggle Sessions List closed | same pane state; editor/detail side pane widens by the sessions-list width |
| sessions list closed after side-pane growth | Toggle Sessions List open | same pane state; editor/detail side pane returns to its pre-collapse width |
| any | Close the last editor tab | *Side pane closed* (chat-only; opening a tab restores the pane) |
| *Detail only* (created session) | Drag grid sash wider | *Detail only* (editor content stays closed) |
| *Editor only* / *Editor + Detail* | Activate **Browser** tab | *Editor only* (detail hidden, transient) |
| *Editor only* (Browser active) | Activate **Files/Changes** tab | *Editor + Detail* (detail restored) |
| *Editor only* (Browser active) | Hide Editor | *Detail only* (detail shows the Changes/Files fallback, not left blank) |
| *Detail only* (Browser was last active tab) | Show Editor | *Editor only* (detail hides again — Browser's transient-hide rule resumes) |
| any new-session pane state | **Submit** the session | same visibility and active tab; Changes becomes active after file changes arrive |

---

## 8. Manual validation checklist

1. **New session view:** Changes and File tabs shown + File active + Files detail open + **no editor
   content**; tab bar visible; the "What are you building?" composer keeps focus.
2. **Open a file** from the Files view in the new-session view → the editor content appears and stays.
3. **Detail toggle** in the new-session view → the editor content appears (detail hides).
4. **Submit** a new session → the Changes tab becomes active with the Changes detail; the editor
   content is **still closed**.
5. **Hide Editor** → editor content closes, detail **keeps its width**, chat expands, tab bar
   stays; Hide Editor is then replaced by Show Editor in the same slot.
6. **Detail toggle** from *Editor + Detail* → detail hides, editor stays (*Editor only*); toggle again
   → detail returns.
7. **Toggle Side Panel** → the whole side pane closes (chat-only); toggle again → it restores. Repeat while maximized and verify that reopening restores maximization.
8. **Browser tab** → detail hides; switch back to Files/Changes → detail restores.
9. **File tab** active → the Explorer detail is shown (revealed on activation).
10. **Close the last editor tab** → the whole side pane closes (chat-only); opening any tab restores it.
11. **`+` button** hidden while the editor area is closed; reappears when the editor is open.
12. **Sash drag** to widen the third pane in a **created** session while the editor is closed → editor
    content re-reveals and Hide Editor reappears (replacing Show Editor); hiding the editor never leaves a
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
| New Session entry-time editor hide + detail mapping; Existing Session visibility profile + detail mapping | `contrib/layout/browser/singlePane/singlePaneNewSessionStrategy.ts`, `contrib/layout/browser/singlePane/singlePaneExistingSessionStrategy.ts` |
| Quick Chat side-pane preservation | `contrib/layout/browser/singlePane/singlePaneQuickChatStrategy.ts` |
| Managed Changes + File tabs (suppressed opens) + detail-only editor-area collapse | `contrib/layout/browser/singlePane/singlePaneDockedTabsCoordinator.ts` |
| Detail-panel sync mechanics (sequencer, `openViewContainer`) | `contrib/layout/browser/singlePane/singlePaneDetailPanelCoordinator.ts` |
| Existing Session visibility-profile storage (legacy combined storage shape accepted) | `contrib/layout/browser/singlePane/singlePaneVisibilityProfileStore.ts` |
| Startup controller selection | `contrib/layout/browser/sessions.layout.contribution.ts` |
| Hide/Show Editor, Maximize, add-tab actions | `contrib/editor/browser/editor.contribution.ts`, `contrib/editor/browser/addTabActions.ts` |
| Toggle Details command + editor-title item | `contrib/layout/browser/singlePane/singlePaneExistingSessionStrategy.ts` |

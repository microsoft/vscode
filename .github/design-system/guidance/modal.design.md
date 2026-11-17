# Modal

## Introduction

A management modal gives a bounded task a temporary home without losing the workspace behind it. Keep the shell consistent while allowing the task inside it to differ: browsing customizations, managing automations, and managing remote environments should feel related, not interchangeable.

## Overview

Design for **Calm** through restrained chrome, **Focused** through a clear content hierarchy, and **Consistent** through shared surface and control roles. Harmonious does not mean giving every manager a sidebar, a fixed number of columns, or a permanent footer.

Keep three layers distinct:

| Layer | Responsibility |
| --- | --- |
| Host | Modality, placement, available size, outer contour, close path, focus ownership, and supported child overlays |
| Management shell | Stable title, optional navigation, content heading and collection tools, and predictable scrolling |
| Feature | Data, scope, selection, editing, validation, progress, and action consequences |

Customizations, Automations, and remote environments share the [modal editor host](../../../src/vs/workbench/browser/parts/editor/modalEditorPart.ts) and its [compact-header options](../../../src/vs/platform/editor/common/editor.ts). Keep their management shells consistent while letting each feature shape its own content. Use [Dialog](../../../src/vs/base/browser/ui/dialog/dialog.design.md) for short blocking questions.


## Usage

Choose the working context before styling its frame.

| Need | Choose |
| --- | --- |
| Briefly manage a related collection, then return to the previous task | A management modal on the modal editor host |
| Answer a blocking question or confirm a consequence | The existing dialog service, not a miniature management window |
| Choose one item or command | Quick Input or the existing picker |
| Read, compare, or edit content over a sustained session | An editor or docked view; open it from the manager instead of growing the manager into an editor |

Use the host rather than imitating modality with a dim rectangle. Request the same modal editor options as the existing managers: a compact header, and no move into the editor area. The host owns placement, resizing, persisted size, the close action, and dismissal; a feature must not reimplement them.

## Anatomy

Separate the **window title** from the **content title**. The first names the whole task; the second names the selected category or collection. Scope controls belong with the content they affect, not among window controls.

```text
+--------------------------------------------------------------------+
| Management title                                     Host | Close  |
+==================+=================================================+  <- header divider
| Navigation       | Content title [count]   Filter  Search  Primary |
| (optional)       | Supporting description                          |
|                  +-------------------------------------+-----------+
| Group or         | Name        Metadata   Status   [On]| Item      |
| category  count  | Name        Metadata   Status   [On]| detail    |
|                  | Name        Metadata   Status   [On]| Close (x) |
+------------------+-------------------------------------+-----------+
                   ^ navigation divider                  ^ detail divider
```

**Structural study, not measured UI.** The header spans the shell. Navigation is optional; the main content takes its space when absent. Detail belongs to the current task and closes locally.

- **Host header:** title leading, host actions and Close trailing. A divider separates the header from the body. Never put a feature's Create action among window controls.
- **Navigation:** a list of destinations or ownership groups with trailing counts. A divider separates it from the content. Give the region an accessible name.
- **Content header:** title leading. Collection tools trail in a fixed order: **filter, search, primary action**. Wrap tools below the title before crowding it.
- **Collection:** a table with metadata columns for data people scan and compare. Group rows by a meaningful key with a collapsible header and a count. Keep row actions and on/off toggles at the row's trailing edge.
- **Detail:** opens beside the collection when an item is selected, separated by a divider. It shows identity, the most important properties, primary item actions, the latest result, and history. Its Close closes the detail, not the manager.
- **Footer:** only when a whole-form draft needs commit and cancel. A browsing manager does not need a footer.

## Visual treatment

Reuse complete component treatments rather than assembling a new visual language for each feature. The [elevation specification](elevation.design.md) owns surfaces, contours, shadows, and stacking; the [size registry](../../../src/vs/platform/theme/common/sizes/baseSizes.ts) owns the spacing and radius ramps.

| Role | Guidance |
| --- | --- |
| Outer surface | The host owns contour, radius, shadow, and backdrop. One perceived perimeter: do not add a rounded, bordered card inside the rounded host. Use an opaque, theme-aware fill; avoid glass or blur behind dense text. |
| Header | Compact host header on the editor background, followed by a divider. |
| Navigation | Same surface as the content, separated by a divider rather than a second fill. Selected row uses the list selection treatment; counts are trailing, secondary text. |
| Content header | Title in the heading role, description in the secondary body role, collection tools on one row with the shared toolbar gap. |
| Collection | Table rows with column headers. Equivalent tables share the same alternating-row treatment. Group headers use one count treatment across managers. |
| Detail | Same surface as the collection, separated by a divider. Section labels use one role; properties use a label/value grid. |
| Controls | Workbench buttons, inputs, toggles, and toolbars. Equivalent roles, such as the primary create action or the filter button, share size, style, and position. |
| Selection and status | Keep selection distinct from keyboard focus. Pair status color with an icon or text; an unavailable environment is not a disabled automation. |

Use semantic tokens and theme colors only. Choose the shared role before its token; do not copy measurements between managers.

## Composition and adaptation

### Navigation is not filtering

Use navigation when destinations have different content or capabilities, such as Customizations' categories. Use ownership groups when they name a lasting, meaningful scope, such as Automations' personal, cloud, and repository groups. Use filters for transient narrowing of the current collection: status, workspace, execution location, harness, or environment.

Do not show the same dimension as both a navigation item and a filter. When a manager has a single collection and no meaningful scopes, omit navigation; remote environments can stay table-led.

### Keep the task stable

Opening details, changing selection, resolving metadata, and showing progress must not move the outer frame or the collection tools. Scroll the collection and the detail independently inside their regions.

Prefer detail **beside** the collection while both remain usable. When the width cannot hold both, replace the collection with the detail and provide Back. Overlay detail that covers the collection is not the default. Detail is rich UI for the item, not a raw editor of its source; offer the source as a secondary action.

### Adapt before clipping

Keep the title, Close, identity, state, and primary action available as space shrinks. Let tools wrap, secondary columns yield, and detail change presentation before compressing everything. Navigation may collapse only if an operable replacement remains. Check the actual container at increased zoom and with longer localized labels.

## Behavior

- **One management task:** create and edit within the current manager where practical. Creating with an agent may hand off to a chat session; say so before the manager closes.
- **Explicit consequences:** distinguish browsing, selection, and drafts from applying a change. Toggling an automation off is not deleting it; closing the manager does not stop a running automation; selecting a sharing method does not start sharing.
- **Local feedback:** put field errors with fields and operation status with its row or detail. Preserve the draft on recoverable failure.
- **Useful empty states:** distinguish an empty collection, no search matches, missing setup, loading, and failure. Offer the next relevant action.
- **Avoid redundant labels:** do not repeat the same status or run label in the row, the group header, and the detail.
- **Predictable dismissal:** Escape closes the active child picker or menu first, then the open detail, then the manager under the host's dirty-state policy.

The [elevation lifecycle guidance](elevation.design.md#keep-one-task-in-front) explains child surfaces and save confirmation.

## Accessibility

Use the host's accessible name and modal semantics. Move focus into the task, keep Tab and Shift+Tab within the host and supported child surfaces, and restore focus to the invoker on close.

- **Name regions and controls:** label navigation, the collection, and the detail. Distinguish Close Details from Close. Icon-only actions such as filter and refresh need specific names.
- **Preserve composite navigation:** keep the real list, tree, table, and toolbar keyboard models. Selection and focus remain visible together, including on rows with toggles.
- **Handle child surfaces:** a dropdown remains usable within the modal's focus ownership; Escape returns to its trigger.
- **Announce meaningful changes:** expose loading, validation, and completion without re-announcing the manager. Do not rely on a spinner, a colored dot, zebra striping, or hover alone.
- **Support themes and preferences:** check dark, light, and both high-contrast themes; keep a contour when shadows disappear and honor reduced motion.
- **Follow the workflow:** use the [accessibility skill](../../skills/accessibility/SKILL.md) for help content, Accessible View, and verbosity hints.

## Review checklist

- The task is bounded and uses the modal editor host with a compact header.
- A divider separates the header from the body, and navigation from content; there is no inner card.
- Collection tools are ordered filter, search, primary; Create never sits among window controls.
- Tables use metadata columns, the shared zebra treatment, and one group-count style.
- Each dimension is either navigation or a filter, not both.
- Detail opens beside the collection, closes locally, and does not move the frame.
- Narrow or zoomed content keeps the title, Close, and the primary action reachable.
- Keyboard navigation, child dismissal, visible focus, and return focus work in the real host.

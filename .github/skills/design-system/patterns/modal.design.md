---
title: "Modal"
kind: "pattern"
status: "stable"
order: 2
aliases:
  - "management modal"
legacyPaths:
  - ".github/design-system/guidance/modal.design.md"
  - ".github/design-system/modal.design.md"
---

# Modal

## Introduction

A management modal lets people find, inspect, and act on related items, then return to their workspace. Reuse its composition and interaction model across Automations, Customizations, and remote environment management; short confirmations and sustained editing need different surfaces.

## Overview

Apply [Sameness signals sameness](../foundations/principles.design.md#6-sameness-signals-sameness) to the whole journey, not just the frame. People should recognize how to browse, narrow a collection, inspect an item, act, and return.

Keep these relationships consistent:

| Shared contract | May vary with the task |
| --- | --- |
| One temporary management task with a stable title and close path | The collection and its domain language |
| Collection tools stay with the collection; item actions stay with the item | Available filters, metadata, and primary action |
| Navigation, filtering, and selection have distinct meanings | Whether categories or persistent scopes require navigation |
| Inspection preserves the place people came from | Beside-detail or drill-in presentation according to available space |
| Progress, failure, and recovery stay attached to the affected operation | Whether the operation configures, installs, runs, or connects |

This is a target design convention for the management-modal family, not a claim that the three evolving designs already match. Harmonize shared decisions without forcing identical content or changing every modal editor.


## Usage

Choose the working context before styling its frame. A shared silhouette alone is not a reason to use this pattern.

| Need | Choose |
| --- | --- |
| Briefly browse, inspect, or configure a related collection, then return | This management-modal pattern |
| Answer a blocking question or confirm a consequence | The existing dialog service, not a miniature management window |
| Choose one item or command | Quick Input or the existing picker |
| Read, compare, or edit content over a sustained session | An editor or docked view, with a clear handoff from the manager |

For example, inspecting an automation's schedule and enabling it fits this pattern. Comparing several run outputs while editing code belongs in the working layout, not a growing stack of modals.

## Anatomy

Separate the **window title**, which names the management task, from the **content title**, which names the current collection. Keep one main content region; optional navigation and detail support it.

```text
+--------------------------------------------------------------------+
| Management title                                            Close |
+------------------+-------------------------------------------------+
| Navigation       | Collection title                                |
| (optional)       | Description            Filter  Search  Primary  |
|                  +-------------------------------------+-----------+
| Destination      | Item        Metadata        Actions | Detail    |
| or scope         | Item        Metadata        Actions | (optional)|
|                  | Item        Metadata        Actions |           |
+------------------+-------------------------------------+-----------+
```

**Structural study, not measured UI.** One header spans the task; the collection leads, with optional navigation before it and optional detail beside it. Lines show region relationships, not required borders.

| Region | Keep consistent | Use only when needed |
| --- | --- | --- |
| Task header | Title leading, host controls and Close trailing; never put Create among window controls | Additional host actions supported by the surface |
| Navigation | Named destinations or lasting scopes, with a clear current location | Omit for a single collection without meaningful scopes |
| Collection header | Title and supporting description; tools ordered filter, search, primary action | Omit absent tools; wrap them before crowding the title |
| Collection | Scannable identity, relevant metadata, status, and item actions | Tables for comparison; cards or lists when their content structure fits better |
| Detail | Selected identity, properties, item actions, and relevant results | History or other secondary information when it supports the task |
| Draft actions | Commit and Cancel belong to the draft they affect | A footer only for a whole-form draft, not routine browsing |

When navigation or detail is absent, give its space to the collection. Do not retain empty columns merely to match another manager.

## Composition and adaptation

### Give each navigation choice one job

| Choice | Meaning | Preserve |
| --- | --- | --- |
| Destination | Switch the kind of content or available capabilities | A clear location and destination-specific context |
| Scope | Switch a lasting ownership or working context | Visible scope and predictable collection membership |
| Filter or search | Narrow the current collection without changing its identity | Active criteria and a clear reset path |
| Selection | Identify an item for inspection or action | Distinct selection and keyboard focus |
| Drill-in | Temporarily replace the collection with one item's detail | Back to the same scope, criteria, selection, and scroll position |

Do not represent the same dimension as both navigation and a filter. Opening an item must not silently change the current scope.

### Keep inspection local

Open detail beside the collection while both remain usable. Close Details returns attention to its item; it does not close the manager.

At constrained widths, replace the collection with detail and provide Back instead of covering it with another modal. Restore focus to the originating item on return.

Keep the outer frame and collection tools stable while selection, metadata, and progress change. Scroll long collections and details within their own regions.

### Adapt without changing meaning

Let tools wrap and secondary columns yield before compressing identity, state, or actions. If navigation collapses, retain an operable replacement that exposes the current location.

Check increased zoom and longer localized labels in the actual container. Back, Close, and the primary action must remain reachable without losing the task's hierarchy.

## Behavior

Keep the same action and recovery model even when feature verbs differ.

| Moment | Shared behavior |
| --- | --- |
| Enter | Show the task title and current location; move focus into a meaningful starting point |
| Browse | Selection inspects; it does not implicitly install, run, connect, or apply a draft |
| Create or edit | Stay within the manager where practical; distinguish draft changes from immediate actions |
| Apply | Make consequences explicit; use one primary action for the current decision |
| Wait | Show progress beside its operation without moving the frame or stealing focus |
| Recover | Keep field errors with fields and operation failures with their item; preserve recoverable input and offer retry |
| Leave detail | Back or Close Details returns to the collection with its context intact |
| Leave manager | Use the host close path and dirty-state policy; return focus to the invoker |

Distinguish an empty collection, no matches, missing setup, loading, and failure. Each state needs an explanation and the relevant next action, not the same empty illustration.

Explain a handoff before opening an editor, chat, or external destination. Closing the manager does not itself stop an automation or disconnect an environment.

Escape dismisses the active child menu or picker first. Then dismiss local inspection, where present, before leaving the manager; preserve draft protection throughout.

Use the [elevation lifecycle guidance](../foundations/elevation.design.md#keep-one-task-in-front) for child surfaces and necessary save confirmation. Recoverable errors do not justify another custom modal.
## Accessibility

The [accessibility contract](../../accessibility/SKILL.md) applies throughout the shared journey. Use the host's modal semantics and keep Tab and Shift+Tab within it and supported child surfaces.

- Name navigation, collection, and detail regions; distinguish Close Details from the manager's Close.
- Preserve the real list, tree, table, and toolbar keyboard models, including access to item actions.
- Keep keyboard focus visible alongside selection and nested controls; never rely on hover for an essential action.
- Return focus from child surfaces to their trigger, from detail to its item, and from the manager to its invoker.
- Expose loading, validation, and completion without re-announcing the whole manager; do not rely on color or motion alone.
- Maintain readable structure, reachable actions, and visible focus at increased zoom and in high-contrast themes.
- Follow the owning feature's help, Accessible View, and verbosity requirements when adding or changing interactions.

## Scenario applications

These are applications of the proposed shared pattern to ongoing design work, not final feature specifications. Compare the shared journey before deciding which regions each scenario needs.

| Scenario and job | Reuse the pattern | Justified variation |
| --- | --- | --- |
| Automations: find a routine, inspect its setup or latest run, then manage it | Collection tools, local inspection, explicit create/edit actions, and operation feedback | Lasting ownership scopes when useful; schedule, enabled state, and run history in item content |
| Customizations: browse a kind of customization, inspect it, then configure or install it | Stable shell, collection tools, selection-to-detail, and local recovery | Categories when content or capabilities differ; source and applicability in item content |
| Remote environments: find a target, inspect availability, then connect or manage it | Scannable identity and state, item actions, operation progress, and a clear return path | A table-led single collection may need no navigation; connection lifecycle and target properties replace run history |

### Transfer the same journey

1. Choose a destination or scope only when the scenario needs one; otherwise start at the collection.
2. Narrow the collection, select an item, and inspect its identity, state, and available actions.
3. Perform the explicit action; show progress or recovery with that item.
4. Return to the same collection context, then close the manager and resume the original task.

For automation inspection, the detail may show a schedule; for a remote target, it may show connection properties. The different data does not earn different Back, Close, or retry behavior.

At narrow widths, both scenarios use drill-in detail with Back rather than a second modal. The observable result is the same: the previous collection context survives inspection.

## Visual treatment

Reuse complete component treatments instead of assembling a visual language per feature. The [elevation specification](../foundations/elevation.design.md) owns surface hierarchy, contours, shadows, and stacking.

- Let the host own the outer perimeter; avoid a second rounded frame around the whole body.
- Use shared heading, secondary-text, spacing, and control roles for equivalent regions and actions.
- Keep navigation and detail subordinate through hierarchy and quiet boundaries, not independent floating cards.
- Use the same selection and group-count treatments for equivalent collections; a pattern does not require every collection to be a table.
- Pair state color with text or an icon; keep selection, focus, and operational state distinct.

### Implementation starting points

Use the [modal editor host](../../../../src/vs/workbench/browser/parts/editor/modalEditorPart.ts), not an imitation backdrop. Separate host responsibilities from feature-owned data, drafts, validation, and operations.

The [Customizations input](../../../../src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.ts) and [remote environments input](../../../../src/vs/workbench/contrib/sessions/providers/remoteAgentHost/browser/remotesEditorInput.ts) request a compact header and disallow moving into the editor area. Reuse those [host options](../../../../src/vs/platform/editor/common/editor.ts) for this surface family rather than rebuilding its chrome.

The current [Automations view](../../../../src/vs/sessions/contrib/sessions/browser/views/automationsView.ts) provides feature context, not evidence that the new modal design has shipped. Feature owners still need to validate adoption of the shared contract.

## Review checklist

- A new scenario can reuse the journey without copying another feature's categories, columns, or metadata.
- Equivalent regions and actions remain recognizable; every difference answers a task need.
- Scope, filtering, selection, and action consequences remain distinct.
- Inspecting and returning preserves collection context at both wide and constrained widths.
- Failure leaves a clear explanation, preserved input, and a useful recovery path.
- Keyboard users can enter, inspect, act, dismiss child surfaces, and return with visible focus.
- The task stays bounded; longer work hands off clearly instead of accumulating modal layers.

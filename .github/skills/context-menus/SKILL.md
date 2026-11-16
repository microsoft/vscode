---
name: context-menus
description: 'Use when adding, changing, or reviewing context menus or menu contributions, including Action2 `menu` entries and MenuRegistry items with `group`/`order`, hand-built `showContextMenu` action lists, submenus, and separators. Covers group order, destructive-action placement, consistency across surfaces, and labels.'
---

# Context menus

A context menu lists the actions for the clicked object in a predictable order, so users find the same action in the same place on every object and surface.

## Group order

Groups render in lexicographic order of their ID, with `navigation` always first. Use these groups, in this order, for new menus and for all Agents window menus:

| Group | Purpose |
|---|---|
| `navigation` | Open, create, or run the object. The default (double-click or Enter) action comes first. |
| `1_state` | Change the object's state. |
| `2_organize` | Change where the object is listed or how it is ordered. |
| `3_copy` | Copy information about the object to the clipboard. |
| `4_manage` | Configure or edit the object itself. Destructive actions come last. |

- Order items within a group with `order` (or `group@n` in `package.json`) instead of relying on title sorting.
- Prefer these groups over inventing new ones. A new group needs a purpose none of them covers.
- Established workbench menus with documented groups (editor, Explorer, terminal, editor title) keep their own group IDs. Add to the closest matching group.
- Group IDs of menus open to extensions are API. When you change one, update every contribution, including `extensions/*/package.json`.

## Rules

- **Destructive actions last.** An action that deletes or removes data is the final item of the menu. Never place it mid-menu.
- **Same object, same menu.** An object shown in several places (list row, tab, header, card) offers the same actions in the same order. Reuse one `MenuId` or the same group IDs rather than building a parallel action list by hand.
- **Inline actions are in the menu too.** Every hover or toolbar action of a row or header also appears in its context menu.
- **Only actions for the clicked object.** List-wide or unrelated actions belong on the section header, view title, or empty space, not on an item.
- **Hide what doesn't apply; disable what can't run now.** Use `when` for actions irrelevant to the object and `precondition` for applicable actions that are temporarily unavailable, such as single-item actions during multi-selection.
- **Keep it short.** At most about 5 groups and 15 items, with one level of submenus. Use a submenu for 3 or more related targets, and a toggle rather than a submenu for a two-way choice.
- **Labels.** Use Title Case. End with `...` when the action asks for more input or confirmation. Labels must be unique within a menu.
- **Dynamic actions join their group.** When actions must be built in code, merge them into the matching group of the menu's actions instead of appending them after a final separator. Join groups with `Separator.join`.

Based on the [VS Code context menu UX guidelines](https://code.visualstudio.com/api/ux-guidelines/context-menus), the [Windows menu guidelines](https://learn.microsoft.com/windows/win32/uxguide/cmd-menus), and the [Apple context menu guidelines](https://developer.apple.com/design/human-interface-guidelines/context-menus).

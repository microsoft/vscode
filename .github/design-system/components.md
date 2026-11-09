# Component qualification and granularity

The Components index represents reusable UI contracts, not every Figma symbol, exported class, fixture, or product region. Figma supplies design evidence; the product supplies implementation and reuse evidence. Neither is an automatic topic generator.

## Choosing the topic boundary

A topic earns its place when it describes an independent interaction or presentation contract that people can reuse. It should have an extracted product widget/service, or be a well-established design-system contract whose missing implementation is explicitly TBD.

Keep variants, states, and structural parts within that contract. A new icon, description, toolbar location, row renderer, header, or attachment kind does not create another component. Conversely, do not collapse genuinely different selection and accessibility behavior just because two controls look similar.

The visible list remains flat and alphabetical. There is no card-link overview or invented family hierarchy in navigation. Related implementations are consolidated within a component topic.

## Evidence from established systems

- [Fluent Button](https://fluent2.microsoft.design/components/web/react/core/button/usage) documents ordinary, split, menu, and compound button types together. [Carbon Button](https://carbondesignsystem.com/components/button/usage/) keeps emphasis, size, icon-only anatomy, and button-group guidance within Button. VS Code likewise has Button, ButtonWithIcon, ButtonWithDescription, ButtonWithDropdown, and ButtonBar in one owning module.
- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) exposes trigger, overlay, content, title, description, and close as parts of Dialog, not separate catalog pages. Menu items, section labels, and submenus follow the same parent/part principle here.
- [Fluent Dropdown](https://fluent2.microsoft.design/components/web/react/core/dropdown/usage) groups single/multiple selection modes while distinguishing native Select and editable Combobox use cases. This index considers product contracts too: SelectBox's native/custom delegates and the platform MultiSelectDropdown have different APIs and selection lifecycles, so their references remain distinct.
- [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction) emphasizes established interaction contracts, keyboard behavior, and focus management. Its [Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip) and [Hover Card](https://www.radix-ui.com/primitives/docs/components/hover-card) are distinct contracts. That distinction informs scope, not an instruction to copy Radix's APIs or accessibility behavior into VS Code.

These are granularity comparisons, not a requirement to reproduce another library's entire catalog.

## Consolidations grounded in product code

| Topic | Implementations, variants, and parts kept together |
| --- | --- |
| Button | [Button and ButtonBar](../../src/vs/base/browser/ui/button/button.ts), icon-only and description variants, split-button behavior, and menu-button triggers |
| Toolbar | [ActionBar](../../src/vs/base/browser/ui/actionbar/actionbar.ts) and [ToolBar](../../src/vs/base/browser/ui/toolbar/toolbar.ts), including secondary actions and overflow |
| Text field | [InputBox and HistoryInputBox](../../src/vs/base/browser/ui/inputbox/inputBox.ts), multiline sizing, and [FindInput](../../src/vs/base/browser/ui/findinput/findInput.ts) as a search composition |
| Label | [HighlightedLabel](../../src/vs/base/browser/ui/highlightedlabel/highlightedLabel.ts), [IconLabel](../../src/vs/base/browser/ui/iconLabel/iconLabel.ts), and [ResourceLabels](../../src/vs/workbench/browser/labels.ts) for URI-aware specialization |
| Menu | [Menu](../../src/vs/base/browser/ui/menu/menu.ts), triggers, items, sections, submenus, and separators; not a separate model-picker or chat-input-menu topic |
| List and Tree | [List](../../src/vs/base/browser/ui/list/listWidget.ts) row renderers and [ObjectTree](../../src/vs/base/browser/ui/tree/objectTree.ts)/[AsyncDataTree](../../src/vs/base/browser/ui/tree/asyncDataTree.ts) variants; file and folder rows are not standalone topics |
| Collapsible pane | [Pane and PaneView](../../src/vs/base/browser/ui/splitview/paneview.ts), including header, body, and expansion state; not every sidebar header or panel title |
| Quick Pick | [QuickPick](../../src/vs/platform/quickinput/browser/quickInput.ts) and its shared service contract, including filter, items, title/actions, and shortcut labels |
| Resource pill | [ChatPillsWidget and its view-item base](../../src/vs/workbench/browser/chatPills.ts), [resource](../../src/vs/workbench/browser/chatResourcePill.ts) and [dropdown](../../src/vs/workbench/browser/chatDropdownPill.ts) presentations; not a page for every attachment/reference fragment |
| Notification | Shared notification message, severity, actions, and toast presentation; not individual headers or the notification-center application surface |

Checkbox, Switch, Radio, Select, Multi-select, and Combobox retain distinct purposes. A counter badge is not relabeled as a general status/tag API. Spinner styles share one topic; a progress bar remains a different contract. Field association, Tabs, and Separator remain bounded TBD contracts rather than invented completed widgets.

The resource pill reference is intentionally scoped to the shared product abstraction; it does not claim that a domain-neutral Tag component has already been extracted.

## Scope and compatibility

[Component curation](content/components/curation.json) explicitly selects the canonical families. The records in [toolkit specifications](content/components/toolkit-specifications.json) remain evidence, not obligations to create topics.

Whole chat/editor/notebook shells, extension-specific rows, window controls, settings pages, glyph fragments, and other feature compositions do not enter the primary component navigation. A code abstraction is evidence of reuse, but not every exported implementation class is a design-system component.

Old variant URLs resolve to their parent family. Icon/status glyph links resolve to Iconography. Other old toolkit-only references remain hidden archival entries so existing links do not fail or pretend to be a different primitive. An explicitly opened archived reference may remain selected in the full book, but it does not reappear in its navigation or normal topic listings.

## Example readiness

Do not use the fixture registry to determine component scope. Existing primitive examples are preserved, including ButtonBar and IconLabel scenes under their parent topics. Primary fixture names and fixture IDs stay stable; secondary grouped examples get distinguishing labels.

Source-validated API rows identify their actual owning implementation, including combined label APIs. A topic that lacks an isolated example/reference remains TBD. Grouping a missing variant into a ready family is not evidence that the missing variant has acquired a preview.

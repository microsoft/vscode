# Mobile Agents Window architecture

> **Specification change gate:** Do not update this document for responsive bug
> fixes, control behavior, styling, or unfinished work. Update it only when
> mobile composition, navigation ownership, or the adaptation contract changes.

## Scope

The phone layout adapts the Agents Window to a narrow, touch-first viewport
without creating a separate session, provider, or command model.

This specification defines stable mobile composition and ownership. Exact
dimensions, touch targets, styling, picker contents, and individual feature
availability belong in code, design tokens, component fixtures, and tests.

## Core principle

Mobile components are presentation adapters over shared Sessions services.
They may replace a desktop part, picker, or editor presentation, but must
preserve provider-neutral session identity, scoped context, and command
semantics.

## Viewport classification

The Agents Window derives phone layout from the current viewport and platform
environment. Mobile context keys are declarative inputs for menus, view
registration, and presentation selection; they are not the source of truth for
model or provider behavior.

Part factories select their mobile or desktop implementation once during
construction, based on the initial viewport. They do not replace part instances
when the viewport later crosses the phone breakpoint.

## Composition

Phone layouts prioritize one primary surface:

```text
Mobile title bar
Active session or custom view
Mobile navigation and transient overlays
```

Desktop side parts do not remain as permanently visible columns. Their content
is presented through mobile navigation, drawers, sheets, or full-screen
overlays as appropriate.

The active session and chat remain owned by `ISessionsService`. Mobile
navigation must not create a second active-session store.

## Mobile part pattern

When a factory selects a mobile subclass, that instance remains alive for the
part's lifetime. It checks the current viewport and delegates to desktop
behavior after rotating or resizing out of phone layout. A mobile subclass:

- reuses the shared service and contribution contract;
- changes only composition, interaction, or presentation;
- gates mobile behavior on the current viewport without recreating the part;
- preserves scoped session context for commands and menus.

Desktop-only behavior must be gated before presentation rather than hidden with
CSS after instantiation when the underlying component is unsuitable for phone
layout.

## Navigation

The workbench-owned `MobileNavigationStack` tracks nested mobile layers such as
drawers, custom views, pickers, and full-screen editors. Platform back
navigation dismisses the top layer before leaving the current session surface;
it does not control part-instance lifetime.

Opening another session resets or replaces transient navigation layers through
the owning service. Components do not coordinate navigation by reading another
component's storage keys.

## Pickers and actions

Mobile pickers adapt the same underlying selection controllers used by desktop.
Provider selection, model selection, configuration, and workspace resolution
remain owned by their shared services.

Actions use shared commands and menu IDs with mobile context-key gating.
Presentation-specific action view items may differ, but invoking an action must
resolve the same scoped session and operation.

## Editors and changes

Mobile file and diff review use phone-native editor presentations. The design
for mobile diff surfaces is documented in
[MOBILE_DIFF_EDITORS.md](browser/parts/mobile/contributions/MOBILE_DIFF_EDITORS.md).

Editor inputs still open through `IEditorService`. Mobile overlays and
navigation wrappers must preserve editor lifecycle and disposal behavior.

## Custom views

Custom views use the same `ICustomViewService` state as desktop. Phone
presentation pushes the custom view onto mobile navigation and dismisses it
through the normal back-navigation path.

## Feature gating

Features that do not have a usable phone presentation are excluded through
their registration or enablement conditions. Mobile-specific gating must remain
orthogonal to AI entitlement and provider capabilities.

Do not infer feature support from provider IDs. Shared capabilities determine
whether an operation exists; mobile context determines whether its presentation
is available.

## Testing

Use focused tests for viewport selection, navigation-stack behavior, command
scope, and mobile part factories. Use component fixtures or live workbench
validation for layout, touch interaction, virtual keyboard behavior, and narrow
viewports.

## Change policy

Update this specification only when viewport ownership, mobile composition, the
part-subclass pattern, or navigation contracts change. Do not append file maps,
CSS values, unfinished work, individual control behavior, or regression
narratives.

## Related specifications

- [Layout](LAYOUT.md)
- [Layout controllers](LAYOUT_CONTROLLER.md)
- [Sessions architecture](SESSIONS.md)

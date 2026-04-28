---
description: Architecture documentation for the Agents window — an agents-first app built as a new top-level layer alongside vs/workbench. Covers layout, parts, chat widget, contributions, entry points, and development guidelines. Use when working in `src/vs/sessions`
applyTo: src/vs/sessions/**
---

# Agents Window

The Agents window is a **standalone application** built as a new top-level layer (`vs/sessions`) in the VS Code architecture. It provides an agents-first experience optimized for agent workflows — a simplified, fixed-layout workbench where chat is the primary interaction surface and editors appear as modal overlays.

When working on files under `src/vs/sessions/`, use these skills for detailed guidance:

- **`sessions`** skill — covers the full architecture: layering, folder structure, chat widget, menus, contributions, entry points, and development guidelines
- **`agent-sessions-layout`** skill — covers the fixed layout structure, grid configuration, part visibility, editor modal, titlebar, sidebar footer, and implementation requirements

## Mobile Component Architecture

The Agents window has an established mobile architecture (documented in `src/vs/sessions/MOBILE.md`). When adding phone-specific UI — bottom sheets, action sheets, mobile pickers, or any interaction that differs from desktop — follow these rules:

1. **Never add `IsPhoneLayoutContext` branching inside a desktop component.** Desktop code must have zero phone-layout checks. If a component needs different behavior on phone, create a mobile subclass or a phone-gated contribution instead.

2. **Create mobile subclasses in `browser/parts/mobile/`.** Extend the desktop class, override only the methods that differ (e.g., the picker/menu method), and keep the rest inherited. Examples: `MobileChatBarPart`, `MobileSidebarPart`, `MobilePanelPart`.

3. **Use conditional instantiation.** The call site that creates the component (e.g., `AgenticPaneCompositePartService`) should pick the mobile vs. desktop class based on viewport width at construction time — the same pattern already used for Part subclasses.

4. **Co-locate component CSS with its TypeScript file.** Each component should own its CSS in a `media/` subfolder next to the component, imported directly in the TypeScript file via `import './media/myComponent.css';`. Do not put component-specific styles in `mobileChatShell.css` — that file should contain only layout and shell-level styles for phone layout (`phone-layout` class rules).

5. **Prefer reusable mobile widgets.** Before hand-rolling a bottom sheet, check if an existing pattern (panel sheet, context menu action sheet, quick pick) can be reused or extended. If a new pattern is genuinely needed, build it as a reusable widget in `browser/parts/mobile/` so other features can share it.

6. **Phone-specific contributions** use `when: IsPhoneLayoutContext` in their registration and live in separate files — giving full file separation with no internal branching.

## Touch & iOS Compatibility

The Agents window can run on touch-capable platforms (notably iOS). Follow these rules for all DOM interaction code:

- Do not use `EventType.MOUSE_DOWN`, `EventType.MOUSE_UP`, or `EventType.MOUSE_MOVE` with `addDisposableListener` directly — on iOS, these events don't fire because the platform uses pointer events. Use `addDisposableGenericMouseDownListener`, `addDisposableGenericMouseUpListener`, or `addDisposableGenericMouseMoveListener` instead, which automatically select the correct event type per platform.
- For custom clickable elements (e.g. picker triggers, title bar pills, or other `<div>`/`<span>` elements styled as buttons) that open pickers or menus on click, listen to **both** `EventType.CLICK` and `TouchEventType.Tap` and call `Gesture.addTarget` on the element. On touch devices, including iOS, VS Code relies on the gesture system to emit `TouchEventType.Tap`, and `EventType.CLICK` alone may not reliably fire there. The base `Button` class already does this correctly, so this rule applies to custom non-`<button>` trigger elements.
- Add `touch-action: manipulation` in CSS on custom clickable elements (e.g. picker triggers, title bar pills, or other `<div>`/`<span>` elements styled as buttons) to eliminate the 300ms tap delay on touch devices. This is not needed for native `<button>` elements or standard VS Code widgets (quick picks, context menus, action bar items) which already handle touch behavior.

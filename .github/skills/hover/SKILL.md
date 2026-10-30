---
name: hover
description: 'Use when adding, changing, or reviewing hovers or tooltips on VS Code widgets and UI elements, including buttons, actions, toolbars, lists, and trees. Covers custom versus native tooltips, hoverDelegate placement, HoverStyle, pointers, IHoverService delayed hovers, groupId, and shared instant-hover behavior across adjacent widgets.'
---

# Hovers and tooltips

Keep hovers **Calm** on first entry and **Consistent** while moving between related controls: the first hover waits for `workbench.hover.delay`, then nearby, similar targets show their hovers immediately while the hover interaction remains active. Widget boundaries must not introduce another delay.

## Use custom hovers by default

- Use the widget's hover API or `IHoverService`, not native browser tooltips via `element.title` or `setAttribute('title', ...)`. Remove conflicting HTML title attributes when introducing a custom hover.
- A widget's `title` or `tooltip` option can still be correct when the widget routes it through the custom-hover machinery. Inspect the implementation rather than banning properties by name.
- Keep native tooltips a narrow exception for controls inside an existing custom hover/context view when opening another custom hover would interfere with the parent. Pass [nativeHoverDelegate](../../../src/vs/platform/hover/browser/hover.ts) through the widget's supported `hoverDelegate` option instead of hand-writing title attributes.
- Do not turn an entire feature native to solve one nested control's problem. The current [HoverService](../../../src/vs/platform/hover/browser/hoverService.ts) supports limited nested hovers, so nesting is not universally impossible; check the actual parent/context-view interaction before choosing this exception.

## Choose placement and pointer together

Here, **pointer** means the small arrow connecting the hover to its target, not the mouse cursor.

| Target | Placement | Pointer |
|--------|-----------|---------|
| Small buttons, toolbar actions, icon actions, and other small clickable targets | Element-anchored | Always |
| Ordinary list/tree items with simple text tooltips | Mouse-anchored | Never |
| List/tree items with rich, information-heavy hovers | Element-anchored, to the left or right of the row | Always |
| Other UI elements | Normally element-anchored | Always when element-anchored |

- For delayed element hovers, use `setupDelayedHover` with `style: HoverStyle.Pointer`, or explicitly set `appearance.showPointer: true`. Bare `setupDelayedHover` does not automatically add a pointer. `HoverStyle.Pointer` also defaults to compact styling; use explicit appearance options when that is not appropriate for rich content.
- For mouse placement, use `setupDelayedHoverAtMouse`, normally with `style: HoverStyle.Mouse`. Never request a pointer. This API excludes position and pointer overrides from its public options; it positions relative to the mouse.
- For rich row hovers, set `position.hoverPosition` to `HoverPosition.LEFT` or `HoverPosition.RIGHT` so the hover does not cover neighboring rows. Preserve normal viewport-aware fallback unless the feature specifically requires forced positioning.
- For delegate-based widgets, use `placement: 'element'` with a pointer, or `placement: 'mouse'` without one. The managed-hover path derives the pointer from the delegate's placement; preserve this pairing in custom delegates and overrides too.

## Choose the API the widget supports

Read the target widget and its surrounding component before wiring a hover.

| Surface | API |
|---------|-----|
| Existing widgets accepting `hoverDelegate`, such as buttons, action items, action bars, and toolbars | Pass a shared instant-enabled `IHoverDelegate` |
| New direct hover registrations, or widgets accepting `hoverLifecycleOptions` | Use delayed hovers with a shared lifecycle `groupId` |
| A feature already owns the triggering events and needs to control showing the hover | Use `showDelayedHover(options, { groupId })` and own the returned hover's lifecycle |

Prefer `setupDelayedHover` / `setupDelayedHoverAtMouse` for new direct registrations. [setupManagedHover](../../../src/vs/base/browser/ui/hover/hover.ts) is deprecated, but existing widgets still use it internally through `hoverDelegate`; do not bypass their supported API or rewrite them unnecessarily.

Inject `IHoverService` through the constructor where available. In `vs/base`, where importing platform services would violate layering, use [getBaseLayerHoverDelegate()](../../../src/vs/base/browser/ui/hover/hoverDelegate2.ts) for direct registrations, or accept a delegate/lifecycle option from the caller.

Do not use unconditional `showInstantHover`, a zero delay, a custom timer, or `reducedDelay` as a substitute for grouping. The first ordinary pointer-triggered hover must still respect the configured workbench delay.

## Share instant-hover state across the visual group

Choose the boundary by what the user sees, not by class ownership. Two toolbars next to each other with similar-looking actions form one hover group, even though they are separate widget instances. Likewise, adjacent individually rendered action items should share state.

### Delegate-based widgets

Create one [createInstantHoverDelegate()](../../../src/vs/base/browser/ui/hover/hoverDelegateFactory.ts) at the common owner and pass the **same instance** to every related widget:

```typescript
const hoverDelegate = this._register(createInstantHoverDelegate());

const primaryToolbar = this._register(this.instantiationService.createInstance(
	WorkbenchToolBar, primaryContainer, { hoverDelegate }
));
const secondaryToolbar = this._register(this.instantiationService.createInstance(
	WorkbenchToolBar, secondaryContainer, { hoverDelegate }
));
```

- The factory creates an element-placement, instant-enabled delegate. The initial hover uses the workbench delay; subsequent hovers using that instance can skip the delay during its short recently-hidden grace window.
- `getDefaultHoverDelegate('element')` gives element placement but does **not** enable instant hover.
- [ToolBar](../../../src/vs/base/browser/ui/toolbar/toolbar.ts) and [ActionBar](../../../src/vs/base/browser/ui/actionbar/actionbar.ts) create their own instant delegate when none is supplied. That groups items **within** each widget, not across two neighboring widgets. Explicitly supply the common delegate to connect them.
- Forward the incoming action-view-item options in custom `actionViewItemProvider` implementations, especially `hoverDelegate`. Pass the same delegate to separately constructed action items and buttons too. Creating a delegate per item, per toolbar, or inside the provider breaks the shared behavior.
- If constructing `WorkbenchHoverDelegate` for feature-specific overrides, enable `{ instantHover: true }` for an element-placement group and share that instance. Do not accidentally disable the pointer through appearance overrides.

### Delayed hovers

Choose one stable `groupId` for related targets and pass it in the **lifecycle options**, not the hover's content/appearance options:

```typescript
const hoverLifecycleOptions: IHoverLifecycleOptions = { groupId: generateUuid() };

store.add(hoverService.setupDelayedHover(firstTarget, {
	content: firstTooltip,
	style: HoverStyle.Pointer
}, hoverLifecycleOptions));
store.add(hoverService.setupDelayedHover(secondTarget, {
	content: secondTooltip,
	style: HoverStyle.Pointer
}, hoverLifecycleOptions));
```

Here `store` owns this rendered surface and the tooltip strings are already localized. Create the group once for that surface, not inside each registration or options factory. Pass it into adjacent child widgets that expose `hoverLifecycleOptions`.

- A delayed hover skips the delay when a currently visible hover belongs to the same group. Unlike the delegate path, this is not a shared recently-hidden timer.
- Use a per-instance UUID when independent instances must stay separate. A feature-specific string is appropriate only when all uses intentionally belong to the same group.
- Do not use one generic global ID for unrelated controls, or a new ID for each item. Do not confuse `groupId` with `IHoverOptions.id`, which controls hover equality, not grouping.
- The delegate and delayed-hover mechanisms are separate. A `groupId` does not connect to an `IHoverDelegate`'s state. When a visual group spans both APIs, inspect the widgets' supported extension points and align the group deliberately; do not assume the two mechanisms automatically coordinate.

For rich list rows, keep the row's group separate from dissimilar inline actions and combine it with side placement:

```typescript
store.add(hoverService.setupDelayedHover(rowElement, {
	content: richContent,
	appearance: { showPointer: true },
	position: { hoverPosition: HoverPosition.RIGHT }
}, rowHoverLifecycleOptions));
```

Reuse `rowHoverLifecycleOptions` across the related rows; it contains their stable `groupId`.

## Ownership and accessibility

- Register a newly created scoped delegate immediately with its owner's disposable store. A delegate supplied by a parent is borrowed; the parent owns its disposal.
- Register delayed-hover listeners and manually shown hover widgets with the appropriate component, template, or render store. Repeated rendering must not accumulate registrations on a long-lived store. Keep the delegate/group stable for the intended interaction lifetime.
- Use localized tooltip text. Preserve accessible names, keyboard activation, focus restoration, and Escape dismissal; a tooltip is not a substitute for an accessible label.
- For delayed hovers, `setupKeyboardEvents: true` adds Enter/Space handling to show and focus the hover. Use it only when those keys are not already owned by the target's action or navigation behavior.
- Keep rich hover content and its links/actions reachable. Do not force `hideOnHover: true` on content the user must interact with. Follow the [accessibility skill](../accessibility/SKILL.md) for the surrounding feature.

---
name: component-fixtures
description: Use when creating or updating component fixtures for screenshot testing, or when designing UI components to be fixture-friendly. Covers fixture file structure, theming, service setup, CSS scoping, async rendering, and common pitfalls.
---

# Component Fixtures

Component fixtures render isolated UI components for visual screenshot testing via the component explorer. Fixtures live in `src/vs/workbench/test/browser/componentFixtures/` and are auto-discovered by the Vite dev server using the glob `src/**/*.fixture.ts`.

Use tools `mcp_component-exp_`* to list and screenshot fixtures. If you cannot see these tools, inform the user to them on.

## Running Fixtures Locally

1. Start the component explorer daemon: run the **Launch Component Explorer** task
2. Use the `mcp_component-exp_list_fixtures` tool to see all available fixtures and their URLs
3. Use the `mcp_component-exp_screenshot` tool to capture screenshots programmatically

## File Structure

Each fixture file exports a default `defineThemedFixtureGroup(...)`. The file must end with `.fixture.ts`.

```
src/vs/workbench/test/browser/componentFixtures/
  fixtureUtils.ts              # Shared helpers (DO NOT import @vscode/component-explorer elsewhere)
  myComponent.fixture.ts       # Your fixture file
```

## Basic Pattern

```typescript
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

export default defineThemedFixtureGroup({
    Default: defineComponentFixture({ render: renderMyComponent }),
    AnotherVariant: defineComponentFixture({ render: renderMyComponent }),
});

function renderMyComponent({ container, disposableStore, theme }: ComponentFixtureContext): void {
    container.style.width = '400px';

    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: theme,
        additionalServices: (reg) => {
            // Register additional services the component needs
            reg.define(IMyService, MyServiceImpl);
            reg.defineInstance(IMockService, mockInstance);
        },
    });

    const widget = disposableStore.add(
        instantiationService.createInstance(MyWidget, /* constructor args */)
    );
    container.appendChild(widget.domNode);
}
```

Key points:
- **`defineThemedFixtureGroup`** automatically creates Dark and Light variants for each fixture
- **`defineComponentFixture`** wraps your render function with theme setup and shadow DOM isolation
- **`createEditorServices`** provides a `TestInstantiationService` with base editor services pre-registered
- Always register created widgets with `disposableStore.add(...)` to prevent leaks
- Pass `colorTheme: theme` to `createEditorServices` so theme colors render correctly

## Utilities from fixtureUtils.ts

| Export | Purpose |
|---|---|
| `defineComponentFixture` | Creates Dark/Light themed fixture variants from a render function |
| `defineThemedFixtureGroup` | Groups multiple themed fixtures into a named fixture group |
| `createEditorServices` | Creates `TestInstantiationService` with all base editor services |
| `registerWorkbenchServices` | Registers additional workbench services (context menu, label, etc.) |
| `createTextModel` | Creates a text model via `ModelService` for editor fixtures |
| `setupTheme` | Applies theme CSS to a container (called automatically by `defineComponentFixture`) |
| `darkTheme` / `lightTheme` | Pre-loaded `ColorThemeData` instances |

**Important:** Only `fixtureUtils.ts` may import from `@vscode/component-explorer`. All fixture files must go through the helpers in `fixtureUtils.ts`.

## CSS Scoping

Fixtures render inside shadow DOM. The component-explorer automatically adopts the global VS Code stylesheets and theme CSS.

### Matching production CSS selectors

Many VS Code components have CSS rules scoped to deep ancestor selectors (e.g., `.interactive-session .interactive-input-part > .widget-container .my-element`). In fixtures, you must recreate the required ancestor DOM structure for these selectors to match:

```typescript
function render({ container }: ComponentFixtureContext): void {
    container.classList.add('interactive-session');

    // Recreate ancestor structure that CSS selectors expect
    const inputPart = dom.$('.interactive-input-part');
    const widgetContainer = dom.$('.widget-container');
    inputPart.appendChild(widgetContainer);
    container.appendChild(inputPart);

    widgetContainer.appendChild(myWidget.domNode);
}
```

**Design recommendation for new components:** Avoid deeply nested CSS selectors that require specific ancestor elements. Use self-contained class names (e.g., `.my-widget .my-element` rather than `.parent-view .parent-part > .wrapper .my-element`). This makes components easier to fixture and reuse.

## Services

### Using createEditorServices

`createEditorServices` pre-registers these services: `IAccessibilityService`, `IKeybindingService`, `IClipboardService`, `IOpenerService`, `INotificationService`, `IDialogService`, `IUndoRedoService`, `ILanguageService`, `IConfigurationService`, `IStorageService`, `IThemeService`, `IModelService`, `ICodeEditorService`, `IContextKeyService`, `ICommandService`, `ITelemetryService`, `IHoverService`, `IUserInteractionService`, and more.

### Additional services

Register extra services via `additionalServices`:

```typescript
createEditorServices(disposableStore, {
    additionalServices: (reg) => {
        // Class-based (instantiated by DI):
        reg.define(IMyService, MyServiceImpl);
        // Instance-based (pre-constructed):
        reg.defineInstance(IMyService, myMockInstance);
    },
});
```

### Mocking services

Use the `mock<T>()` helper from `base/test/common/mock.js` to create mock service instances:

```typescript
import { mock } from '../../../../base/test/common/mock.js';

const myService = new class extends mock<IMyService>() {
    override someMethod(): string { return 'test'; }
    override onSomeEvent = Event.None;
};
reg.defineInstance(IMyService, myService);
```

For mock view models or data objects:
```typescript
const element = new class extends mock<IChatRequestViewModel>() { }();
```

## Async Rendering

The component explorer waits **2 animation frames** after the synchronous render function returns. For most components, this is sufficient.

If your render function returns a `Promise`, the component explorer waits for the promise to resolve.

### Pitfall: DOM reparenting causes flickering

Avoid moving rendered widgets between DOM parents after initial render. This causes:
- Layout recalculation (the widget jumps as `position: absolute` coordinates become invalid)
- Focus loss (blur events can trigger hide logic in widgets like QuickInput)
- Screenshot instability (the component explorer may capture an intermediate layout state)

**Bad pattern — reparenting a widget after async wait:**
```typescript
async function render({ container }: ComponentFixtureContext): Promise<void> {
    const host = document.createElement('div');
    container.appendChild(host);
    // ... create widget inside host ...
    await waitForWidget();
    container.appendChild(widget);  // BAD: reparenting causes flicker
    host.remove();
}
```

**Better pattern — render in-place with the correct DOM structure from the start:**
```typescript
function render({ container }: ComponentFixtureContext): void {
    // Set up the correct DOM structure first, then create the widget inside it
    const widget = createWidget(container);
    container.appendChild(widget.domNode);
}
```

If the component absolutely requires async setup (e.g., QuickInput which renders internally), minimize DOM manipulation after the widget appears by structuring the host container to match the final layout from the beginning.

## Adapting Existing Components for Fixtures

Existing components often need small changes to become fixturable. When writing a fixture reveals friction, fix the component — don't work around it in the fixture. Common adaptations:

### Decouple CSS from ancestor context

If a component's CSS only works inside a deeply nested selector like `.workbench .sidebar .my-view .my-widget`, refactor the CSS to be self-contained. Move the styles so they're scoped to the component's own root class:

```css
/* Before: requires specific ancestors */
.workbench .sidebar .my-view .my-widget .header { font-weight: bold; }

/* After: self-contained */
.my-widget .header { font-weight: bold; }
```

If the component shares styles with its parent (e.g., inheriting background color), use CSS custom properties rather than relying on ancestor selectors.

### Extract hard-coded service dependencies

If a component reaches into singletons or global state instead of using DI, refactor it to accept services through the constructor:

```typescript
// Before: hard to mock in fixtures
class MyWidget {
    private readonly config = getSomeGlobalConfig();
}

// After: injectable and testable
class MyWidget {
    constructor(@IConfigurationService private readonly configService: IConfigurationService) { }
}
```

### Add options to control auto-focus and animation

Components that auto-focus on creation or run animations cause flaky screenshots. Add an options parameter:

```typescript
interface IMyWidgetOptions {
    shouldAutoFocus?: boolean;
}
```

The fixture passes `shouldAutoFocus: false`. The production call site keeps the default behavior.

### Expose internal state for "already completed" rendering

Many components have lifecycle states (loading → active → completed). If the component can only reach the "completed" state through user interaction, add support for initializing directly into that state via constructor data:

```typescript
// The fixture can pass pre-filled data to render the summary/completed state
// without simulating the full user interaction flow.
const carousel: IChatQuestionCarousel = {
    questions,
    allowSkip: true,
    kind: 'questionCarousel',
    isUsed: true,           // Already completed
    data: { 'q1': 'answer' }, // Pre-filled answers
};
```

### Make DOM node accessible

If a component builds its DOM internally and doesn't expose the root element, add a public `readonly domNode: HTMLElement` property so fixtures can append it to the container.

## Writing Fixture-Friendly Components

When designing new UI components, follow these practices to make them easy to fixture:

### 1. Accept a container element in the constructor

```typescript
// Good: container is passed in
class MyWidget {
    constructor(container: HTMLElement, @IFoo foo: IFoo) {
        this.domNode = dom.append(container, dom.$('.my-widget'));
    }
}

// Also good: widget creates its own domNode for the caller to place
class MyWidget {
    readonly domNode: HTMLElement;
    constructor(@IFoo foo: IFoo) {
        this.domNode = dom.$('.my-widget');
    }
}
```

### 2. Use dependency injection for all services

All external dependencies should come through DI so fixtures can provide test implementations:

```typescript
// Good: services injected
constructor(@IThemeService private readonly themeService: IThemeService) { }

// Bad: reaching into globals
constructor() { this.theme = getGlobalTheme(); }
```

### 3. Keep CSS selectors shallow

```css
/* Good: self-contained, easy to fixture */
.my-widget .my-header { ... }
.my-widget .my-list-item { ... }

/* Bad: requires deep ancestor chain */
.workbench .sidebar .my-view .my-widget .my-header { ... }
```

### 4. Avoid reading from layout/window services during construction

Components that measure the window or read layout dimensions during construction are hard to fixture because the shadow DOM container has different dimensions than the workbench:

```typescript
// Prefer: use CSS for sizing, or accept dimensions as parameters
container.style.width = '400px';
container.style.height = '300px';

// Avoid: reading from layoutService during construction
const width = this.layoutService.mainContainerDimension.width;
```

### 5. Support disabling auto-focus in fixtures

Auto-focus can interfere with screenshot stability. Provide options to disable it:

```typescript
interface IMyWidgetOptions {
    shouldAutoFocus?: boolean;  // Fixtures pass false
}
```

### 6. Expose the DOM node

The fixture needs to append the widget's DOM to the container. Expose it as a public `readonly domNode: HTMLElement`.

## Multiple Fixture Variants

Create variants to show different states of the same component:

```typescript
export default defineThemedFixtureGroup({
    // Different data states
    Empty: defineComponentFixture({ render: (ctx) => renderWidget(ctx, { items: [] }) }),
    WithItems: defineComponentFixture({ render: (ctx) => renderWidget(ctx, { items: sampleItems }) }),

    // Different configurations
    ReadOnly: defineComponentFixture({ render: (ctx) => renderWidget(ctx, { readonly: true }) }),
    Editable: defineComponentFixture({ render: (ctx) => renderWidget(ctx, { readonly: false }) }),

    // Lifecycle states
    Loading: defineComponentFixture({ render: (ctx) => renderWidget(ctx, { state: 'loading' }) }),
    Completed: defineComponentFixture({ render: (ctx) => renderWidget(ctx, { state: 'done' }) }),
});
```

## Learnings

Update this section with insights from your fixture development experience!

* Do not copy the component to the fixture and modify it there. Always adapt the original component to be fixture-friendly, then render it in the fixture. This ensures the fixture tests the real component code and lifecycle, rather than a modified version that may hide bugs.

* **Don't recompose child widgets in fixtures.** Never manually instantiate and add a sub-widget (e.g., a toolbar content widget) that the parent component is supposed to create. Instead, configure the parent correctly (e.g., set the right editor option, register the right provider) so the child appears through the normal code path. Manually recomposing hides integration bugs and doesn't test the real widget lifecycle.

---
name: memory-leak-audit
description: 'Audit code for memory leaks and disposable issues. Use when reviewing event listeners, DOM handlers, lifecycle callbacks, or fixing leak reports. Covers addDisposableListener, Event.once, MutableDisposable, DisposableStore, and onWillDispose patterns.'
---

# Memory Leak Audit

The #1 bug category in VS Code. This skill encodes the patterns that prevent and fix leaks.

## When to Use

- Reviewing code that registers event listeners or DOM handlers
- Fixing reported memory leaks (listener counts growing over time)
- Creating objects in methods that are called repeatedly
- Working with model lifecycle events (onWillDispose, onDidClose)
- Adding event subscriptions in constructors or setup methods

## Audit Checklist

Work through each check in order. A single missed pattern can cause thousands of leaked objects.

### Step 1: DOM Event Listeners

**Rule**: Never use raw `.onload`, `.onclick`, or `addEventListener()` directly. Always use `addDisposableListener()`.

```typescript
// BAD — leaks a listener every call
this.iconElement.onload = () => { ... };

// GOOD — tracked and disposable
this._register(addDisposableListener(this.iconElement, 'load', () => { ... }));
```

**Validated by**: PR #280566 — Extension icon widget leaked 185 listeners after 37 toggles.

### Step 2: One-Time Events

**Rule**: Use `Event.once()` for events that should only fire once (lifecycle events, close events, first-change events).

```typescript
// BAD — listener stays registered forever after first fire
model.onDidDispose(() => store.dispose());

// GOOD — auto-removes after first invocation
Event.once(model.onDidDispose)(() => store.dispose());
```

**Validated by**: PRs #285657, #285661 — Terminal lifecycle hacks replaced with `Event.once()`.

### Step 3: Repeated Method Calls

**Rule**: Objects created in methods called multiple times must NOT be registered to the class `this._register()`. Use `MutableDisposable` or return `IDisposable` to the caller.

```typescript
// BAD — every call adds another listener to the class store
startSearch() {
    this._register(this.model.onResults(() => { ... }));
}

// GOOD — MutableDisposable ensures max 1 listener
private readonly _searchListener = this._register(new MutableDisposable());

startSearch() {
    this._searchListener.value = this.model.onResults(() => { ... });
}
```

When the event should only fire once per method call, combine `Event.once()` with `MutableDisposable` — this auto-removes the listener after the first invocation while still guarding against repeated calls:

```typescript
private readonly _searchListener = this._register(new MutableDisposable());

startSearch() {
    this._searchListener.value = Event.once(this.model.onResults)(() => { ... });
}
```

**Validated by**: PR #283466 — Terminal find widget leaked 1 listener per search.

### Step 4: Model-Tied DisposableStores

**Rule**: When creating a `DisposableStore` tied to a model's lifetime, register `model.onWillDispose(() => store.dispose())` to the store itself.

```typescript
const store = new DisposableStore();
store.add(model.onWillDispose(() => store.dispose()));
store.add(model.onDidChange(() => { ... }));
```

**Validated by**: Pattern used in `chatEditingSession.ts`, `fileBasedRecommendations.ts`, `testingContentProvider.ts`.

### Step 5: Resource Pool Patterns

**Rule**: When using factory methods that create pooled objects (lists, trees), disposables must be registered to the individual item, not the pool class.

```typescript
// BAD — registers to pool, never cleaned per item
createItem() {
    const item = new Item();
    this._register(item.onEvent(() => { ... }));
    return item;
}

// GOOD — wrap with item-scoped disposal
createItem(): IDisposable & Item {
    const store = new DisposableStore();
    const item = new Item();
    store.add(item.onEvent(() => { ... }));
    return { ...item, dispose: () => store.dispose() };
}
```

**Validated by**: PR #290505 — Chat content parts CollapsibleListPool and TreePool leaked disposables.

### Step 6: Test Validation

**Rule**: Every test suite that creates disposable objects must call `ensureNoDisposablesAreLeakedInTestSuite()`.

```typescript
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('MyFeature', () => {
    ensureNoDisposablesAreLeakedInTestSuite();

    test('does something', () => {
        // test disposables are tracked automatically
    });
});
```

## Quick Reference

| Scenario | Pattern | Anti-Pattern |
|----------|---------|-------------|
| DOM events | `addDisposableListener()` | `.onclick =`, `addEventListener()` |
| One-time events | `Event.once(event)(handler)` | `event(handler)` for lifecycle |
| Repeated methods | `MutableDisposable` or return `IDisposable` | `this._register()` in non-constructor |
| Model lifecycle | `store.add(model.onWillDispose(...))` | Forgetting cleanup |
| Pooled objects | Item-scoped `DisposableStore` | Pool-scoped `this._register()` |
| Tests | `ensureNoDisposablesAreLeakedInTestSuite()` | No leak checking |

## Verification

After fixing leaks, verify by:
1. Checking listener counts before/after repeated operations
2. Running `ensureNoDisposablesAreLeakedInTestSuite()` in tests
3. Confirming object counts stabilize (don't grow linearly with usage)

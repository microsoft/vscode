---
description: Guidelines for writing code using IDisposable
---

Core symbols:
* `IDisposable`
	* `dispose(): void` - dispose the object
* `Disposable` (implements `IDisposable`) - base class for disposable objects
	* `this._store: DisposableStore`
	* `this._register<T extends IDisposable>(t: T): T`
		* Try to immediately register created disposables! E.g. `const someDisposable = this._register(new SomeDisposable())`
* `DisposableStore` (implements `IDisposable`)
	* `add<T extends IDisposable>(t: T): T`
	* `clear()`
* `toDisposable(fn: () => void): IDisposable` - helper to create a disposable from a function

* `MutableDisposable` (implements `IDisposable`)
	* `value: IDisposable | undefined`
	* `clear()`
	* A value that enters a mutable disposable (at least once) will be disposed the latest when the mutable disposable is disposed (or when the value is replaced or cleared).

## Important Patterns

### Async Operations and Disposal

When working with async operations that create disposables, always check if the parent object has been disposed before calling `this._register()`:

```typescript
async myAsyncMethod() {
	await someAsyncOperation();
	
	// Check disposal state BEFORE creating new disposables
	if (this._store.isDisposed) {
		return; // Bail early to prevent leaks
	}
	
	const disposable = this._register(new SomeDisposable());
	
	await anotherAsyncOperation();
	
	// Check again after async operations
	if (this._store.isDisposed) {
		return;
	}
	
	// Continue with remaining work...
}
```

**Why this matters:** Between `await` points, the parent object may be disposed (e.g., due to virtualization, scrolling, or user navigation). Attempting to register disposables on a disposed store causes memory leaks and console warnings.

### Async Disposable Registration in Promises

When registering disposables in promise callbacks, check disposal state first:

```typescript
protected _setDetachedTerminal(detachedTerminal: Promise<IDetachedTerminalInstance>): void {
	this._detachedTerminal = detachedTerminal.then(terminal => {
		if (this._store.isDisposed) {
			terminal.dispose(); // Clean up the terminal
			throw new Error('Cannot register terminal on disposed mirror');
		}
		return this._register(terminal);
	});
}
```

Callers should wrap `await` calls in try-catch to handle disposal gracefully:

```typescript
try {
	const terminal = await this._getTerminal();
	// Use terminal...
} catch {
	// Mirror was disposed, handle gracefully
	return undefined;
}
```

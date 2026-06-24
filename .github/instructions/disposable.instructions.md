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

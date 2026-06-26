---
description: Guidelines for writing code using IDisposable
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

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

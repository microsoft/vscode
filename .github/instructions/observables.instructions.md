---
description: Guidelines for writing code using observables and deriveds.
---

# Observables System Overview

## Purpose

The observables system provides a reactive programming framework for VS Code, enabling automatic dependency tracking and efficient updates when data changes. It follows patterns similar to MobX but is specifically tailored for VS Code's architecture and performance requirements.

## Scope

- **Included**: Observable values, derived computations, automatic dependency tracking, transaction batching, event-based observables, and reactive autoruns
- **Out of scope**: Direct DOM manipulation, HTTP requests, or async operations (use utility functions for async integration)
- **Integration points**: Disposables system, event system, VS Code services, and extension APIs

## Architecture

### High-Level Design

The observables system uses a **push-pull hybrid approach** with automatic dependency tracking:

1. **Observable Values** store data and notify observers of changes
2. **Derived Observables** compute values lazily based on other observables
3. **Autoruns** execute side effects when dependencies change
4. **Transactions** batch multiple changes to prevent intermediate notifications
5. **Readers** track dependencies automatically during computation

### Key Classes & Interfaces

- **`IObservable<T>`**: Core interface for readable observable values with dependency tracking
- **`ISettableObservable<T>`**: Interface for observable values that can be updated
- **`ObservableValue`**: Implementation for simple observable values with change notification
- **`Derived`**: Implementation for computed observables derived from other observables
- **`AutorunObserver`**: Implementation for reactive side effects that re-run on dependency changes
- **`TransactionImpl`**: Batches multiple observable changes into single notification cycles

### Key Files

- **`src/vs/base/common/observableInternal/index.ts`**: Main facade exposing all observable APIs
- **`src/vs/base/common/observableInternal/base.ts`**: Core interfaces and contracts for the observable system
- **`src/vs/base/common/observableInternal/observables/observableValue.ts`**: Implementation of basic observable values
- **`src/vs/base/common/observableInternal/observables/derived.ts`**: Implementation of computed observables
- **`src/vs/base/common/observableInternal/reactions/autorun.ts`**: Implementation of reactive side effects
- **`src/vs/base/common/observableInternal/transaction.ts`**: Transaction system for batching changes
- **`src/vs/base/common/observableInternal/utils/utils.ts`**: Utility functions for advanced observable patterns

## Development Guidelines

### Basic Usage Pattern

```ts
class MyService extends Disposable {
    private _myData1 = observableValue(/* always put `this` here */ this, /* initial value*/ 0);
    private _myData2 = observableValue(/* always put `this` here */ this, /* initial value*/ 42);

    // Deriveds can combine/derive from other observables/deriveds
    private _myDerivedData = derived(this, reader => {
		// Use observable.read(reader) to access the value and track the dependency.
        return this._myData1.read(reader) * this._myData2.read(reader);
	});

	private _myDerivedDataWithLifetime = derived(this, reader => {
		// The reader.store will get cleared just before the derived is re-evaluated or gets unsubscribed.
		return reader.store.add(new SomeDisposable(this._myDerivedData.read(reader)));
	});

    constructor() {
        this._register(autorun((reader) => { // like mobx autorun, they run immediately and on change
            const data = this._myData1.read(reader); // but you only get the data if you pass in the reader!

            console.log(data);

			// also has reader.store
        }))
    }

    getData(): number {
        return this._myData1.get(); // use get if you don't have a reader, but try to avoid it since the dependency is not tracked.
    }

	setData1() {
		this._myData1.set(42, undefined); // use set to update the value. The second paramater is the transaction, which is undefined here.
	}

	setData2() {
		transaction(tx => {
			// you can use transaction to batch updates, so they are only notified once.
			// Whenever multiple observables are synchronously updated together, use transaction!
			this._myData1.set(42, tx);
			this._myData2.set(43, tx);
		});
	}
}
```

### Most Important Symbols

* `observableValue` - Creates basic observable values
* `disposableObservableValue` - Observable values that auto-dispose their contents
* `derived` - Creates computed observables
* `autorun` - Creates reactive side effects
* `transaction` - Batches multiple changes
* `observableFromEvent` - Creates observables from events
* `observableSignalFromEvent` - Creates signal observables from events
* `observableSignal(...): IObservable<void>` - Use `.trigger(tx)` to trigger a change

Check `src/vs/base/common/observableInternal/index.ts` for a complete list of all observable utilities.

## Learnings

* [1] Avoid glitches
* [2] **Choose the right observable value type:**
	* Use `observableValue(owner, initialValue)` for regular values
	* Use `disposableObservableValue(owner, initialValue)` when storing disposable values - it automatically disposes the previous value when a new one is set, and disposes the current value when the observable itself is disposed (similar to `MutableDisposable` behavior)
* [3] **Choose the right event observable pattern:**
	* Use `observableFromEvent(owner, event, valueComputer)` when you need to track a computed value that changes with the event, and you want updates only when the computed value actually changes
	* Use `observableSignalFromEvent(owner, event)` when you need to force re-computation every time the event fires, regardless of value stability. This is important when the computed value might not change but dependent computations need fresh context (e.g., workspace folder changes where the folder array reference might be the same but file path calculations need to be refreshed)

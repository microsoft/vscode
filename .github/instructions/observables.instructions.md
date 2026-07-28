---
description: Guidelines for writing code using observables and deriveds.
---

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


Most important symbols:
* `observableValue`
* `disposableObservableValue`
* `derived`
* `autorun`
* `transaction`
* `observableFromEvent`
* `observableSignalFromEvent`
* `observableSignal(...): IObservable<void>` - use `.trigger(tx)` to trigger a change


* Check src\vs\base\common\observableInternal\index.ts for a list of all observable utitilies


* Important learnings:
	* [1] Avoid glitches
	* [2] **Choose the right observable value type:**
		* Use `observableValue(owner, initialValue)` for regular values
		* Use `disposableObservableValue(owner, initialValue)` when storing disposable values - it automatically disposes the previous value when a new one is set, and disposes the current value when the observable itself is disposed (similar to `MutableDisposable` behavior)
	* [3] **Choose the right event observable pattern:**
		* Use `observableFromEvent(owner, event, valueComputer)` when you need to track a computed value that changes with the event, and you want updates only when the computed value actually changes
		* Use `observableSignalFromEvent(owner, event)` when you need to force re-computation every time the event fires, regardless of value stability. This is important when the computed value might not change but dependent computations need fresh context (e.g., workspace folder changes where the folder array reference might be the same but file path calculations need to be refreshed)

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { autorun } from '../reactions/autorun.js';
import { observableValue } from '../observables/observableValue.js';
import { DisposableStore, toDisposable } from '../commonFacade/deps.js';
import { derived, derivedOpts } from '../observables/derived.js';
import { observableFromEvent } from '../observables/observableFromEvent.js';
import { observableSignal } from '../observables/observableSignal.js';
import { _setKeepObserved, _setRecomputeInitiallyAndOnChange } from '../observables/baseObservable.js';
import { DebugLocation } from '../debugLocation.js';
export function observableFromPromise(promise) {
    const observable = observableValue('promiseValue', {});
    promise.then((value) => {
        observable.set({ value }, undefined);
    });
    return observable;
}
export function signalFromObservable(owner, observable) {
    return derivedOpts({
        owner,
        equalsFn: () => false,
    }, reader => {
        observable.read(reader);
    });
}
/**
 * Creates an observable that debounces the input observable.
 */
export function debouncedObservable(observable, debounceMs, debugLocation = DebugLocation.ofCaller()) {
    let hasValue = false;
    let lastValue;
    let timeout = undefined;
    return observableFromEvent(undefined, cb => {
        const d = autorun(reader => {
            const value = observable.read(reader);
            if (!hasValue) {
                hasValue = true;
                lastValue = value;
            }
            else {
                if (timeout) {
                    clearTimeout(timeout);
                }
                const debounceDuration = typeof debounceMs === 'number' ? debounceMs : debounceMs(lastValue, value);
                if (debounceDuration === 0) {
                    lastValue = value;
                    cb();
                    return;
                }
                timeout = setTimeout(() => {
                    lastValue = value;
                    cb();
                }, debounceDuration);
            }
        });
        return {
            dispose() {
                d.dispose();
                hasValue = false;
                lastValue = undefined;
            },
        };
    }, () => {
        if (hasValue) {
            return lastValue;
        }
        else {
            return observable.get();
        }
    }, debugLocation);
}
/**
 * Creates an observable that debounces the input observable.
 */
export function debouncedObservable2(observable, debounceMs, debugLocation = DebugLocation.ofCaller()) {
    const s = observableSignal('handleTimeout');
    let currentValue = undefined;
    let timeout = undefined;
    const d = derivedOpts({
        owner: undefined,
        onLastObserverRemoved: () => {
            currentValue = undefined;
        }
    }, reader => {
        const val = observable.read(reader);
        s.read(reader);
        if (val !== currentValue) {
            const debounceDuration = typeof debounceMs === 'number' ? debounceMs : debounceMs(currentValue, val);
            if (debounceDuration === 0) {
                currentValue = val;
                return val;
            }
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => {
                currentValue = val;
                s.trigger(undefined);
            }, debounceDuration);
        }
        return currentValue;
    }, debugLocation);
    return d;
}
export function wasEventTriggeredRecently(event, timeoutMs, disposableStore) {
    const observable = observableValue('triggeredRecently', false);
    let timeout = undefined;
    disposableStore.add(event(() => {
        observable.set(true, undefined);
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            observable.set(false, undefined);
        }, timeoutMs);
    }));
    return observable;
}
/**
 * This makes sure the observable is being observed and keeps its cache alive.
 */
export function keepObserved(observable) {
    const o = new KeepAliveObserver(false, undefined);
    observable.addObserver(o);
    return toDisposable(() => {
        observable.removeObserver(o);
    });
}
_setKeepObserved(keepObserved);
/**
 * This converts the given observable into an autorun.
 */
export function recomputeInitiallyAndOnChange(observable, handleValue) {
    const o = new KeepAliveObserver(true, handleValue);
    observable.addObserver(o);
    try {
        o.beginUpdate(observable);
    }
    finally {
        o.endUpdate(observable);
    }
    return toDisposable(() => {
        observable.removeObserver(o);
    });
}
_setRecomputeInitiallyAndOnChange(recomputeInitiallyAndOnChange);
export class KeepAliveObserver {
    constructor(_forceRecompute, _handleValue) {
        this._forceRecompute = _forceRecompute;
        this._handleValue = _handleValue;
        this._counter = 0;
    }
    beginUpdate(observable) {
        this._counter++;
    }
    endUpdate(observable) {
        if (this._counter === 1 && this._forceRecompute) {
            if (this._handleValue) {
                this._handleValue(observable.get());
            }
            else {
                observable.reportChanges();
            }
        }
        this._counter--;
    }
    handlePossibleChange(observable) {
        // NO OP
    }
    handleChange(observable, change) {
        // NO OP
    }
}
export function derivedObservableWithCache(owner, computeFn) {
    let lastValue = undefined;
    const observable = derivedOpts({ owner, debugReferenceFn: computeFn }, reader => {
        lastValue = computeFn(reader, lastValue);
        return lastValue;
    });
    return observable;
}
export function derivedObservableWithWritableCache(owner, computeFn) {
    let lastValue = undefined;
    const onChange = observableSignal('derivedObservableWithWritableCache');
    const observable = derived(owner, reader => {
        onChange.read(reader);
        lastValue = computeFn(reader, lastValue);
        return lastValue;
    });
    return Object.assign(observable, {
        clearCache: (tx) => {
            lastValue = undefined;
            onChange.trigger(tx);
        },
        setCache: (newValue, tx) => {
            lastValue = newValue;
            onChange.trigger(tx);
        }
    });
}
/**
 * When the items array changes, referential equal items are not mapped again.
 */
export function mapObservableArrayCached(owner, items, map, keySelector) {
    let m = new ArrayMap(map, keySelector);
    const self = derivedOpts({
        debugReferenceFn: map,
        owner,
        onLastObserverRemoved: () => {
            m.dispose();
            m = new ArrayMap(map);
        }
    }, (reader) => {
        const i = items.read(reader);
        m.setItems(i);
        return m.getItems();
    });
    return self;
}
class ArrayMap {
    constructor(_map, _keySelector) {
        this._map = _map;
        this._keySelector = _keySelector;
        this._cache = new Map();
        this._items = [];
    }
    dispose() {
        this._cache.forEach(entry => entry.store.dispose());
        this._cache.clear();
    }
    setItems(items) {
        const newItems = [];
        const itemsToRemove = new Set(this._cache.keys());
        for (const item of items) {
            const key = this._keySelector ? this._keySelector(item) : item;
            let entry = this._cache.get(key);
            if (!entry) {
                const store = new DisposableStore();
                const out = this._map(item, store);
                entry = { out, store };
                this._cache.set(key, entry);
            }
            else {
                itemsToRemove.delete(key);
            }
            newItems.push(entry.out);
        }
        for (const item of itemsToRemove) {
            const entry = this._cache.get(item);
            entry.store.dispose();
            this._cache.delete(item);
        }
        this._items = newItems;
    }
    getItems() {
        return this._items;
    }
}
export function isObservable(obj) {
    return !!obj && obj.read !== undefined && obj.reportChanges !== undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvdXRpbHMvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRWxELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsZUFBZSxFQUFzQixZQUFZLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM1RixPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUVwRCxNQUFNLFVBQVUscUJBQXFCLENBQUksT0FBbUI7SUFDM0QsTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFnQixjQUFjLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDdEUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO1FBQ3RCLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUNILE9BQU8sVUFBVSxDQUFDO0FBQ25CLENBQUM7QUFFRCxNQUFNLFVBQVUsb0JBQW9CLENBQUksS0FBNkIsRUFBRSxVQUEwQjtJQUNoRyxPQUFPLFdBQVcsQ0FBQztRQUNsQixLQUFLO1FBQ0ws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
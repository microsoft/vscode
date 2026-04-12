/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DebugLocation } from '../debugLocation.js';
import { getFunctionName } from '../debugName.js';
import { getLogger, logObservable } from '../logging/logging.js';
let _derived;
/**
 * @internal
 * This is to allow splitting files.
*/
export function _setDerivedOpts(derived) {
    _derived = derived;
}
let _recomputeInitiallyAndOnChange;
export function _setRecomputeInitiallyAndOnChange(recomputeInitiallyAndOnChange) {
    _recomputeInitiallyAndOnChange = recomputeInitiallyAndOnChange;
}
let _keepObserved;
export function _setKeepObserved(keepObserved) {
    _keepObserved = keepObserved;
}
let _debugGetObservableGraph;
export function _setDebugGetObservableGraph(debugGetObservableGraph) {
    _debugGetObservableGraph = debugGetObservableGraph;
}
export class ConvenientObservable {
    get TChange() { return null; }
    reportChanges() {
        this.get();
    }
    /** @sealed */
    read(reader) {
        if (reader) {
            return reader.readObservable(this);
        }
        else {
            return this.get();
        }
    }
    map(fnOrOwner, fnOrUndefined, debugLocation = DebugLocation.ofCaller()) {
        const owner = fnOrUndefined === undefined ? undefined : fnOrOwner;
        const fn = fnOrUndefined === undefined ? fnOrOwner : fnOrUndefined;
        return _derived({
            owner,
            debugName: () => {
                const name = getFunctionName(fn);
                if (name !== undefined) {
                    return name;
                }
                // regexp to match `x => x.y` or `x => x?.y` where x and y can be arbitrary identifiers (uses backref):
                const regexp = /^\s*\(?\s*([a-zA-Z_$][a-zA-Z_$0-9]*)\s*\)?\s*=>\s*\1(?:\??)\.([a-zA-Z_$][a-zA-Z_$0-9]*)\s*$/;
                const match = regexp.exec(fn.toString());
                if (match) {
                    return `${this.debugName}.${match[2]}`;
                }
                if (!owner) {
                    return `${this.debugName} (mapped)`;
                }
                return undefined;
            },
            debugReferenceFn: fn,
        }, (reader) => fn(this.read(reader), reader), debugLocation);
    }
    /**
     * @sealed
     * Converts an observable of an observable value into a direct observable of the value.
    */
    flatten() {
        return _derived({
            owner: undefined,
            debugName: () => `${this.debugName} (flattened)`,
        }, (reader) => this.read(reader).read(reader));
    }
    recomputeInitiallyAndOnChange(store, handleValue) {
        store.add(_recomputeInitiallyAndOnChange(this, handleValue));
        return this;
    }
    /**
     * Ensures that this observable is observed. This keeps the cache alive.
     * However, in case of deriveds, it does not force eager evaluation (only when the value is read/get).
     * Use `recomputeInitiallyAndOnChange` for eager evaluation.
     */
    keepObserved(store) {
        store.add(_keepObserved(this));
        return this;
    }
    get debugValue() {
        return this.get();
    }
    get debug() {
        return new DebugHelper(this);
    }
}
class DebugHelper {
    constructor(observable) {
        this.observable = observable;
    }
    getDependencyGraph() {
        return _debugGetObservableGraph(this.observable, { type: 'dependencies' });
    }
    getObserverGraph() {
        return _debugGetObservableGraph(this.observable, { type: 'observers' });
    }
}
export class BaseObservable extends ConvenientObservable {
    constructor(debugLocation) {
        super();
        this._observers = new Set();
        getLogger()?.handleObservableCreated(this, debugLocation);
    }
    addObserver(observer) {
        const len = this._observers.size;
        this._observers.add(observer);
        if (len === 0) {
            this.onFirstObserverAdded();
        }
        if (len !== this._observers.size) {
            getLogger()?.handleOnListenerCountChanged(this, this._observers.size);
        }
    }
    removeObserver(observer) {
        const deleted = this._observers.delete(observer);
        if (deleted && this._observers.size === 0) {
            this.onLastObserverRemoved();
        }
        if (deleted) {
            getLogger()?.handleOnListenerCountChanged(this, this._observers.size);
        }
    }
    onFirstObserverAdded() { }
    onLastObserverRemoved() { }
    log() {
        const hadLogger = !!getLogger();
        logObservable(this);
        if (!hadLogger) {
            getLogger()?.handleObservableCreated(this, DebugLocation.ofCaller());
        }
        return this;
    }
    debugGetObservers() {
        return this._observers;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZU9ic2VydmFibGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvb2JzZXJ2YWJsZXMvYmFzZU9ic2VydmFibGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3BELE9BQU8sRUFBYyxlQUFlLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUU5RCxPQUFPLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBSWpFLElBQUksUUFBNEIsQ0FBQztBQUNqQzs7O0VBR0U7QUFDRixNQUFNLFVBQVUsZUFBZSxDQUFDLE9BQXdCO0lBQ3ZELFFBQVEsR0FBRyxPQUFPLENBQUM7QUFDcEIsQ0FBQztBQUVELElBQUksOEJBQW9FLENBQUM7QUFDekUsTUFBTSxVQUFVLGlDQUFpQyxDQUFDLDZCQUFvRTtJQUNySCw4QkFBOEIsR0FBRyw2QkFBNkIsQ0FBQztBQUNoRSxDQUFDO0FBRUQsSUFBSSxhQUFrQyxDQUFDO0FBQ3ZDLE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxZQUFrQztJQUNsRSxhQUFhLEdBQUcsWUFBWSxDQUFDO0FBQzlCLENBQUM7QUFFRCxJQUFJLHdCQUF3RCxDQUFDO0FBQzdELE1BQU0sVUFBVSwyQkFBMkIsQ0FBQyx1QkFBd0Q7SUFDbkcsd0JBQXdCLEdBQUcsdUJBQXVCLENBQUM7QUFDcEQsQ0FBQztBQUVELE1BQU0sT0FBZ0Isb0JBQW9CO0lBQ3pDLElBQUksT0FBTyxLQUFjLE9BQU8sSUFBSyxDQUFDLENBQUMsQ0FBQztJQUlqQyxhQUFhO1FBQ25CLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNaLENBQUM7SUFLRCxjQUFjO0lBQ1AsSUFBSSxDQUFDLE1BQTJCO1FBQ3RDLElB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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { compareBy, numberComparator } from './arrays.js';
import { groupBy } from './collections.js';
import { SetMap, ResourceMap } from './map.js';
import { createSingleCallFunction } from './functional.js';
import { Iterable } from './iterator.js';
import { BugIndicatingError, onUnexpectedError } from './errors.js';
// #region Disposable Tracking
/**
 * Enables logging of potentially leaked disposables.
 *
 * A disposable is considered leaked if it is not disposed or not registered as the child of
 * another disposable. This tracking is very simple an only works for classes that either
 * extend Disposable or use a DisposableStore. This means there are a lot of false positives.
 */
const TRACK_DISPOSABLES = false;
let disposableTracker = null;
export class GCBasedDisposableTracker {
    constructor() {
        this._registry = new FinalizationRegistry(heldValue => {
            console.warn(`[LEAKED DISPOSABLE] ${heldValue}`);
        });
    }
    trackDisposable(disposable) {
        const stack = new Error('CREATED via:').stack;
        this._registry.register(disposable, stack, disposable);
    }
    setParent(child, parent) {
        if (parent) {
            this._registry.unregister(child);
        }
        else {
            this.trackDisposable(child);
        }
    }
    markAsDisposed(disposable) {
        this._registry.unregister(disposable);
    }
    markAsSingleton(disposable) {
        this._registry.unregister(disposable);
    }
}
export class DisposableTracker {
    constructor() {
        this.livingDisposables = new Map();
    }
    static { this.idx = 0; }
    getDisposableData(d) {
        let val = this.livingDisposables.get(d);
        if (!val) {
            val = { parent: null, source: null, isSingleton: false, value: d, idx: DisposableTracker.idx++ };
            this.livingDisposables.set(d, val);
        }
        return val;
    }
    trackDisposable(d) {
        const data = this.getDisposableData(d);
        if (!data.source) {
            data.source =
                new Error().stack;
        }
    }
    setParent(child, parent) {
        const data = this.getDisposableData(child);
        data.parent = parent;
    }
    markAsDisposed(x) {
        this.livingDisposables.delete(x);
    }
    markAsSingleton(disposable) {
        this.getDisposableData(disposable).isSingleton = true;
    }
    getRootParent(data, cache) {
        const cacheValue = cache.get(data);
        if (cacheValue) {
            return cacheValue;
        }
        const result = data.parent ? this.getRootParent(this.getDisposableData(data.parent), cache) : data;
        cache.set(data, result);
        return result;
    }
    getTrackedDisposables() {
        const rootParentCache = new Map();
        const leaking = [...this.livingDisposables.entries()]
            .filter(([, v]) => v.source !== null && !this.getRootParent(v, rootParentCache).isSingleton)
            .flatMap(([k]) => k);
        return leaking;
    }
    computeLeakingDisposables(maxReported = 10, preComputedLeaks) {
        let uncoveredLeakingObjs;
        if (preComputedLeaks) {
            uncoveredLeakingObjs = preComputedLeaks;
        }
        else {
            const rootParentCache = new Map();
            const leakingObjects = [...this.livingDisposables.values()]
                .filter((info) => info.source !== null && !this.getRootParent(info, rootParentCache).isSingleton);
            if (leakingObjects.length === 0) {
                return;
            }
            const leakingObjsSet = new Set(leakingObjects.map(o => o.value));
            // Remove all objects that are a child of other leaking objects. Assumes there are no cycles.
            uncoveredLeakingObjs = leakingObjects.filter(l => {
                return !(l.parent && leakingObjsSet.has(l.parent));
            });
            if (uncoveredLeakingObjs.length === 0) {
                throw new Error('There are cyclic diposable chains!');
            }
        }
        if (!uncoveredLeakingObjs) {
            return undefined;
        }
        function getStackTracePath(leaking) {
            function removePrefix(array, linesToRemove) {
                while (array.length > 0 && linesToRemove.some(regexp => typeof regexp === 'string' ? regexp === array[0] : array[0].match(regexp))) {
                    array.shift();
                }
            }
            const lines = leaking.source.split('\n').map(p => p.trim().replace('at ', '')).filter(l => l !== '');
            removePrefix(lines, ['Error', /^trackDisposable \(.*\)$/, /^DisposableTracker.trackDisposable \(.*\)$/]);
            return lines.reverse();
        }
        const stackTraceStarts = new SetMap();
        for (const leaking of uncoveredLeakingObjs) {
            const stackTracePath = getStackTracePath(leaking);
            for (let i = 0; i <= stackTracePath.length; i++) {
                stackTraceStarts.add(stackTracePath.slice(0, i).join('\n'), leaking);
            }
        }
        // Put earlier leaks first
        uncoveredLeakingObjs.sort(compareBy(l => l.idx, numberComparator));
        let message = '';
        let i = 0;
        for (const leaking of uncoveredLeakingObjs.slice(0, maxReported)) {
            i++;
            const stackTracePath = getStackTracePath(leaking);
            const stackTraceFormattedLines = [];
            for (let i = 0; i < stackTracePath.length; i++) {
                let line = stackTracePath[i];
                const starts = stackTraceStarts.get(stackTracePath.slice(0, i + 1).join('\n'));
                line = `(shared with ${starts.size}/${uncoveredLeakingObjs.length} leaks) at ${line}`;
                const prevStarts = stackTraceStarts.get(stackTracePath.slice(0, i).join('\n'));
                const continuations = groupBy([...prevStarts].map(d => getStackTracePath(d)[i]), v => v);
                delete continuations[stackTracePath[i]];
                for (const [cont, set] of Object.entries(continuations)) {
                    if (set) {
                        stackTraceFormattedLines.unshift(`    - stacktraces of ${set.length} other leaks continue with ${cont}`);
                    }
                }
                stackTraceFormattedLines.unshift(line);
            }
            message += `\n\n\n==================== Leaking disposable ${i}/${uncoveredLeakingObjs.length}: ${leaking.value.constructor.name} ====================\n${stackTraceFormattedLines.join('\n')}\n============================================================\n\n`;
        }
        if (uncoveredLeakingObjs.length > maxReported) {
            message += `\n\n\n... and ${uncoveredLeakingObjs.length - maxReported} more leaking disposables\n\n`;
        }
        return { leaks: uncoveredLeakingObjs, details: message };
    }
}
export function setDisposableTracker(tracker) {
    disposableTracker = tracker;
}
if (TRACK_DISPOSABLES) {
    const __is_disposable_tracked__ = '__is_disposable_tracked__';
    setDisposableTracker(new class {
        trackDisposable(x) {
            const stack = new Error('Potentially leaked disposable').stack;
            setTimeout(() => {
                // eslint-disable-next-line local/code-no-any-casts
                if (!x[__is_disposable_tracked__]) {
                    console.log(stack);
                }
            }, 3000);
        }
        setParent(child, parent) {
            if (child && child !== Disposable.None) {
                try {
                    // eslint-disable-next-line local/code-no-any-casts
                    child[__is_disposable_tracked__] = true;
                }
                catch {
                    // noop
                }
            }
        }
        markAsDisposed(disposable) {
            if (disposable && disposable !== Disposable.None) {
                try {
                    // eslint-disable-next-line local/code-no-any-casts
                    disposable[__is_disposable_tracked__] = true;
                }
                catch {
                    // noop
                }
            }
        }
        markAsSingleton(disposable) { }
    });
}
export function trackDisposable(x) {
    disposableTracker?.trackDisposable(x);
    return x;
}
export function markAsDisposed(disposable) {
    disposableTracker?.markAsDisposed(disposable);
}
function setParentOfDisposable(child, parent) {
    disposableTracker?.setParent(child, parent);
}
function setParentOfDisposables(children, parent) {
    if (!disposableTracker) {
        return;
    }
    for (const child of children) {
        disposableTracker.setParent(child, parent);
    }
}
/**
 * Indicates that the given object is a singleton which does not need to be disposed.
*/
export function markAsSingleton(singleton) {
    disposableTracker?.markAsSingleton(singleton);
    return singleton;
}
/**
 * Check if `thing` is {@link IDisposable disposable}.
 */
export function isDisposable(thing) {
    // eslint-disable-next-line local/code-no-any-casts
    return typeof thing === 'object' && thing !== null && typeof thing.dispose === 'function' && thing.dispose.length === 0;
}
export function dispose(arg) {
    if (Iterable.is(arg)) {
        const errors = [];
        for (const d of arg) {
            if (d) {
                try {
                    d.dispose();
                }
                catch (e) {
                    errors.push(e);
                }
            }
        }
        if (errors.length === 1) {
            throw errors[0];
        }
        else if (errors.length > 1) {
            throw new AggregateError(errors, 'Encountered errors while disposing of store');
        }
        return Array.isArray(arg) ? [] : arg;
    }
    else if (arg) {
        arg.dispose();
        return arg;
    }
}
export function disposeIfDisposable(disposables) {
    for (const d of disposables) {
        if (isDisposable(d)) {
            d.dispose();
        }
    }
    return [];
}
/**
 * Combine multiple disposable values into a single {@link IDisposable}.
 */
export function combinedDisposable(...disposables) {
    const parent = toDisposable(() => dispose(disposables));
    setParentOfDisposables(disposables, parent);
    return parent;
}
class FunctionDisposable {
    constructor(fn) {
        this._isDisposed = false;
        this._fn = fn;
        trackDisposable(this);
    }
    dispose() {
        if (this._isDisposed) {
            return;
        }
        if (!this._fn) {
            throw new Error(`Unbound disposable context: Need to use an arrow function to preserve the value of this`);
        }
        this._isDisposed = true;
        markAsDisposed(this);
        this._fn();
    }
}
/**
 * Turn a function that implements dispose into an {@link IDisposable}.
 *
 * @param fn Clean up function, guaranteed to be called only **once**.
 */
export function toDisposable(fn) {
    return new FunctionDisposable(fn);
}
/**
 * Manages a collection of disposable values.
 *
 * This is the preferred way to manage multiple disposables. A `DisposableStore` is safer to work with than an
 * `IDisposable[]` as it considers edge cases, such as registering the same value multiple times or adding an item to a
 * store that has already been disposed of.
 */
export class DisposableStore {
    static { this.DISABLE_DISPOSED_WARNING = false; }
    constructor() {
        this._toDispose = new Set();
        this._isDisposed = false;
        trackDisposable(this);
    }
    /**
     * Dispose of all registered disposables and mark this object as disposed.
     *
     * Any future disposables added to this object will be disposed of on `add`.
     */
    dispose() {
        if (this._isDisposed) {
            return;
        }
        markAsDisposed(this);
        this._isDisposed = true;
        this.clear();
    }
    /**
     * @return `true` if this object has been disposed of.
     */
    get isDisposed() {
        return this._isDisposed;
    }
    /**
     * Dispose of all registered disposables but do not mark this object as disposed.
     */
    clear() {
        if (this._toDispose.size === 0) {
            return;
        }
        try {
            dispose(this._toDispose);
        }
        finally {
            this._toDispose.clear();
        }
    }
    /**
     * Add a new {@link IDisposable disposable} to the collection.
     */
    add(o) {
        if (!o || o === Disposable.None) {
            return o;
        }
        if (o === this) {
            throw new Error('Cannot register a disposable on itself!');
        }
        setParentOfDisposable(o, this);
        if (this._isDisposed) {
            if (!DisposableStore.DISABLE_DISPOSED_WARNING) {
                console.warn(new Error('Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!').stack);
            }
        }
        else {
            this._toDispose.add(o);
        }
        return o;
    }
    /**
     * Deletes a disposable from store and disposes of it. This will not throw or warn and proceed to dispose the
     * disposable even when the disposable is not part in the store.
     */
    delete(o) {
        if (!o) {
            return;
        }
        if (o === this) {
            throw new Error('Cannot dispose a disposable on itself!');
        }
        this._toDispose.delete(o);
        o.dispose();
    }
    /**
     * Deletes the value from the store, but does not dispose it.
     */
    deleteAndLeak(o) {
        if (!o) {
            return;
        }
        if (this._toDispose.delete(o)) {
            setParentOfDisposable(o, null);
        }
    }
    assertNotDisposed() {
        if (this._isDisposed) {
            onUnexpectedError(new BugIndicatingError('Object disposed'));
        }
    }
}
/**
 * Abstract base class for a {@link IDisposable disposable} object.
 *
 * Subclasses can {@linkcode _register} disposables that will be automatically cleaned up when this object is disposed of.
 */
export class Disposable {
    /**
     * A disposable that does nothing when it is disposed of.
     *
     * TODO: This should not be a static property.
     */
    static { this.None = Object.freeze({ dispose() { } }); }
    constructor() {
        this._store = new DisposableStore();
        trackDisposable(this);
        setParentOfDisposable(this._store, this);
    }
    dispose() {
        markAsDisposed(this);
        this._store.dispose();
    }
    /**
     * Adds `o` to the collection of disposables managed by this object.
     */
    _register(o) {
        if (o === this) {
            throw new Error('Cannot register a disposable on itself!');
        }
        return this._store.add(o);
    }
}
/**
 * Manages the lifecycle of a disposable value that may be changed.
 *
 * This ensures that when the disposable value is changed, the previously held disposable is disposed of. You can
 * also register a `MutableDisposable` on a `Disposable` to ensure it is automatically cleaned up.
 */
export class MutableDisposable {
    constructor() {
        this._isDisposed = false;
        trackDisposable(this);
    }
    /**
     * Get the currently held disposable value, or `undefined` if this MutableDisposable has been disposed
     */
    get value() {
        return this._isDisposed ? undefined : this._value;
    }
    /**
     * Set a new disposable value.
     *
     * Behaviour:
     * - If the MutableDisposable has been disposed, the setter is a no-op.
     * - If the new value is strictly equal to the current value, the setter is a no-op.
     * - Otherwise the previous value (if any) is disposed and the new value is stored.
     *
     * Related helpers:
     * - clear() resets the value to `undefined` (and disposes the previous value).
     * - clearAndLeak() returns the old value without disposing it and removes its parent.
     */
    set value(value) {
        if (this._isDisposed || value === this._value) {
            return;
        }
        this._value?.dispose();
        if (value) {
            setParentOfDisposable(value, this);
        }
        this._value = value;
    }
    /**
     * Resets the stored value and disposed of the previously stored value.
     */
    clear() {
        this.value = undefined;
    }
    dispose() {
        this._isDisposed = true;
        markAsDisposed(this);
        this._value?.dispose();
        this._value = undefined;
    }
    /**
     * Clears the value, but does not dispose it.
     * The old value is returned.
    */
    clearAndLeak() {
        const oldValue = this._value;
        this._value = undefined;
        if (oldValue) {
            setParentOfDisposable(oldValue, null);
        }
        return oldValue;
    }
}
/**
 * Manages the lifecycle of a disposable value that may be changed like {@link MutableDisposable}, but the value must
 * exist and cannot be undefined.
 */
export class MandatoryMutableDisposable {
    constructor(initialValue) {
        this._disposable = new MutableDisposable();
        this._isDisposed = false;
        this._disposable.value = initialValue;
    }
    get value() {
        return this._disposable.value;
    }
    set value(value) {
        if (this._isDisposed || value === this._disposable.value) {
            return;
        }
        this._disposable.value = value;
    }
    dispose() {
        this._isDisposed = true;
        this._disposable.dispose();
    }
}
export class RefCountedDisposable {
    constructor(_disposable) {
        this._disposable = _disposable;
        this._counter = 1;
    }
    acquire() {
        this._counter++;
        return this;
    }
    release() {
        if (--this._counter === 0) {
            this._disposable.dispose();
        }
        return this;
    }
}
export class ReferenceCollection {
    constructor() {
        this.references = new Map();
    }
    acquire(key, ...args) {
        let reference = this.references.get(key);
        if (!reference) {
            reference = { counter: 0, object: this.createReferencedObject(key, ...args) };
            this.references.set(key, reference);
        }
        const { object } = reference;
        const dispose = createSingleCallFunction(() => {
            if (--reference.counter === 0) {
                this.destroyReferencedObject(key, reference.object);
                this.references.delete(key);
            }
        });
        reference.counter++;
        return { object, dispose };
    }
}
/**
 * Unwraps a reference collection of promised values. Makes sure
 * references are disposed whenever promises get rejected.
 */
export class AsyncReferenceCollection {
    constructor(referenceCollection) {
        this.referenceCollection = referenceCollection;
    }
    async acquire(key, ...args) {
        const ref = this.referenceCollection.acquire(key, ...args);
        try {
            const object = await ref.object;
            return {
                object,
                dispose: () => ref.dispose()
            };
        }
        catch (error) {
            ref.dispose();
            throw error;
        }
    }
}
export class ImmortalReference {
    constructor(object) {
        this.object = object;
    }
    dispose() { }
}
export function disposeOnReturn(fn) {
    const store = new DisposableStore();
    try {
        fn(store);
    }
    finally {
        store.dispose();
    }
}
/**
 * A map the manages the lifecycle of the values that it stores.
 */
export class DisposableMap {
    constructor(store = new Map()) {
        this._isDisposed = false;
        this._store = store;
        trackDisposable(this);
    }
    /**
     * Disposes of all stored values and mark this object as disposed.
     *
     * Trying to use this object after it has been disposed of is an error.
     */
    dispose() {
        markAsDisposed(this);
        this._isDisposed = true;
        this.clearAndDisposeAll();
    }
    /**
     * Disposes of all stored values and clear the map, but DO NOT mark this object as disposed.
     */
    clearAndDisposeAll() {
        if (!this._store.size) {
            return;
        }
        try {
            dispose(this._store.values());
        }
        finally {
            this._store.clear();
        }
    }
    has(key) {
        return this._store.has(key);
    }
    get size() {
        return this._store.size;
    }
    get(key) {
        return this._store.get(key);
    }
    set(key, value, skipDisposeOnOverwrite = false) {
        if (this._isDisposed) {
            console.warn(new Error('Trying to add a disposable to a DisposableMap that has already been disposed of. The added object will be leaked!').stack);
        }
        if (!skipDisposeOnOverwrite) {
            this._store.get(key)?.dispose();
        }
        this._store.set(key, value);
        setParentOfDisposable(value, this);
    }
    /**
     * Delete the value stored for `key` from this map and also dispose of it.
     */
    deleteAndDispose(key) {
        this._store.get(key)?.dispose();
        this._store.delete(key);
    }
    /**
     * Delete the value stored for `key` from this map but return it. The caller is
     * responsible for disposing of the value.
     */
    deleteAndLeak(key) {
        const value = this._store.get(key);
        if (value) {
            setParentOfDisposable(value, null);
        }
        this._store.delete(key);
        return value;
    }
    keys() {
        return this._store.keys();
    }
    values() {
        return this._store.values();
    }
    [Symbol.iterator]() {
        return this._store[Symbol.iterator]();
    }
}
/**
 * A set that manages the lifecycle of the values that it stores.
 */
export class DisposableSet {
    constructor(store = new Set()) {
        this._isDisposed = false;
        this._store = store;
        trackDisposable(this);
    }
    /**
     * Disposes of all stored values and mark this object as disposed.
     *
     * Trying to use this object after it has been disposed of is an error.
     */
    dispose() {
        markAsDisposed(this);
        this._isDisposed = true;
        this.clearAndDisposeAll();
    }
    /**
     * Disposes of all stored values and clear the set, but DO NOT mark this object as disposed.
     */
    clearAndDisposeAll() {
        if (!this._store.size) {
            return;
        }
        try {
            dispose(this._store.values());
        }
        finally {
            this._store.clear();
        }
    }
    has(value) {
        return this._store.has(value);
    }
    get size() {
        return this._store.size;
    }
    add(value) {
        if (this._isDisposed) {
            console.warn(new Error('Trying to add a disposable to a DisposableSet that has already been disposed of. The added object will be leaked!').stack);
        }
        this._store.add(value);
        setParentOfDisposable(value, this);
    }
    /**
     * Delete the value from this set and also dispose of it.
     */
    deleteAndDispose(value) {
        if (this._store.delete(value)) {
            value.dispose();
        }
    }
    /**
     * Delete the value from this set but return it. The caller is
     * responsible for disposing of the value.
     */
    deleteAndLeak(value) {
        if (this._store.delete(value)) {
            setParentOfDisposable(value, null);
            return value;
        }
        return undefined;
    }
    values() {
        return this._store.values();
    }
    [Symbol.iterator]() {
        return this._store[Symbol.iterator]();
    }
}
/**
 * Call `then` on a Promise, unless the returned disposable is disposed.
 */
export function thenIfNotDisposed(promise, then) {
    let disposed = false;
    promise.then(result => {
        if (disposed) {
            return;
        }
        then(result);
    });
    return toDisposable(() => {
        disposed = true;
    });
}
/**
 * Call `then` on a promise that resolves to a {@link IDisposable}, then either register the
 * disposable or register it to the {@link DisposableStore}, depending on whether the store is
 * disposed or not.
 */
export function thenRegisterOrDispose(promise, store) {
    return promise.then(disposable => {
        if (store.isDisposed) {
            disposable.dispose();
        }
        else {
            store.add(disposable);
        }
        return disposable;
    });
}
export class DisposableResourceMap extends DisposableMap {
    constructor() {
        super(new ResourceMap());
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlmZWN5Y2xlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vbGlmZWN5Y2xlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRS9DLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDekMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGlCQUFpQixFQUFFLE1BQU0sYUFBYSxDQUFDO0FBRXBFLDhCQUE4QjtBQUU5Qjs7Ozs7O0dBTUc7QUFDSCxNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQztBQUNoQyxJQUFJLGlCQUFpQixHQUE4QixJQUFJLENBQUM7QUF5QnhELE1BQU0sT0FBTyx3QkFBd0I7SUFBckM7UUFFa0IsY0FBUyxHQUFHLElBQUksb0JBQW9CLENBQVMsU0FBUyxDQUFDLEVBQUU7WUFDekUsT0FBTyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUMsQ0FBQztJQXNCSixDQUFDO0lBcEJBLGVBQWUsQ0FBQyxVQUF1QjtRQUN0QyxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxLQUFNLENBQUM7UUFDL0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQsU0FBUyxDQUFDLEtBQWtCLEVBQUUsTUFBMEI7UUFDdkQsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNaLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2xDLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM3QixDQUFDO0lBQ0YsQ0FBQztJQUVELGNBQWMsQ0FBQyxVQUF1QjtRQUNyQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBRUQsZUFBZSxDQUFDLFVBQXVCO1FBQ3RDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7Q0FDRDtBQVVELE1BQU0sT0FBTyxpQkFBaUI7SUFBOUI7UUFHa0Isc0JBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQStCLENBQUM7SUEySTdFLENBQUM7YUE3SWUsUUFBRyxHQUFHLENBQUMsQUFBSixDQUFLO0lBSWYsaUJBQWlCLENBQUMsQ0FBYztRQUN2QyxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNWLEdBQUcsR0FBRyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7WUFDakcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDcEMsQ0FBQztRQUNELE9BQU8sR0FBRyxDQUFDO0lBQ1osQ0FBQztJQUVELGVBQWUsQ0FBQyxDQUFjO1FBQzdCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxNQUFNO2dCQUNWLElBQUksS0FBSyxFQUFFLENBQUMsS0FBTSxDQUFDO1FBQ3JCLENBQUM7SUFDRixDQUFDO0lBRUQsU0FBUyxDQUFDLEtBQWtCLEVBQUUsTUFBMEI7UUFDdkQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3RCLENBQUM7SUFFRCxjQUFjLENBQUMsQ0FBYztRQUM1QixJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxlQUFlLENBQUMsVUFBdUI7UUFDdEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7SUFDdkQsQ0FBQztJQUVPLGFBQWEsQ0FBQyxJQUFvQixFQUFFLEtBQTBDO1FBQ3JGLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixPQUFPLFVBQVUsQ0FBQztRQUNuQixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDbkcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDeEIsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRUQscUJBQXFCO1FBQ3BCLE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxFQUFrQyxDQUFDO1FBRWxFLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUM7YUFDbkQsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDLFdBQVcsQ0FBQzthQUMzRixPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV0QixPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0lBRUQseUJBQXlCLENBQUMsV0FBVyxHQUFHLEVBQUUsRUFBRSxnQkFBbUM7UUFDOUUsSUFBSSxvQkFBa0QsQ0FBQztRQUN2RCxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDdEIsb0JBQW9CLEdBQUcsZ0JBQWdCLENBQUM7UUFDekMsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLGVBQWUsR0FBRyxJQUFJLEdBQUcsRUFBa0MsQ0FBQztZQUVsRSxNQUFNLGNBQWMsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxDQUFDO2lCQUN6RCxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsZUFBZSxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7WUFFbkcsSUFBSSxjQUFjLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNqQyxPQUFPO1lBQ1IsQ0FBQztZQUNELE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUVqRSw2RkFBNkY7WUFDN0Ysb0JBQW9CLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDaEQsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBSSxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ3BELENBQUMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxvQkFBb0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztZQUN2RCxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQzNCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxTQUFTLGlCQUFpQixDQUFDLE9BQXVCO1lBQ2pELFNBQVMsWUFBWSxDQUFDLEtBQWUsRUFBRSxhQUFrQztnQkFDeEUsT0FBTyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDcEksS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNmLENBQUM7WUFDRixDQUFDO1lBRUQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE1BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDdEcsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDLENBQUM7WUFDekcsT0FBTyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDeEIsQ0FBQztRQUVELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLEVBQTBCLENBQUM7UUFDOUQsS0FBSyxNQUFNLE9BQU8sSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1lBQzVDLE1BQU0sY0FBYyxHQUFHLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ2pELGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDdEUsQ0FBQztRQUNGLENBQUM7UUFFRCwwQkFBMEI7UUFDMUIsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBRW5FLElBQUksT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUVqQixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDVixLQUFLLE1BQU0sT0FBTyxJQUFJLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUNsRSxDQUFDLEVBQUUsQ0FBQztZQUNKLE1BQU0sY0FBYyxHQUFHLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xELE1BQU0sd0JBQXdCLEdBQUcsRUFBRSxDQUFDO1lBRXBDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ2hELElBQUksSUFBSSxHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0IsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDL0UsSUFBSSxHQUFHLGdCQUFnQixNQUFNLENBQUMsSUFBSSxJQUFJLG9CQUFvQixDQUFDLE1BQU0sY0FBYyxJQUFJLEVBQUUsQ0FBQztnQkFFdEYsTUFBTSxVQUFVLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUMvRSxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDekYsT0FBTyxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hDLEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7b0JBQ3pELElBQUksR0FBRyxFQUFFLENBQUM7d0JBQ1Qsd0JBQXdCLENBQUMsT0FBTyxDQUFDLHdCQUF3QixHQUFHLENBQUMsTUFBTSw4QkFBOEIsSUFBSSxFQUFFLENBQUMsQ0FBQztvQkFDMUcsQ0FBQztnQkFDRixDQUFDO2dCQUVELHdCQUF3QixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN4QyxDQUFDO1lBRUQsT0FBTyxJQUFJLGlEQUFpRCxDQUFDLElBQUksb0JBQW9CLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUksMEJBQTBCLHdCQUF3QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsb0VBQW9FLENBQUM7UUFDbFEsQ0FBQztRQUVELElBQUksb0JBQW9CLENBQUMsTUFBTSxHQUFHLFdBQVcsRUFBRSxDQUFDO1lBQy9DLE9BQU8sSUFBSSxpQkFBaUIsb0JBQW9CLENBQUMsTUFBTSxHQUFHLFdBQVcsK0JBQStCLENBQUM7UUFDdEcsQ0FBQztRQUVELE9BQU8sRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxDQUFDO0lBQzFELENBQUM7O0FBR0YsTUFBTSxVQUFVLG9CQUFvQixDQUFDLE9BQWtDO0lBQ3RFLGlCQUFpQixHQUFHLE9BQU8sQ0FBQztBQUM3QixDQUFDO0FBRUQsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO0lBQ3ZCLE1BQU0seUJBQXlCLEdBQUcsMkJBQTJCLENBQUM7SUFDOUQsb0JBQW9CLENBQUMsSUFBSTtRQUN4QixlQUFlLENBQUMsQ0FBYztZQUM3QixNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLEtBQU0sQ0FBQztZQUNoRSxVQUFVLENBQUMsR0FBRyxFQUFFO2dCQUNmLG1EQUFtRDtnQkFDbkQsSUFBSSxDQUFFLENBQVMsQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLENBQUM7b0JBQzVDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3BCLENBQUM7WUFDRixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDVixDQUFDO1FBRUQsU0FBUyxDQUFDLEtBQWtCLEVBQUUsTUFBMEI7WUFDdkQsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDeEMsSUFBSSxDQUFDO29CQUNKLG1EQUFtRDtvQkFDbEQsS0FBYSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsSUFBSSxDQUFDO2dCQUNsRCxDQUFDO2dCQUFDLE1BQU0sQ0FBQztvQkFDUixPQUFPO2dCQUNSLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELGNBQWMsQ0FBQyxVQUF1QjtZQUNyQyxJQUFJLFVBQVUsSUFBSSxVQUFVLEtBQUssVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNsRCxJQUFJLENBQUM7b0JBQ0osbURBQW1EO29CQUNsRCxVQUFrQixDQUFDLHlCQUF5QixDQUFDLEdBQUcsSUFBSSxDQUFDO2dCQUN2RCxDQUFDO2dCQUFDLE1BQU0sQ0FBQztvQkFDUixPQUFPO2dCQUNSLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELGVBQWUsQ0FBQyxVQUF1QixJQUFVLENBQUM7S0FDbEQsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELE1BQU0sVUFBVSxlQUFlLENBQXdCLENBQUk7SUFDMUQsaUJBQWlCLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RDLE9BQU8sQ0FBQyxDQUFDO0FBQ1YsQ0FBQztBQUVELE1BQU0sVUFBVSxjQUFjLENBQUMsVUFBdUI7SUFDckQsaUJBQWlCLEVBQUUsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQy9DLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLEtBQWtCLEVBQUUsTUFBMEI7SUFDNUUsaUJBQWlCLEVBQUUsU0FBUyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztBQUM3QyxDQUFDO0FBRUQsU0FBUyxzQkFBc0IsQ0FBQyxRQUF1QixFQUFFLE1BQTBCO0lBQ2xGLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3hCLE9BQU87SUFDUixDQUFDO0lBQ0QsS0FBSyxNQUFNLEtBQUssSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUM5QixpQkFBaUIsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzVDLENBQUM7QUFDRixDQUFDO0FBRUQ7O0VBRUU7QUFDRixNQUFNLFVBQVUsZUFBZSxDQUF3QixTQUFZO0lBQ2xFLGlCQUFpQixFQUFFLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM5QyxPQUFPLFNBQVMsQ0FBQztBQUNsQixDQUFDO0FBaUJEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLFlBQVksQ0FBSSxLQUFRO0lBQ3ZDLG1EQUFtRDtJQUNuRCxPQUFPLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLE9BQTBCLEtBQU0sQ0FBQyxPQUFPLEtBQUssVUFBVSxJQUF1QixLQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUM7QUFDakssQ0FBQztBQVVELE1BQU0sVUFBVSxPQUFPLENBQXdCLEdBQWdDO0lBQzlFLElBQUksUUFBUSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3RCLE1BQU0sTUFBTSxHQUFVLEVBQUUsQ0FBQztRQUV6QixLQUFLLE1BQU0sQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQ1AsSUFBSSxDQUFDO29CQUNKLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDYixDQUFDO2dCQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ1osTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDaEIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLENBQUM7YUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDOUIsTUFBTSxJQUFJLGNBQWMsQ0FBQyxNQUFNLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztRQUNqRixDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztJQUN0QyxDQUFDO1NBQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNoQixHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZCxPQUFPLEdBQUcsQ0FBQztJQUNaLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxVQUFVLG1CQUFtQixDQUFpQyxXQUFxQjtJQUN4RixLQUFLLE1BQU0sQ0FBQyxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQzdCLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDckIsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2IsQ0FBQztJQUNGLENBQUM7SUFDRCxPQUFPLEVBQUUsQ0FBQztBQUNYLENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxHQUFHLFdBQTBCO0lBQy9ELE1BQU0sTUFBTSxHQUFHLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUN4RCxzQkFBc0IsQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDNUMsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxrQkFBa0I7SUFJdkIsWUFBWSxFQUFjO1FBQ3pCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDO1FBQ2QsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxPQUFPO1FBQ04sSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDdEIsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyx5RkFBeUYsQ0FBQyxDQUFDO1FBQzVHLENBQUM7UUFDRCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztRQUN4QixjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckIsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ1osQ0FBQztDQUNEO0FBRUQ7Ozs7R0FJRztBQUNILE1BQU0sVUFBVSxZQUFZLENBQUMsRUFBYztJQUMxQyxPQUFPLElBQUksa0JBQWtCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDbkMsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sT0FBTyxlQUFlO2FBRXBCLDZCQUF3QixHQUFHLEtBQUssQUFBUixDQUFTO0lBS3hDO1FBSGlCLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBZSxDQUFDO1FBQzdDLGdCQUFXLEdBQUcsS0FBSyxDQUFDO1FBRzNCLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN2QixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLE9BQU87UUFDYixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN0QixPQUFPO1FBQ1IsQ0FBQztRQUVELGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztRQUN4QixJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDZCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxJQUFXLFVBQVU7UUFDcEIsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7T0FFRztJQUNJLEtBQUs7UUFDWCxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2hDLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0osT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxQixDQUFDO2dCQUFTLENBQUM7WUFDVixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3pCLENBQUM7SUFDRixDQUFDO0lBRUQ7O09BRUc7SUFDSSxHQUFHLENBQXdCLENBQUk7UUFDckMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2pDLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQztRQUNELElBQUssQ0FBZ0MsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNoRCxNQUFNLElBQUksS0FBSyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUVELHFCQUFxQixDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMvQixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsZUFBZSxDQUFDLHdCQUF3QixFQUFFLENBQUM7Z0JBQy9DLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLENBQUMscUhBQXFILENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0SixDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QixDQUFDO1FBRUQsT0FBTyxDQUFDLENBQUM7SUFDVixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ksTUFBTSxDQUF3QixDQUFJO1FBQ3hDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNSLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSyxDQUFnQyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ2hELE1BQU0sSUFBSSxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztRQUMzRCxDQUFDO1FBQ0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUIsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2IsQ0FBQztJQUVEOztPQUVHO0lBQ0ksYUFBYSxDQUF3QixDQUFJO1FBQy9DLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNSLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQy9CLHFCQUFxQixDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNoQyxDQUFDO0lBQ0YsQ0FBQztJQUVNLGlCQUFpQjtRQUN2QixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN0QixpQkFBaUIsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUM5RCxDQUFDO0lBQ0YsQ0FBQzs7QUFHRjs7OztHQUlHO0FBQ0gsTUFBTSxPQUFnQixVQUFVO0lBRS9COzs7O09BSUc7YUFDYSxTQUFJLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBYyxFQUFFLE9BQU8sS0FBSyxDQUFDLEVBQUUsQ0FBQyxBQUFoRCxDQUFpRDtJQUlyRTtRQUZtQixXQUFNLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUdqRCxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEIscUJBQXFCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRU0sT0FBTztRQUNiLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVyQixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFRDs7T0FFRztJQUNPLFNBQVMsQ0FBd0IsQ0FBSTtRQUM5QyxJQUFLLENBQTJCLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDM0MsTUFBTSxJQUFJLEtBQUssQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1FBQzVELENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNCLENBQUM7O0FBR0Y7Ozs7O0dBS0c7QUFDSCxNQUFNLE9BQU8saUJBQWlCO0lBSTdCO1FBRlEsZ0JBQVcsR0FBRyxLQUFLLENBQUM7UUFHM0IsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFFRDs7T0FFRztJQUNILElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ25ELENBQUM7SUFFRDs7Ozs7Ozs7Ozs7T0FXRztJQUNILElBQUksS0FBSyxDQUFDLEtBQW9CO1FBQzdCLElBQUksSUFBSSxDQUFDLFdBQVcsSUFBSSxLQUFLLEtBQUssSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQy9DLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUN2QixJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1gscUJBQXFCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFDRCxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztJQUNyQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLO1FBQ0osSUFBSSxDQUFDLEtBQUssR0FBRyxTQUFTLENBQUM7SUFDeEIsQ0FBQztJQUVELE9BQU87UUFDTixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztRQUN4QixjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckIsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQztJQUN6QixDQUFDO0lBRUQ7OztNQUdFO0lBQ0YsWUFBWTtRQUNYLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDN0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUM7UUFDeEIsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNkLHFCQUFxQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBQ0QsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztDQUNEO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLDBCQUEwQjtJQUl0QyxZQUFZLFlBQWU7UUFIVixnQkFBVyxHQUFHLElBQUksaUJBQWlCLEVBQUssQ0FBQztRQUNsRCxnQkFBVyxHQUFHLEtBQUssQ0FBQztRQUczQixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssR0FBRyxZQUFZLENBQUM7SUFDdkMsQ0FBQztJQUVELElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFNLENBQUM7SUFDaEMsQ0FBQztJQUVELElBQUksS0FBSyxDQUFDLEtBQVE7UUFDakIsSUFBSSxJQUFJLENBQUMsV0FBVyxJQUFJLEtBQUssS0FBSyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzFELE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0lBQ2hDLENBQUM7SUFFRCxPQUFPO1FBQ04sSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7UUFDeEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUM1QixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sb0JBQW9CO0lBSWhDLFlBQ2tCLFdBQXdCO1FBQXhCLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBSGxDLGFBQVEsR0FBVyxDQUFDLENBQUM7SUFJekIsQ0FBQztJQUVMLE9BQU87UUFDTixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDaEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzNCLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDNUIsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztDQUNEO0FBTUQsTUFBTSxPQUFnQixtQkFBbUI7SUFBekM7UUFFa0IsZUFBVSxHQUF5RCxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBeUIvRixDQUFDO0lBdkJBLE9BQU8sQ0FBQyxHQUFXLEVBQUUsR0FBRyxJQUFlO1FBQ3RDLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXpDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixTQUFTLEdBQUcsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUM5RSxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckMsQ0FBQztRQUVELE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxTQUFTLENBQUM7UUFDN0IsTUFBTSxPQUFPLEdBQUcsd0JBQXdCLENBQUMsR0FBRyxFQUFFO1lBQzdDLElBQUksRUFBRSxTQUFTLENBQUMsT0FBTyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUMvQixJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDN0IsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRXBCLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7SUFDNUIsQ0FBQztDQUlEO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLHdCQUF3QjtJQUVwQyxZQUFvQixtQkFBb0Q7UUFBcEQsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFpQztJQUFJLENBQUM7SUFFN0UsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFXLEVBQUUsR0FBRyxJQUFlO1FBQzVDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFFM0QsSUFBSSxDQUFDO1lBQ0osTUFBTSxNQUFNLEdBQUcsTUFBTSxHQUFHLENBQUMsTUFBTSxDQUFDO1lBRWhDLE9BQU87Z0JBQ04sTUFBTTtnQkFDTixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRTthQUM1QixDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsTUFBTSxLQUFLLENBQUM7UUFDYixDQUFDO0lBQ0YsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGlCQUFpQjtJQUM3QixZQUFtQixNQUFTO1FBQVQsV0FBTSxHQUFOLE1BQU0sQ0FBRztJQUFJLENBQUM7SUFDakMsT0FBTyxLQUFzQixDQUFDO0NBQzlCO0FBRUQsTUFBTSxVQUFVLGVBQWUsQ0FBQyxFQUFvQztJQUNuRSxNQUFNLEtBQUssR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBQ3BDLElBQUksQ0FBQztRQUNKLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNYLENBQUM7WUFBUyxDQUFDO1FBQ1YsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7QUFDRixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sYUFBYTtJQUt6QixZQUFZLFFBQW1CLElBQUksR0FBRyxFQUFRO1FBRnRDLGdCQUFXLEdBQUcsS0FBSyxDQUFDO1FBRzNCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN2QixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILE9BQU87UUFDTixjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7UUFDeEIsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7SUFDM0IsQ0FBQztJQUVEOztPQUVHO0lBQ0gsa0JBQWtCO1FBQ2pCLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0osT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUMvQixDQUFDO2dCQUFTLENBQUM7WUFDVixJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3JCLENBQUM7SUFDRixDQUFDO0lBRUQsR0FBRyxDQUFDLEdBQU07UUFDVCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFRCxJQUFJLElBQUk7UUFDUCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxHQUFHLENBQUMsR0FBTTtRQUNULE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVELEdBQUcsQ0FBQyxHQUFNLEVBQUUsS0FBUSxFQUFFLHNCQUFzQixHQUFHLEtBQUs7UUFDbkQsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDdEIsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxtSEFBbUgsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BKLENBQUM7UUFFRCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUNqQyxDQUFDO1FBRUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzVCLHFCQUFxQixDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxnQkFBZ0IsQ0FBQyxHQUFNO1FBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7O09BR0c7SUFDSCxhQUFhLENBQUMsR0FBTTtRQUNuQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1gscUJBQXFCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxJQUFJO1FBQ0gsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRCxNQUFNO1FBQ0wsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQzdCLENBQUM7SUFFRCxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDaEIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO0lBQ3ZDLENBQUM7Q0FDRDtBQUVEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLGFBQWE7SUFLekIsWUFBWSxRQUFnQixJQUFJLEdBQUcsRUFBSztRQUZoQyxnQkFBVyxHQUFHLEtBQUssQ0FBQztRQUczQixJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNwQixlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxPQUFPO1FBQ04sY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRDs7T0FFRztJQUNILGtCQUFrQjtRQUNqQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN2QixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQztZQUNKLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDL0IsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNyQixDQUFDO0lBQ0YsQ0FBQztJQUVELEdBQUcsQ0FBQyxLQUFRO1FBQ1gsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBRUQsSUFBSSxJQUFJO1FBQ1AsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztJQUN6QixDQUFDO0lBRUQsR0FBRyxDQUFDLEtBQVE7UUFDWCxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN0QixPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLG1IQUFtSCxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEosQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZCLHFCQUFxQixDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxnQkFBZ0IsQ0FBQyxLQUFRO1FBQ3hCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMvQixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakIsQ0FBQztJQUNGLENBQUM7SUFFRDs7O09BR0c7SUFDSCxhQUFhLENBQUMsS0FBUTtRQUNyQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDL0IscUJBQXFCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ25DLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxNQUFNO1FBQ0wsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQzdCLENBQUM7SUFFRCxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDaEIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO0lBQ3ZDLENBQUM7Q0FDRDtBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLGlCQUFpQixDQUFJLE9BQW1CLEVBQUUsSUFBeUI7SUFDbEYsSUFBSSxRQUFRLEdBQUcsS0FBSyxDQUFDO0lBQ3JCLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7UUFDckIsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNkLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2QsQ0FBQyxDQUFDLENBQUM7SUFDSCxPQUFPLFlBQVksQ0FBQyxHQUFHLEVBQUU7UUFDeEIsUUFBUSxHQUFHLElBQUksQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLHFCQUFxQixDQUF3QixPQUFtQixFQUFFLEtBQXNCO0lBQ3ZHLE9BQU8sT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUNoQyxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN0QixVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdEIsQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3ZCLENBQUM7UUFDRCxPQUFPLFVBQVUsQ0FBQztJQUNuQixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxNQUFNLE9BQU8scUJBQTJELFNBQVEsYUFBcUI7SUFDcEc7UUFDQyxLQUFLLENBQUMsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQzFCLENBQUM7Q0FDRCJ9
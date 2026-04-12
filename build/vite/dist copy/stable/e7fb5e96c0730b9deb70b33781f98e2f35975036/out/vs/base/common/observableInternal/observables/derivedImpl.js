/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BaseObservable } from './baseObservable.js';
import { BugIndicatingError, DisposableStore, assertFn, onBugIndicatingError } from '../commonFacade/deps.js';
import { getLogger } from '../logging/logging.js';
export var DerivedState;
(function (DerivedState) {
    /** Initial state, no previous value, recomputation needed */
    DerivedState[DerivedState["initial"] = 0] = "initial";
    /**
     * A dependency could have changed.
     * We need to explicitly ask them if at least one dependency changed.
     */
    DerivedState[DerivedState["dependenciesMightHaveChanged"] = 1] = "dependenciesMightHaveChanged";
    /**
     * A dependency changed and we need to recompute.
     * After recomputation, we need to check the previous value to see if we changed as well.
     */
    DerivedState[DerivedState["stale"] = 2] = "stale";
    /**
     * No change reported, our cached value is up to date.
     */
    DerivedState[DerivedState["upToDate"] = 3] = "upToDate";
})(DerivedState || (DerivedState = {}));
function derivedStateToString(state) {
    switch (state) {
        case 0 /* DerivedState.initial */: return 'initial';
        case 1 /* DerivedState.dependenciesMightHaveChanged */: return 'dependenciesMightHaveChanged';
        case 2 /* DerivedState.stale */: return 'stale';
        case 3 /* DerivedState.upToDate */: return 'upToDate';
        default: return '<unknown>';
    }
}
export class Derived extends BaseObservable {
    get debugName() {
        return this._debugNameData.getDebugName(this) ?? '(anonymous)';
    }
    constructor(_debugNameData, _computeFn, _changeTracker, _handleLastObserverRemoved = undefined, _equalityComparator, debugLocation) {
        super(debugLocation);
        this._debugNameData = _debugNameData;
        this._computeFn = _computeFn;
        this._changeTracker = _changeTracker;
        this._handleLastObserverRemoved = _handleLastObserverRemoved;
        this._equalityComparator = _equalityComparator;
        this._state = 0 /* DerivedState.initial */;
        this._value = undefined;
        this._updateCount = 0;
        this._dependencies = new Set();
        this._dependenciesToBeRemoved = new Set();
        this._changeSummary = undefined;
        this._isUpdating = false;
        this._isComputing = false;
        this._didReportChange = false;
        this._isInBeforeUpdate = false;
        this._isReaderValid = false;
        this._store = undefined;
        this._delayedStore = undefined;
        this._removedObserverToCallEndUpdateOn = null;
        this._changeSummary = this._changeTracker?.createChangeSummary(undefined);
    }
    onLastObserverRemoved() {
        /**
         * We are not tracking changes anymore, thus we have to assume
         * that our cache is invalid.
         */
        this._state = 0 /* DerivedState.initial */;
        this._value = undefined;
        getLogger()?.handleDerivedCleared(this);
        for (const d of this._dependencies) {
            d.removeObserver(this);
        }
        this._dependencies.clear();
        if (this._store !== undefined) {
            this._store.dispose();
            this._store = undefined;
        }
        if (this._delayedStore !== undefined) {
            this._delayedStore.dispose();
            this._delayedStore = undefined;
        }
        this._handleLastObserverRemoved?.();
    }
    get() {
        const checkEnabled = false; // TODO set to true
        if (this._isComputing && checkEnabled) {
            // investigate why this fails in the diff editor!
            throw new BugIndicatingError('Cyclic deriveds are not supported yet!');
        }
        if (this._observers.size === 0) {
            let result;
            // Without observers, we don't know when to clean up stuff.
            // Thus, we don't cache anything to prevent memory leaks.
            try {
                this._isReaderValid = true;
                let changeSummary = undefined;
                if (this._changeTracker) {
                    changeSummary = this._changeTracker.createChangeSummary(undefined);
                    this._changeTracker.beforeUpdate?.(this, changeSummary);
                }
                result = this._computeFn(this, changeSummary);
            }
            finally {
                this._isReaderValid = false;
            }
            // Clear new dependencies
            this.onLastObserverRemoved();
            return result;
        }
        else {
            do {
                // We might not get a notification for a dependency that changed while it is updating,
                // thus we also have to ask all our depedencies if they changed in this case.
                if (this._state === 1 /* DerivedState.dependenciesMightHaveChanged */) {
                    for (const d of this._dependencies) {
                        /** might call {@link handleChange} indirectly, which could make us stale */
                        d.reportChanges();
                        if (this._state === 2 /* DerivedState.stale */) {
                            // The other dependencies will refresh on demand, so early break
                            break;
                        }
                    }
                }
                // We called report changes of all dependencies.
                // If we are still not stale, we can assume to be up to date again.
                if (this._state === 1 /* DerivedState.dependenciesMightHaveChanged */) {
                    this._state = 3 /* DerivedState.upToDate */;
                }
                if (this._state !== 3 /* DerivedState.upToDate */) {
                    this._recompute();
                }
                // In case recomputation changed one of our dependencies, we need to recompute again.
            } while (this._state !== 3 /* DerivedState.upToDate */);
            return this._value;
        }
    }
    _recompute() {
        let didChange = false;
        this._isComputing = true;
        this._didReportChange = false;
        const emptySet = this._dependenciesToBeRemoved;
        this._dependenciesToBeRemoved = this._dependencies;
        this._dependencies = emptySet;
        try {
            const changeSummary = this._changeSummary;
            this._isReaderValid = true;
            if (this._changeTracker) {
                this._isInBeforeUpdate = true;
                this._changeTracker.beforeUpdate?.(this, changeSummary);
                this._isInBeforeUpdate = false;
                this._changeSummary = this._changeTracker?.createChangeSummary(changeSummary);
            }
            const hadValue = this._state !== 0 /* DerivedState.initial */;
            const oldValue = this._value;
            this._state = 3 /* DerivedState.upToDate */;
            const delayedStore = this._delayedStore;
            if (delayedStore !== undefined) {
                this._delayedStore = undefined;
            }
            try {
                if (this._store !== undefined) {
                    this._store.dispose();
                    this._store = undefined;
                }
                /** might call {@link handleChange} indirectly, which could invalidate us */
                this._value = this._computeFn(this, changeSummary);
            }
            finally {
                this._isReaderValid = false;
                // We don't want our observed observables to think that they are (not even temporarily) not being observed.
                // Thus, we only unsubscribe from observables that are definitely not read anymore.
                for (const o of this._dependenciesToBeRemoved) {
                    o.removeObserver(this);
                }
                this._dependenciesToBeRemoved.clear();
                if (delayedStore !== undefined) {
                    delayedStore.dispose();
                }
            }
            didChange = this._didReportChange || (hadValue && !(this._equalityComparator(oldValue, this._value)));
            getLogger()?.handleObservableUpdated(this, {
                oldValue,
                newValue: this._value,
                change: undefined,
                didChange,
                hadValue,
            });
        }
        catch (e) {
            onBugIndicatingError(e);
        }
        this._isComputing = false;
        if (!this._didReportChange && didChange) {
            for (const r of this._observers) {
                r.handleChange(this, undefined);
            }
        }
        else {
            this._didReportChange = false;
        }
    }
    toString() {
        return `LazyDerived<${this.debugName}>`;
    }
    // IObserver Implementation
    beginUpdate(_observable) {
        if (this._isUpdating) {
            throw new BugIndicatingError('Cyclic deriveds are not supported yet!');
        }
        this._updateCount++;
        this._isUpdating = true;
        try {
            const propagateBeginUpdate = this._updateCount === 1;
            if (this._state === 3 /* DerivedState.upToDate */) {
                this._state = 1 /* DerivedState.dependenciesMightHaveChanged */;
                // If we propagate begin update, that will already signal a possible change.
                if (!propagateBeginUpdate) {
                    for (const r of this._observers) {
                        r.handlePossibleChange(this);
                    }
                }
            }
            if (propagateBeginUpdate) {
                for (const r of this._observers) {
                    r.beginUpdate(this); // This signals a possible change
                }
            }
        }
        finally {
            this._isUpdating = false;
        }
    }
    endUpdate(_observable) {
        this._updateCount--;
        if (this._updateCount === 0) {
            // End update could change the observer list.
            const observers = [...this._observers];
            for (const r of observers) {
                r.endUpdate(this);
            }
            if (this._removedObserverToCallEndUpdateOn) {
                const observers = [...this._removedObserverToCallEndUpdateOn];
                this._removedObserverToCallEndUpdateOn = null;
                for (const r of observers) {
                    r.endUpdate(this);
                }
            }
        }
        assertFn(() => this._updateCount >= 0);
    }
    handlePossibleChange(observable) {
        // In all other states, observers already know that we might have changed.
        if (this._state === 3 /* DerivedState.upToDate */ && this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable)) {
            this._state = 1 /* DerivedState.dependenciesMightHaveChanged */;
            for (const r of this._observers) {
                r.handlePossibleChange(this);
            }
        }
    }
    handleChange(observable, change) {
        if (this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable) || this._isInBeforeUpdate) {
            getLogger()?.handleDerivedDependencyChanged(this, observable, change);
            let shouldReact = false;
            try {
                shouldReact = this._changeTracker ? this._changeTracker.handleChange({
                    changedObservable: observable,
                    change,
                    // eslint-disable-next-line local/code-no-any-casts
                    didChange: (o) => o === observable,
                }, this._changeSummary) : true;
            }
            catch (e) {
                onBugIndicatingError(e);
            }
            const wasUpToDate = this._state === 3 /* DerivedState.upToDate */;
            if (shouldReact && (this._state === 1 /* DerivedState.dependenciesMightHaveChanged */ || wasUpToDate)) {
                this._state = 2 /* DerivedState.stale */;
                if (wasUpToDate) {
                    for (const r of this._observers) {
                        r.handlePossibleChange(this);
                    }
                }
            }
        }
    }
    // IReader Implementation
    _ensureReaderValid() {
        if (!this._isReaderValid) {
            throw new BugIndicatingError('The reader object cannot be used outside its compute function!');
        }
    }
    readObservable(observable) {
        this._ensureReaderValid();
        // Subscribe before getting the value to enable caching
        observable.addObserver(this);
        /** This might call {@link handleChange} indirectly, which could invalidate us */
        const value = observable.get();
        // Which is why we only add the observable to the dependencies now.
        this._dependencies.add(observable);
        this._dependenciesToBeRemoved.delete(observable);
        return value;
    }
    reportChange(change) {
        this._ensureReaderValid();
        this._didReportChange = true;
        // TODO add logging
        for (const r of this._observers) {
            r.handleChange(this, change);
        }
    }
    get store() {
        this._ensureReaderValid();
        if (this._store === undefined) {
            this._store = new DisposableStore();
        }
        return this._store;
    }
    get delayedStore() {
        this._ensureReaderValid();
        if (this._delayedStore === undefined) {
            this._delayedStore = new DisposableStore();
        }
        return this._delayedStore;
    }
    addObserver(observer) {
        const shouldCallBeginUpdate = !this._observers.has(observer) && this._updateCount > 0;
        super.addObserver(observer);
        if (shouldCallBeginUpdate) {
            if (!this._removedObserverToCallEndUpdateOn?.delete(observer)) {
                observer.beginUpdate(this);
            }
        }
    }
    removeObserver(observer) {
        if (this._observers.has(observer) && this._updateCount > 0) {
            if (!this._removedObserverToCallEndUpdateOn) {
                this._removedObserverToCallEndUpdateOn = new Set();
            }
            this._removedObserverToCallEndUpdateOn.add(observer);
        }
        super.removeObserver(observer);
    }
    debugGetState() {
        return {
            state: this._state,
            stateStr: derivedStateToString(this._state),
            updateCount: this._updateCount,
            isComputing: this._isComputing,
            dependencies: this._dependencies,
            value: this._value,
        };
    }
    debugSetValue(newValue) {
        // eslint-disable-next-line local/code-no-any-casts
        this._value = newValue;
    }
    debugRecompute() {
        this.beginUpdate(this);
        try {
            if (!this._isComputing) {
                this._recompute();
            }
            else {
                this._state = 2 /* DerivedState.stale */;
            }
        }
        finally {
            this.endUpdate(this);
        }
    }
    setValue(newValue, tx, change) {
        this._value = newValue;
        const observers = this._observers;
        tx.updateObserver(this, this);
        for (const d of observers) {
            d.handleChange(this, change);
        }
    }
}
export class DerivedWithSetter extends Derived {
    constructor(debugNameData, computeFn, changeTracker, handleLastObserverRemoved = undefined, equalityComparator, set, debugLocation) {
        super(debugNameData, computeFn, changeTracker, handleLastObserverRemoved, equalityComparator, debugLocation);
        this.set = set;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVyaXZlZEltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvb2JzZXJ2YWJsZXMvZGVyaXZlZEltcGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXJELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxlQUFlLEVBQW9CLFFBQVEsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ2hJLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQVdsRCxNQUFNLENBQU4sSUFBa0IsWUFvQmpCO0FBcEJELFdBQWtCLFlBQVk7SUFDN0IsNkRBQTZEO0lBQzdELHFEQUFXLENBQUE7SUFFWDs7O09BR0c7SUFDSCwrRkFBZ0MsQ0FBQTtJQUVoQzs7O09BR0c7SUFDSCxpREFBUyxDQUFBO0lBRVQ7O09BRUc7SUFDSCx1REFBWSxDQUFBO0FBQ2IsQ0FBQyxFQXBCaUIsWUFBWSxLQUFaLFlBQVksUUFvQjdCO0FBRUQsU0FBUyxvQkFBb0IsQ0FBQyxLQUFtQjtJQUNoRCxRQUFRLEtBQUssRUFBRSxDQUFDO1FBQ2YsaUNBQXlCLENBQUMsQ0FBQyxPQUFPLFNBQVMsQ0FBQztRQUM1QyxzREFBOEMsQ0FBQyxDQUFDLE9BQU8sOEJBQThCLENBQUM7UUFDdEYsK0JBQXVCLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQztRQUN4QyxrQ0FBMEIsQ0FBQyxDQUFDLE9BQU8sVUFBVSxDQUFDO1FBQzlDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sV0FBVyxDQUFDO0lBQzdCLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxPQUFPLE9BQWlELFNBQVEsY0FBMEI7SUFnQi9GLElBQW9CLFNBQVM7UUFDNUIsT0FBTyxJQUFJLENB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
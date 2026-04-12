/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DisposableStore, strictEquals } from '../commonFacade/deps.js';
import { DebugLocation } from '../debugLocation.js';
import { DebugNameData } from '../debugName.js';
import { _setDerivedOpts } from './baseObservable.js';
import { Derived, DerivedWithSetter } from './derivedImpl.js';
export function derived(computeFnOrOwner, computeFn, debugLocation = DebugLocation.ofCaller()) {
    if (computeFn !== undefined) {
        return new Derived(new DebugNameData(computeFnOrOwner, undefined, computeFn), computeFn, undefined, undefined, strictEquals, debugLocation);
    }
    return new Derived(
    // eslint-disable-next-line local/code-no-any-casts
    new DebugNameData(undefined, undefined, computeFnOrOwner), 
    // eslint-disable-next-line local/code-no-any-casts
    computeFnOrOwner, undefined, undefined, strictEquals, debugLocation);
}
export function derivedWithSetter(owner, computeFn, setter, debugLocation = DebugLocation.ofCaller()) {
    return new DerivedWithSetter(new DebugNameData(owner, undefined, computeFn), computeFn, undefined, undefined, strictEquals, setter, debugLocation);
}
export function derivedOpts(options, computeFn, debugLocation = DebugLocation.ofCaller()) {
    return new Derived(new DebugNameData(options.owner, options.debugName, options.debugReferenceFn), computeFn, undefined, options.onLastObserverRemoved, options.equalsFn ?? strictEquals, debugLocation);
}
_setDerivedOpts(derivedOpts);
/**
 * Represents an observable that is derived from other observables.
 * The value is only recomputed when absolutely needed.
 *
 * {@link computeFn} should start with a JS Doc using `@description` to name the derived.
 *
 * Use `createEmptyChangeSummary` to create a "change summary" that can collect the changes.
 * Use `handleChange` to add a reported change to the change summary.
 * The compute function is given the last change summary.
 * The change summary is discarded after the compute function was called.
 *
 * @see derived
 */
export function derivedHandleChanges(options, computeFn, debugLocation = DebugLocation.ofCaller()) {
    return new Derived(new DebugNameData(options.owner, options.debugName, undefined), computeFn, options.changeTracker, undefined, options.equalityComparer ?? strictEquals, debugLocation);
}
export function derivedWithStore(computeFnOrOwner, computeFnOrUndefined, debugLocation = DebugLocation.ofCaller()) {
    let computeFn;
    let owner;
    if (computeFnOrUndefined === undefined) {
        // eslint-disable-next-line local/code-no-any-casts
        computeFn = computeFnOrOwner;
        owner = undefined;
    }
    else {
        owner = computeFnOrOwner;
        // eslint-disable-next-line local/code-no-any-casts
        computeFn = computeFnOrUndefined;
    }
    // Intentionally re-assigned in case an inactive observable is re-used later
    // eslint-disable-next-line local/code-no-potentially-unsafe-disposables
    let store = new DisposableStore();
    return new Derived(new DebugNameData(owner, undefined, computeFn), r => {
        if (store.isDisposed) {
            store = new DisposableStore();
        }
        else {
            store.clear();
        }
        return computeFn(r, store);
    }, undefined, () => store.dispose(), strictEquals, debugLocation);
}
export function derivedDisposable(computeFnOrOwner, computeFnOrUndefined, debugLocation = DebugLocation.ofCaller()) {
    let computeFn;
    let owner;
    if (computeFnOrUndefined === undefined) {
        // eslint-disable-next-line local/code-no-any-casts
        computeFn = computeFnOrOwner;
        owner = undefined;
    }
    else {
        owner = computeFnOrOwner;
        // eslint-disable-next-line local/code-no-any-casts
        computeFn = computeFnOrUndefined;
    }
    let store = undefined;
    return new Derived(new DebugNameData(owner, undefined, computeFn), r => {
        if (!store) {
            store = new DisposableStore();
        }
        else {
            store.clear();
        }
        const result = computeFn(r);
        if (result) {
            store.add(result);
        }
        return result;
    }, undefined, () => {
        if (store) {
            store.dispose();
            store = undefined;
        }
    }, strictEquals, debugLocation);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVyaXZlZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9vYnNlcnZhYmxlcy9kZXJpdmVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxlQUFlLEVBQWlDLFlBQVksRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNwRCxPQUFPLEVBQWMsYUFBYSxFQUFrQixNQUFNLGlCQUFpQixDQUFDO0FBQzVFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUN0RCxPQUFPLEVBQWtCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBVTlFLE1BQU0sVUFBVSxPQUFPLENBQ3RCLGdCQUF1RSxFQUN2RSxTQUFnRSxFQUNoRSxhQUFhLEdBQUcsYUFBYSxDQUFDLFFBQVEsRUFBRTtJQUV4QyxJQUFJLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUM3QixPQUFPLElBQUksT0FBTyxDQUNqQixJQUFJLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLEVBQ3pELFNBQVMsRUFDVCxTQUFTLEVBQ1QsU0FBUyxFQUNULFlBQVksRUFDWixhQUFhLENBQ2IsQ0FBQztJQUNILENBQUM7SUFDRCxPQUFPLElBQUksT0FBTztJQUNqQixtREFBbUQ7SUFDbkQsSUFBSSxhQUFhLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxnQkFBdUIsQ0FBQztJQUNoRSxtREFBbUQ7SUFDbkQsZ0JBQXVCLEVBQ3ZCLFNBQVMsRUFDVCxTQUFTLEVBQ1QsWUFBWSxFQUNaLGFBQWEsQ0FDYixDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sVUFBVSxpQkFBaUIsQ0FBSSxL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
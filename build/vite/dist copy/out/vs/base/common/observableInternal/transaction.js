/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { handleBugIndicatingErrorRecovery } from './base.js';
import { getFunctionName } from './debugName.js';
import { getLogger } from './logging/logging.js';
/**
 * Starts a transaction in which many observables can be changed at once.
 * {@link fn} should start with a JS Doc using `@description` to give the transaction a debug name.
 * Reaction run on demand or when the transaction ends.
 */
export function transaction(fn, getDebugName) {
    const tx = new TransactionImpl(fn, getDebugName);
    try {
        fn(tx);
    }
    finally {
        tx.finish();
    }
}
let _globalTransaction = undefined;
export function globalTransaction(fn) {
    if (_globalTransaction) {
        fn(_globalTransaction);
    }
    else {
        const tx = new TransactionImpl(fn, undefined);
        _globalTransaction = tx;
        try {
            fn(tx);
        }
        finally {
            tx.finish(); // During finish, more actions might be added to the transaction.
            // Which is why we only clear the global transaction after finish.
            _globalTransaction = undefined;
        }
    }
}
/** @deprecated */
export async function asyncTransaction(fn, getDebugName) {
    const tx = new TransactionImpl(fn, getDebugName);
    try {
        await fn(tx);
    }
    finally {
        tx.finish();
    }
}
/**
 * Allows to chain transactions.
 */
export function subtransaction(tx, fn, getDebugName) {
    if (!tx) {
        transaction(fn, getDebugName);
    }
    else {
        fn(tx);
    }
}
export class TransactionImpl {
    constructor(_fn, _getDebugName) {
        this._fn = _fn;
        this._getDebugName = _getDebugName;
        this._updatingObservers = [];
        getLogger()?.handleBeginTransaction(this);
    }
    getDebugName() {
        if (this._getDebugName) {
            return this._getDebugName();
        }
        return getFunctionName(this._fn);
    }
    updateObserver(observer, observable) {
        if (!this._updatingObservers) {
            // This happens when a transaction is used in a callback or async function.
            // If an async transaction is used, make sure the promise awaits all users of the transaction (e.g. no race).
            handleBugIndicatingErrorRecovery('Transaction already finished!');
            // Error recovery
            transaction(tx => {
                tx.updateObserver(observer, observable);
            });
            return;
        }
        // When this gets called while finish is active, they will still get considered
        this._updatingObservers.push({ observer, observable });
        observer.beginUpdate(observable);
    }
    finish() {
        const updatingObservers = this._updatingObservers;
        if (!updatingObservers) {
            handleBugIndicatingErrorRecovery('transaction.finish() has already been called!');
            return;
        }
        for (let i = 0; i < updatingObservers.length; i++) {
            const { observer, observable } = updatingObservers[i];
            observer.endUpdate(observable);
        }
        // Prevent anyone from updating observers from now on.
        this._updatingObservers = null;
        getLogger()?.handleEndTransaction(this);
    }
    debugGetUpdatingObservers() {
        return this._updatingObservers;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNhY3Rpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvdHJhbnNhY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGdDQUFnQyxFQUF3QyxNQUFNLFdBQVcsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDakQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRWpEOzs7O0dBSUc7QUFFSCxNQUFNLFVBQVUsV0FBVyxDQUFDLEVBQThCLEVBQUUsWUFBMkI7SUFDdEYsTUFBTSxFQUFFLEdBQUcsSUFBSSxlQUFlLENBQUMsRUFBRSxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ2pELElBQUksQ0FBQztRQUNKLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNSLENBQUM7WUFBUyxDQUFDO1FBQ1YsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ2IsQ0FBQztBQUNGLENBQUM7QUFDRCxJQUFJLGtCQUFrQixHQUE2QixTQUFTLENBQUM7QUFFN0QsTUFBTSxVQUFVLGlCQUFpQixDQUFDLEVBQThCO0lBQy9ELElBQUksa0JBQWtCLEVBQUUsQ0FBQztRQUN4QixFQUFFLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUN4QixDQUFDO1NBQU0sQ0FBQztRQUNQLE1BQU0sRUFBRSxHQUFHLElBQUksZUFBZSxDQUFDLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM5QyxrQkFBa0IsR0FBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDO1lBQ0osRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ1IsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsaUVBQWlF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
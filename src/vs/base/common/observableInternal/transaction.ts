/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { handleBugIndicatingErrorRecovery, IObservable, IObserver, ITransaction } from './base.js';
import { getFunctionName } from './debugName.js';
import { getLogger } from './logging/logging.js';

/**
 * Starts a transaction in which many observables can be changed at once.
 * {@link fn} should start with a JS Doc using `@description` to give the transaction a debug name.
 * Reaction run on demand or when the transaction ends.
 */

export function transaction(fn: (tx: ITransaction) => void, getDebugName?: () => string): void {
	const tx = new TransactionImpl(fn, getDebugName);
	try {
		fn(tx);
	} finally {
		tx.finish();
	}
}
let _globalTransaction: ITransaction | undefined = undefined;

export function globalTransaction(fn: (tx: ITransaction) => void) {
	if (_globalTransaction) {
		fn(_globalTransaction);
	} else {
		const tx = new TransactionImpl(fn, undefined);
		_globalTransaction = tx;
		try {
			fn(tx);
		} finally {
			tx.finish(); // During finish, more actions might be added to the transaction.

			// Which is why we only clear the global transaction after finish.
			_globalTransaction = undefined;
		}
	}
}
/** @deprecated */

export async function asyncTransaction(fn: (tx: ITransaction) => Promise<void>, getDebugName?: () => string): Promise<void> {
	const tx = new TransactionImpl(fn, getDebugName);
	try {
		await fn(tx);
	} finally {
		tx.finish();
	}
}
/**
 * Allows to chain transactions.
 */

export function subtransaction(tx: ITransaction | undefined, fn: (tx: ITransaction) => void, getDebugName?: () => string): void {
	if (!tx) {
		transaction(fn, getDebugName);
	} else {
		fn(tx);
	}
} export class TransactionImpl implements ITransaction {
	private _updatingObservers: { observer: IObserver; observable: IObservable<any> }[] | null = [];

	constructor(public readonly _fn: Function, private readonly _getDebugName?: () => string) {
		getLogger()?.handleBeginTransaction(this);
	}

	public getDebugName(): string | undefined {
		if (this._getDebugName) {
			return this._getDebugName();
		}
		return getFunctionName(this._fn);
	}

	public updateObserver(observer: IObserver, observable: IObservable<any>): void {
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

	public finish(): void {
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

	public debugGetUpdatingObservers() {
		return this._updatingObservers;
	}
}


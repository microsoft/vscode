/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader, IObservable } from '../base.js';
import { DebugOwner, DebugNameData } from '../debugName.js';
import { CancellationError, CancellationToken, CancellationTokenSource } from '../commonFacade/cancellation.js';
import { strictEquals } from '../commonFacade/deps.js';
import { autorun } from '../reactions/autorun.js';
import { Derived } from '../observables/derivedImpl.js';
import { DebugLocation } from '../debugLocation.js';

/**
 * Resolves the promise when the observables state matches the predicate.
 */
export function waitForState<T>(observable: IObservable<T | null | undefined>): Promise<T>;
export function waitForState<T, TState extends T>(observable: IObservable<T>, predicate: (state: T) => state is TState, isError?: (state: T) => boolean | unknown | undefined, cancellationToken?: CancellationToken): Promise<TState>;
export function waitForState<T>(observable: IObservable<T>, predicate: (state: T) => boolean, isError?: (state: T) => boolean | unknown | undefined, cancellationToken?: CancellationToken): Promise<T>;
export function waitForState<T>(observable: IObservable<T>, predicate?: (state: T) => boolean, isError?: (state: T) => boolean | unknown | undefined, cancellationToken?: CancellationToken): Promise<T> {
	if (!predicate) {
		predicate = state => state !== null && state !== undefined;
	}
	return new Promise((resolve, reject) => {
		let isImmediateRun = true;
		let shouldDispose = false;
		const stateObs = observable.map(state => {
			/** @description waitForState.state */
			return {
				isFinished: predicate(state),
				error: isError ? isError(state) : false,
				state
			};
		});
		const d = autorun(reader => {
			/** @description waitForState */
			const { isFinished, error, state } = stateObs.read(reader);
			if (isFinished || error) {
				if (isImmediateRun) {
					// The variable `d` is not initialized yet
					shouldDispose = true;
				} else {
					d.dispose();
				}
				if (error) {
					reject(error === true ? state : error);
				} else {
					resolve(state);
				}
			}
		});
		if (cancellationToken) {
			const dc = cancellationToken.onCancellationRequested(() => {
				d.dispose();
				dc.dispose();
				reject(new CancellationError());
			});
			if (cancellationToken.isCancellationRequested) {
				d.dispose();
				dc.dispose();
				reject(new CancellationError());
				return;
			}
		}
		isImmediateRun = false;
		if (shouldDispose) {
			d.dispose();
		}
	});
}

export function derivedWithCancellationToken<T>(computeFn: (reader: IReader, cancellationToken: CancellationToken) => T): IObservable<T>;
export function derivedWithCancellationToken<T>(owner: object, computeFn: (reader: IReader, cancellationToken: CancellationToken) => T): IObservable<T>;
export function derivedWithCancellationToken<T>(computeFnOrOwner: ((reader: IReader, cancellationToken: CancellationToken) => T) | object, computeFnOrUndefined?: ((reader: IReader, cancellationToken: CancellationToken) => T)): IObservable<T> {
	let computeFn: (reader: IReader, store: CancellationToken) => T;
	let owner: DebugOwner;
	if (computeFnOrUndefined === undefined) {
		// eslint-disable-next-line local/code-no-any-casts
		computeFn = computeFnOrOwner as any;
		owner = undefined;
	} else {
		owner = computeFnOrOwner;
		// eslint-disable-next-line local/code-no-any-casts
		computeFn = computeFnOrUndefined as any;
	}

	let cancellationTokenSource: CancellationTokenSource | undefined = undefined;
	return new Derived(
		new DebugNameData(owner, undefined, computeFn),
		r => {
			if (cancellationTokenSource) {
				cancellationTokenSource.dispose(true);
			}
			cancellationTokenSource = new CancellationTokenSource();
			return computeFn(r, cancellationTokenSource.token);
		}, undefined,
		() => cancellationTokenSource?.dispose(),
		strictEquals,
		DebugLocation.ofCaller()
	);
}

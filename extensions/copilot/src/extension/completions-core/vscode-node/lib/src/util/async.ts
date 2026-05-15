/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deferred promise implementation to enable delayed promise resolution.
 * Note: in Node 22+ this can be replaced with Promise.withResolvers.
 */
export class Deferred<T> {
	resolve: (value: T | PromiseLike<T>) => void = () => { };
	reject: (reason?: unknown) => void = () => { };

	readonly promise: Promise<T> = new Promise((resolve, reject) => {
		this.resolve = resolve;
		this.reject = reject;
	});
}

/**
 * Returns a promise that resolves after a delay, optionally with a value.
 * Equivalent to node:timers/promises setTimeout without node dependency.
 */
export function delay<T>(ms: number, value: T): Promise<T>;
export function delay(ms: number): Promise<void>;
export function delay(ms: number, value = undefined) {
	return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

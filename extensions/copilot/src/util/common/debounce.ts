/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type DebounceState = {
	timer: any;
	reject: (reason?: any) => void;
};

/**
 * Debouncer class for async code.
 *
 * Implements "trailing" debouncing as described here:
 * https://css-tricks.com/debouncing-throttling-explained-examples/#aa-debounce
 *
 * For a given instance of this class, at most one call to `debounce` can be
 * in progress at a time. A subsequent call will trigger rejection of the promise returned
 * by the previous call.
 */
export class Debouncer {
	private state: DebounceState | undefined;

	/**
	 * Wait for the specified number of milliseconds, then resolve.
	 * Rejects if another call is made to `debounce` on this object in the meantime.
	 */
	public async debounce(ms: number): Promise<void> {
		if (this.state) {
			clearTimeout(this.state.timer);
			this.state.reject();
			this.state = undefined;
		}
		return new Promise<void>((resolve, reject) => {
			this.state = {
				timer: setTimeout(() => resolve(), ms),
				reject,
			};
		});
	}
}

/** Debounce function for sync functions */
export function debounce<T extends (...args: any[]) => any>(
	ms: number,
	callback: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
	let timer: any | undefined;

	return (...args: Parameters<T>) => {
		if (timer) {
			clearTimeout(timer);
		}
		return new Promise<ReturnType<T>>(resolve => {
			timer = setTimeout(() => {
				const returnValue = callback(...args) as ReturnType<T>;
				resolve(returnValue);
			}, ms);
		});
	};
}

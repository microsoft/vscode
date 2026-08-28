/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Disposable } from 'vscode';

/**
 * Adaptive debounce class that starts with a short delay and increases
 * the debounce time for subsequent events until reaching a maximum threshold.
 */
export class ThrottledDebouncer implements Disposable {

	private static readonly INITIAL_DELAY = 100;
	private static readonly DELAY_INCREMENT = 10;
	private static readonly MAX_DELAY = 500;

	private timeoutId: TimeoutHandle | undefined;
	private currentDelay: number;
	private readonly initialDelay: number;
	private readonly increment: number;
	private readonly maxDelay: number;

	constructor(initialDelay: number = ThrottledDebouncer.INITIAL_DELAY, increment: number = ThrottledDebouncer.DELAY_INCREMENT, maxDelay: number = ThrottledDebouncer.MAX_DELAY) {
		this.currentDelay = initialDelay;
		this.initialDelay = initialDelay;
		this.increment = increment;
		this.maxDelay = maxDelay;
	}

	/**
	 * Triggers the debounced function. If called again before the current
	 * debounce period expires, it will cancel the previous call and schedule
	 * a new one with an increased delay.
	 *
	 * @param fn The function to execute after the debounce period
	 * @param args The arguments to pass to the function
	 */
	public trigger<T extends unknown[]>(fn: (...args: T) => void, ...args: T): void {
		// Cancel any existing timeout
		if (this.timeoutId !== undefined) {
			clearTimeout(this.timeoutId);
			// Increase delay for subsequent events, up to the maximum
			this.currentDelay = Math.min(
				this.currentDelay + this.increment,
				this.maxDelay
			);
		}

		// Schedule the function to run after the current delay
		this.timeoutId = setTimeout(() => {
			this.timeoutId = undefined;
			this.currentDelay = this.initialDelay; // Reset delay after execution
			fn(...args);
		}, this.currentDelay);
	}

	/**
	 * Cancels any pending debounced function call and resets the delay.
	 */
	public cancel(): void {
		if (this.timeoutId !== undefined) {
			clearTimeout(this.timeoutId);
			this.timeoutId = undefined;
		}
		this.currentDelay = this.initialDelay;
	}

	/**
	 * Returns whether there is a pending debounced function call.
	 */
	public get isPending(): boolean {
		return this.timeoutId !== undefined;
	}

	/**
	 * Returns the current debounce delay in milliseconds.
	 */
	public get getCurrentDelay(): number {
		return this.currentDelay;
	}

	/**
	 * Disposes of the debounce instance, canceling any pending calls.
	 */
	public dispose(): void {
		this.cancel();
	}
}

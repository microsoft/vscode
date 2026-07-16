/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// perf-benchmark-marker

/**
 * Fixture for chat-simulation benchmarks.
 * Simplified from src/vs/base/common/event.ts for stable perf testing.
 */

import { IDisposable, DisposableStore } from './lifecycle';

export interface Event<T> {
	(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

export namespace Event {
	export const None: Event<any> = () => ({ dispose() { } });

	export function once<T>(event: Event<T>): Event<T> {
		return (listener, thisArgs?, disposables?) => {
			let didFire = false;
			const result = event(e => {
				if (didFire) { return; }
				didFire = true;
				return listener.call(thisArgs, e);
			}, null, disposables);
			if (didFire) { result.dispose(); }
			return result;
		};
	}

	export function map<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
		return (listener, thisArgs?, disposables?) =>
			event(i => listener.call(thisArgs, map(i)), null, disposables);
	}

	export function filter<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
		return (listener, thisArgs?, disposables?) =>
			event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
	}

	export function debounce<T>(event: Event<T>, merge: (last: T | undefined, e: T) => T, delay: number = 100): Event<T> {
		let subscription: IDisposable;
		let output: T | undefined;
		let handle: any;
		return (listener, thisArgs?, disposables?) => {
			subscription = event(cur => {
				output = merge(output, cur);
				clearTimeout(handle);
				handle = setTimeout(() => {
					const e = output!;
					output = undefined;
					listener.call(thisArgs, e);
				}, delay);
			});
			return { dispose() { subscription.dispose(); clearTimeout(handle); } };
		};
	}
}

export class Emitter<T> {
	private readonly _listeners = new Set<(e: T) => void>();
	private _disposed = false;

	readonly event: Event<T> = (listener: (e: T) => void) => {
		if (this._disposed) { return { dispose() { } }; }
		this._listeners.add(listener);
		return {
			dispose: () => { this._listeners.delete(listener); }
		};
	};

	fire(event: T): void {
		if (this._disposed) { return; }
		for (const listener of [...this._listeners]) {
			try { listener(event); } catch { }
		}
	}

	dispose(): void {
		if (this._disposed) { return; }
		this._disposed = true;
		this._listeners.clear();
	}

	get hasListeners(): boolean { return this._listeners.size > 0; }
}

export class PauseableEmitter<T> extends Emitter<T> {
	private _isPaused = false;
	private _queue: T[] = [];

	pause(): void { this._isPaused = true; }

	resume(): void {
		this._isPaused = false;
		while (this._queue.length > 0) {
			super.fire(this._queue.shift()!);
		}
	}

	override fire(event: T): void {
		if (this._isPaused) { this._queue.push(event); }
		else { super.fire(event); }
	}
}

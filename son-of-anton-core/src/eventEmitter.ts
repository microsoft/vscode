/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Disposable } from './host';

/**
 * Listener registration function. Compatible with `vscode.Event<T>` so that
 * core code emitting these events can be consumed by extension code without
 * an adapter layer.
 */
export type Event<T> = (listener: (e: T) => unknown) => Disposable;

/**
 * Tiny typed event emitter. Mirrors the shape of `vscode.EventEmitter<T>`
 * (`event` + `fire(payload)` + `dispose()`) so we can lift code out of the
 * extension without rewriting each subscription site.
 *
 * Listener exceptions are caught and logged so a misbehaving subscriber
 * cannot cascade to siblings — matches VS Code's own emitter contract.
 */
export class TypedEventEmitter<T> {
	private listeners: Array<(e: T) => unknown> = [];
	private disposed = false;

	readonly event: Event<T> = (listener: (e: T) => unknown): Disposable => {
		if (this.disposed) {
			return { dispose: () => undefined };
		}
		this.listeners.push(listener);
		return {
			dispose: () => {
				const index = this.listeners.indexOf(listener);
				if (index >= 0) {
					this.listeners.splice(index, 1);
				}
			},
		};
	};

	fire(payload: T): void {
		if (this.disposed) {
			return;
		}
		// Snapshot — listeners may dispose themselves mid-fire.
		const snapshot = this.listeners.slice();
		for (const listener of snapshot) {
			try {
				listener(payload);
			} catch (err) {
				// eslint-disable-next-line no-console
				console.error('TypedEventEmitter listener threw:', err);
			}
		}
	}

	dispose(): void {
		this.disposed = true;
		this.listeners = [];
	}
}

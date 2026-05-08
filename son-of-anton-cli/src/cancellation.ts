/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationLike } from 'son-of-anton-core/dist/chatStream';
import type { Disposable } from 'son-of-anton-core/dist/host';

/**
 * Trivial `CancellationLike` implementation backed by an `AbortController`.
 * Lets the CLI hand a real cancellation channel to core agents that expect
 * the VS Code-shaped contract without dragging in `vscode` types.
 */
export class CliCancellation implements CancellationLike {
	private readonly listeners: Array<() => unknown> = [];
	private cancelled = false;

	get isCancellationRequested(): boolean {
		return this.cancelled;
	}

	onCancellationRequested(listener: () => unknown): Disposable {
		if (this.cancelled) {
			// Match VS Code behaviour: fire immediately if already cancelled.
			queueMicrotask(() => {
				try { listener(); } catch { /* swallow */ }
			});
		}
		this.listeners.push(listener);
		return {
			dispose: () => {
				const idx = this.listeners.indexOf(listener);
				if (idx >= 0) {
					this.listeners.splice(idx, 1);
				}
			},
		};
	}

	cancel(): void {
		if (this.cancelled) {
			return;
		}
		this.cancelled = true;
		for (const listener of [...this.listeners]) {
			try { listener(); } catch { /* swallow */ }
		}
	}
}

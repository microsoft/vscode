/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';

interface IPendingNotificationToast<T> {
	item: T;
	readonly disposables: DisposableStore;
	cleanupScheduled: boolean;
}

export class PendingNotificationToasts<T> implements IDisposable {

	private readonly pendingToasts = new Set<IPendingNotificationToast<T>>();

	constructor(
		private readonly isCurrent: (item: T) => boolean,
		private readonly equals: (item: T, other: T) => boolean,
		private readonly scheduler: (callback: () => void) => IDisposable
	) { }

	tryReplace(item: T): boolean {
		for (const pendingToast of this.pendingToasts) {
			if (this.equals(pendingToast.item, item)) {
				pendingToast.item = item;
				return true;
			}
		}

		return false;
	}

	add(item: T, render: (item: T, disposables: DisposableStore) => void): void {
		const disposables = new DisposableStore();
		const pendingToast: IPendingNotificationToast<T> = { item, disposables, cleanupScheduled: false };
		this.pendingToasts.add(pendingToast);
		disposables.add(toDisposable(() => this.pendingToasts.delete(pendingToast)));
		// Defer toast creation to avoid animation work while the renderer is busy (#107935).
		disposables.add(this.scheduler(() => {
			const pendingItem = pendingToast.item;
			if (!this.isCurrent(pendingItem)) {
				disposables.dispose();
				return;
			}

			this.pendingToasts.delete(pendingToast);
			render(pendingItem, disposables);
		}));
	}

	remove(item: T): void {
		for (const pendingToast of this.pendingToasts) {
			if (pendingToast.item === item && !pendingToast.cleanupScheduled) {
				pendingToast.cleanupScheduled = true;
				// Allow a synchronous duplicate ADD to retarget the pending toast before cleanup.
				queueMicrotask(() => {
					pendingToast.cleanupScheduled = false;
					if (this.pendingToasts.has(pendingToast) && !this.isCurrent(pendingToast.item)) {
						pendingToast.disposables.dispose();
					}
				});
				break;
			}
		}
	}

	clear(): void {
		for (const pendingToast of this.pendingToasts) {
			pendingToast.disposables.dispose();
		}
		this.pendingToasts.clear();
	}

	dispose(): void {
		this.clear();
	}
}

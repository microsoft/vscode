/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, IDisposableTracker, setDisposableTracker } from '../../common/lifecycle.js';

class DisposableTracker implements IDisposableTracker {
	allDisposables: [IDisposable, string][] = [];
	trackDisposable(x: IDisposable): void {
		this.allDisposables.push([x, new Error().stack!]);
	}
	setParent(child: IDisposable, parent: IDisposable): void {
		for (let idx = 0; idx < this.allDisposables.length; idx++) {
			if (this.allDisposables[idx][0] === child) {
				this.allDisposables.splice(idx, 1);
				return;
			}
		}
	}
	markAsDisposed(x: IDisposable): void {
		for (let idx = 0; idx < this.allDisposables.length; idx++) {
			if (this.allDisposables[idx][0] === x) {
				this.allDisposables.splice(idx, 1);
				return;
			}
		}
	}
	markAsSingleton(disposable: IDisposable): void {
		// noop
	}
}

let currentTracker: DisposableTracker | null = null;

export function beginTrackingDisposables(): void {
	currentTracker = new DisposableTracker();
	setDisposableTracker(currentTracker);
}

export function endTrackingDisposables(): void {
	if (currentTracker) {
		setDisposableTracker(null);
		console.log(currentTracker.allDisposables.map(e => `${e[0]}\n${e[1]}`).join('\n\n'));
		currentTracker = null;
	}
}

export function beginLoggingFS(withStacks: boolean = false): void {
	(<any>self).beginLoggingFS?.(withStacks);
}

export function endLoggingFS(): void {
	(<any>self).endLoggingFS?.();
}

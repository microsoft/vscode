/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable2, IDisposableTracker, setDisposableTracker } from 'vs/base/common/lifecycle';

class DisposableTracker implements IDisposableTracker {
	allDisposables: [IDisposable2, string][] = [];
	trackDisposable(x: IDisposable2): void {
		this.allDisposables.push([x, new Error().stack!]);
	}
	markTracked(x: IDisposable2): void {
		for (let idx = 0; idx < this.allDisposables.length; idx++) {
			if (this.allDisposables[idx][0] === x) {
				this.allDisposables.splice(idx, 1);
				return;
			}
		}
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
		console.log(currentTracker!.allDisposables.map(e => `${e[0]}\n${e[1]}`).join('\n\n'));
		currentTracker = null;
	}
}

export function beginLoggingFS(withStacks: boolean = false): void {
	if ((<any>self).beginLoggingFS) {
		(<any>self).beginLoggingFS(withStacks);
	}
}

export function endLoggingFS(): void {
	if ((<any>self).endLoggingFS) {
		(<any>self).endLoggingFS();
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import * as path from '../../../base/common/path.js';

export class Win32UpdateAttempt {
	readonly cancellationTokenSource = new CancellationTokenSource();
	readonly updateFilePath: string;
	readonly cancelFilePath: string;
	readonly progressFilePath: string;
	private completed = false;

	constructor(cachePath: string, quality: string, version: string, readonly id: number) {
		this.updateFilePath = path.join(cachePath, `CodeSetup-${quality}-${version}-${id}.flag`);
		this.cancelFilePath = path.join(cachePath, `cancel-${id}.flag`);
		this.progressFilePath = path.join(cachePath, `update-progress-${id}`);
	}

	get isActive(): boolean {
		return !this.completed && !this.cancellationTokenSource.token.isCancellationRequested;
	}

	complete(): boolean {
		if (!this.isActive) {
			return false;
		}

		this.completed = true;
		this.cancellationTokenSource.dispose(true);
		return true;
	}
}

export function completeWin32UpdateAttempt(currentAttempt: Win32UpdateAttempt | undefined, candidate: Win32UpdateAttempt): boolean {
	return currentAttempt === candidate && candidate.complete();
}

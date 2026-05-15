/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Progress } from 'vscode';


/**
 * Sends the progress to report to the progress option if promise takes longer than time to wait
 * @param progress The progress object which receives the progressToReport item
 * @param progressToReport The progress being reported to the progressToReport item
 * @param promise The promise which is being executed
 * @param timeToWait The time to allow that promise to execute before firing off the progress
 * @returns The promise so that it may be externally awaited
 */
export async function reportProgressOnSlowPromise<T, P extends Promise<any>>(progress: Progress<T>, progressToReport: T, promise: P, timeToWait: number): Promise<Awaited<P>> {
	let timeoutId: any | null = null;
	let promiseResolved = false;

	// Start a timer
	timeoutId = setTimeout(() => {
		if (!promiseResolved) {
			// If the promise is not yet resolved or rejected, report the progress
			progress.report(progressToReport);
		}
	}, timeToWait);

	try {
		// Wait for the promise to resolve or reject
		const result = await promise;
		promiseResolved = true;
		return result;
	} finally {
		// If the timer is still running, clear it
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

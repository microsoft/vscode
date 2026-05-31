/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation, raceTimeout } from '../vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../vs/base/common/cancellation';
import { CancellationError } from '../vs/base/common/errors';

// sentinel value to indicate cancellation
const CANCELLED = Symbol('cancelled');

/**
 * Races a promise against a cancellation token and a timeout.
 * @param promiseGenerator A function that generates the promise to race against cancellation and timeout.
 * @param parentToken The cancellation token to use.
 * @param timeoutInMs The timeout in milliseconds.
 * @param timeoutMessage The message to use for the timeout error.
 * @returns The result of the promise if it completes before the timeout, or throws an error if it times out or is cancelled.
 */
export async function raceTimeoutAndCancellationError<T>(
	promiseGenerator: (cancellationToken: CancellationToken) => Promise<T>,
	parentToken: CancellationToken,
	timeoutInMs: number,
	timeoutMessage: string): Promise<T> {
	const cancellationSource = new CancellationTokenSource(parentToken);
	try {
		const result = await raceTimeout(raceCancellation(promiseGenerator(cancellationSource.token), cancellationSource.token, CANCELLED as T), timeoutInMs);

		if (result === CANCELLED) { // cancelled sentinel from raceCancellation
			throw new CancellationError();
		}

		if (result === undefined) { // timeout sentinel from raceTimeout
			// signal ongoing work to cancel in the promise
			cancellationSource.cancel();
			throw new Error(timeoutMessage);
		}

		return result;
	}
	finally {
		cancellationSource.dispose();
	}
}
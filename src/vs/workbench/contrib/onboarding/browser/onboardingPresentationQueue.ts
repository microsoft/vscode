/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, SequencerByKey } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';

const presentations = new SequencerByKey<Window>();

/** Serializes presentations within a window without sharing their scheduling or persistence. */
export function runWithOnboardingPresentation<T>(targetWindow: Window, token: CancellationToken, run: () => Promise<T>): Promise<T> {
	return raceCancellationError(presentations.queue(targetWindow, () => {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return run();
	}), token);
}

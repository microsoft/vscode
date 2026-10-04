/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';

export type GitHubCancellation = AbortSignal | CancellationToken;

/** Passes signals through and scopes any token adapter to the operation's lifetime. */
export function toAbortSignal(cancellation: GitHubCancellation, lifetime: DisposableStore): AbortSignal {
	if (!CancellationToken.isCancellationToken(cancellation)) {
		return cancellation;
	}

	const controller = new AbortController();
	if (cancellation.isCancellationRequested) {
		controller.abort(new CancellationError());
	} else {
		lifetime.add(cancellation.onCancellationRequested(() => controller.abort(new CancellationError())));
	}
	return controller.signal;
}

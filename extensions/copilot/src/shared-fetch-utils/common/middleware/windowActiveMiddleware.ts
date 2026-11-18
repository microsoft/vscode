/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FetchBlockedError, type FetchMiddleware, type WindowStateProvider } from '../fetchTypes';

export class WindowInactiveError extends FetchBlockedError {
	constructor() {
		super('Window is inactive', 60_000);
	}
}

/**
 * Prevents fetches while the window is inactive by throwing a
 * {@link WindowInactiveError}. Callers that cache the parsed value
 * (e.g. {@link FetchedValue}) will fall back to the last-good value
 * automatically because they handle {@link FetchBlockedError}.
 */
export function windowActiveMiddleware(provider: WindowStateProvider): FetchMiddleware {
	return (next) => async (request) => {
		if (!provider.isActive) {
			throw new WindowInactiveError();
		}
		return next(request);
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../common/cancellation.js';
import { DisposableStore } from '../../../common/lifecycle.js';

/** The lifetime must cover both the request and consumption of its response body. */
export type CancellableFetch = (input: RequestInfo | URL, init: Omit<RequestInit, 'signal'> | undefined, token: CancellationToken, lifetime: DisposableStore) => Promise<Response>;

export function createCancellableFetch(fetcher: typeof globalThis.fetch): CancellableFetch {
	return async (input, init, token, lifetime) => {
		CancellationToken.throwIfCanceled(token);
		return fetcher(input, {
			...init,
			signal: token === CancellationToken.None ? undefined : CancellationToken.toAbortSignal(token, lifetime),
		});
	};
}

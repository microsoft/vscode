/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FetchBlockedError, type FetchMiddleware } from '../fetchTypes';

export class AuthBlockedError extends FetchBlockedError {
	constructor(retryAfterMs: number) {
		super(`Auth token blocked for ${Math.round(retryAfterMs / 1000)}s after 401/403`, retryAfterMs);
	}
}

/**
 * After a `401` or `403` response, blocks the current auth token for
 * {@link blockDurationMs} (default 1 hour). Subsequent requests with
 * the same `Authorization` header are rejected immediately with an
 * {@link AuthBlockedError}. If the token changes (e.g. the user
 * re-authenticates) the block is cleared automatically.
 */
export function authBlockedMiddleware(
	blockDurationMs: number = 60 * 60 * 1000,
): FetchMiddleware {
	let blockedToken: string | undefined;
	let blockedUntil = 0;

	return (next) => async (request) => {
		const currentToken = request.headers['Authorization'] ?? request.headers['authorization'];

		// Token changed → clear block
		if (currentToken !== blockedToken) {
			blockedToken = undefined;
			blockedUntil = 0;
		}

		// Still blocked?
		if (currentToken && currentToken === blockedToken && Date.now() < blockedUntil) {
			throw new AuthBlockedError(blockedUntil - Date.now());
		}

		const response = await next(request);

		if ((response.status === 401 || response.status === 403) && currentToken) {
			blockedToken = currentToken;
			blockedUntil = Date.now() + blockDurationMs;
			throw new AuthBlockedError(blockDurationMs);
		}

		return response;
	};
}

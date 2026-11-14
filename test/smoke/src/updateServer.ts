/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nodeFetch, { Response } from 'node-fetch';

export interface IUpdateServerFetchOptions {
	/** Bound on all attempts together, including the waits between them. */
	readonly totalTimeoutMs?: number;
	readonly attemptTimeoutMs?: number;
	readonly fetch?: (url: string, init: { timeout: number }) => Promise<Pick<Response, 'ok' | 'status' | 'statusText'>>;
	readonly sleep?: (ms: number) => Promise<void>;
	readonly now?: () => number;
	readonly log?: (message: string) => void;
}

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

/**
 * Fetches from update.code.visualstudio.com, retrying only network errors,
 * timeouts and transient statuses (408, 429, 5xx) with backoff, within a total
 * time bound. Any other response is returned to the caller unchanged.
 */
export async function fetchFromUpdateServer<T extends Pick<Response, 'ok' | 'status' | 'statusText'> = Response>(url: string, options: IUpdateServerFetchOptions = {}): Promise<T> {
	const totalTimeoutMs = options.totalTimeoutMs ?? 3 * 60 * 1000;
	const attemptTimeoutMs = options.attemptTimeoutMs ?? 45 * 1000;
	const fetch = options.fetch ?? ((target: string, init: { timeout: number }) => nodeFetch(target, init));
	const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
	const now = options.now ?? Date.now;
	const deadline = now() + totalTimeoutMs;
	let lastFailure = 'no attempt made';
	for (let attempt = 1, backoffMs = 5000; ; attempt++, backoffMs = Math.min(backoffMs * 2, 30000)) {
		const remaining = deadline - now();
		if (remaining <= 0) {
			break;
		}
		try {
			const response = await fetch(url, { timeout: Math.min(attemptTimeoutMs, remaining) });
			if (!isRetryableStatus(response.status)) {
				return response as T;
			}
			lastFailure = `HTTP ${response.status} ${response.statusText}`.trim();
			// Release the connection of a response we will not read.
			(response as { body?: { destroy?(): void } }).body?.destroy?.();
		} catch (error) {
			lastFailure = error instanceof Error ? error.message : String(error);
		}
		options.log?.(`Update server request ${url} failed (attempt ${attempt}): ${lastFailure}`);
		if (deadline - now() <= backoffMs) {
			break;
		}
		await sleep(backoffMs);
	}
	throw new Error(`Could not fetch ${url} from the update server within ${Math.round(totalTimeoutMs / 1000)}s: ${lastFailure}`);
}

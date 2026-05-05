// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { AgentEvent, ProviderAdapter, UniformRequest } from './providers/types.js';

interface ErrnoLike {
	code?: string;
	message: string;
}

export interface FailoverEntry {
	readonly adapter: ProviderAdapter;
	readonly model: string;
}

/**
 * Returns true for errors that warrant trying the next provider in the chain.
 *
 * Not retried: 4xx client errors (except 429 quota), AbortSignal cancellation,
 * and adapter-internal logic errors.
 */
export function isFailoverError(err: unknown): boolean {
	if (!(err instanceof Error)) {
		return false;
	}
	const code = (err as ErrnoLike).code;
	if (
		code === 'ECONNRESET' ||
		code === 'ECONNREFUSED' ||
		code === 'ETIMEDOUT' ||
		code === 'ENOTFOUND'
	) {
		return true;
	}
	const msg = err.message;
	// HTTP 5xx from provider
	if (/returned 5\d\d/.test(msg)) {
		return true;
	}
	// Quota or rate-limit exhaustion
	if (msg.includes('429') || msg.includes('quota_exceeded') || msg.includes('rate_limit_exceeded')) {
		return true;
	}
	return false;
}

/**
 * Sends a request through the ordered list of provider entries, failing over
 * transparently on connection errors, HTTP 5xx responses, and quota exhaustion.
 *
 * Each entry is tried in sequence. Failover fires when:
 *   - The adapter throws an error matching `isFailoverError`
 *   - The adapter yields a retryable `error` event before `message_stop`
 *   - The adapter's async generator closes without emitting `message_stop`
 *
 * On mid-stream failure the downstream consumer will have already received
 * events from the failed provider; the fallback re-issues the full request
 * and continues the event stream — the UI layer is responsible for rendering
 * the continuation sensibly.
 */
export async function* withFailover(
	entries: readonly FailoverEntry[],
	req: UniformRequest,
	signal: AbortSignal,
): AsyncIterable<AgentEvent> {
	if (entries.length === 0) {
		yield { type: 'error', code: 'NO_PROVIDERS', message: 'No providers configured', retryable: false };
		yield { type: 'message_stop', stopReason: 'error' };
		return;
	}

	for (let i = 0; i < entries.length; i++) {
		const { adapter, model } = entries[i];
		const isLast = i === entries.length - 1;
		const entryReq: UniformRequest = { ...req, model };

		try {
			let completed = false;
			let shouldTryNext = false;

			for await (const event of adapter.send(entryReq, signal)) {
				yield event;

				if (event.type === 'message_stop') {
					completed = true;
					break;
				}

				// A retryable error mid-stream: finish this event, try next provider.
				if (event.type === 'error' && event.retryable && !isLast) {
					shouldTryNext = true;
					break;
				}
			}

			if (completed || (isLast && !shouldTryNext)) {
				return;
			}
			// continue to next provider
		} catch (err) {
			if (signal.aborted) {
				yield { type: 'error', code: 'cancelled', message: 'Request cancelled', retryable: false };
				yield { type: 'message_stop', stopReason: 'error' };
				return;
			}

			if (!isLast && isFailoverError(err)) {
				continue;
			}

			const castErr = err as ErrnoLike;
			yield {
				type: 'error',
				code: castErr.code ?? 'PROVIDER_ERROR',
				message: castErr.message,
				retryable: false,
			};
			yield { type: 'message_stop', stopReason: 'error' };
			return;
		}
	}
}

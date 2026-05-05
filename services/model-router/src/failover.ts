// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { AgentEvent, ModelDescriptor, ProviderAdapter, UniformRequest } from './providers/types.js';

interface ErrnoLike {
	code?: string;
	message: string;
}

// ---------------------------------------------------------------------------
// FailoverAdapter — OOP class-based failover (§10.1)
// ---------------------------------------------------------------------------

/** One entry in the ordered failover chain. */
export interface FailoverTarget {
	readonly provider: string;
	readonly model: string;
	readonly adapter: ProviderAdapter;
}

/**
 * Wraps a primary ProviderAdapter with an ordered fallback chain (§10.1).
 *
 * Failover is triggered when:
 *   - The adapter throws a connection-level exception before content starts.
 *   - The adapter yields an `error` event with `retryable: true` before any
 *     `text_delta` or `tool_use_start` has been yielded (mid-stream errors
 *     cannot be rolled back, so they are forwarded as-is).
 *
 * On each attempt the `model` field in the request is replaced with the
 * target's model so the underlying adapter talks to the right variant.
 */
export class FailoverAdapter implements ProviderAdapter {
	private readonly targets: readonly FailoverTarget[];

	constructor(
		primary: FailoverTarget,
		fallbacks: readonly FailoverTarget[] = [],
	) {
		this.targets = [primary, ...fallbacks];
	}

	get id(): string {
		return `failover:${this.targets[0].provider}`;
	}

	get displayName(): string {
		return `${this.targets[0].adapter.displayName} (with failover)`;
	}

	async isAvailable(): Promise<boolean> {
		for (const target of this.targets) {
			if (await target.adapter.isAvailable()) {
				return true;
			}
		}
		return false;
	}

	async listModels(): Promise<ModelDescriptor[]> {
		return this.targets[0].adapter.listModels();
	}

	async *send(req: UniformRequest, signal: AbortSignal): AsyncIterable<AgentEvent> {
		let lastErrorEvent: AgentEvent & { type: 'error' } | undefined;

		for (let i = 0; i < this.targets.length; i++) {
			const target = this.targets[i];
			const isLast = i === this.targets.length - 1;

			if (signal.aborted) {
				return;
			}

			try {
				const available = await target.adapter.isAvailable();
				if (!available && !isLast) {
					continue;
				}

				const modifiedReq: UniformRequest = { ...req, model: target.model };
				let hadContent = false;
				let shouldFailover = false;

				for await (const event of target.adapter.send(modifiedReq, signal)) {
					if (event.type === 'text_delta' || event.type === 'tool_use_start') {
						hadContent = true;
					}

					// Only failover pre-stream: once content has started we cannot
					// roll it back, so forward the error to the caller instead.
					if (event.type === 'error' && event.retryable && !hadContent && !isLast) {
						lastErrorEvent = event;
						shouldFailover = true;
						break;
					}

					yield event;

					if (event.type === 'message_stop') {
						return;
					}
				}

				if (!shouldFailover) {
					return;
				}
			} catch (err) {
				if (isLast) {
					yield {
						type: 'error',
						code: 'connection_error',
						message: err instanceof Error ? err.message : 'Unknown connection error',
						retryable: false,
					};
					return;
				}
				// Try next target in chain.
			}
		}

		// All targets exhausted without a successful response.
		yield lastErrorEvent ?? {
			type: 'error',
			code: 'all_providers_exhausted',
			message: 'All provider attempts failed',
			retryable: false,
		};
	}
}

// ---------------------------------------------------------------------------
// withFailover — functional async-generator failover
// ---------------------------------------------------------------------------

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

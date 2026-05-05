// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { AgentEvent, ModelDescriptor, ProviderAdapter, UniformRequest } from '../providers/types.js';

/** One slot in a failover chain — an adapter to try and the model to request. */
export interface FailoverSlot {
	readonly adapter: ProviderAdapter;
	readonly model: string;
}

/** Returns true for events that represent content visible to the consumer. */
function isContentEvent(event: AgentEvent): boolean {
	return event.type === 'text_delta'
		|| event.type === 'tool_use_start'
		|| event.type === 'tool_use_delta'
		|| event.type === 'tool_use_stop'
		|| event.type === 'thinking_delta';
}

/**
 * FailoverChain wraps an ordered list of (adapter, model) pairs and
 * implements the ProviderAdapter contract (§10.1 of AGENTIC_PLATFORM_PLAN.md).
 *
 * On a retryable error from the current adapter the chain advances to the
 * next slot:
 *
 *   Pre-stream failover — error before any content event (text_delta,
 *   tool_use_start, thinking_delta): the caller sees nothing from the failed
 *   attempt. Pre-content events (message_start, usage, etc.) are buffered and
 *   discarded on retry so the fallback adapter starts cleanly.
 *
 *   Mid-stream failover — error after content events have already been
 *   yielded: the chain advances to the next adapter, which replays the full
 *   request from the beginning. The caller receives a new `message_start`
 *   event from the fallback adapter, signalling the provider switch. The
 *   chat UI can clear the partial message on `message_start`.
 *
 * A non-retryable error from any adapter terminates the stream immediately —
 * the error event is passed through to the caller and no further adapters
 * are tried.
 *
 * Exhausting all adapters (every one failed with a retryable error or threw)
 * yields a single terminal `error` event followed by `message_stop`.
 *
 * Failover is triggered by:
 *   - `AgentEvent.error` with `retryable: true`
 *   - A thrown exception (connection reset, network error)
 */
export class FailoverChain implements ProviderAdapter {
	readonly id: string;
	readonly displayName: string;

	private readonly slots: readonly FailoverSlot[];

	constructor(
		slots: readonly FailoverSlot[],
		id: string = 'failover-chain',
		displayName: string = 'Failover Chain',
	) {
		if (slots.length === 0) {
			throw new Error('FailoverChain requires at least one slot');
		}
		this.slots = slots;
		this.id = id;
		this.displayName = displayName;
	}

	async isAvailable(): Promise<boolean> {
		for (const { adapter } of this.slots) {
			try {
				if (await adapter.isAvailable()) {
					return true;
				}
			} catch {
				// continue checking remaining adapters
			}
		}
		return false;
	}

	async listModels(): Promise<ModelDescriptor[]> {
		const seen = new Set<string>();
		const models: ModelDescriptor[] = [];
		for (const { adapter } of this.slots) {
			try {
				for (const m of await adapter.listModels()) {
					if (!seen.has(m.id)) {
						seen.add(m.id);
						models.push(m);
					}
				}
			} catch {
				// tolerate unavailable adapters in model listing
			}
		}
		return models;
	}

	async *send(req: UniformRequest, signal: AbortSignal): AsyncIterable<AgentEvent> {
		let lastErrorCode: string | undefined;
		let lastErrorMessage: string | undefined;

		for (const { adapter, model } of this.slots) {
			const adapterReq: UniformRequest = { ...req, model };
			let shouldAdvance = false;

			// Buffer events that arrive before the first content event.  If a
			// retryable error occurs before any content is seen, discard the buffer
			// so the caller never observes the failed adapter's preamble.
			const preContentBuffer: AgentEvent[] = [];
			let contentSeen = false;

			try {
				for await (const event of adapter.send(adapterReq, signal)) {
					// Retryable error — advance to next adapter (consuming the event
					// so the caller never sees the failed-provider error).
					if (event.type === 'error' && event.retryable) {
						lastErrorCode = event.code;
						lastErrorMessage = event.message;
						shouldAdvance = true;
						break;
					}

					if (!contentSeen) {
						if (isContentEvent(event)) {
							// First content seen — flush the buffered preamble then yield
							// the content event itself.
							contentSeen = true;
							for (const buffered of preContentBuffer) {
								yield buffered;
							}
							preContentBuffer.length = 0;
						} else {
							// Not content yet — buffer and continue.
							preContentBuffer.push(event);
							continue;
						}
					}

					yield event;
				}
			} catch (err) {
				// Network / connection error — always retryable.
				lastErrorCode = 'connection_reset';
				lastErrorMessage = err instanceof Error ? err.message : String(err);
				shouldAdvance = true;
			}

			if (!shouldAdvance) {
				// Adapter completed normally (or emitted a non-retryable error).
				// Flush any remaining buffered pre-content events so the caller gets
				// the full picture (e.g. usage or message_stop with no content).
				if (!contentSeen) {
					for (const buffered of preContentBuffer) {
						yield buffered;
					}
				}
				return;
			}
			// Loop continues to try the next adapter — buffer is discarded.
		}

		// All adapters exhausted.
		yield {
			type: 'error',
			code: lastErrorCode ?? 'all_providers_failed',
			message: `All providers failed. Last error: ${lastErrorMessage ?? 'unknown'}`,
			retryable: false,
		};
		yield { type: 'message_stop', stopReason: 'error' };
	}
}

/** Shared exponential backoff for DIAL HTTP calls (tokenize and chat). */

import { abortError, isAbortError } from './cancel';

export interface HttpRetryConfig {
	readonly maxAttempts: number;
	readonly baseDelayMs: number;
	readonly maxDelayMs: number;
}

export interface RetryOptions extends HttpRetryConfig {
	readonly isRetryable: (detail: string) => boolean;
	readonly signal?: AbortSignal;
	readonly onRetry?: (attempt: number, delayMs: number, detail: string) => void;
}

/** `attempt` is 1-based; delay before the next try after attempt N fails. */
export function computeBackoffDelayMs(
	attempt: number,
	baseDelayMs: number,
	maxDelayMs: number,
): number {
	const exponential = baseDelayMs * 2 ** Math.max(0, attempt - 1);
	const capped = Math.min(maxDelayMs, exponential);
	// ±25 % jitter so concurrent clients do not realign on the same tick.
	const jitter = capped * 0.25 * (Math.random() * 2 - 1);
	return Math.max(0, Math.round(capped + jitter));
}

/**
 * Delay before the next chat retry after a transient failure. When the upstream
 * drops the connection with an empty body (common under vLLM queue pressure),
 * scale the wait with how long the last attempt already blocked.
 */
export function computeChatTransientRetryDelayMs(
	attempt: number,
	config: HttpRetryConfig,
	lastDetail: string,
	lastAttemptElapsedMs: number,
): number {
	const exponential = computeBackoffDelayMs(attempt, config.baseDelayMs, config.maxDelayMs);
	if (!lastDetail.toLowerCase().includes('(empty response body)')) {
		return exponential;
	}
	const queueHint = Math.floor(lastAttemptElapsedMs / 3);
	return Math.min(config.maxDelayMs, Math.max(exponential, queueHint));
}

export async function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);
		const onAbort = (): void => {
			cleanup();
			reject(abortError());
		};
		const cleanup = (): void => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
		};
		if (signal?.aborted) {
			cleanup();
			reject(abortError());
			return;
		}
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	options: RetryOptions,
): Promise<T> {
	let lastDetail = 'unknown error';
	for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
		if (options.signal?.aborted) {
			throw abortError();
		}
		try {
			return await fn();
		} catch (error: unknown) {
			if (isAbortError(error)) {
				throw error instanceof Error ? error : abortError();
			}
			lastDetail = error instanceof Error ? error.message : String(error);
			if (attempt >= options.maxAttempts || !options.isRetryable(lastDetail)) {
				throw error instanceof Error ? error : new Error(lastDetail);
			}
			const delayMs = computeBackoffDelayMs(attempt, options.baseDelayMs, options.maxDelayMs);
			options.onRetry?.(attempt, delayMs, lastDetail);
			await sleepMs(delayMs, options.signal);
		}
	}
	throw new Error(lastDetail);
}

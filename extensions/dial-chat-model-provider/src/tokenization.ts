/**
 * Token counting helpers for the DIAL `/v1/deployments/{id}/tokenize` endpoint.
 *
 * The endpoint accepts a batch of `inputs` (plain strings or full chat requests)
 * and returns one `output` per input with a `token_count` or an `error`.
 * @see https://github.com/epam/ai-dial-sdk/blob/development/aidial_sdk/deployment/tokenize.py
 *
 * This module is intentionally free of `vscode` imports so it can be unit-tested
 * in isolation and reused by both the client (request shape) and the service.
 */

import { isRecord, readNumber, readString, type JsonValue } from './runtimeGuards';

/** Batch tokenize request body (`{ inputs: [{ type: 'string', value }, …] }`). */
export function buildTokenizeBody(texts: readonly string[]): JsonValue {
	return { inputs: texts.map((value) => ({ type: 'string', value })) };
}

export interface TokenizeResult {
	/** Token count from a `status: success` output, when present and finite. */
	readonly tokenCount?: number;
	/** Error message from a `status: error` output, when present. */
	readonly error?: string;
}

function parseTokenizeOutput(item: JsonValue): TokenizeResult {
	if (!isRecord(item)) {
		return {};
	}
	if (item.status === 'success') {
		const count = readNumber(item, 'token_count');
		if (count !== undefined && count >= 0) {
			return { tokenCount: count };
		}
		return {};
	}
	const error = readString(item, 'error');
	return error !== undefined ? { error } : {};
}

/**
 * Parse the `outputs[]` array of a tokenize response into exactly `expected`
 * results (positionally aligned to the request `inputs`). Missing or malformed
 * entries become empty results so callers can treat them as retryable failures.
 */
export function parseTokenizeResponses(body: JsonValue, expected: number): TokenizeResult[] {
	const outputs = isRecord(body) && Array.isArray(body.outputs) ? body.outputs : [];
	const results: TokenizeResult[] = [];
	for (let i = 0; i < expected; i++) {
		results.push(i < outputs.length ? parseTokenizeOutput(outputs[i] as JsonValue) : {});
	}
	return results;
}

/**
 * Whether a tokenize error means the endpoint is permanently unavailable for
 * this deployment (missing route / feature) rather than a transient failure
 * (rate limit, overloaded upstream). Used to stop retrying for the session.
 */
export function isTokenizeUnavailableError(detail: string): boolean {
	const lower = detail.toLowerCase();
	return (
		lower.includes('route is not found') ||
		lower.includes('http 404') ||
		(lower.includes('tokenize') && lower.includes('not support'))
	);
}

/** Whether a tokenize failure should be retried with exponential backoff. */
export function isRetryableTokenizeError(detail: string): boolean {
	if (isTokenizeUnavailableError(detail)) {
		return false;
	}
	const lower = detail.toLowerCase();
	if (lower.includes('tokenize response missing token_count')) {
		return true;
	}
	if (lower.includes('tokenize error:')) {
		return true;
	}
	return (
		lower.includes('http 502') ||
		lower.includes('http 503') ||
		lower.includes('http 504') ||
		lower.includes('http 429') ||
		lower.includes('http unknown') ||
		lower.includes('(empty response body)') ||
		lower.includes('econnrefused') ||
		lower.includes('econnreset') ||
		lower.includes('etimedout') ||
		lower.includes('socket hang up') ||
		lower.includes('timeout') ||
		lower.includes('network error')
	);
}

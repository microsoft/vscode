/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type * as http from 'http';

/**
 * Anthropic-error helpers shared by the proxy. Two shapes:
 *
 * - **Proxy-authored errors**: synthesized by the proxy when no upstream
 *   response exists (auth failure, bad route, malformed body, model
 *   parse failure, `count_tokens`). Sent as a JSON body or an SSE error
 *   frame.
 * - **CAPI errors** (passthrough): a `CopilotApiError` already carries
 *   the upstream `Anthropic.ErrorResponse`. The proxy re-emits it
 *   verbatim — see `claudeProxyService.ts` for that branch.
 */

/**
 * Build a synthetic Anthropic error envelope. `request_id` is `null`
 * because the proxy authored this error itself (no upstream request was
 * made, or the upstream request didn't supply one).
 */
export function buildErrorEnvelope(type: Anthropic.ErrorType, message: string): Anthropic.ErrorResponse {
	return {
		type: 'error',
		error: { type, message },
		request_id: null,
	};
}

/**
 * Send a proxy-authored JSON error response. Caller must NOT have
 * written headers or body yet.
 */
export function writeJsonError(
	res: http.ServerResponse,
	status: number,
	type: Anthropic.ErrorType,
	message: string,
): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(buildErrorEnvelope(type, message)));
}

/**
 * Send an upstream {@link Anthropic.ErrorResponse} verbatim with the
 * supplied HTTP status. Used by the CAPI passthrough branch in
 * `claudeProxyService` so any extra fields on the upstream envelope
 * (e.g. `request_id`) propagate to the SDK unchanged.
 */
export function writeUpstreamJsonError(
	res: http.ServerResponse,
	status: number,
	envelope: Anthropic.ErrorResponse,
): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(envelope));
}

/**
 * Encode a single SSE frame for an Anthropic streaming error. Used after
 * `writeHead(200)` has already been called (so we can no longer change
 * the HTTP status). Caller should `res.end()` after writing this frame
 * — the Anthropic SDK treats `event: error` as terminal.
 */
export function formatSseErrorFrame(envelope: Anthropic.ErrorResponse): string {
	return `event: error\ndata: ${JSON.stringify(envelope)}\n\n`;
}

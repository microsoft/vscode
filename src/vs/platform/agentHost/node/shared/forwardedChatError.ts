/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotApiError, COPILOT_API_ERROR_STATUS_STREAMING } from './copilotApiService.js';

/**
 * Marker prefix used to smuggle a structured, serialized chat fetch error
 * through the agent SDK subprocess boundary. The model proxies run in this
 * (the agent host) process and hold the rich {@link CopilotApiError}, but the
 * agent SDKs (Claude, Codex, Copilot CLI) run as child processes that only
 * see an HTTP/SSE error. The proxy appends `VSCODE_PROXY_ERROR:<base64>` to
 * the error message; the SDK forwards that text back verbatim, and the agent
 * decodes it on the way out.
 *
 * Mirrors the Copilot Chat extension's `PROXY_ERROR_PREFIX`
 * (`extensions/copilot/src/extension/chatSessions/claude/common/claudeMessageDispatch.ts`).
 */
export const PROXY_ERROR_PREFIX = 'VSCODE_PROXY_ERROR:';

/**
 * Serialized chat fetch error payload. This is the JSON shape forwarded over
 * the protocol's `ErrorInfo._meta.chatError`. The core consumer
 * (`src/vs/workbench/contrib/chat/common/chatErrorMessages.ts`) reads the same
 * JSON shape to render localized, user-facing messages. The two definitions
 * are intentionally decoupled (the platform/node layer cannot import workbench
 * code), so any field change must be mirrored on both sides.
 */
export interface IForwardedChatFetchError {
	/** Mirrors the extension's `ChatFetchResponseType` string value. */
	readonly type: string;
	readonly reason?: string;
	readonly requestId?: string;
	readonly serverRequestId?: string;
	readonly category?: string;
	readonly retryAfter?: number;
	readonly isAuto?: boolean;
	readonly capiError?: { readonly code?: string; readonly message?: string };
}

/**
 * The full forwarded chat error placed at `ErrorInfo._meta.chatError`.
 */
export interface IForwardedChatError {
	readonly fetchError: IForwardedChatFetchError;
	readonly copilotPlan?: string;
	readonly isUsageBasedBilling?: boolean;
	readonly quotaResetDate?: string;
}

/**
 * Maps a {@link CopilotApiError} HTTP status (or the mid-stream streaming
 * sentinel) to the extension's `ChatFetchResponseType` string value. Kept in
 * sync with the Copilot Chat extension's error classification so the core
 * formatter produces identical messages.
 */
function statusToFetchType(status: number): string {
	switch (status) {
		case 402:
			return 'quotaExceeded';
		case 429:
			return 'rateLimited';
		case 499:
			return 'canceled';
		case 400:
			return 'badRequest';
		case 401:
		case 403:
			return 'agent_unauthorized';
		case 404:
			return 'notFound';
		default:
			return 'failed';
	}
}

/**
 * Builds a {@link IForwardedChatError} from a {@link CopilotApiError}. The
 * error's Anthropic envelope carries the upstream message and type, which are
 * surfaced as `reason`/`capiError` so the core formatter can render the right
 * message (rate limit, quota, filtered, etc.).
 */
export function buildForwardedChatError(err: CopilotApiError): IForwardedChatError {
	const status = err.status === COPILOT_API_ERROR_STATUS_STREAMING ? 502 : err.status;
	const message = err.envelope.error.message;
	const code = err.envelope.error.type;
	const requestId = typeof err.envelope.request_id === 'string' ? err.envelope.request_id : '';
	return {
		fetchError: {
			type: statusToFetchType(status),
			reason: message,
			requestId,
			capiError: { code, message },
		},
	};
}

/**
 * Encodes a {@link IForwardedChatError} as a `VSCODE_PROXY_ERROR:<base64>`
 * marker string. Base64 survives the SDK's JSON re-encoding without
 * double-escaping issues.
 */
export function encodeForwardedChatError(forwarded: IForwardedChatError): string {
	return `${PROXY_ERROR_PREFIX}${Buffer.from(JSON.stringify(forwarded)).toString('base64')}`;
}

/**
 * Attempts to decode a {@link IForwardedChatError} from arbitrary error text
 * that may contain a {@link PROXY_ERROR_PREFIX} marker. Returns `undefined`
 * when no marker is present or the payload cannot be parsed.
 *
 * Mirrors the extension's `tryParseProxyError`.
 */
export function tryParseForwardedChatError(errorText: string | undefined): IForwardedChatError | undefined {
	if (!errorText) {
		return undefined;
	}
	const idx = errorText.indexOf(PROXY_ERROR_PREFIX);
	if (idx === -1) {
		return undefined;
	}
	// Extract the base64 payload after the prefix, stopping at whitespace or quotes.
	const start = idx + PROXY_ERROR_PREFIX.length;
	const end = errorText.slice(start).search(/[\s"']/);
	const b64 = end === -1 ? errorText.slice(start) : errorText.slice(start, start + end);
	try {
		const parsed = JSON.parse(Buffer.from(b64, 'base64').toString()) as IForwardedChatError;
		if (parsed && typeof parsed === 'object' && parsed.fetchError && typeof parsed.fetchError.type === 'string') {
			return parsed;
		}
		return undefined;
	} catch {
		return undefined;
	}
}

/**
 * Wraps a {@link IForwardedChatError} into the `_meta` record carried on the
 * protocol `ErrorInfo`. The core consumer reads `_meta.chatError`.
 */
export function toChatErrorMeta(forwarded: IForwardedChatError): Record<string, unknown> {
	return { chatError: forwarded };
}

/**
 * Convenience: decode a {@link IForwardedChatError} from arbitrary error text
 * and wrap it into the protocol `ErrorInfo._meta` record. Returns `undefined`
 * when the text carries no {@link PROXY_ERROR_PREFIX} marker, so callers can
 * spread it onto an `ErrorInfo` without changing behavior for plain errors.
 */
export function tryBuildChatErrorMeta(errorText: string | undefined): Record<string, unknown> | undefined {
	const forwarded = tryParseForwardedChatError(errorText);
	return forwarded ? toChatErrorMeta(forwarded) : undefined;
}

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
 * Upper bound on the base64 marker payload we will decode. A forwarded chat
 * error serializes to well under 1 KB; this cap prevents an oversized or
 * adversarial marker riding along in model-influenced error text from driving
 * an unbounded base64/JSON allocation.
 */
const MAX_FORWARDED_MARKER_B64_LENGTH = 8 * 1024;

/** Standard base64 alphabet with optional padding. */
const FORWARDED_MARKER_B64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

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
	const requestId = typeof err.envelope.request_id === 'string' ? err.envelope.request_id : '';
	// CAPI rate-limit/quota errors carry their fine-grained code in the
	// response body (e.g. `{ "error": { "code": "quota_exceeded", ... } }`).
	// The proxy synthesizes a non-conforming body into the Anthropic envelope
	// as `error.type: 'api_error'` with the raw body as the message, so prefer
	// a CAPI code/message parsed out of the message when present.
	const capiError = extractCapiError(err.envelope.error.message) ?? { code: err.envelope.error.type, message: err.envelope.error.message };
	return {
		fetchError: {
			type: statusToFetchType(status),
			reason: capiError.message ?? err.envelope.error.message,
			requestId,
			capiError,
		},
	};
}

/**
 * Attempts to parse a CAPI-style error body (`{ "error": { "code", "message" } }`)
 * out of an envelope message string. Returns `undefined` when the message is
 * not such a JSON payload.
 */
function extractCapiError(message: string): { code?: string; message?: string } | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(message);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== 'object') {
		return undefined;
	}
	const error = (parsed as { error?: unknown }).error;
	if (!error || typeof error !== 'object') {
		return undefined;
	}
	const code = (error as { code?: unknown }).code;
	const msg = (error as { message?: unknown }).message;
	if (typeof code !== 'string' && typeof msg !== 'string') {
		return undefined;
	}
	return {
		code: typeof code === 'string' ? code : undefined,
		message: typeof msg === 'string' ? msg : undefined,
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
 * Fields from a structured agent-SDK error (notably the Copilot CLI SDK's
 * `ErrorData`) used to build a forwarded chat error directly, without a
 * {@link PROXY_ERROR_PREFIX} marker. The Copilot CLI authenticates with CAPI
 * itself (no VS Code proxy to embed a marker), but its `session.error` event
 * already carries the structured classification we need.
 */
export interface ISdkChatErrorFields {
	readonly errorType: string;
	readonly errorCode?: string;
	readonly message: string;
	readonly statusCode?: number;
	readonly providerCallId?: string;
	readonly serviceRequestId?: string;
}

/**
 * Maps an agent-SDK error category (and optional HTTP status) to the
 * extension's `ChatFetchResponseType` string value, or `undefined` when the
 * error is not a model/CAPI error we can render richly. Categories mirror the
 * Copilot CLI SDK's `ErrorData.errorType` values.
 */
function sdkErrorTypeToFetchType(errorType: string, statusCode: number | undefined): string | undefined {
	switch (errorType) {
		case 'quota':
			return 'quotaExceeded';
		case 'rate_limit':
			return 'rateLimited';
		case 'context_limit':
			return 'length';
		case 'authentication':
		case 'authorization':
			return 'agent_unauthorized';
	}
	return statusCode !== undefined ? statusToFetchType(statusCode) : undefined;
}

/**
 * Builds a {@link IForwardedChatError} from a structured agent-SDK error.
 * Returns `undefined` when the error cannot be classified as a model/CAPI
 * error, so callers can fall back to the raw message.
 */
export function buildForwardedChatErrorFromFields(data: ISdkChatErrorFields): IForwardedChatError | undefined {
	const type = sdkErrorTypeToFetchType(data.errorType, data.statusCode);
	if (!type) {
		return undefined;
	}
	// The Copilot CLI SDK classifies quota errors only via `errorType: 'quota'`
	// (or a 402 status) and does not carry a fine-grained CAPI code. Default to
	// the generic `quota_exceeded` code so the core formatter renders the
	// plan-specific quota message (matching the extension's CLI handling, which
	// calls `getQuotaMessageForPlan` directly) instead of the bare title.
	const code = data.errorCode ?? (type === 'quotaExceeded' ? 'quota_exceeded' : undefined);
	const capiError = (code || data.message) ? { code, message: data.message } : undefined;
	return {
		fetchError: {
			type,
			reason: data.message,
			requestId: data.providerCallId ?? '',
			serverRequestId: data.serviceRequestId,
			...(capiError && { capiError }),
		},
	};
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
	// Reject empty, oversized, or non-base64 payloads before decoding so a
	// stray/adversarial marker in model-influenced text can't be parsed.
	if (b64.length === 0 || b64.length > MAX_FORWARDED_MARKER_B64_LENGTH || !FORWARDED_MARKER_B64_PATTERN.test(b64)) {
		return undefined;
	}
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
 * Removes the `VSCODE_PROXY_ERROR:<base64>` marker (and anything after it) from
 * an error message so the human-readable text isn't polluted by the forwarding
 * payload. The structured payload is consumed separately via `_meta`. A no-op
 * when no marker is present.
 */
export function stripProxyErrorMarker(text: string): string {
	const idx = text.indexOf(PROXY_ERROR_PREFIX);
	if (idx === -1) {
		return text;
	}
	return text.slice(0, idx).trim() || text.slice(0, idx);
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

/**
 * Convenience: build the protocol `ErrorInfo._meta` record from a structured
 * agent-SDK error. Returns `undefined` when the error cannot be classified as
 * a model/CAPI error, so callers can fall back to the raw message.
 */
export function tryBuildChatErrorMetaFromFields(data: ISdkChatErrorFields): Record<string, unknown> | undefined {
	const forwarded = buildForwardedChatErrorFromFields(data);
	return forwarded ? toChatErrorMeta(forwarded) : undefined;
}

/**
 * Decodes a forwarded {@link PROXY_ERROR_PREFIX} marker out of an error message
 * and returns the cleaned human-readable message together with the protocol
 * `ErrorInfo._meta` record. When no marker is present the message is returned
 * unchanged and `_meta` is omitted, so the result can be spread directly onto
 * an `ErrorInfo` without changing behavior for plain errors:
 *
 * ```ts
 * error: { errorType: 'CodexError', ...extractForwardedErrorInfo(message) }
 * ```
 */
export function extractForwardedErrorInfo(message: string): { message: string; _meta?: Record<string, unknown> } {
	const forwarded = tryParseForwardedChatError(message);
	if (!forwarded) {
		return { message };
	}
	return { message: stripProxyErrorMarker(message), _meta: toChatErrorMeta(forwarded) };
}

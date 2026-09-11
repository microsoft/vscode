/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../platform/log/common/logService';

// Reserved headers that cannot be overridden for security and functionality reasons
// Including forbidden request headers: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header
const RESERVED_HEADERS: ReadonlySet<string> = new Set([
	// Forbidden Request Headers
	'accept-charset',
	'accept-encoding',
	'access-control-request-headers',
	'access-control-request-method',
	'connection',
	'content-length',
	'cookie',
	'date',
	'dnt',
	'expect',
	'host',
	'keep-alive',
	'origin',
	'permissions-policy',
	'referer',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'user-agent',
	'via',
	// Forwarding & Routing
	'forwarded',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
	// Others
	'api-key',
	'authorization',
	'content-type',
	'openai-intent',
	'x-github-api-version',
	'x-initiator',
	'x-interaction-id',
	'x-interaction-type',
	'x-onbehalf-extension-id',
	'x-request-id',
	'x-vscode-user-agent-library-version',
	// Pattern-based forbidden headers are checked separately:
	// - 'proxy-*' headers (handled in sanitization logic)
	// - 'sec-*' headers (handled in sanitization logic)
	// - 'x-http-method*' with forbidden methods CONNECT, TRACE, TRACK (handled in sanitization logic)
]);

// RFC 7230 compliant header name pattern: token characters only
const VALID_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;

// Maximum limits to prevent abuse
const MAX_HEADER_NAME_LENGTH = 256;
const MAX_HEADER_VALUE_LENGTH = 8192;
const MAX_CUSTOM_HEADER_COUNT = 20;

/**
 * Default reserved-header check. Callers with their own override rules (e.g.
 * {@link CustomEndpointOAIEndpoint}'s Messages API auth headers) can pass a
 * different predicate to {@link sanitizeCustomHeaders} instead.
 */
export function isDefaultReservedHeader(lowerKey: string): boolean {
	return RESERVED_HEADERS.has(lowerKey);
}

/**
 * Well-known auth header names whose presence in `requestHeaders` signals that the
 * user is supplying their own credentials for an endpoint behind a gateway, APIM,
 * vanity domain, etc. where the URL-based heuristic cannot infer the correct header.
 * When any of these is present, a default/SDK-generated auth header must not also be
 * sent, or the endpoint receives two conflicting credentials. Shared by
 * {@link CustomEndpointOAIEndpoint} and the Gemini delegation path so a gateway auth
 * override behaves the same way for every apiType. Headers that are typically
 * complementary to a backend auth header (e.g. APIM subscription keys, Azure
 * Functions keys) are intentionally excluded.
 */
const AUTH_OVERRIDE_SIGNAL_HEADERS: ReadonlySet<string> = new Set([
	'api-key',
	'authorization',
	'x-api-key',
	'x-goog-api-key',
	'apikey',
]);

/**
 * Reserved auth headers that a caller may permit users to override via
 * `requestHeaders`. Other well-known auth headers like `x-api-key`,
 * `x-goog-api-key`, `apikey`, `ocp-apim-subscription-key`, and `x-functions-key`
 * are not on the base reserved list, so they already pass through without needing
 * to be listed here.
 */
export function isReservedHeaderAllowingAuthOverride(lowerKey: string): boolean {
	if (lowerKey === 'api-key' || lowerKey === 'authorization') {
		return false;
	}
	return isDefaultReservedHeader(lowerKey);
}

/**
 * Whether the given (already-sanitized) headers include a well-known auth header,
 * meaning the user is supplying their own credentials. See
 * {@link AUTH_OVERRIDE_SIGNAL_HEADERS}.
 */
export function hasAuthOverrideHeader(headers: Readonly<Record<string, string>>): boolean {
	return Object.keys(headers).some(key => AUTH_OVERRIDE_SIGNAL_HEADERS.has(key.toLowerCase()));
}

/**
 * Detects zero-width characters (U+200B-U+200D, U+FEFF) and bidirectional
 * override controls (U+202A-U+202E), which could otherwise be used to hide or
 * visually reorder header content. Checked by code point, not a regex literal
 * with inline \u escapes, since those get mangled by this editing pipeline.
 */
function hasForbiddenBidiOrZeroWidthChar(value: string): boolean {
	for (const ch of value) {
		const code = ch.codePointAt(0);
		if (code === undefined) {
			continue;
		}
		if (code >= 0x200B && code <= 0x200D) {
			return true;
		}
		if (code >= 0x202A && code <= 0x202E) {
			return true;
		}
		if (code === 0xFEFF) {
			return true;
		}
	}
	return false;
}

export function sanitizeHeaderValue(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();

	if (trimmed.length > MAX_HEADER_VALUE_LENGTH) {
		return undefined;
	}

	// Disallow control characters including CR, LF, and others (0x00-0x1F, 0x7F)
	// This prevents HTTP header injection and response splitting attacks
	if (/[\x00-\x1F\x7F]/.test(trimmed)) {
		return undefined;
	}

	// Additional check for potential Unicode issues
	// Reject headers with bidirectional override characters or zero-width characters
	if (hasForbiddenBidiOrZeroWidthChar(trimmed)) {
		return undefined;
	}

	return trimmed;
}

/**
 * Filters and validates user-supplied custom headers: strips reserved/forbidden
 * names, enforces RFC 7230 name syntax and length limits, rejects control and
 * bidi/zero-width characters in values, and caps the header count. Shared by
 * every BYOK request path that accepts `requestHeaders`, so a gateway header
 * configured for one apiType can't bypass the checks applied to the others.
 */
export function sanitizeCustomHeaders(
	headers: Readonly<Record<string, string>> | undefined,
	modelId: string,
	logService: ILogService,
	isReservedHeader: (lowerKey: string) => boolean = isDefaultReservedHeader,
): Record<string, string> {
	if (!headers) {
		return {};
	}

	const entries = Object.entries(headers);

	if (entries.length > MAX_CUSTOM_HEADER_COUNT) {
		logService.warn(`[BYOK] Model '${modelId}' has ${entries.length} custom headers, exceeding limit of ${MAX_CUSTOM_HEADER_COUNT}. Only first ${MAX_CUSTOM_HEADER_COUNT} will be processed.`);
	}

	const sanitized: Record<string, string> = {};
	let processedCount = 0;

	for (const [rawKey, rawValue] of entries) {
		if (processedCount >= MAX_CUSTOM_HEADER_COUNT) {
			break;
		}

		const key = rawKey.trim();
		if (!key) {
			logService.warn(`[BYOK] Model '${modelId}' has empty header name, skipping.`);
			continue;
		}

		if (key.length > MAX_HEADER_NAME_LENGTH) {
			logService.warn(`[BYOK] Model '${modelId}' has header name exceeding ${MAX_HEADER_NAME_LENGTH} characters, skipping.`);
			continue;
		}

		if (!VALID_HEADER_NAME_PATTERN.test(key)) {
			logService.warn(`[BYOK] Model '${modelId}' has invalid header name format: '${key}', skipping.`);
			continue;
		}

		const lowerKey = key.toLowerCase();
		if (isReservedHeader(lowerKey)) {
			logService.warn(`[BYOK] Model '${modelId}' attempted to override reserved header '${key}', skipping.`);
			continue;
		}

		// Check for pattern-based forbidden headers
		if (lowerKey.startsWith('proxy-') || lowerKey.startsWith('sec-')) {
			logService.warn(`[BYOK] Model '${modelId}' attempted to set forbidden header pattern '${key}', skipping.`);
			continue;
		}

		// Check for X-HTTP-Method* headers with forbidden methods
		if (lowerKey === 'x-http-method' || lowerKey === 'x-http-method-override' || lowerKey === 'x-method-override') {
			const forbiddenMethods = ['connect', 'trace', 'track'];
			const methodValue = String(rawValue).toLowerCase().trim();
			if (forbiddenMethods.includes(methodValue)) {
				logService.warn(`[BYOK] Model '${modelId}' attempted to set forbidden method '${methodValue}' in header '${key}', skipping.`);
				continue;
			}
		}

		const sanitizedValue = sanitizeHeaderValue(rawValue);
		if (sanitizedValue === undefined) {
			logService.warn(`[BYOK] Model '${modelId}' has invalid value for header '${key}': '${rawValue}', skipping.`);
			continue;
		}

		sanitized[key] = sanitizedValue;
		processedCount++;
	}

	return sanitized;
}

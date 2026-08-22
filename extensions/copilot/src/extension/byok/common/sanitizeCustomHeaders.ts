/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared sanitizer for user-configured `requestHeaders` on BYOK endpoints.
 *
 * Both the chat endpoint (`OpenAIEndpoint`) and the inline completion fetcher
 * (`LiveOpenAIFetcher`) forward user-configured headers to OpenAI-compatible
 * endpoints. Headers that collide with authentication, transport-level or
 * Copilot-internal headers, forbidden browser headers, or header-injection
 * attempts are dropped here so both pipelines apply the same rules.
 */
export interface SanitizeCustomRequestHeadersOptions {
	/**
	 * Decides whether a lowercased header name must be rejected. Defaults to
	 * {@link DEFAULT_FORBIDDEN_CUSTOM_HEADERS} plus
	 * {@link SanitizeCustomRequestHeadersOptions.extraForbiddenHeaders}.
	 */
	readonly isReservedHeader?: (lowerKey: string) => boolean;
	/** Extra forbidden header names (lowercase), on top of the default reserved set. */
	readonly extraForbiddenHeaders?: ReadonlySet<string>;
	/** Model identifier used in warning messages. */
	readonly modelId?: string;
	/** Prefix prepended to each warning message (e.g. '[OpenAIEndpoint] '). */
	readonly logPrefix?: string;
	/** Receives one warning message per skipped header / exceeded limit. */
	readonly onWarning?: (message: string) => void;
}

// Reserved headers that cannot be overridden for security and functionality reasons
// Including forbidden request headers: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header
export const DEFAULT_FORBIDDEN_CUSTOM_HEADERS: ReadonlySet<string> = new Set([
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

function sanitizeHeaderValue(value: unknown): string | undefined {
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
	if (/[\u200B-\u200D\u202A-\u202E\uFEFF]/.test(trimmed)) {
		return undefined;
	}

	return trimmed;
}

export function sanitizeCustomRequestHeaders(
	headers: Readonly<Record<string, string>> | undefined,
	options?: SanitizeCustomRequestHeadersOptions
): Record<string, string> {
	if (!headers) {
		return {};
	}

	const modelId = options?.modelId;
	const warn = (suffix: string) => options?.onWarning?.(`${options?.logPrefix ?? ''}${modelId ? `Model '${modelId}' ` : ''}${suffix}`);
	const isReservedHeader = options?.isReservedHeader
		?? ((lowerKey: string) => DEFAULT_FORBIDDEN_CUSTOM_HEADERS.has(lowerKey) || (options?.extraForbiddenHeaders?.has(lowerKey) ?? false));

	const entries = Object.entries(headers);

	if (entries.length > MAX_CUSTOM_HEADER_COUNT) {
		warn(`has ${entries.length} custom headers, exceeding limit of ${MAX_CUSTOM_HEADER_COUNT}. Only first ${MAX_CUSTOM_HEADER_COUNT} will be processed.`);
	}

	const sanitized: Record<string, string> = {};
	let processedCount = 0;

	for (const [rawKey, rawValue] of entries) {
		if (processedCount >= MAX_CUSTOM_HEADER_COUNT) {
			break;
		}

		const key = rawKey.trim();
		if (!key) {
			warn('has empty header name, skipping.');
			continue;
		}

		if (key.length > MAX_HEADER_NAME_LENGTH) {
			warn(`has header name exceeding ${MAX_HEADER_NAME_LENGTH} characters, skipping.`);
			continue;
		}

		if (!VALID_HEADER_NAME_PATTERN.test(key)) {
			warn(`has invalid header name format: '${key}', Skipping.`);
			continue;
		}

		const lowerKey = key.toLowerCase();
		if (isReservedHeader(lowerKey)) {
			warn(`attempted to override reserved header '${key}', skipping.`);
			continue;
		}

		// Check for pattern-based forbidden headers
		if (lowerKey.startsWith('proxy-') || lowerKey.startsWith('sec-')) {
			warn(`attempted to set forbidden header pattern '${key}', skipping.`);
			continue;
		}

		// Check for X-HTTP-Method* headers with forbidden methods
		if (lowerKey === 'x-http-method' || lowerKey === 'x-http-method-override' || lowerKey === 'x-method-override') {
			const forbiddenMethods = ['connect', 'trace', 'track'];
			const methodValue = String(rawValue).toLowerCase().trim();
			if (forbiddenMethods.includes(methodValue)) {
				warn(`attempted to set forbidden method '${methodValue}' in header '${key}', skipping.`);
				continue;
			}
		}

		const sanitizedValue = sanitizeHeaderValue(rawValue);
		if (sanitizedValue === undefined) {
			warn(`has invalid value for header '${key}': '${rawValue}', skipping.`);
			continue;
		}

		sanitized[key] = sanitizedValue;
		processedCount++;
	}

	return sanitized;
}

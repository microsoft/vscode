/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Centralized sensitive data filter for Glass Box AI.
 *
 * Applied at ingestion time — before data is stored in the GlassBox service —
 * so that no unsanitized copies exist in memory.
 */

/** Maximum length for any single content preview */
const MAX_PREVIEW_LENGTH = 500;

/** Patterns that indicate sensitive data */
const SENSITIVE_PATTERNS: readonly { pattern: RegExp; replacement: string }[] = [
	// Bearer / OAuth tokens
	{ pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, replacement: 'Bearer [REDACTED]' },
	// GitHub tokens (classic and fine-grained)
	{ pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g, replacement: '[GITHUB_TOKEN_REDACTED]' },
	// Generic API keys (common patterns)
	{ pattern: /(?:api[_-]?key|apikey|api[_-]?secret|api[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9\-._~+/]{16,}['"]?/gi, replacement: '[API_KEY_REDACTED]' },
	// AWS access keys
	{ pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[AWS_KEY_REDACTED]' },
	// Connection strings
	{ pattern: /(?:mongodb|postgres|mysql|redis|amqp|mssql):\/\/[^\s'"]+/gi, replacement: '[CONNECTION_STRING_REDACTED]' },
	// Generic passwords in key=value format
	{ pattern: /(?:password|passwd|pwd|secret)\s*[:=]\s*['"]?[^\s'"]{4,}['"]?/gi, replacement: '[SECRET_REDACTED]' },
	// Base64-encoded long strings that may be JWT tokens (header.payload.signature pattern)
	{ pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: '[ENCODED_TOKEN_REDACTED]' },
	// Azure/OpenAI API keys (hex-like, 32+ chars in key=value or header context)
	{ pattern: /(?:key|token|secret|authorization)\s*[:=]\s*['"]?([0-9a-f]{32,})['"]?/gi, replacement: '[HEX_KEY_REDACTED]' },
];

/**
 * Redact sensitive patterns from a string.
 */
export function redactSensitiveData(input: string): string {
	let result = input;
	for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
		result = result.replace(pattern, replacement);
	}
	return result;
}

/**
 * Truncate content to a safe preview length and redact sensitive data.
 */
export function sanitizePreview(content: string | undefined, maxLength: number = MAX_PREVIEW_LENGTH): string | undefined {
	if (!content) {
		return undefined;
	}

	let sanitized = redactSensitiveData(content);
	if (sanitized.length > maxLength) {
		sanitized = sanitized.substring(0, maxLength) + '\u2026 [truncated]';
	}
	return sanitized;
}

/**
 * Sanitize a label (file path, symbol name) — redacts home directory
 * and other user-specific path segments.
 */
export function sanitizeLabel(label: string): string {
	// Replace home directory paths with ~
	let sanitized = label.replace(/(?:\/home\/|\/Users\/|C:\\Users\\)[^/\\]+/gi, '~');
	sanitized = redactSensitiveData(sanitized);
	return sanitized;
}

/**
 * Check if a string appears to contain sensitive data.
 * Useful for deciding whether to include content at all.
 */
export function containsSensitiveData(input: string): boolean {
	return SENSITIVE_PATTERNS.some(({ pattern }) => {
		// Reset lastIndex for global patterns
		pattern.lastIndex = 0;
		return pattern.test(input);
	});
}

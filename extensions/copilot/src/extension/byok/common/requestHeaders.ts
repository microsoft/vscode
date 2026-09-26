/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Lower-cased header names that user model configuration and request middleware
 * must not set, because the fetch layer or the endpoint owns them.
 *
 * Includes the forbidden request headers listed at
 * https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header.
 * Pattern-based names (`proxy-*`, `sec-*`) are covered by
 * {@link hasForbiddenRequestHeaderPrefix}.
 */
export const reservedRequestHeaderNames: ReadonlySet<string> = new Set([
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
	// Owned by the endpoint or the fetch layer
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
]);

/**
 * Returns whether a lower-cased header name uses one of the forbidden
 * prefixes (`proxy-*`, `sec-*`) that browsers and fetch layers refuse to send.
 */
export function hasForbiddenRequestHeaderPrefix(lowerName: string): boolean {
	return lowerName.startsWith('proxy-') || lowerName.startsWith('sec-');
}

/**
 * Copies every header of `source` into `target`. HTTP header names are
 * case-insensitive, so an existing entry whose name differs only in casing is
 * replaced instead of being sent twice. The casing of the last writer wins.
 */
export function mergeRequestHeaders(target: Record<string, string>, source: Readonly<Record<string, string>>): void {
	for (const [name, value] of Object.entries(source)) {
		const lowerName = name.toLowerCase();
		for (const existing of Object.keys(target)) {
			if (existing !== name && existing.toLowerCase() === lowerName) {
				delete target[existing];
			}
		}
		target[name] = value;
	}
}

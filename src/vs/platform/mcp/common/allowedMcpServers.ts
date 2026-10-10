/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/arrays.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { isObject, isString } from '../../../base/common/types.js';

/**
 * A single entry in the `chat.mcp.allowedServers` allowlist. Identifies an MCP server by exactly
 * one strategy: its configured name, a remote server URL pattern (supporting `*` wildcards), or a
 * local stdio command invocation (matched as an ordered argument list). Delivered as JSON via user
 * settings or enterprise managed settings and validated at match time, so only the field matching
 * the intended strategy is meaningful.
 */
export interface IMcpServerMatcher {
	readonly serverName?: string;
	readonly serverUrl?: string;
	readonly serverCommand?: readonly string[];
}

/**
 * Normalized identity of an MCP server used for allowlist matching. Both the install-time and the
 * runtime enforcement paths reduce their server representation to this shape: `url` is set for
 * remote (HTTP/SSE) servers and `command` (the full `[command, ...args]` invocation) for local
 * stdio servers.
 */
export interface IMcpServerIdentity {
	readonly name: string;
	readonly url?: string;
	readonly command?: readonly string[];
}

/**
 * The result of evaluating an MCP server against the allow/deny lists.
 */
export const enum McpServerAllowResult {
	/** Permitted: not denied, and either no allowlist is configured or it matches one. */
	Allowed,
	/** Blocked because it matches a deny entry (deny always wins). */
	Denied,
	/** Blocked because an allowlist is configured and it matches no entry. */
	NotAllowed,
}

/**
 * Coerces a resolved `chat.mcp.allowedServers` / `chat.mcp.deniedServers` configuration value into a
 * list of matchers. Returns `undefined` (meaning "not configured") when the value is not an array —
 * which is also how an unset setting surfaces (the registered `null` default). Malformed matcher
 * entries (non-objects, or entries that do not carry exactly one valid matching field) are dropped
 * so a bad payload degrades to "no match" rather than throwing during matching.
 */
export function getMcpServerMatchers(value: unknown): readonly IMcpServerMatcher[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value.filter(isValidMatcher);
}

function isValidMatcher(entry: unknown): entry is IMcpServerMatcher {
	if (!isObject(entry)) {
		return false;
	}
	const { serverName, serverUrl, serverCommand } = entry as IMcpServerMatcher;
	const hasName = isString(serverName) && serverName.length > 0;
	const hasUrl = isString(serverUrl) && serverUrl.length > 0;
	const hasCommand = Array.isArray(serverCommand) && serverCommand.length > 0 && serverCommand.every(isString);
	// Exactly one matching strategy per the canonical schema's `oneOf`.
	return (hasName ? 1 : 0) + (hasUrl ? 1 : 0) + (hasCommand ? 1 : 0) === 1;
}

/**
 * Whether the server identity matches at least one of the given matchers. A `undefined` or empty
 * matcher list matches nothing.
 */
export function isMcpServerMatched(matchers: readonly IMcpServerMatcher[] | undefined, identity: IMcpServerIdentity): boolean {
	return !!matchers && matchers.some(matcher => matchesMatcher(matcher, identity));
}

/**
 * Evaluates an MCP server against the allow and deny lists. Deny always takes precedence; an unset
 * (`undefined`) allowlist imposes no restriction, while a configured allowlist requires a match.
 */
export function checkMcpServerAllowed(allowlist: readonly IMcpServerMatcher[] | undefined, denylist: readonly IMcpServerMatcher[] | undefined, identity: IMcpServerIdentity): McpServerAllowResult {
	if (isMcpServerMatched(denylist, identity)) {
		return McpServerAllowResult.Denied;
	}
	if (allowlist !== undefined && !isMcpServerMatched(allowlist, identity)) {
		return McpServerAllowResult.NotAllowed;
	}
	return McpServerAllowResult.Allowed;
}

function matchesMatcher(matcher: IMcpServerMatcher, identity: IMcpServerIdentity): boolean {
	if (isString(matcher.serverName)) {
		return matcher.serverName === identity.name;
	}
	if (isString(matcher.serverUrl)) {
		return identity.url !== undefined && matchesUrlPattern(matcher.serverUrl, identity.url);
	}
	if (Array.isArray(matcher.serverCommand)) {
		return identity.command !== undefined && equals(matcher.serverCommand, identity.command);
	}
	return false;
}

/**
 * Matches a URL against a `*` wildcard pattern. HTTP(S) URLs are compared as the WHATWG
 * network destination so an authority wildcard cannot disagree with `fetch` about the host.
 */
function matchesUrlPattern(pattern: string, url: string): boolean {
	const destination = toNetworkDestinationUrl(url);
	if (destination === undefined) {
		return false;
	}
	if (!pattern.includes('*')) {
		const expected = toNetworkDestinationUrl(pattern);
		return expected !== undefined && expected.toLowerCase() === destination.toLowerCase();
	}
	const normalizedPattern = toNetworkDestinationPattern(pattern);
	if (normalizedPattern === undefined) {
		return false;
	}
	try {
		return new RegExp(buildUrlPatternRegexSource(normalizedPattern), 'i').test(destination);
	} catch {
		return false;
	}
}

/**
 * Returns the HTTP(S) destination `fetch` will use, or `undefined` if `url` is not a valid URL.
 */
function toNetworkDestinationUrl(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
			return parsed.origin + parsed.pathname + parsed.search;
		}
		return url;
	} catch {
		return undefined;
	}
}

function toNetworkDestinationPattern(pattern: string): string | undefined {
	const schemeSeparator = pattern.indexOf('://');
	if (schemeSeparator < 0) {
		return pattern;
	}
	const scheme = pattern.slice(0, schemeSeparator).toLowerCase();
	if (scheme !== 'http' && scheme !== 'https') {
		return pattern;
	}

	const rest = pattern.slice(schemeSeparator + 3);
	const authorityEnd = findAuthorityEnd(rest, 0);
	let authority = rest.slice(0, authorityEnd);
	const userinfoEnd = authority.lastIndexOf('@');
	if (userinfoEnd >= 0) {
		authority = authority.slice(userinfoEnd + 1);
	}

	const hostAndPort = splitHostAndPort(authority);
	if (hostAndPort === undefined) {
		return undefined;
	}
	const defaultPort = scheme === 'https' ? '443' : '80';
	const port = hostAndPort.port === defaultPort ? undefined : hostAndPort.port;

	let afterAuthority = rest.slice(authorityEnd).replace(/\\/g, '/');
	const hash = afterAuthority.indexOf('#');
	if (hash >= 0) {
		afterAuthority = afterAuthority.slice(0, hash);
	}
	if (!afterAuthority) {
		afterAuthority = '/';
	} else if (afterAuthority.startsWith('?')) {
		afterAuthority = `/${afterAuthority}`;
	}

	return `${scheme}://${hostAndPort.host}${port !== undefined ? `:${port}` : ''}${afterAuthority}`;
}

function splitHostAndPort(authority: string): { host: string; port: string | undefined } | undefined {
	if (authority.startsWith('[')) {
		const close = authority.indexOf(']');
		if (close === -1) {
			return undefined;
		}
		if (authority[close + 1] === ':') {
			return { host: authority.slice(0, close + 1), port: authority.slice(close + 2) };
		}
		if (close + 1 < authority.length) {
			return undefined;
		}
		return { host: authority, port: undefined };
	}

	const colon = authority.lastIndexOf(':');
	if (colon >= 0) {
		return { host: authority.slice(0, colon), port: authority.slice(colon + 1) };
	}
	return authority ? { host: authority, port: undefined } : undefined;
}

function buildUrlPatternRegexSource(pattern: string): string {
	const schemeSeparator = pattern.indexOf('://');
	const authorityStart = schemeSeparator >= 0 ? schemeSeparator + 3 : 0;
	const authorityEnd = findAuthorityEnd(pattern, authorityStart);

	let source = '^';
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (i < authorityEnd && char === ':' && pattern[i + 1] === '*') {
			source += '(:[^/@\\\\?#]*)?';
			i++;
		} else if (char === '*') {
			source += i < authorityEnd ? '[^/@\\\\?#]*' : '.*';
		} else {
			source += escapeRegExpCharacters(char);
		}
	}
	return source + '$';
}

function findAuthorityEnd(pattern: string, authorityStart: number): number {
	for (let i = authorityStart; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === '/' || char === '\\' || char === '?' || char === '#') {
			return i;
		}
	}
	return pattern.length;
}

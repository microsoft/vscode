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
 * Matches a URL against a pattern that may contain `*` wildcards. Matching is case-insensitive,
 * anchored to the whole string, and every non-wildcard character is matched literally.
 *
 * Wildcard reach is region-aware so an authority wildcard cannot swallow the path: a `*` inside
 * the authority region (scheme + `//` + host/port, i.e. everything before the first `/` of the
 * path) matches any run of non-`/` characters, while a `*` in the path/query region matches any
 * run of characters. This prevents patterns like `https://*.example.com/*` from matching a URL
 * whose real host is untrusted, e.g. `https://evil.test/.example.com/tool`.
 */
function matchesUrlPattern(pattern: string, url: string): boolean {
	const regexSource = buildUrlPatternRegexSource(pattern);
	try {
		return new RegExp(regexSource, 'i').test(url);
	} catch {
		return false;
	}
}

function buildUrlPatternRegexSource(pattern: string): string {
	// The authority region spans from the start of the pattern up to (but not including) the first
	// `/` of the path. Wildcards there must not cross a `/` so they cannot consume path segments.
	const schemeSeparator = pattern.indexOf('://');
	const authorityStart = schemeSeparator >= 0 ? schemeSeparator + 3 : 0;
	const pathStart = pattern.indexOf('/', authorityStart);
	const authorityEnd = pathStart >= 0 ? pathStart : pattern.length;

	let source = '^';
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === '*') {
			source += i < authorityEnd ? '[^/]*' : '.*';
		} else {
			source += escapeRegExpCharacters(char);
		}
	}
	return source + '$';
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpAuthRequiredReason, McpServerStatusAuthRequired, McpServerStatusKind, ProtectedResourceMetadata } from '../../common/state/protocol/state.js';

/**
 * Parsed parts of an HTTP 401/403 auth challenge.
 */
export interface IMcpAuthChallenge {
	/** Required scopes from the `scope=` directive on `WWW-Authenticate`. */
	readonly scopes: readonly string[] | undefined;
	/** OAuth `error` directive (`invalid_token`, `insufficient_scope`, etc.) */
	readonly error: string | undefined;
	/** OAuth `error_description` directive — human-readable. */
	readonly errorDescription: string | undefined;
	/** URL of the RFC 9728 protected resource metadata document. */
	readonly resourceMetadataUrl: string | undefined;
}

const EMPTY_CHALLENGE: IMcpAuthChallenge = {
	scopes: undefined,
	error: undefined,
	errorDescription: undefined,
	resourceMetadataUrl: undefined,
};

/**
 * Parse a `WWW-Authenticate` header value. Tolerates missing fields and
 * returns all-undefined when the header is empty or doesn't start with
 * `Bearer`. Whitespace-tolerant; quoted values are unquoted.
 *
 * Caveat: this is NOT a fully RFC-7235-compliant parser — it handles
 * the subset of `Bearer ...` challenges MCP is documented to use.
 */
export function parseWwwAuthenticate(header: string | undefined): IMcpAuthChallenge {
	if (!header) {
		return EMPTY_CHALLENGE;
	}

	const trimmed = header.trim();
	const bearerMatch = /^Bearer(?:\s+(.*))?$/i.exec(trimmed);
	if (!bearerMatch) {
		return EMPTY_CHALLENGE;
	}

	const params = parseChallengeParams(bearerMatch[1] ?? '');

	const scopeRaw = params.get('scope');
	const scopes = scopeRaw === undefined
		? undefined
		: scopeRaw.split(/\s+/).filter(s => s.length > 0);

	return {
		scopes: scopes && scopes.length > 0 ? scopes : undefined,
		error: params.get('error'),
		errorDescription: params.get('error_description'),
		resourceMetadataUrl: params.get('resource_metadata'),
	};
}

/**
 * Parse a comma-separated list of `key=value` or `key="quoted value"`
 * pairs from the auth-param portion of a Bearer challenge. Defensive:
 * malformed input does not throw — keys without recognizable values are
 * skipped.
 */
function parseChallengeParams(input: string): Map<string, string> {
	const result = new Map<string, string>();
	// Matches: key=value where value is either a quoted string (with
	// optional escaped chars) or a token of non-whitespace, non-comma chars.
	const re = /([A-Za-z0-9_-]+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^,\s]*))/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(input)) !== null) {
		const key = m[1].toLowerCase();
		const quoted = m[2];
		const bare = m[3];
		const value = quoted !== undefined
			? quoted.replace(/\\(.)/g, '$1')
			: (bare ?? '');
		result.set(key, value);
	}
	return result;
}

/**
 * Compose an `McpServerStatusAuthRequired` from an HTTP status, the
 * parsed challenge, the resource metadata fetched from
 * `resource_metadata`, and whether a prior token had been used.
 */
export function buildAuthRequiredStatus(opts: {
	httpStatus: 401 | 403;
	challenge: IMcpAuthChallenge;
	/** RFC 9728 metadata fetched out-of-band. */
	resource: ProtectedResourceMetadata;
	/** True if the upstream had been previously authenticated. */
	hadPriorToken: boolean;
}): McpServerStatusAuthRequired {
	const { httpStatus, challenge, resource, hadPriorToken } = opts;

	let reason: McpAuthRequiredReason;
	if (httpStatus === 403 && challenge.error === 'insufficient_scope') {
		reason = McpAuthRequiredReason.InsufficientScope;
	} else if (httpStatus === 401 && hadPriorToken) {
		reason = McpAuthRequiredReason.Expired;
	} else {
		reason = McpAuthRequiredReason.Required;
	}

	const requiredScopes = challenge.scopes && challenge.scopes.length > 0
		? [...challenge.scopes]
		: (resource.scopes_supported && resource.scopes_supported.length > 0
			? [...resource.scopes_supported]
			: undefined);

	const status: McpServerStatusAuthRequired = {
		kind: McpServerStatusKind.AuthRequired,
		reason,
		resource,
	};
	if (requiredScopes) {
		status.requiredScopes = requiredScopes;
	}
	if (challenge.errorDescription) {
		status.description = challenge.errorDescription;
	}
	return status;
}

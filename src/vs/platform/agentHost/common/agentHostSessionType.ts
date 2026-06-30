/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentProvider } from './agentService.js';

const REMOTE_AGENT_HOST_SESSION_TYPE_PREFIX = 'remote-';

/**
 * Builds the unique per-connection identifier for a remote agent host.
 *
 * This string is used as the resource URI scheme registered via
 * `registerChatSessionContentProvider` and as the language model vendor /
 * `targetChatSessionType` published by `AgentHostLanguageModelProvider`.
 */
export function remoteAgentHostSessionTypeId(connectionAuthority: string, agentProvider: AgentProvider): string {
	return `${remoteAgentHostSessionTypeAuthorityPrefix(connectionAuthority)}${agentProvider}`;
}

/**
 * Builds the authority-specific prefix for remote agent host session types.
 */
export function remoteAgentHostSessionTypeAuthorityPrefix(connectionAuthority: string): string {
	return `${REMOTE_AGENT_HOST_SESSION_TYPE_PREFIX}${connectionAuthority}-`;
}

/**
 * Returns whether the given session type uses the remote agent host scheme.
 */
export function isRemoteAgentHostSessionType(sessionType: string): boolean {
	return sessionType.startsWith(REMOTE_AGENT_HOST_SESSION_TYPE_PREFIX);
}

/**
 * Finds the best matching remote agent host authority from a known candidate set.
 *
 * Remote session types are formatted as `remote-{authority}-{provider}` and
 * authorities may contain `-`, so callers should match against the full set of
 * known authorities instead of splitting the session type.
 */
export function findRemoteAgentHostSessionTypeAuthority(sessionType: string, connectionAuthorities: Iterable<string>): string | undefined {
	if (!isRemoteAgentHostSessionType(sessionType)) {
		return undefined;
	}

	let bestMatch: string | undefined;
	for (const authority of connectionAuthorities) {
		if (isRemoteAgentHostSessionTypeForAuthority(sessionType, authority) && (!bestMatch || authority.length > bestMatch.length)) {
			bestMatch = authority;
		}
	}
	return bestMatch;
}

function isRemoteAgentHostSessionTypeForAuthority(sessionType: string, connectionAuthority: string): boolean {
	return !!connectionAuthority && sessionType.startsWith(remoteAgentHostSessionTypeAuthorityPrefix(connectionAuthority));
}

/**
 * Extracts the connection authority from a remote agent host session type when the provider is known.
 */
export function parseRemoteAgentHostSessionTypeAuthority(sessionType: string, agentProvider: AgentProvider): string | undefined {
	if (!isRemoteAgentHostSessionType(sessionType)) {
		return undefined;
	}

	const providerSuffix = `-${agentProvider}`;
	if (!sessionType.endsWith(providerSuffix)) {
		return undefined;
	}

	const authority = sessionType.slice(REMOTE_AGENT_HOST_SESSION_TYPE_PREFIX.length, sessionType.length - providerSuffix.length);
	return authority || undefined;
}

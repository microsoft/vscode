/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostConnectionInfo } from '../../../../platform/agentHost/common/remoteAgentHostService.js';

// Scheme conventions for `copilotcli` chat sessions:
// - Local AH:  `agent-host-copilotcli:/<id>`         (LOCAL_RESOURCE_SCHEME_PREFIX + provider)
// - Remote AH: `remote-<auth>-copilotcli:/<id>`      (remoteAgentHostSessionTypeId)
// - EH CLI ext: `copilotcli:/<id>`                   (extension's own session type)
const COPILOT_CLI_PROVIDER = 'copilotcli';
export const COPILOT_CLI_LOCAL_AH_SCHEME = `agent-host-${COPILOT_CLI_PROVIDER}`;
export const COPILOT_CLI_EH_SCHEME = COPILOT_CLI_PROVIDER;
const REMOTE_PROVIDER_PREFIX = 'remote-';
const REMOTE_PROVIDER_SUFFIX = `-${COPILOT_CLI_PROVIDER}`;

/**
 * Builds the local `events.jsonl` URI under `~/.copilot/session-state/<rawId>/`.
 *
 * Used for both the local Agent Host Copilot CLI provider and the
 * extension-host Copilot CLI provider, which share the same on-disk layout
 * and the same chat session URI shape (`copilotcli:/<rawId>`).
 */
export function buildLocalEventsUri(userHome: URI, rawSessionId: string): URI {
	return joinPath(userHome, '.copilot', 'session-state', rawSessionId, 'events.jsonl');
}

/**
 * Builds a `vscode-agent-host://` URI for the `events.jsonl` file inside
 * the host's user home directory, using the connection's reported
 * `defaultDirectory` (set from `os.homedir()` on the host during the
 * AHP handshake).
 *
 * The path is joined at the URI-path level using forward slashes, which
 * works for both POSIX hosts (`/home/me`) and Windows hosts whose
 * `URI.file(os.homedir()).path` is also forward-slash-rooted (e.g.
 * `/c:/Users/me`). Returns `undefined` if the host did not report a
 * usable `defaultDirectory`.
 */
export function buildRemoteEventsUri(connection: IRemoteAgentHostConnectionInfo, rawSessionId: string): URI | undefined {
	const homePath = connection.defaultDirectory;
	if (!homePath) {
		return undefined;
	}
	const trimmed = homePath.endsWith('/') ? homePath.slice(0, -1) : homePath;
	const remoteFileUri = URI.from({
		scheme: 'file',
		path: `${trimmed}/.copilot/session-state/${rawSessionId}/events.jsonl`,
	});
	const authority = agentHostAuthority(connection.address);
	return toAgentHostUri(remoteFileUri, authority);
}

/**
 * Parses the connection authority out of a remote AH chat session scheme
 * of the form `remote-<authority>-copilotcli`. Returns `undefined` for
 * any other scheme, including the local `copilotcli` scheme.
 */
export function parseRemoteAuthorityFromScheme(scheme: string): string | undefined {
	if (!scheme.startsWith(REMOTE_PROVIDER_PREFIX) || !scheme.endsWith(REMOTE_PROVIDER_SUFFIX)) {
		return undefined;
	}
	const authority = scheme.slice(REMOTE_PROVIDER_PREFIX.length, scheme.length - REMOTE_PROVIDER_SUFFIX.length);
	return authority || undefined;
}

export type ResolveEventsUriResult =
	| { readonly kind: 'ok'; readonly resource: URI }
	| { readonly kind: 'no-session' }
	| { readonly kind: 'unsupported-scheme'; readonly scheme: string }
	| { readonly kind: 'remote-not-connected'; readonly authority: string }
	| { readonly kind: 'remote-no-home'; readonly authority: string };

/**
 * Pure resolver for tests. Translates a chat session resource into the
 * `events.jsonl` URI for the corresponding Copilot CLI session, or
 * returns a structured error.
 */
export function resolveEventsUri(
	sessionResource: URI | undefined,
	userHome: URI,
	getConnectionByAuthority: (authority: string) => IRemoteAgentHostConnectionInfo | undefined,
): ResolveEventsUriResult {
	if (!sessionResource) {
		return { kind: 'no-session' };
	}
	const rawId = sessionResource.path.startsWith('/') ? sessionResource.path.substring(1) : sessionResource.path;
	if (!rawId) {
		return { kind: 'no-session' };
	}

	if (sessionResource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME || sessionResource.scheme === COPILOT_CLI_EH_SCHEME) {
		return { kind: 'ok', resource: buildLocalEventsUri(userHome, rawId) };
	}

	const remoteAuthority = parseRemoteAuthorityFromScheme(sessionResource.scheme);
	if (remoteAuthority) {
		const connection = getConnectionByAuthority(remoteAuthority);
		if (!connection) {
			return { kind: 'remote-not-connected', authority: remoteAuthority };
		}
		const resource = buildRemoteEventsUri(connection, rawId);
		if (!resource) {
			return { kind: 'remote-no-home', authority: remoteAuthority };
		}
		return { kind: 'ok', resource };
	}

	return { kind: 'unsupported-scheme', scheme: sessionResource.scheme };
}

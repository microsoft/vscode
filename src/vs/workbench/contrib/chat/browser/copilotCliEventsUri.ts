/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { parseRemoteAgentHostSessionTypeAuthority } from '../../../../platform/agentHost/common/agentHostSessionType.js';
import { agentHostAuthority, fromAgentHostUri, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostConnectionInfo } from '../../../../platform/agentHost/common/remoteAgentHostService.js';

// Scheme conventions for `copilotcli` chat sessions:
// - Local AH:  `agent-host-copilotcli:/<id>`         (LOCAL_RESOURCE_SCHEME_PREFIX + provider)
// - Remote AH: `remote-<auth>-copilotcli:/<id>`      (remoteAgentHostSessionTypeId, agent.provider = 'copilotcli')
// - EH CLI ext: `copilotcli:/<id>`                   (extension's own session type)
// The copilot agent reports its provider id as `copilotcli` on every host, so
// the local, remote and EH schemes all carry the `copilotcli` token.
const COPILOT_CLI_PROVIDER = 'copilotcli';
export const COPILOT_CLI_LOCAL_AH_SCHEME = `agent-host-${COPILOT_CLI_PROVIDER}`;
export const COPILOT_CLI_EH_SCHEME = COPILOT_CLI_PROVIDER;

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
 * Builds the local `~/.copilot/logs` directory URI.
 */
export function buildLocalCopilotLogsUri(userHome: URI): URI {
	return joinPath(userHome, '.copilot', 'logs');
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
 * Builds a `vscode-agent-host://` URI for the host's `~/.copilot/logs`
 * directory, using the connection's reported home directory.
 */
export function buildRemoteCopilotLogsUri(connection: IRemoteAgentHostConnectionInfo): URI | undefined {
	const homePath = connection.defaultDirectory;
	if (!homePath) {
		return undefined;
	}
	const trimmed = homePath.endsWith('/') ? homePath.slice(0, -1) : homePath;
	const remoteFileUri = URI.from({
		scheme: 'file',
		path: `${trimmed}/.copilot/logs`,
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
	return parseRemoteAgentHostSessionTypeAuthority(scheme, COPILOT_CLI_PROVIDER);
}

/**
 * Extracts the raw Copilot CLI session id from a chat session resource.
 */
export function getCopilotCliSessionRawId(sessionResource: URI | undefined): string | undefined {
	if (!sessionResource) {
		return undefined;
	}
	if (sessionResource.scheme !== COPILOT_CLI_LOCAL_AH_SCHEME && sessionResource.scheme !== COPILOT_CLI_EH_SCHEME && !parseRemoteAuthorityFromScheme(sessionResource.scheme)) {
		return undefined;
	}
	return getRawSessionId(sessionResource);
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
	const rawId = getRawSessionId(sessionResource);
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

function getRawSessionId(sessionResource: URI): string | undefined {
	const rawId = sessionResource.path.startsWith('/') ? sessionResource.path.substring(1) : sessionResource.path;
	return rawId || undefined;
}

/**
 * Resolves the host-local filesystem path string of a Copilot CLI session's
 * `events.jsonl`, suitable for tooling that runs **on the host** (e.g. the
 * agent's terminal), as opposed to a workbench {@link URI} consumed by the
 * file service.
 *
 * Reuses {@link resolveEventsUri} so it stays in lockstep with the resolution
 * used by the chat debug panel and the "Open Copilot CLI State File" command,
 * then unwraps the result into a plain path:
 * - a local `file://` URI becomes its `fsPath` (same machine as the host).
 * - a remote `vscode-agent-host://` URI is unwrapped to the underlying file
 *   URI whose `path` is the real path on the remote host the agent runs on.
 *
 * Returns `undefined` when the session is not a Copilot CLI session or the
 * path cannot be resolved (e.g. a remote host that reported no home directory).
 */
export function buildHostLocalEventsPath(
	sessionResource: URI | undefined,
	userHome: URI,
	getConnectionByAuthority: (authority: string) => IRemoteAgentHostConnectionInfo | undefined,
): string | undefined {
	const result = resolveEventsUri(sessionResource, userHome, getConnectionByAuthority);
	if (result.kind !== 'ok') {
		return undefined;
	}
	if (result.resource.scheme === Schemas.file) {
		return result.resource.fsPath;
	}
	// A remote agent-host URI wraps the host-local file URI; its `path` is the
	// real path on the remote host where the agent (and the skill) execute. Strip
	// the leading slash from a Windows drive-letter path (`/c:/…` → `c:/…`) so the
	// injected path is usable by host-side tooling; POSIX paths are left as-is.
	return fromAgentHostUri(result.resource).path.replace(/^\/([a-zA-Z]:)/, '$1');
}

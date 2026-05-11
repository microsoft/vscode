/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IsAgentHostSession } from './agentHostSkillButtons.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';

// Scheme conventions for `copilotcli` chat sessions:
// - Local AH:  `agent-host-copilotcli:/<id>`         (LOCAL_RESOURCE_SCHEME_PREFIX + provider)
// - Remote AH: `remote-<auth>-copilotcli:/<id>`      (remoteAgentHostSessionTypeId)
// - EH CLI ext: `copilotcli:/<id>`                   (extension's own session type)
const COPILOT_CLI_PROVIDER = 'copilotcli';
const LOCAL_AH_SCHEME = `agent-host-${COPILOT_CLI_PROVIDER}`;
const EH_CLI_SCHEME = COPILOT_CLI_PROVIDER;
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

	if (sessionResource.scheme === LOCAL_AH_SCHEME || sessionResource.scheme === EH_CLI_SCHEME) {
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

export class OpenSessionEventsFileAction extends Action2 {

	static readonly ID = 'agentHost.openSessionEventsFile';

	constructor() {
		super({
			id: OpenSessionEventsFileAction.ID,
			title: localize2('openSessionEventsFile', "Open Copilot CLI State File"),
			f1: true,
			category: Categories.Developer,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsAgentHostSession),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const pathService = accessor.get(IPathService);
		const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		const sessionResource = sessionsManagementService.activeSession.get()?.resource;
		const userHome = pathService.userHome({ preferLocal: true });

		const result = resolveEventsUri(
			sessionResource,
			userHome,
			authority => remoteAgentHostService.connections.find(c => agentHostAuthority(c.address) === authority),
		);

		switch (result.kind) {
			case 'ok':
				await editorService.openEditor({ resource: result.resource });
				return;
			case 'no-session':
				notificationService.info(localize('openSessionEventsFile.noSession', "No Copilot CLI session is active."));
				return;
			case 'unsupported-scheme':
				notificationService.info(localize('openSessionEventsFile.unsupported', "The active chat session is not a Copilot CLI session."));
				return;
			case 'remote-not-connected':
				notificationService.warn(localize('openSessionEventsFile.notConnected', "No active connection found for remote agent host '{0}'.", result.authority));
				return;
			case 'remote-no-home':
				notificationService.warn(localize('openSessionEventsFile.noHome', "Remote agent host '{0}' did not report a home directory.", result.authority));
				return;
		}
	}
}

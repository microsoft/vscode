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
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IOutputService } from '../../../../workbench/services/output/common/output.js';
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

/** Output channel ID for the agent host process logger (forwarded via RemoteLoggerChannelClient). */
const AGENT_HOST_LOGGER_CHANNEL_ID = 'agenthost';
/** Output channel ID for the current window's renderer log. */
const WINDOW_LOG_CHANNEL_ID = 'rendererLog';
/** Output channel ID for the shared process compound log. */
const SHARED_PROCESS_LOG_CHANNEL_ID = 'shared';

export class CollectAgentHostDebugLogsAction extends Action2 {

	static readonly ID = 'agentHost.collectDebugLogs';

	constructor() {
		super({
			id: CollectAgentHostDebugLogsAction.ID,
			title: localize2('collectAgentHostDebugLogs', "Collect Agent Host Debug Logs"),
			f1: true,
			category: Categories.Developer,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsAgentHostSession),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const pathService = accessor.get(IPathService);
		const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
		const agentHostService = accessor.get(IAgentHostService);
		const outputService = accessor.get(IOutputService);
		const fileService = accessor.get(IFileService);
		const fileDialogService = accessor.get(IFileDialogService);
		const nativeHostService = accessor.get(INativeHostService);
		const notificationService = accessor.get(INotificationService);
		const textModelService = accessor.get(ITextModelService);

		const sessionResource = sessionsManagementService.activeSession.get()?.resource;
		const userHome = pathService.userHome({ preferLocal: true });

		const eventsResult = resolveEventsUri(
			sessionResource,
			userHome,
			authority => remoteAgentHostService.connections.find(c => agentHostAuthority(c.address) === authority),
		);

		switch (eventsResult.kind) {
			case 'no-session':
				notificationService.info(localize('collectDebugLogs.noSession', "No Copilot CLI session is active."));
				return;
			case 'unsupported-scheme':
				notificationService.info(localize('collectDebugLogs.unsupported', "The active chat session is not a Copilot CLI session."));
				return;
			case 'remote-not-connected':
				notificationService.warn(localize('collectDebugLogs.notConnected', "No active connection found for remote agent host '{0}'.", eventsResult.authority));
				return;
			case 'remote-no-home':
				notificationService.warn(localize('collectDebugLogs.noHome', "Remote agent host '{0}' did not report a home directory.", eventsResult.authority));
				return;
		}

		const isLocal = sessionResource?.scheme === LOCAL_AH_SCHEME || sessionResource?.scheme === EH_CLI_SCHEME;

		// Collect all output channel IDs relevant for the current session's agent host.
		const channelIds: string[] = [];

		if (isLocal) {
			// IPC traffic log for the local agent host connection
			channelIds.push(`agenthost.${agentHostService.clientId}`);
			// Agent host process logger (forwarded from the utility process)
			channelIds.push(AGENT_HOST_LOGGER_CHANNEL_ID);
		} else {
			const remoteAuthority = parseRemoteAuthorityFromScheme(sessionResource!.scheme);
			if (remoteAuthority) {
				const connection = remoteAgentHostService.connections.find(c => agentHostAuthority(c.address) === remoteAuthority);
				if (connection) {
					channelIds.push(`agenthost.${connection.clientId}`);
				}
			}
		}

		// Always include the window and shared process logs
		channelIds.push(WINDOW_LOG_CHANNEL_ID);
		channelIds.push(SHARED_PROCESS_LOG_CHANNEL_ID);

		const files: { path: string; contents: string }[] = [];

		// 1. events.jsonl
		try {
			const content = await fileService.readFile(eventsResult.resource);
			files.push({ path: 'events.jsonl', contents: content.value.toString() });
		} catch {
			// File may not exist yet if the session never wrote any events
		}

		// 2. Output channels
		for (const channelId of channelIds) {
			const channel = outputService.getChannel(channelId);
			const descriptor = outputService.getChannelDescriptor(channelId);
			if (!channel || !descriptor) {
				continue;
			}
			const modelRef = await textModelService.createModelReference(channel.uri);
			try {
				const filename = `${descriptor.label.replace(/[/\\:*?"<>|]/g, '-')}.log`;
				files.push({ path: filename, contents: modelRef.object.textEditorModel.getValue() });
			} finally {
				modelRef.dispose();
			}
		}

		if (files.length === 0) {
			notificationService.notify({
				severity: Severity.Warning,
				message: localize('collectDebugLogs.noFiles', "No log files were found for the active session."),
			});
			return;
		}

		const sessionTitle = sessionsManagementService.activeSession.get()?.title.get();
		const titleSlug = sessionTitle
			? `-${sessionTitle.replace(/[/\\:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}`
			: '';
		const defaultUri = joinPath(await fileDialogService.defaultFilePath(), `ah-logs${titleSlug}.zip`);
		const saveUri = await fileDialogService.showSaveDialog({
			title: localize('collectDebugLogs.saveDialogTitle', "Save Agent Host Debug Logs"),
			defaultUri,
			filters: [{ name: localize('collectDebugLogs.zipFilter', "Zip Archive"), extensions: ['zip'] }],
		});

		if (!saveUri) {
			return;
		}

		try {
			await nativeHostService.createZipFile(saveUri, files);
		} catch (error) {
			notificationService.notify({
				severity: Severity.Error,
				message: localize('collectDebugLogs.saveError', "Failed to save debug logs: {0}", error instanceof Error ? error.message : String(error)),
			});
		}
	}
}

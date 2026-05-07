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
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IOutputService } from '../../../../workbench/services/output/common/output.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IsAgentHostSession } from '../browser/agentHostSkillButtons.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { resolveEventsUri, parseRemoteAuthorityFromScheme } from '../browser/openSessionEventsFileActions.js';

/** Output channel ID for the agent host process logger (forwarded via RemoteLoggerChannelClient). */
const AGENT_HOST_LOGGER_CHANNEL_ID = 'agenthost';
/** Output channel ID for the current window's renderer log. */
const WINDOW_LOG_CHANNEL_ID = 'rendererLog';
/** Output channel ID for the shared process compound log. */
const SHARED_PROCESS_LOG_CHANNEL_ID = 'shared';

const LOCAL_AH_SCHEME = 'agent-host-copilotcli';
const EH_CLI_SCHEME = 'copilotcli';

export class ExportAgentHostDebugLogsAction extends Action2 {

	static readonly ID = 'agentHost.exportDebugLogs';

	constructor() {
		super({
			id: ExportAgentHostDebugLogsAction.ID,
			title: localize2('exportAgentHostDebugLogs', "Export Agent Host Debug Logs..."),
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
		const productService = accessor.get(IProductService);
		const logService = accessor.get(ILogService);

		const sessionResource = sessionsManagementService.activeSession.get()?.resource;
		const userHome = pathService.userHome({ preferLocal: true });

		const eventsResult = resolveEventsUri(
			sessionResource,
			userHome,
			authority => remoteAgentHostService.connections.find(c => agentHostAuthority(c.address) === authority),
		);

		switch (eventsResult.kind) {
			case 'no-session':
				notificationService.info(localize('exportDebugLogs.noSession', "No Copilot CLI session is active."));
				return;
			case 'unsupported-scheme':
				notificationService.info(localize('exportDebugLogs.unsupported', "The active chat session is not a Copilot CLI session."));
				return;
			case 'remote-not-connected':
				notificationService.warn(localize('exportDebugLogs.notConnected', "No active connection found for remote agent host '{0}'.", eventsResult.authority));
				return;
			case 'remote-no-home':
				notificationService.warn(localize('exportDebugLogs.noHome', "Remote agent host '{0}' did not report a home directory.", eventsResult.authority));
				return;
		}

		const isLocal = sessionResource?.scheme === LOCAL_AH_SCHEME || sessionResource?.scheme === EH_CLI_SCHEME;

		// Collect all output channel IDs relevant for the current session's agent host.
		const channelIds: string[] = [];

		// Remote agent host connection (if any), for downloading agenthost.log from the remote.
		let remoteConnection: IRemoteAgentHostConnectionInfo | undefined;

		if (isLocal) {
			// IPC traffic log for the local agent host connection
			channelIds.push(`agenthost.${agentHostService.clientId}`);
			// Agent host process logger (forwarded from the utility process)
			channelIds.push(AGENT_HOST_LOGGER_CHANNEL_ID);
		} else {
			const remoteAuthority = parseRemoteAuthorityFromScheme(sessionResource!.scheme);
			if (remoteAuthority) {
				remoteConnection = remoteAgentHostService.connections.find(c => agentHostAuthority(c.address) === remoteAuthority);
				if (remoteConnection) {
					channelIds.push(`agenthost.${remoteConnection.clientId}`);
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

		// 3. For remote agent hosts, also download the agenthost.log file directly from
		// the remote machine. The CLI launches the server with its default data dir,
		// which lives at `<home>/<serverDataFolderName>/data/logs/<datestamp>/agenthost.log`.
		if (remoteConnection?.defaultDirectory) {
			try {
				const remoteLog = await readRemoteAgentHostLog(remoteConnection, productService.serverDataFolderName, fileService);
				if (remoteLog) {
					files.push({ path: 'remote-agenthost.log', contents: remoteLog });
				}
			} catch (error) {
				logService.warn(`[ExportAgentHostDebugLogs] Failed to download remote agenthost.log: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (files.length === 0) {
			notificationService.notify({
				severity: Severity.Warning,
				message: localize('exportDebugLogs.noFiles', "No log files were found for the active session."),
			});
			return;
		}

		const sessionTitle = sessionsManagementService.activeSession.get()?.title.get();
		const titleSlug = sessionTitle
			? `-${sessionTitle.replace(/[/\\:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}`
			: '';
		const defaultUri = joinPath(await fileDialogService.defaultFilePath(), `ah-logs${titleSlug}.zip`);
		const saveUri = await fileDialogService.showSaveDialog({
			title: localize('exportDebugLogs.saveDialogTitle', "Export Agent Host Debug Logs"),
			defaultUri,
			filters: [{ name: localize('exportDebugLogs.zipFilter', "Zip Archive"), extensions: ['zip'] }],
		});

		if (!saveUri) {
			return;
		}

		try {
			await nativeHostService.createZipFile(saveUri, files);
		} catch (error) {
			notificationService.notify({
				severity: Severity.Error,
				message: localize('exportDebugLogs.saveError', "Failed to save debug logs: {0}", error instanceof Error ? error.message : String(error)),
			});
		}
	}
}

/**
 * Reads the remote agent host's `agenthost.log` from the remote machine via the
 * `vscode-agent-host://` filesystem proxy. The CLI launches the server with its
 * default data dir at `<home>/<serverDataFolderName>/data/logs/<datestamp>/`,
 * so we list the logs directory and pick the most recent date-stamped folder.
 */
async function readRemoteAgentHostLog(
	connection: IRemoteAgentHostConnectionInfo,
	serverDataFolderName: string | undefined,
	fileService: IFileService,
): Promise<string | undefined> {
	const homePath = connection.defaultDirectory;
	if (!homePath) {
		return undefined;
	}
	const authority = agentHostAuthority(connection.address);
	const homeUri = toAgentHostUri(URI.from({ scheme: 'file', path: homePath }), authority);

	// Possible server data folder candidates. The renderer's own
	// `serverDataFolderName` (which the user is running) is the most likely
	// match, but the remote agent host may have been launched by a different
	// quality of CLI. Dev builds also append `-dev`, which won't exist on
	// any real built remote, so we strip that suffix as well.
	const candidates = new Set<string>();
	if (serverDataFolderName) {
		candidates.add(serverDataFolderName);
		if (serverDataFolderName.endsWith('-dev')) {
			candidates.add(serverDataFolderName.slice(0, -'-dev'.length));
		}
	}
	candidates.add('.vscode-server');
	candidates.add('.vscode-server-insiders');
	candidates.add('.vscode-server-oss');
	candidates.add('.vscode-server-exploration');

	// Enumerate every `<home>/<candidate>/data/logs/<datestamp>/agenthost.log`
	// across all candidates and pick the one with the newest mtime. This avoids
	// picking up a stale stable-quality folder when an insiders folder has a
	// more recent log (or vice versa).
	let best: { uri: URI; mtime: number } | undefined;
	for (const folderName of candidates) {
		const logsDirUri = joinPath(homeUri, folderName, 'data', 'logs');
		let entries;
		try {
			const stat = await fileService.resolve(logsDirUri, { resolveMetadata: true });
			entries = stat.children;
		} catch {
			continue;
		}
		if (!entries) {
			continue;
		}
		for (const dir of entries) {
			if (!dir.isDirectory) {
				continue;
			}
			const logUri = joinPath(dir.resource, 'agenthost.log');
			let logStat;
			try {
				logStat = await fileService.resolve(logUri, { resolveMetadata: true });
			} catch {
				continue;
			}
			const mtime = logStat.mtime ?? 0;
			if (!best || mtime > best.mtime) {
				best = { uri: logUri, mtime };
			}
		}
	}

	if (!best) {
		return undefined;
	}
	const content = await fileService.readFile(best.uri);
	return content.value.toString();
}

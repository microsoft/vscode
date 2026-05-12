/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentHostEnabledSettingId, IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IChatWidgetService } from '../../browser/chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { COPILOT_CLI_LOCAL_AH_SCHEME, parseRemoteAuthorityFromScheme, resolveEventsUri } from '../../browser/copilotCliEventsUri.js';

/** Output channel ID for the agent host process logger (forwarded via RemoteLoggerChannelClient). */
const AGENT_HOST_LOGGER_CHANNEL_ID = 'agenthost';
/** Output channel ID for the current window's renderer log. */
const WINDOW_LOG_CHANNEL_ID = 'rendererLog';
/** Output channel ID for the shared process compound log. */
const SHARED_PROCESS_LOG_CHANNEL_ID = 'shared';

/**
 * Description of the agent-host session whose logs should be exported. If
 * not provided, the action exports all agent-host-related logs for the
 * current window (no session-specific scoping or events file).
 */
export interface IActiveAgentHostSessionForExport {
	/** The chat session resource. */
	readonly resource: URI;
	/** Optional display title used to derive the default zip filename. */
	readonly title: string | undefined;
	/** True for local agent-host sessions (`agent-host-*` scheme). */
	readonly isLocal: boolean;
}

/**
 * Shared implementation of "Export Agent Host Debug Logs". Collects the
 * Copilot CLI session events file (if available), the window/shared/agent-host
 * output channel logs, and the AHP transport JSONL logs into a single zip file
 * chosen by the user via a save dialog.
 *
 * Both the workbench-side action (resolves the active session via
 * `IChatWidgetService`) and the sessions-app-side action (resolves it via
 * `ISessionsManagementService`) call into this helper.
 */
export async function exportAgentHostDebugLogs(
	accessor: ServicesAccessor,
	activeSession: IActiveAgentHostSessionForExport | undefined,
): Promise<void> {
	const pathService = accessor.get(IPathService);
	const agentHostService = accessor.get(IAgentHostService);
	const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
	const outputService = accessor.get(IOutputService);
	const fileService = accessor.get(IFileService);
	const fileDialogService = accessor.get(IFileDialogService);
	const nativeHostService = accessor.get(INativeHostService);
	const notificationService = accessor.get(INotificationService);
	const textModelService = accessor.get(ITextModelService);
	const productService = accessor.get(IProductService);
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IEnvironmentService);

	const userHome = pathService.userHome({ preferLocal: true });

	const eventsResult = resolveEventsUri(
		activeSession?.resource,
		userHome,
		authority => remoteAgentHostService.connections.find(c => agentHostAuthority(c.address) === authority),
	);

	// Collect all output channel IDs relevant for the current session's agent host.
	const channelIds = new Set<string>();

	// Remote agent host connection (if any), for downloading agenthost.log from the remote.
	let remoteConnection: IRemoteAgentHostConnectionInfo | undefined;
	let ahpLogNameFilter: ((name: string) => boolean) | undefined;

	if (activeSession) {
		if (activeSession.isLocal) {
			// Agent host process logger (forwarded from the utility process)
			channelIds.add(AGENT_HOST_LOGGER_CHANNEL_ID);
			channelIds.add(`agenthost.${agentHostService.clientId}`);
			const localClientId = sanitizeFilePart(agentHostService.clientId);
			ahpLogNameFilter = name => name.includes(localClientId);
		} else {
			remoteConnection = getRemoteConnectionForSession(activeSession.resource, remoteAgentHostService.connections);
			if (remoteConnection) {
				channelIds.add(`agenthost.${remoteConnection.clientId}`);
			}
		}
	} else {
		channelIds.add(AGENT_HOST_LOGGER_CHANNEL_ID);
		channelIds.add(`agenthost.${agentHostService.clientId}`);
		for (const connection of remoteAgentHostService.connections) {
			channelIds.add(`agenthost.${connection.clientId}`);
		}
	}

	// Always include the window and shared process logs
	channelIds.add(WINDOW_LOG_CHANNEL_ID);
	channelIds.add(SHARED_PROCESS_LOG_CHANNEL_ID);

	const files: { path: string; contents: string }[] = [];

	// 1. events.jsonl
	if (eventsResult.kind === 'ok') {
		try {
			const content = await fileService.readFile(eventsResult.resource);
			files.push({ path: 'events.jsonl', contents: content.value.toString() });
		} catch {
			// File may not exist yet if the session never wrote any events
		}
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

	// 3. AHP transport JSONL logs (one file per remote connection, written under <logsHome>/ahp/).
	// These replace the per-connection `agenthost.<clientId>` IPC traffic output channel.
	try {
		const ahpDir = joinPath(environmentService.logsHome, 'ahp');
		const stat = await fileService.resolve(ahpDir, { resolveMetadata: true });
		for (const child of stat.children ?? []) {
			if (child.isDirectory || !child.name.endsWith('.jsonl') || ahpLogNameFilter && !ahpLogNameFilter(child.name)) {
				continue;
			}
			try {
				const content = await fileService.readFile(child.resource);
				files.push({ path: `ahp/${child.name}`, contents: content.value.toString() });
			} catch (error) {
				logService.warn(`[ExportAgentHostDebugLogs] Failed to read AHP log '${child.name}': ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	} catch {
		// AHP log directory may not exist if no remote connection has been opened or if logging is disabled.
	}

	// 4. For remote agent hosts, also download the agenthost.log file directly from
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
			message: activeSession
				? localize('exportDebugLogs.noFiles.activeSession', "No log files were found for the active Agent Host session.")
				: localize('exportDebugLogs.noFiles.currentWindow', "No Agent Host log files were found for the current window."),
		});
		return;
	}

	const titleSlug = activeSession?.title
		? `-${activeSession.title.replace(/[/\\:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}`
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

/**
 * Workbench-side action. Uses the last-focused chat widget's view model to
 * find the active Copilot CLI chat session. Suitable for vscode where the
 * agents-window-specific `ISessionsManagementService` is not present.
 */
export class ExportAgentHostDebugLogsAction extends Action2 {

	static readonly ID = 'workbench.action.chat.exportAgentHostDebugLogs';

	constructor() {
		super({
			id: ExportAgentHostDebugLogsAction.ID,
			title: localize2('exportAgentHostDebugLogs', "Export Agent Host Debug Logs..."),
			f1: true,
			category: Categories.Developer,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.equals(`config.${AgentHostEnabledSettingId}`, true),
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const widget = chatWidgetService.lastFocusedWidget;
		const model = widget?.viewModel?.model;
		const activeSession = model ? toActiveAgentHostSession(model.sessionResource, model.title) : undefined;
		await exportAgentHostDebugLogs(accessor, activeSession);
	}
}

/**
 * Translates a chat session URI scheme into an agent-host session context,
 * or `undefined` if the scheme does not belong to a Copilot CLI agent-host
 * session (i.e. local AH or remote AH; the EH CLI extension's own
 * `copilotcli:` sessions are excluded).
 */
function toActiveAgentHostSession(resource: URI, title: string | undefined): IActiveAgentHostSessionForExport | undefined {
	if (resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME) {
		return { resource, title, isLocal: true };
	}
	if (parseRemoteAuthorityFromScheme(resource.scheme)) {
		return { resource, title, isLocal: false };
	}
	return undefined;
}

function getRemoteConnectionForSession(sessionResource: URI, connections: readonly IRemoteAgentHostConnectionInfo[]): IRemoteAgentHostConnectionInfo | undefined {
	return connections.find(connection => sessionResource.scheme.startsWith(`remote-${agentHostAuthority(connection.address)}-`));
}

function sanitizeFilePart(value: string): string {
	return value.replace(/[\\/:\*\?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'connection';
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, streamToBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { extname, joinPath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, remoteAgentHostLogOutputChannelId, AGENT_HOST_LOG_OUTPUT_CHANNEL_ID } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { buildLocalCopilotLogsUri, buildRemoteCopilotLogsUri, getCopilotCliSessionRawId, parseRemoteAuthorityFromScheme, resolveEventsUri } from '../copilotCliEventsUri.js';
import { findCopilotLogsForSession, getRemoteConnectionForSession, readRemoteAgentHostLog } from '../chatDebug/agentHostLogSources.js';
import { sanitizeFilePart } from '../../../../../platform/agentHost/common/agentHostLogNaming.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { readSessionDebugArtifacts, type IDebugArtifact } from '../../../../../platform/agentHost/common/state/sessionState.js';

/** Output channel ID for the agent host process logger (forwarded via RemoteLoggerChannelClient). */
const AGENT_HOST_LOGGER_CHANNEL_ID = AGENT_HOST_LOG_OUTPUT_CHANNEL_ID;
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
	/**
	 * Debug artifacts the host advertised for this session via session `_meta`
	 * (`agentHost.debugArtifacts`) — host-local absolute paths to provider log /
	 * transcript files. The export resolves each through the resource proxy
	 * instead of re-deriving provider-specific on-disk layouts. Omitted when the
	 * caller can't read the session's `_meta` (e.g. the workbench-side action).
	 */
	readonly debugArtifacts?: readonly IDebugArtifact[];
}

export type IAgentHostDebugLogFile =
	| { readonly path: string; readonly contents: string }
	| { readonly path: string; readonly resource: URI; readonly size: number };

export interface IAgentHostDebugLogsExport {
	readonly files: IAgentHostDebugLogFile[];
	readonly exportName: string;
}

export const IAgentHostDebugLogsExportService = createDecorator<IAgentHostDebugLogsExportService>('agentHostDebugLogsExportService');

export interface IAgentHostDebugLogsExportService {
	readonly _serviceBrand: undefined;
	save(exportName: string, files: readonly IAgentHostDebugLogFile[]): Promise<boolean>;
}

export class BrowserAgentHostDebugLogsExportService implements IAgentHostDebugLogsExportService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
	) { }

	async save(exportName: string, files: readonly IAgentHostDebugLogFile[]): Promise<boolean> {
		return exportFilesToLocalFolder(this.fileDialogService, this.fileService, exportName, files);
	}
}

/**
 * Shared implementation of "Export Agent Host Debug Logs". Collects the
 * Copilot CLI session events file (if available), the window/shared/local
 * agent-host output channel logs, remote forwarded logs, and the AHP
 * transport JSONL logs.
 *
 * Both the workbench-side action (resolves the active session via
 * `IChatWidgetService`) and the sessions-app-side action (resolves it via
 * `ISessionsManagementService`) call into this helper.
 */
export async function collectAgentHostDebugLogs(
	accessor: ServicesAccessor,
	activeSession: IActiveAgentHostSessionForExport | undefined,
): Promise<IAgentHostDebugLogsExport | undefined> {
	const pathService = accessor.get(IPathService);
	const agentHostService = accessor.get(IAgentHostService);
	const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
	const outputService = accessor.get(IOutputService);
	const fileService = accessor.get(IFileService);
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
			const localClientId = sanitizeFilePart(agentHostService.clientId);
			ahpLogNameFilter = name => name.includes(localClientId);
		} else {
			remoteConnection = getRemoteConnectionForSession(activeSession.resource, remoteAgentHostService.connections);
			if (remoteConnection) {
				channelIds.add(remoteAgentHostLogOutputChannelId(remoteConnection.address));
			}
		}
	} else {
		channelIds.add(AGENT_HOST_LOGGER_CHANNEL_ID);
		for (const connection of remoteAgentHostService.connections) {
			channelIds.add(remoteAgentHostLogOutputChannelId(connection.address));
		}
	}

	// Always include the window and shared process logs
	channelIds.add(WINDOW_LOG_CHANNEL_ID);
	channelIds.add(SHARED_PROCESS_LOG_CHANNEL_ID);

	const files: IAgentHostDebugLogFile[] = [];

	// 1. events.jsonl
	if (eventsResult.kind === 'ok') {
		try {
			files.push(await createDebugLogFile('events.jsonl', eventsResult.resource, fileService));
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
				files.push(await createDebugLogFile(`ahp/${child.name}`, child.resource, fileService, child.size));
			} catch (error) {
				logService.warn(`[ExportAgentHostDebugLogs] Failed to read AHP log '${child.name}': ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	} catch {
		// AHP log directory may not exist if no remote connection has been opened or if logging is disabled.
	}

	// 3b. Provider debug artifacts (e.g. Claude SDK debug logs + session transcript)
	// advertised by the host via session `_meta`. The host reports concrete
	// host-local absolute paths — no client-side knowledge of provider on-disk
	// layout — which we resolve through the resource proxy: `file://` for a local
	// session, `vscode-agent-host://` for a remote one.
	//
	// Resolve the artifacts from the owning host's `_meta` when the caller didn't
	// already supply them: the Agents window passes them from the live session
	// adapter, whereas the workbench window (no adapter) reads them here — from the
	// local host or the matching remote connection. Best-effort: a miss just omits
	// the provider artifacts; the general logs still export.
	let debugArtifacts = activeSession?.debugArtifacts;
	if (activeSession && debugArtifacts === undefined) {
		if (activeSession.isLocal) {
			debugArtifacts = await resolveSessionDebugArtifacts(() => agentHostService.listSessions(), activeSession.resource);
		} else {
			const connection = remoteConnection && remoteAgentHostService.getConnection(remoteConnection.address);
			if (connection) {
				debugArtifacts = await resolveSessionDebugArtifacts(() => connection.listSessions(), activeSession.resource);
			}
		}
	}
	const artifactAuthority = remoteConnection ? agentHostAuthority(remoteConnection.address) : undefined;
	for (const artifact of debugArtifacts ?? []) {
		// `artifact.path` is an absolute path on the agent-host machine. Locally
		// that's this platform (`URI.file`); remotely it's the remote platform, so
		// preserve it verbatim via `URI.from` rather than let `URI.file` apply the
		// client's separator/drive rules to a foreign path.
		const resource = activeSession?.isLocal
			? URI.file(artifact.path)
			: artifactAuthority ? toAgentHostUri(URI.from({ scheme: Schemas.file, path: artifact.path }), artifactAuthority) : undefined;
		if (!resource) {
			continue;
		}
		try {
			// Capture the size so remote artifacts use the bounded read path (a large
			// `--debug` log shouldn't be slurped whole over the proxy), and a missing
			// file (e.g. one whose SDK subprocess hasn't written it yet) is skipped.
			const { size } = await fileService.resolve(resource, { resolveMetadata: true });
			files.push(await createDebugLogFile(`${sanitizeFilePart(artifact.label)}${extname(resource)}`, resource, fileService, size));
		} catch (error) {
			logService.warn(`[ExportAgentHostDebugLogs] Failed to read debug artifact '${artifact.label}': ${error instanceof Error ? error.message : String(error)}`);
		}
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

	// 5. Copilot SDK process logs under ~/.copilot/logs do not include the
	// session id in the filename, but relevant entries include it in the content.
	const rawSessionId = getCopilotCliSessionRawId(activeSession?.resource);
	if (rawSessionId) {
		const copilotLogsDir = activeSession?.isLocal
			? buildLocalCopilotLogsUri(userHome)
			: remoteConnection ? buildRemoteCopilotLogsUri(remoteConnection) : undefined;
		if (copilotLogsDir) {
			const copilotLogFiles = await findCopilotLogsForSession(copilotLogsDir, rawSessionId, fileService, logService);
			for (const file of copilotLogFiles) {
				try {
					files.push(await createDebugLogFile(file.path, file.resource, fileService, file.size));
				} catch (error) {
					logService.warn(`[ExportAgentHostDebugLogs] Failed to read Copilot log '${file.path}': ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}
	}

	if (files.length === 0) {
		notificationService.notify({
			severity: Severity.Warning,
			message: activeSession
				? localize('exportDebugLogs.noFiles.activeSession', "No log files were found for the active Agent Host session.")
				: localize('exportDebugLogs.noFiles.currentWindow', "No Agent Host log files were found for the current window."),
		});
		return undefined;
	}

	const titleSlug = activeSession?.title
		? `-${activeSession.title.replace(/[/\\:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}`
		: '';
	return { files, exportName: `ah-logs${titleSlug}` };
}

export async function exportAgentHostDebugLogs(
	accessor: ServicesAccessor,
	activeSession: IActiveAgentHostSessionForExport | undefined,
): Promise<void> {
	const exportService = accessor.get(IAgentHostDebugLogsExportService);
	const notificationService = accessor.get(INotificationService);
	const chatEntitlementService = accessor.get(IChatEntitlementService);
	const logs = await collectAgentHostDebugLogs(accessor, activeSession);
	if (!logs) {
		return;
	}
	try {
		const saved = await exportService.save(logs.exportName, logs.files);
		if (saved) {
			notificationService.warn(chatEntitlementService.isInternal
				? localize('exportDebugLogs.privacyWarning.internal', "Note: This log may contain personal information such as auth tokens, file contents, or terminal output. It MUST be shared privately via Slack or in an issue filed on the microsoft/vscode-internalbacklog repo.")
				: localize('exportDebugLogs.privacyWarning', "Note: This log may contain personal information such as auth tokens, file contents, or terminal output. Please consider sharing privately or reviewing the contents carefully before sharing."));
		}
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
				IsWebContext.negate(),
				AGENT_HOST_ENABLED_CONTEXT_KEY,
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const model = chatWidgetService.lastFocusedWidget?.viewModel?.model;
		const activeSession = model ? toActiveAgentHostSession(model.sessionResource, model.title) : undefined;
		// `collectAgentHostDebugLogs` resolves the host-advertised debug artifacts
		// itself (it already holds the local + remote agent host services), so the
		// accessor is used synchronously here with no `invokeFunction` re-entry.
		await exportAgentHostDebugLogs(accessor, activeSession);
	}
}

/**
 * Reads the host-advertised {@link IDebugArtifact}s for a session from the owning
 * agent host's session summaries, matched by the session's unique id (the
 * summary's `session` URI may use the backend scheme, so we compare ids, not the
 * whole URI). The caller supplies the matching `listSessions` — the local host or
 * a specific remote connection — so this serves both local and remote export.
 * Best-effort: any failure resolves to `undefined`.
 */
async function resolveSessionDebugArtifacts(listSessions: () => Promise<IAgentSessionMetadata[]>, resource: URI): Promise<readonly IDebugArtifact[] | undefined> {
	try {
		const rawId = resource.path.substring(1);
		const sessions = await listSessions();
		return readSessionDebugArtifacts(sessions.find(session => session.session.path.substring(1) === rawId)?._meta);
	} catch {
		return undefined;
	}
}

/**
 * Translates a chat session URI scheme into an agent-host session context, or
 * `undefined` if the scheme does not belong to an agent-host session. Covers any
 * local agent host (`agent-host-<provider>`, e.g. Copilot CLI or Claude) and
 * remote agent hosts; the EH CLI extension's own `copilotcli:` sessions are
 * excluded. Provider-specific collection (events.jsonl, Copilot/Claude logs)
 * self-selects downstream by scheme/session id.
 */
export function toActiveAgentHostSession(resource: URI, title: string | undefined): IActiveAgentHostSessionForExport | undefined {
	if (resource.scheme.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX)) {
		return { resource, title, isLocal: true };
	}
	if (parseRemoteAuthorityFromScheme(resource.scheme)) {
		return { resource, title, isLocal: false };
	}
	return undefined;
}

async function exportFilesToLocalFolder(
	fileDialogService: IFileDialogService,
	fileService: IFileService,
	exportName: string,
	files: readonly IAgentHostDebugLogFile[],
): Promise<boolean> {
	const folders = await fileDialogService.showOpenDialog({
		title: localize('exportDebugLogs.folderDialogTitle', "Select Folder for Agent Host Debug Logs"),
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		availableFileSystems: [Schemas.file],
	});

	const parentFolder = folders?.[0];
	if (!parentFolder) {
		return false;
	}

	const exportFolder = joinPath(parentFolder, exportName);
	await fileService.createFolder(exportFolder);
	for (const file of files) {
		const segments = toSafeRelativePathSegments(file.path);
		if (segments.length === 0) {
			continue;
		}

		let folder = exportFolder;
		for (const segment of segments.slice(0, -1)) {
			folder = joinPath(folder, segment);
			await fileService.createFolder(folder);
		}
		const target = joinPath(folder, segments[segments.length - 1]);
		if (hasKey(file, { contents: true })) {
			await fileService.writeFile(target, VSBuffer.fromString(file.contents));
		} else {
			const source = await fileService.readFileStream(file.resource, { length: file.size });
			await fileService.writeFile(target, source.value);
		}
	}
	return true;
}

async function createDebugLogFile(path: string, resource: URI, fileService: IFileService, size?: number): Promise<IAgentHostDebugLogFile> {
	if (resource.scheme === Schemas.file) {
		const observedSize = size ?? (await fileService.resolve(resource, { resolveMetadata: true })).size;
		return { path, resource, size: observedSize };
	}
	// Non-local resources (e.g. remote agent-host logs) can't be streamed from
	// disk, so read them inline, bounded to the captured size when known.
	if (size !== undefined) {
		const stream = await fileService.readFileStream(resource, { length: size });
		const content = await streamToBuffer(stream.value);
		return { path, contents: content.toString() };
	}
	const content = await fileService.readFile(resource);
	return { path, contents: content.value.toString() };
}

function toSafeRelativePathSegments(path: string): string[] {
	return path
		.replace(/\\/g, '/')
		.split('/')
		.filter(segment => {
			return segment.length > 0 && segment !== '.' && segment !== '..';
		})
		.map(segment => segment.replace(/[/\\:*?"<>|]/g, '-'));
}

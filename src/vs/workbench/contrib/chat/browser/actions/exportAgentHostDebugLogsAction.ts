/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, newWriteableBufferStream, streamToBuffer, type VSBufferReadableStream } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService, type AgentHostDebugLogsArtifactKind, type IAgentConnection, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostService, remoteAgentHostLogOutputChannelId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { DEFAULT_CHAT_ID, getSessionChatResource, StateComponents, type SessionState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ByteSize, IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator, IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId, parseRemoteAuthorityFromScheme } from '../copilotCliEventsUri.js';
import { getRemoteConnectionForSession, sanitizeFilePart } from '../chatDebug/agentHostLogSources.js';
import { buildAgentHostCustomizationsUri, buildAgentHostUsageUri } from '../chatDebug/agentHostUsageSidecar.js';

const SHARED_PROCESS_LOG_FILE_NAME = 'sharedprocess.log';
const OUTPUT_LOG_FOLDER_PREFIX = 'output_';
const MAX_INLINE_DEBUG_LOGS_BYTES = 30 * ByteSize.MB;

/**
 * Description of the agent-host session whose logs should be exported. If
 * not provided, the action exports all agent-host-related logs for the
 * current window (no session-specific scoping or events file).
 */
export interface IActiveAgentHostSessionForExport {
	/** The chat session resource. */
	readonly resource: URI;
	/** Optional owning-session title used to namespace the default zip filename. */
	readonly sessionTitle: string | undefined;
	/** Optional active-chat title used to derive the default zip filename. */
	readonly chatTitle: string | undefined;
	/** True for local agent-host sessions (`agent-host-*` scheme). */
	readonly isLocal: boolean;
	/** Backend chat identifier selected within the session. */
	readonly chatId: string;
	/** Exact host-published backend chat resource, when already resolved by the provider. */
	readonly backendChatResource: URI | undefined;
}

export type IAgentHostDebugLogFile =
	| { readonly path: string; readonly contents: string; readonly size: number }
	| { readonly path: string; readonly resource: URI; readonly size: number };

export interface IAgentHostDebugLogsExport {
	readonly files: IAgentHostDebugLogFile[];
	readonly exportName: string;
	readonly hostArtifact: IAgentHostDebugLogsHostArtifact | undefined;
}

/**
 * A debug-log artifact produced by an agent host, paired with the means to read
 * its bytes. For a remote host the artifact lives on the remote disk, so
 * {@link readChunk} streams it over AHP in bounded slices instead of
 * materializing the whole archive in one protocol message.
 */
export interface IAgentHostDebugLogsHostArtifact {
	readonly artifact: IAgentHostDebugLogsArtifact;
	readonly readChunk: (resource: URI, position: number) => Promise<IAgentHostDebugLogsChunk>;
}

export const IAgentHostDebugLogsExportService = createDecorator<IAgentHostDebugLogsExportService>('agentHostDebugLogsExportService');

export interface IAgentHostDebugLogsExportService {
	readonly _serviceBrand: undefined;
	readonly hostArtifactKind: AgentHostDebugLogsArtifactKind;
	save(exportName: string, files: readonly IAgentHostDebugLogFile[], hostArtifact: IAgentHostDebugLogsHostArtifact | undefined): Promise<boolean>;
}

export class BrowserAgentHostDebugLogsExportService implements IAgentHostDebugLogsExportService {
	declare readonly _serviceBrand: undefined;
	readonly hostArtifactKind = 'directory';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async save(exportName: string, files: readonly IAgentHostDebugLogFile[], hostArtifact: IAgentHostDebugLogsHostArtifact | undefined): Promise<boolean> {
		return this.instantiationService.invokeFunction(accessor => exportFilesToLocalFolder(accessor, exportName, files, hostArtifact));
	}
}

export function resolveAgentHostDebugLogsChat(
	activeSession: Pick<IActiveAgentHostSessionForExport, 'backendChatResource' | 'chatId' | 'sessionTitle'>,
	state: SessionState | Error | undefined,
): { backendChat: URI | undefined; sessionTitle: string | undefined } {
	let backendChat = activeSession.backendChatResource;
	let sessionTitle = activeSession.sessionTitle;
	if (state && !(state instanceof Error)) {
		if (!backendChat) {
			const backendChatResource = getSessionChatResource(state, activeSession.chatId);
			if (backendChatResource) {
				backendChat = URI.parse(backendChatResource);
			}
		}
		sessionTitle ??= state.title;
	}
	return { backendChat, sessionTitle };
}

/**
 * Streams a host-owned artifact by repeatedly calling `readChunk`. The stream
 * fails if the host overruns or underruns the size it declared, so a
 * truncated or runaway transfer can never be silently zipped up.
 */
export function createHostArtifactStream(
	artifact: IAgentHostDebugLogsArtifact,
	readChunk: (position: number) => Promise<IAgentHostDebugLogsChunk>,
): VSBufferReadableStream {
	const stream = newWriteableBufferStream();
	(async () => {
		let position = 0;
		while (true) {
			const chunk = await readChunk(position);
			const byteLength = chunk.data.byteLength;
			if (byteLength > 0) {
				position += byteLength;
				if (position > artifact.size) {
					throw new Error(`Agent Host debug log artifact exceeded its declared size of ${artifact.size} bytes`);
				}
				await stream.write(chunk.data);
			}
			if (chunk.eof) {
				break;
			}
			if (byteLength === 0) {
				throw new Error('Agent Host returned an empty debug log chunk before the end of the artifact');
			}
		}
		if (position !== artifact.size) {
			throw new Error(`Agent Host debug log artifact ended after ${position} bytes, expected ${artifact.size}`);
		}
		stream.end();
	})().catch(error => {
		stream.error(error instanceof Error ? error : new Error(String(error)));
		stream.end();
	});
	return stream;
}

/**
 * Shared implementation of "Export Agent Host Debug Logs". Collects the
 * Agent Host's own debug-log bundle (collected and packaged by the host), plus
 * the logs this side owns: the window/shared-process output channels, remote
 * forwarded logs, the AHP transport JSONL logs, and the client-local capture
 * sidecars.
 *
 * Both the workbench-side action (resolves the active session via
 * `IChatWidgetService`) and the sessions-app-side action (resolves it via
 * `ISessionsManagementService`) call into this helper.
 */
export async function collectAgentHostDebugLogs(
	accessor: ServicesAccessor,
	activeSession: IActiveAgentHostSessionForExport | undefined,
	onDidCreateHostArtifact: (artifact: IAgentHostDebugLogsArtifact) => void,
): Promise<IAgentHostDebugLogsExport> {
	const agentHostService = accessor.get(IAgentHostService);
	const agentHostConnectionsService = accessor.get(IAgentHostConnectionsService);
	const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
	const fileService = accessor.get(IFileService);
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IWorkbenchEnvironmentService);
	const exportService = accessor.get(IAgentHostDebugLogsExportService);

	let connection: IAgentConnection | undefined;
	let backendSession: URI | undefined;
	let backendChat: URI | undefined;
	let sessionTitle = activeSession?.sessionTitle;
	if (activeSession) {
		const sessionResolution = agentHostConnectionsService.resolveSessionResource(activeSession.resource);
		if (!sessionResolution) {
			logService.warn(`[ExportAgentHostDebugLogs] No live Agent Host connection owns session ${activeSession.resource.toString()}; exporting client-owned logs only`);
		} else {
			connection = sessionResolution.connection;
			backendSession = sessionResolution.backendSession;
			const state = connection.getSubscriptionUnmanaged(StateComponents.Session, backendSession)?.value;
			({ backendChat, sessionTitle } = resolveAgentHostDebugLogsChat(activeSession, state));
			if (!backendChat) {
				const reason = !state || state instanceof Error
					? 'session state is unavailable'
					: `chat '${activeSession.chatId}' is unavailable`;
				logService.warn(`[ExportAgentHostDebugLogs] Cannot resolve the active chat because ${reason} for ${activeSession.resource.toString()}; exporting session and client-owned logs`);
			}
		}
	} else {
		connection = agentHostConnectionsService.ambientConnection;
	}
	let hostArtifact: IAgentHostDebugLogsArtifact | undefined;
	if (connection) {
		try {
			hostArtifact = await connection.collectDebugLogs(backendSession, exportService.hostArtifactKind, backendChat);
			onDidCreateHostArtifact(hostArtifact);
		} catch (error) {
			logService.warn(`[ExportAgentHostDebugLogs] Failed to collect Agent Host logs: ${error instanceof Error ? error.message : String(error)}; exporting client-owned logs only`);
		}
	}
	let remainingInlineBytes = MAX_INLINE_DEBUG_LOGS_BYTES;

	const forwardedAgentHostLogFileNames = new Set<string>();

	let ahpLogNameFilter: ((name: string) => boolean) | undefined;
	if (activeSession) {
		if (activeSession.isLocal) {
			const localClientId = sanitizeFilePart(agentHostService.clientId);
			ahpLogNameFilter = name => name.includes(localClientId);
		} else {
			const remoteConnection = getRemoteConnectionForSession(activeSession.resource, remoteAgentHostService.connections);
			if (remoteConnection) {
				forwardedAgentHostLogFileNames.add(getOutputChannelLogFileName(remoteAgentHostLogOutputChannelId(remoteConnection.address)));
				const remoteConnectionId = sanitizeFilePart(remoteConnection.address);
				ahpLogNameFilter = name => name.includes(remoteConnectionId);
			}
		}
	} else {
		for (const remoteConnection of remoteAgentHostService.connections) {
			forwardedAgentHostLogFileNames.add(getOutputChannelLogFileName(remoteAgentHostLogOutputChannelId(remoteConnection.address)));
		}
	}

	const files: IAgentHostDebugLogFile[] = [];
	const appendFile = (file: IAgentHostDebugLogFile) => {
		files.push(file);
		if (hasKey(file, { contents: true })) {
			remainingInlineBytes -= file.size;
		}
	};
	const appendFiles = (collectedFiles: readonly IAgentHostDebugLogFile[]) => {
		for (const file of collectedFiles) {
			appendFile(file);
		}
	};

	// 1. Local VS Code process and forwarded Agent Host logs.
	const processLogs = [
		{ folder: 'Window', resource: environmentService.logFile },
		{ folder: 'Shared', resource: joinPath(environmentService.logsHome, SHARED_PROCESS_LOG_FILE_NAME) },
	];
	for (const processLog of processLogs) {
		try {
			appendFiles(await collectRotatedLogFiles(`vscode-logs/${processLog.folder}`, processLog.resource, fileService, remainingInlineBytes));
		} catch (error) {
			logService.warn(`[ExportAgentHostDebugLogs] Failed to collect rotated logs for '${processLog.resource.toString()}': ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	try {
		const forwardedLogs = await findOutputChannelLogFiles(environmentService.windowLogsPath, forwardedAgentHostLogFileNames, fileService);
		for (const forwardedLog of forwardedLogs) {
			const file = await createDebugLogFile(`vscode-logs/Agent Host/${basename(forwardedLog)}`, forwardedLog, fileService, undefined, remainingInlineBytes);
			if (file) {
				appendFile(file);
			}
		}
	} catch (error) {
		logService.warn(`[ExportAgentHostDebugLogs] Failed to collect forwarded Agent Host logs: ${error instanceof Error ? error.message : String(error)}`);
	}

	// 2. AHP transport JSONL logs (one file per remote connection, written under <logsHome>/ahp/).
	// These replace the per-connection `agenthost.<clientId>` IPC traffic output channel.
	try {
		const ahpDir = joinPath(environmentService.logsHome, 'ahp');
		const stat = await fileService.resolve(ahpDir, { resolveMetadata: true });
		for (const child of stat.children ?? []) {
			if (child.isDirectory || !child.name.endsWith('.jsonl') || ahpLogNameFilter && !ahpLogNameFilter(child.name)) {
				continue;
			}
			try {
				const file = await createDebugLogFile(`ahp/${child.name}`, child.resource, fileService, child.size, remainingInlineBytes);
				if (file) {
					appendFile(file);
				}
			} catch (error) {
				logService.warn(`[ExportAgentHostDebugLogs] Failed to read AHP log '${child.name}': ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	} catch {
		// AHP log directory may not exist if no remote connection has been opened or if logging is disabled.
	}

	const rawSessionId = getCopilotCliSessionRawId(activeSession?.resource);

	// 3. Client-local capture sidecars for the session. These hold data the SDK
	// never persists — per-model-call token/credit usage (`assistant.usage` is
	// ephemeral) and the loaded customization set (`session.*_loaded` likewise) —
	// so without them an export cannot explain a usage/cost discrepancy or say
	// which skills/hooks/MCP servers were actually active.
	if (rawSessionId) {
		const sidecars: { path: string; resource: URI }[] = [
			{ path: 'usage.jsonl', resource: buildAgentHostUsageUri(environmentService.userRoamingDataHome, rawSessionId) },
			{ path: 'customizations.json', resource: buildAgentHostCustomizationsUri(environmentService.userRoamingDataHome, rawSessionId) },
		];
		for (const sidecar of sidecars) {
			try {
				const file = await createDebugLogFile(sidecar.path, sidecar.resource, fileService, undefined, remainingInlineBytes);
				if (file) {
					appendFile(file);
				}
			} catch {
				// Absent when agent-host debug logging was off for this session.
			}
		}
	}

	return {
		files,
		exportName: getAgentHostDebugLogsExportName(sessionTitle, activeSession?.chatTitle, activeSession?.chatId === DEFAULT_CHAT_ID),
		hostArtifact: hostArtifact && connection ? { artifact: hostArtifact, readChunk: createChunkReader(connection) } : undefined,
	};
}

export function getAgentHostDebugLogsExportName(sessionTitle: string | undefined, chatTitle: string | undefined, isPrimaryChat: boolean): string {
	const namespace = [
		toDebugLogsTitleSlug(sessionTitle),
		...(!isPrimaryChat ? [toDebugLogsTitleSlug(chatTitle)] : []),
	].filter(title => title.length > 0);
	return namespace.length > 0 ? `ah-logs-${namespace.join('--')}` : 'ah-logs';
}

function toDebugLogsTitleSlug(title: string | undefined): string {
	return title?.replace(/[/\\:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) ?? '';
}

/** Binds a connection's chunked artifact read to one artifact. */
function createChunkReader(connection: IAgentConnection): (resource: URI, position: number) => Promise<IAgentHostDebugLogsChunk> {
	return (resource, position) => connection.readDebugLogsChunk(resource, position);
}

export async function exportAgentHostDebugLogs(
	accessor: ServicesAccessor,
	activeSession: IActiveAgentHostSessionForExport | undefined,
): Promise<void> {
	const exportService = accessor.get(IAgentHostDebugLogsExportService);
	const notificationService = accessor.get(INotificationService);
	const chatEntitlementService = accessor.get(IChatEntitlementService);
	const fileService = accessor.get(IFileService);
	const logService = accessor.get(ILogService);
	const progressService = accessor.get(IProgressService);
	let hostArtifact: IAgentHostDebugLogsArtifact | undefined;
	try {
		const logs = await progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('exportDebugLogs.collectProgress', "Collecting Agent Host debug logs..."),
			delay: 500,
		}, () => collectAgentHostDebugLogs(accessor, activeSession, artifact => hostArtifact = artifact));
		try {
			const saved = await exportService.save(logs.exportName, logs.files, logs.hostArtifact);
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
	} catch (error) {
		notificationService.notify({
			severity: Severity.Error,
			message: localize('exportDebugLogs.collectError', "Failed to collect debug logs: {0}", error instanceof Error ? error.message : String(error)),
		});
	} finally {
		if (hostArtifact) {
			try {
				await fileService.del(hostArtifact.resource, { recursive: hostArtifact.kind === 'directory' });
			} catch (error) {
				logService.warn(`[ExportAgentHostDebugLogs] Failed to delete temporary Agent Host log artifact: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
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
export function toActiveAgentHostSession(resource: URI, chatTitle: string | undefined, sessionTitle?: string): IActiveAgentHostSessionForExport | undefined {
	if (resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME) {
		return { resource: resource.with({ fragment: null }), sessionTitle, chatTitle, isLocal: true, chatId: resource.fragment || DEFAULT_CHAT_ID, backendChatResource: undefined };
	}
	if (parseRemoteAuthorityFromScheme(resource.scheme)) {
		return { resource: resource.with({ fragment: null }), sessionTitle, chatTitle, isLocal: false, chatId: resource.fragment || DEFAULT_CHAT_ID, backendChatResource: undefined };
	}
	return undefined;
}

async function exportFilesToLocalFolder(
	accessor: ServicesAccessor,
	exportName: string,
	files: readonly IAgentHostDebugLogFile[],
	hostArtifact: IAgentHostDebugLogsHostArtifact | undefined,
): Promise<boolean> {
	const fileDialogService = accessor.get(IFileDialogService);
	const fileService = accessor.get(IFileService);
	const logService = accessor.get(ILogService);
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
	if (hostArtifact) {
		try {
			if (hostArtifact.artifact.kind !== 'directory') {
				throw new Error(`Expected an Agent Host debug-log directory, got ${hostArtifact.artifact.kind}`);
			}
			await copyHostArtifactDirectory(exportFolder, hostArtifact, fileService);
		} catch (error) {
			logService.warn(`[ExportAgentHostDebugLogs] Failed to save Agent Host logs: ${error instanceof Error ? error.message : String(error)}; saving client-owned logs only`);
		}
	}
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

async function copyHostArtifactDirectory(
	target: URI,
	hostArtifact: IAgentHostDebugLogsHostArtifact,
	fileService: IFileService,
): Promise<void> {
	let copiedSize = 0;
	for (const entry of hostArtifact.artifact.entries) {
		copiedSize += entry.size;
		if (copiedSize > hostArtifact.artifact.uncompressedSize) {
			throw new Error(`Agent Host debug-log directory exceeded its declared size of ${hostArtifact.artifact.uncompressedSize} bytes`);
		}

		const source = joinPath(hostArtifact.artifact.resource, ...entry.path.split('/'));
		const segments = toSafeRelativePathSegments(entry.path);
		if (segments.length === 0) {
			throw new Error(`Agent Host returned an invalid debug-log artifact path: ${entry.path}`);
		}
		let targetFolder = target;
		for (const segment of segments.slice(0, -1)) {
			targetFolder = joinPath(targetFolder, segment);
			await fileService.createFolder(targetFolder);
		}
		const entryTarget = joinPath(targetFolder, segments[segments.length - 1]);
		if (source.scheme === Schemas.file) {
			const sourceStat = await fileService.resolve(source, { resolveMetadata: true });
			if (!sourceStat.isFile || sourceStat.isSymbolicLink || sourceStat.size !== entry.size) {
				throw new Error(`Agent Host debug-log file no longer matches its manifest: ${entry.path}`);
			}
			await fileService.copy(source, entryTarget, true);
			continue;
		}
		const artifact = { ...hostArtifact.artifact, resource: source, size: entry.size, uncompressedSize: entry.size };
		await fileService.writeFile(entryTarget, createHostArtifactStream(artifact, position => hostArtifact.readChunk(source, position)));
	}
	if (copiedSize !== hostArtifact.artifact.uncompressedSize) {
		throw new Error(`Agent Host debug-log directory manifest accounts for ${copiedSize} bytes, expected ${hostArtifact.artifact.uncompressedSize}`);
	}
}

async function createDebugLogFile(path: string, resource: URI, fileService: IFileService, size: number | undefined, maxInlineSize: number): Promise<IAgentHostDebugLogFile | undefined> {
	if (resource.scheme === Schemas.file || resource.scheme === Schemas.vscodeUserData) {
		const observedSize = size ?? (await fileService.resolve(resource, { resolveMetadata: true })).size;
		return { path, resource, size: observedSize };
	}
	const observedSize = size ?? (await fileService.resolve(resource, { resolveMetadata: true })).size;
	const readSize = Math.min(observedSize, maxInlineSize);
	if (readSize === 0) {
		return undefined;
	}
	const stream = await fileService.readFileStream(resource, { position: observedSize - readSize, length: readSize });
	return createInlineDebugLogFile(path, await streamToBuffer(stream.value), maxInlineSize);
}

function createInlineDebugLogFile(path: string, content: VSBuffer, maxInlineSize: number): IAgentHostDebugLogFile | undefined {
	const size = Math.min(content.byteLength, maxInlineSize);
	if (size === 0) {
		return undefined;
	}
	const capturedContent = size === content.byteLength ? content : content.slice(content.byteLength - size);
	return { path, contents: capturedContent.toString(), size };
}

export async function collectRotatedLogFiles(path: string, current: URI, fileService: IFileService, maxInlineSize = MAX_INLINE_DEBUG_LOGS_BYTES): Promise<IAgentHostDebugLogFile[]> {
	const currentName = basename(current);
	const parent = await fileService.resolve(dirname(current), { resolveMetadata: true });
	const files: IAgentHostDebugLogFile[] = [];
	let remainingInlineSize = maxInlineSize;
	for (const child of parent.children ?? []) {
		if (child.isFile && !child.isSymbolicLink && isRotatedLogFile(child.name, currentName)) {
			const file = await createDebugLogFile(`${path}/${child.name}`, child.resource, fileService, child.size, remainingInlineSize);
			if (file) {
				files.push(file);
				if (hasKey(file, { contents: true })) {
					remainingInlineSize -= file.size;
				}
			}
		}
	}
	return files;
}

export async function findOutputChannelLogFiles(windowLogsPath: URI, fileNames: ReadonlySet<string>, fileService: IFileService): Promise<URI[]> {
	if (fileNames.size === 0) {
		return [];
	}
	const windowLogs = await fileService.resolve(windowLogsPath);
	const outputFolders = (windowLogs.children ?? [])
		.filter(child => child.isDirectory && child.name.startsWith(OUTPUT_LOG_FOLDER_PREFIX))
		.sort((a, b) => b.name.localeCompare(a.name));
	const remaining = new Set(fileNames);
	const result: URI[] = [];
	for (const outputFolder of outputFolders) {
		const folder = await fileService.resolve(outputFolder.resource);
		for (const child of folder.children ?? []) {
			if (child.isFile && !child.isSymbolicLink && remaining.delete(child.name)) {
				result.push(child.resource);
			}
		}
		if (remaining.size === 0) {
			break;
		}
	}
	return result;
}

function getOutputChannelLogFileName(channelId: string): string {
	return `${channelId.replace(/[\\/:\*\?"<>\|]/g, '')}.log`;
}

function isRotatedLogFile(candidate: string, current: string): boolean {
	if (candidate === current) {
		return true;
	}
	const stem = current.endsWith('.log') ? current.slice(0, -'.log'.length) : current;
	const prefix = `${stem}.`;
	if (!candidate.startsWith(prefix) || !candidate.endsWith('.log')) {
		return false;
	}
	const rotation = candidate.slice(prefix.length, -'.log'.length);
	return /^[1-9]\d*$/.test(rotation);
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

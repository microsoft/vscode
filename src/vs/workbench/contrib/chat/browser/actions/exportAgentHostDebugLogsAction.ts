/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../../base/common/actions.js';
import { raceCancellationError, raceTimeout } from '../../../../../base/common/async.js';
import { VSBuffer, newWriteableBufferStream, type VSBufferReadableStream } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isAbsolute, normalize } from '../../../../../base/common/path.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IAgentHostConnectionsService, LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { isAhpLogFileFor } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES, AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES, IAgentHostService, type AgentHostDebugLogsArtifactKind, type IAgentConnection, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostService, remoteAgentHostLogOutputChannelId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { DEFAULT_CHAT_ID, getSessionChatResource, StateComponents, type SessionState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ByteSize, FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { createDecorator, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { NotificationActionTelemetryId, withNotificationActionTelemetry } from '../../../../../platform/notification/common/notificationTelemetry.js';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { getCopilotCliSessionRawId } from '../copilotCliEventsUri.js';
import { getRemoteConnectionForSession, isAgentHostSession } from '../chatDebug/agentHostLogSources.js';
import { buildAgentHostCustomizationsUri, buildAgentHostUsageUri } from '../chatDebug/agentHostUsageSidecar.js';
import { MISSION_CONTROL_AHP_LOG_ID } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { isAgentHostDebugLogsProgress } from '../../../../../platform/agentHost/common/meta/agentHostDebugLogsMeta.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';

const SHARED_PROCESS_LOG_FILE_NAME = 'sharedprocess.log';
const OUTPUT_LOG_FOLDER_PREFIX = 'output_';
const MAX_AHP_LOG_FILES_PER_HOST = 10;

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
	readonly hostArtifact: IAgentHostDebugLogsHostArtifact | undefined;
	readonly hostCollectionError?: string;
}

export interface IAgentHostDebugLogsExportOptions {
	readonly token: CancellationToken;
	readonly progress: IProgress<IProgressStep>;
	/** The destination swap must finish or roll back before cancellation can dismiss progress. */
	readonly onWillCommit?: () => void;
}

export interface IAgentHostDebugLogsSaveResult {
	readonly hostSaveError: string | undefined;
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
	selectDestination(exportName: string): Promise<URI | undefined>;
	save(destination: URI, files: readonly IAgentHostDebugLogFile[], hostArtifact: IAgentHostDebugLogsHostArtifact | undefined, options?: IAgentHostDebugLogsExportOptions): Promise<IAgentHostDebugLogsSaveResult | void>;
}

export class BrowserAgentHostDebugLogsExportService implements IAgentHostDebugLogsExportService {
	declare readonly _serviceBrand: undefined;
	readonly hostArtifactKind = 'directory';

	constructor(
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) { }

	async selectDestination(exportName: string): Promise<URI | undefined> {
		const defaultUri = await resolveAgentHostDebugLogsExportDirectory(this.configurationService, this.fileDialogService, this.fileService, this.logService);
		const folders = await this.fileDialogService.showOpenDialog({
			title: localize('exportDebugLogs.folderDialogTitle', "Select Folder for Agent Host Debug Logs"),
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			defaultUri,
			availableFileSystems: [Schemas.file],
		});
		return folders?.[0] ? joinPath(folders[0], exportName) : undefined;
	}

	async save(destination: URI, files: readonly IAgentHostDebugLogFile[], hostArtifact: IAgentHostDebugLogsHostArtifact | undefined, options?: IAgentHostDebugLogsExportOptions): Promise<IAgentHostDebugLogsSaveResult> {
		const staging = joinPath(dirname(destination), `.agent-host-debug-logs-${generateUuid()}`);
		try {
			throwIfExportCancelled(options?.token ?? CancellationToken.None);
			const result = await exportFilesToLocalFolder(staging, files, hostArtifact, this.fileService, this.logService, options);
			await commitAgentHostDebugLogsExport(staging, destination, this.fileService, this.logService, options);
			return result;
		} finally {
			try {
				if (await this.fileService.exists(staging)) {
					await this.fileService.del(staging, { recursive: true });
				}
			} catch (error) {
				this.logService.warn('[ExportAgentHostDebugLogs] Failed to remove incomplete folder export', error);
			}
		}
	}
}

/** Replaces an export without deleting its previous contents before the new export has been installed. */
export async function commitAgentHostDebugLogsExport(
	staging: URI,
	destination: URI,
	fileService: IFileService,
	logService: ILogService,
	options?: IAgentHostDebugLogsExportOptions,
): Promise<void> {
	const backup = joinPath(dirname(destination), `.agent-host-debug-logs-backup-${generateUuid()}`);
	const hasDestination = await fileService.exists(destination);
	throwIfExportCancelled(options?.token ?? CancellationToken.None);
	options?.onWillCommit?.();
	options?.progress.report({ message: localize('exportDebugLogs.commitProgress', "Finishing export (cannot cancel)...") });
	try {
		if (hasDestination) {
			await fileService.move(destination, backup, false);
		}
		await fileService.move(staging, destination, false);
	} catch (error) {
		if (hasDestination && await fileService.exists(backup)) {
			try {
				await fileService.move(backup, destination, false);
			} catch (rollbackError) {
				logService.error('[ExportAgentHostDebugLogs] Failed to restore previous export', rollbackError);
				throw new Error(localize('exportDebugLogs.rollbackError', "Failed to save debug logs: {0}. The previous export could not be restored and is preserved at {1}: {2}", getErrorMessage(error), backup.toString(true), getErrorMessage(rollbackError)));
			}
		}
		throw error;
	}
	if (hasDestination) {
		try {
			await fileService.del(backup, { recursive: true });
		} catch (error) {
			logService.warn(`[ExportAgentHostDebugLogs] Failed to remove export backup '${backup.toString()}'`, error);
		}
	}
}

export async function resolveAgentHostDebugLogsExportDirectory(
	configurationService: IConfigurationService,
	fileDialogService: IFileDialogService,
	fileService: IFileService,
	logService: ILogService,
): Promise<URI> {
	const configuredPath = configurationService.getValue<string>(ChatConfiguration.AgentHostDebugLogsDefaultExportLocation);
	if (configuredPath) {
		if (isAbsolute(configuredPath)) {
			const configuredDirectory = URI.file(normalize(configuredPath));
			try {
				const stat = await fileService.stat(configuredDirectory);
				if (stat.isDirectory) {
					return configuredDirectory;
				}
				logService.warn('[ExportAgentHostDebugLogs] Configured default export location is not a folder; using the default file-dialog location');
			} catch (error) {
				logService.warn(`[ExportAgentHostDebugLogs] Failed to access configured default export location; using the default file-dialog location: ${getErrorMessage(error)}`);
			}
		} else {
			logService.warn('[ExportAgentHostDebugLogs] Configured default export location is not absolute; using the default file-dialog location');
		}
	}

	return fileDialogService.preferredHome(Schemas.file);
}

export function resolveAgentHostDebugLogsChat(
	activeSession: Pick<IActiveAgentHostSessionForExport, 'backendChatResource' | 'chatId' | 'sessionTitle'>,
	state: SessionState | Error | undefined,
): { backendChat: URI | undefined; sessionTitle: string | undefined } {
	let backendChat = activeSession.backendChatResource;
	let sessionTitle = activeSession.sessionTitle;
	if (state && !(state instanceof Error)) {
		if (!backendChat) {
			const backendChatResource = getSessionChatResource(state, activeSession.chatId, state.defaultChat);
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
	token: CancellationToken = CancellationToken.None,
	onProgress?: (bytes: number) => void,
): VSBufferReadableStream {
	const stream = newWriteableBufferStream({ highWaterMark: 1 });
	(async () => {
		let position = 0;
		const pending = new Map<number, Promise<IAgentHostDebugLogsChunk>>();
		const requestChunk = (offset: number) => {
			const request = readChunk(offset);
			void request.catch(() => { });
			pending.set(offset, request);
		};
		while (true) {
			throwIfExportCancelled(token);
			if (!pending.has(position)) {
				requestChunk(position);
			}
			const chunk = await raceCancellationError(pending.get(position)!, token);
			pending.delete(position);
			const byteLength = chunk.data.byteLength;
			if (byteLength > 0) {
				position += byteLength;
				if (position > artifact.size) {
					throw new Error(`Agent Host debug log artifact exceeded its declared size of ${artifact.size} bytes`);
				}
				// Prefetch at most four bounded slices; short reads resume at their actual offset.
				if (byteLength === AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES && !chunk.eof) {
					for (let offset = position; offset < artifact.size && offset < position + 4 * AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES; offset += AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES) {
						if (!pending.has(offset)) {
							requestChunk(offset);
						}
					}
				} else {
					await raceCancellationError(Promise.allSettled(pending.values()), token);
					pending.clear();
				}
				await raceCancellationError(Promise.resolve(stream.write(chunk.data)), token);
				throwIfExportCancelled(token);
				onProgress?.(position);
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

function throwIfExportCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}

/**
 * Shared implementation of "Export Agent Host Debug Logs". Collects the
 * Agent Host's own debug-log bundle (collected and packaged by the host), plus
 * the logs this side owns: the window/shared-process output channels, remote
 * forwarded logs, the AHP transport JSONL logs, and the client-local capture
 * sidecars. Desktop exports store the compressed host bundle as `host-logs.zip`
 * inside the client ZIP, without recompressing it. ZIP exports are capped at 1,000 combined files; folder exports keep
 * up to 1,000 client files. Both keep at most the ten most recently modified AHP
 * files per host.
 *
 * Both the workbench-side action (resolves the active session via
 * `IChatWidgetService`) and the sessions-app-side action (resolves it via
 * `ISessionsManagementService`) call into this helper.
 */
export async function collectAgentHostDebugLogs(
	accessor: ServicesAccessor,
	activeSession: IActiveAgentHostSessionForExport | undefined,
	onDidCreateHostArtifact: (artifact: IAgentHostDebugLogsArtifact) => void,
	options?: IAgentHostDebugLogsExportOptions,
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
	if (activeSession) {
		const sessionResolution = agentHostConnectionsService.resolveSessionResource(activeSession.resource);
		if (!sessionResolution) {
			logService.warn(`[ExportAgentHostDebugLogs] No live Agent Host connection owns session ${activeSession.resource.toString()}; exporting client-owned logs only`);
		} else {
			connection = sessionResolution.connection;
			backendSession = sessionResolution.backendSession;
			const state = connection.getSubscriptionUnmanaged(StateComponents.Session, backendSession)?.value;
			backendChat = resolveAgentHostDebugLogsChat(activeSession, state).backendChat;
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
	let hostCollectionError: string | undefined;
	const token = options?.token ?? CancellationToken.None;
	throwIfExportCancelled(token);
	if (connection && connection.clientConnectionKind !== AgentHostClientConnectionKind.MissionControl) {
		const listeners = new DisposableStore();
		try {
			const progressToken = generateUuid();
			options?.progress.report({
				message: activeSession?.isLocal
					? localize('exportDebugLogs.collectHost', "Collecting logs on Agent Host...")
					: localize('exportDebugLogs.collectRemote', "Collecting logs on remote Agent Host...")
			});
			if (connection.onDidNotification) {
				listeners.add(connection.onDidNotification(notification => {
					if (notification.type === 'root/progress' && notification.progressToken === progressToken && isAgentHostDebugLogsProgress(notification) && !token.isCancellationRequested) {
						options?.progress.report({ message: notification.message });
					}
				}));
			}
			const hostConnection = connection;
			listeners.add(token.onCancellationRequested(() => {
				void hostConnection.cancelDebugLogs?.(progressToken).catch(error => logService.warn('[ExportAgentHostDebugLogs] Failed to cancel host collection', error));
			}));
			const collection = connection.collectDebugLogs(backendSession, exportService.hostArtifactKind, backendChat, progressToken).then(artifact => {
				onDidCreateHostArtifact(artifact);
				return artifact;
			});
			hostArtifact = await raceCancellationError(collection, token);
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			hostCollectionError = getErrorMessage(error);
			logService.warn(`[ExportAgentHostDebugLogs] Failed to collect Agent Host logs: ${error instanceof Error ? error.message : String(error)}; exporting client-owned logs only`);
		} finally {
			listeners.dispose();
		}
	}
	throwIfExportCancelled(token);
	options?.progress.report({ message: localize('exportDebugLogs.collectClient', "Collecting VS Code logs...") });
	const forwardedAgentHostLogFileNames = new Set<string>();

	let ahpLogId: string | undefined;
	if (activeSession) {
		if (activeSession.isLocal) {
			ahpLogId = agentHostService.clientId;
		} else {
			const remoteConnection = getRemoteConnectionForSession(activeSession.resource, remoteAgentHostService.connections);
			const remoteAddress = agentHostConnectionsService.resolveSessionResourceIdentity(activeSession.resource)?.connectionAddress ?? remoteConnection?.address;
			if (remoteAddress) {
				forwardedAgentHostLogFileNames.add(getOutputChannelLogFileName(remoteAgentHostLogOutputChannelId(remoteAddress)));
				ahpLogId = remoteAddress;
			}
		}
	} else {
		for (const remoteConnection of remoteAgentHostService.connections) {
			forwardedAgentHostLogFileNames.add(getOutputChannelLogFileName(remoteAgentHostLogOutputChannelId(remoteConnection.address)));
		}
	}

	const files: IAgentHostDebugLogFile[] = [];
	let omittedFiles = 0;
	const appendFile = (file: IAgentHostDebugLogFile) => {
		throwIfExportCancelled(token);
		if (files.length < AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES) {
			files.push(file);
		} else {
			omittedFiles++;
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
			appendFiles(await collectRotatedLogFiles(`vscode-logs/${processLog.folder}`, processLog.resource, fileService));
		} catch (error) {
			logService.warn(`[ExportAgentHostDebugLogs] Failed to collect rotated logs for '${processLog.resource.toString()}': ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	try {
		const forwardedLogs = await findOutputChannelLogFiles(environmentService.windowLogsPath, forwardedAgentHostLogFileNames, fileService);
		const seenFileNames = new Set<string>();
		for (const forwardedLog of forwardedLogs) {
			const name = basename(forwardedLog);
			const path = seenFileNames.has(name)
				? `vscode-logs/Agent Host/${basename(dirname(forwardedLog))}/${name}`
				: `vscode-logs/Agent Host/${name}`;
			seenFileNames.add(name);
			appendFile(await createDebugLogFile(path, forwardedLog, fileService));
		}
	} catch (error) {
		logService.warn(`[ExportAgentHostDebugLogs] Failed to collect forwarded Agent Host logs: ${error instanceof Error ? error.message : String(error)}`);
	}

	const rawSessionId = getCopilotCliSessionRawId(activeSession?.resource);

	// 2. Client-local capture sidecars for the session. These hold data the SDK
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
				appendFile(await createDebugLogFile(sidecar.path, sidecar.resource, fileService));
			} catch (error) {
				if (!(error instanceof Error) || toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
					logService.warn(`[ExportAgentHostDebugLogs] Failed to collect '${sidecar.path}': ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}
	}

	// 3. Keep transport history after process logs and sidecars so reconnect loops cannot crowd them out.
	try {
		const ahpDir = joinPath(environmentService.logsHome, 'ahp');
		const stat = await fileService.resolve(ahpDir, { resolveMetadata: true });
		const candidates = (stat.children ?? [])
			.filter(child => child.isFile && !child.isSymbolicLink && child.name.endsWith('.jsonl') && (!activeSession
				|| ahpLogId && isAhpLogFileFor(ahpLogId, child.name)
				|| activeSession.isLocal && isAhpLogFileFor(MISSION_CONTROL_AHP_LOG_ID, child.name)))
			.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0) || b.name.localeCompare(a.name));
		const filesPerHost = new Map<string, number>();
		for (const child of candidates) {
			const hostId = /^ahp-(?<hostId>[a-f0-9]{40})-/.exec(child.name)?.groups?.hostId ?? child.name;
			const hostFileCount = filesPerHost.get(hostId) ?? 0;
			if (hostFileCount >= MAX_AHP_LOG_FILES_PER_HOST) {
				omittedFiles++;
				continue;
			}
			try {
				appendFile(await createDebugLogFile(`ahp/${child.name}`, child.resource, fileService, child.size));
				filesPerHost.set(hostId, hostFileCount + 1);
			} catch (error) {
				logService.warn(`[ExportAgentHostDebugLogs] Failed to read AHP log '${child.name}': ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	} catch (error) {
		if (!(error instanceof Error) || toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
			logService.warn(`[ExportAgentHostDebugLogs] Failed to enumerate AHP logs: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (omittedFiles > 0) {
		logService.warn(`[ExportAgentHostDebugLogs] Omitted ${omittedFiles} log files to keep the export within ${AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES} entries and ${MAX_AHP_LOG_FILES_PER_HOST} AHP files per host`);
	}

	return {
		files,
		hostArtifact: hostArtifact && connection ? { artifact: hostArtifact, readChunk: createChunkReader(connection) } : undefined,
		hostCollectionError,
	};
}

export function getAgentHostDebugLogsExportName(sessionTitle: string | undefined, chatTitle: string | undefined, isPrimaryChat: boolean): string {
	const namespace = [
		toDebugLogsTitleSlug(sessionTitle),
		...(!isPrimaryChat ? [toDebugLogsTitleSlug(chatTitle)] : []),
	].filter(title => title.length > 0);
	return namespace.length > 0 ? `ah-logs-${namespace.join('--')}` : 'ah-logs';
}

export function prepareAgentHostDebugLogsExport(
	selectDestination: () => Promise<URI | undefined>,
	collectLogs: () => Promise<IAgentHostDebugLogsExport>,
): Promise<[PromiseSettledResult<IAgentHostDebugLogsExport>, PromiseSettledResult<URI | undefined>]> {
	const destinationPromise = selectDestination();
	const collectionPromise = collectLogs();
	return Promise.allSettled([collectionPromise, destinationPromise]);
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
	const clipboardService = accessor.get(IClipboardService);
	const fileService = accessor.get(IFileService);
	const logService = accessor.get(ILogService);
	const progressService = accessor.get(IProgressService);
	let hostArtifact: IAgentHostDebugLogsArtifact | undefined;
	let committing = false;
	const disposables = new DisposableStore();
	const cancellation = disposables.add(new CancellationTokenSource());
	const cancelAction = disposables.add(new Action('cancelAgentHostDebugLogs', localize('exportDebugLogs.cancel', "Cancel"), undefined, true, () => {
		if (!committing) {
			cancellation.cancel();
		}
		return Promise.resolve();
	}));
	withNotificationActionTelemetry(cancelAction, NotificationActionTelemetryId.ProgressCancel);
	const deleteHostArtifact = async (artifact: IAgentHostDebugLogsArtifact) => {
		try {
			await fileService.del(artifact.resource, { recursive: artifact.kind === 'directory' });
		} catch (error) {
			logService.warn('[ExportAgentHostDebugLogs] Failed to delete temporary Agent Host log artifact', error);
		}
	};
	try {
		const exportName = resolveAgentHostDebugLogsExportName(accessor, activeSession);
		await progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('exportDebugLogs.progress', "Exporting Agent Host debug logs"),
			primaryActions: [cancelAction],
			delay: 500,
		}, async progress => {
			const options: IAgentHostDebugLogsExportOptions = {
				token: cancellation.token,
				progress,
				onWillCommit: () => {
					committing = true;
					cancelAction.enabled = false;
				},
			};
			try {
				const [collectionResult, destinationResult] = await prepareAgentHostDebugLogsExport(
					() => raceCancellationError(exportService.selectDestination(exportName).then(destination => {
						if (!destination) {
							cancellation.cancel();
						}
						return destination;
					}), options.token),
					() => raceCancellationError(collectAgentHostDebugLogs(accessor, activeSession, artifact => {
						if (options.token.isCancellationRequested) {
							void deleteHostArtifact(artifact);
						} else {
							hostArtifact = artifact;
						}
					}, options), options.token),
				);
				throwIfExportCancelled(options.token);
				if (collectionResult.status === 'rejected') {
					notificationService.notify({
						severity: Severity.Error,
						message: localize('exportDebugLogs.collectError', "Failed to collect debug logs: {0}", collectionResult.reason instanceof Error ? collectionResult.reason.message : String(collectionResult.reason)),
					});
					return;
				}
				if (destinationResult.status === 'rejected') {
					notificationService.notify({
						severity: Severity.Error,
						message: localize('exportDebugLogs.saveError', "Failed to save debug logs: {0}", destinationResult.reason instanceof Error ? destinationResult.reason.message : String(destinationResult.reason)),
					});
					return;
				}
				const destination = destinationResult.value;
				if (!destination) {
					return;
				}
				try {
					const saveResult = await raceCancellationError(exportService.save(destination, collectionResult.value.files, collectionResult.value.hostArtifact, options), options.token);
					throwIfExportCancelled(options.token);
					if (collectionResult.value.hostCollectionError) {
						notificationService.warn(localize('exportDebugLogs.partialExport', "Only VS Code logs were exported. Agent Host logs could not be collected: {0}", collectionResult.value.hostCollectionError));
					} else if (saveResult?.hostSaveError) {
						notificationService.warn(localize('exportDebugLogs.partialSave', "Agent Host logs were not fully exported: {0}", saveResult.hostSaveError));
					}
					notifyAgentHostDebugLogsExported(notificationService, clipboardService, chatEntitlementService.isInternal, destination);
				} catch (error) {
					if (isCancellationError(error) || options.token.isCancellationRequested) {
						throw new CancellationError();
					}
					notificationService.notify({
						severity: Severity.Error,
						message: localize('exportDebugLogs.saveError', "Failed to save debug logs: {0}", error instanceof Error ? error.message : String(error)),
					});
				}
			} finally {
				if (hostArtifact) {
					const artifact = hostArtifact;
					hostArtifact = undefined;
					progress.report({ message: localize('exportDebugLogs.cleanupProgress', "Cleaning up temporary logs...") });
					await raceCancellationError(raceTimeout(deleteHostArtifact(artifact), 10_000, () => {
						logService.warn('[ExportAgentHostDebugLogs] Temporary host artifact cleanup is still pending');
					}), options.token);
				}
			}
		});
	} catch (error) {
		if (!isCancellationError(error)) {
			notificationService.error(localize('exportDebugLogs.error', "Failed to export debug logs: {0}", getErrorMessage(error)));
		}
	} finally {
		disposables.dispose();
	}
}

function resolveAgentHostDebugLogsExportName(accessor: ServicesAccessor, activeSession: IActiveAgentHostSessionForExport | undefined): string {
	let sessionTitle = activeSession?.sessionTitle;
	if (activeSession && !sessionTitle) {
		const sessionResolution = accessor.get(IAgentHostConnectionsService).resolveSessionResource(activeSession.resource);
		if (sessionResolution) {
			const state = sessionResolution.connection.getSubscriptionUnmanaged(StateComponents.Session, sessionResolution.backendSession)?.value;
			sessionTitle = resolveAgentHostDebugLogsChat(activeSession, state).sessionTitle;
		}
	}
	return getAgentHostDebugLogsExportName(sessionTitle, activeSession?.chatTitle, activeSession?.chatId === DEFAULT_CHAT_ID);
}

export function notifyAgentHostDebugLogsExported(
	notificationService: INotificationService,
	clipboardService: IClipboardService,
	isInternal: boolean,
	savedResource: URI,
): void {
	const savedPath = savedResource.scheme === Schemas.file ? savedResource.fsPath : savedResource.toString(true);
	notificationService.notify({
		severity: Severity.Warning,
		message: isInternal
			? localize('exportDebugLogs.privacyWarning.internal', "Note: This log may contain personal information such as auth tokens, file contents, or terminal output. It MUST be shared privately via Slack or in an issue filed on the microsoft/vscode-internalbacklog repo.")
			: localize('exportDebugLogs.privacyWarning', "Note: This log may contain personal information such as auth tokens, file contents, or terminal output. Please consider sharing privately or reviewing the contents carefully before sharing."),
		actions: {
			primary: [
				new Action('copyAgentHostDebugLogsPath', localize('exportDebugLogs.copyPath', "Copy Path"), undefined, true, () => clipboardService.writeText(savedPath)),
			],
		},
	});
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

/** Translates a local or remote agent-host chat resource into a session export context. */
export function toActiveAgentHostSession(resource: URI, chatTitle: string | undefined, sessionTitle?: string): IActiveAgentHostSessionForExport | undefined {
	if (isAgentHostSession(resource)) {
		return { resource: resource.with({ fragment: null }), sessionTitle, chatTitle, isLocal: resource.scheme.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX), chatId: resource.fragment || DEFAULT_CHAT_ID, backendChatResource: undefined };
	}
	return undefined;
}

class AgentHostDebugLogSourceError extends Error {
	override readonly name = 'AgentHostDebugLogSourceError';
}

async function writeDebugLogStream(
	target: URI,
	readSource: (token: CancellationToken) => VSBufferReadableStream | Promise<VSBufferReadableStream>,
	fileService: IFileService,
	token = CancellationToken.None,
): Promise<void> {
	const cancellation = new CancellationTokenSource(token);
	let source: VSBufferReadableStream | undefined;
	try {
		try {
			source = await readSource(cancellation.token);
		} catch (error) {
			throwIfExportCancelled(cancellation.token);
			if (isCancellationError(error)) {
				throw error;
			}
			throw new AgentHostDebugLogSourceError(getErrorMessage(error), { cause: error });
		}
		let sourceError: Error | undefined;
		source.on('error', error => sourceError = error);
		try {
			await fileService.writeFile(target, source);
		} catch (error) {
			throwIfExportCancelled(cancellation.token);
			if (isCancellationError(error) || !sourceError) {
				throw error;
			}
			try {
				await fileService.del(target);
			} catch (cleanupError) {
				if (!(cleanupError instanceof Error) || toFileOperationResult(cleanupError) !== FileOperationResult.FILE_NOT_FOUND) {
					throw cleanupError;
				}
			}
			throw new AgentHostDebugLogSourceError(getErrorMessage(error), { cause: error });
		}
	} finally {
		cancellation.dispose(true);
		source?.destroy();
	}
}

async function exportFilesToLocalFolder(
	exportFolder: URI,
	files: readonly IAgentHostDebugLogFile[],
	hostArtifact: IAgentHostDebugLogsHostArtifact | undefined,
	fileService: IFileService,
	logService: ILogService,
	options?: IAgentHostDebugLogsExportOptions,
): Promise<IAgentHostDebugLogsSaveResult> {
	await fileService.createFolder(exportFolder);
	const copiedHostPaths = new Set<string>();
	let hostSaveError: string | undefined;
	if (hostArtifact) {
		try {
			if (hostArtifact.artifact.kind !== 'directory') {
				throw new AgentHostDebugLogSourceError(`Expected an Agent Host debug-log directory, got ${hostArtifact.artifact.kind}`);
			}
			await copyHostArtifactDirectory(exportFolder, hostArtifact, fileService, options);
			for (const entry of hostArtifact.artifact.entries) {
				copiedHostPaths.add(entry.path);
			}
		} catch (error) {
			throwIfExportCancelled(options?.token ?? CancellationToken.None);
			if (!(error instanceof AgentHostDebugLogSourceError)) {
				throw error;
			}
			logService.warn(`[ExportAgentHostDebugLogs] Failed to save Agent Host logs: ${error instanceof Error ? error.message : String(error)}; saving client-owned logs only`);
			hostSaveError = getErrorMessage(error);
		}
	}
	for (const file of files) {
		throwIfExportCancelled(options?.token ?? CancellationToken.None);
		options?.progress.report({ message: localize('exportDebugLogs.copyClient', "Saving VS Code log: {0}", file.path) });
		if (file.path.startsWith('ahp/') && copiedHostPaths.has(`ahp/mission-control/${file.path.slice('ahp/'.length)}`)) {
			continue;
		}
		const segments = toSafeRelativePathSegments(file.path);
		if (segments.length === 0) {
			logService.warn(`[ExportAgentHostDebugLogs] Invalid debug-log file path '${file.path}'; skipping log file`);
			continue;
		}
		let folder = exportFolder;
		for (const segment of segments.slice(0, -1)) {
			folder = joinPath(folder, segment);
			await fileService.createFolder(folder);
		}
		const target = joinPath(folder, segments[segments.length - 1]);
		try {
			if (hasKey(file, { contents: true })) {
				await fileService.writeFile(target, VSBuffer.fromString(file.contents));
			} else {
				await writeDebugLogStream(target, async token => (await fileService.readFileStream(file.resource, { length: file.size }, token)).value, fileService, options?.token);
			}
		} catch (error) {
			throwIfExportCancelled(options?.token ?? CancellationToken.None);
			if (!(error instanceof AgentHostDebugLogSourceError)) {
				throw error;
			}
			logService.warn(`[ExportAgentHostDebugLogs] Failed to save '${file.path}'; skipping log file`, error);
		}
	}
	return { hostSaveError };
}

async function copyHostArtifactDirectory(
	target: URI,
	hostArtifact: IAgentHostDebugLogsHostArtifact,
	fileService: IFileService,
	options?: IAgentHostDebugLogsExportOptions,
): Promise<void> {
	let copiedSize = 0;
	for (const entry of hostArtifact.artifact.entries) {
		throwIfExportCancelled(options?.token ?? CancellationToken.None);
		let lastReport = 0;
		const report = (bytes: number) => {
			const now = Date.now();
			if (bytes === 0 || bytes === entry.size || now - lastReport >= 100) {
				lastReport = now;
				options?.progress.report({ message: localize('exportDebugLogs.copyHost', "Saving Agent Host logs ({0}): {1} / {2}", entry.path, ByteSize.formatSize(copiedSize - entry.size + bytes), ByteSize.formatSize(hostArtifact.artifact.uncompressedSize)) });
			}
		};
		copiedSize += entry.size;
		report(0);
		if (copiedSize > hostArtifact.artifact.uncompressedSize) {
			throw new AgentHostDebugLogSourceError(`Agent Host debug-log directory exceeded its declared size of ${hostArtifact.artifact.uncompressedSize} bytes`);
		}

		const source = joinPath(hostArtifact.artifact.resource, ...entry.path.split('/'));
		const segments = toSafeRelativePathSegments(entry.path);
		if (segments.length === 0) {
			throw new AgentHostDebugLogSourceError(`Agent Host returned an invalid debug-log artifact path: ${entry.path}`);
		}
		let targetFolder = target;
		for (const segment of segments.slice(0, -1)) {
			targetFolder = joinPath(targetFolder, segment);
			await fileService.createFolder(targetFolder);
		}
		const entryTarget = joinPath(targetFolder, segments[segments.length - 1]);
		if (source.scheme === Schemas.file) {
			await writeDebugLogStream(entryTarget, async token => {
				const sourceStat = await fileService.resolve(source, { resolveMetadata: true });
				if (!sourceStat.isFile || sourceStat.isSymbolicLink || sourceStat.size !== entry.size) {
					throw new Error(`Agent Host debug-log file no longer matches its manifest: ${entry.path}`);
				}
				return (await fileService.readFileStream(source, { length: entry.size }, token)).value;
			}, fileService, options?.token);
			report(entry.size);
			continue;
		}
		const artifact = { ...hostArtifact.artifact, resource: source, size: entry.size, uncompressedSize: entry.size };
		await writeDebugLogStream(entryTarget, token => createHostArtifactStream(artifact, position => hostArtifact.readChunk(source, position), token, report), fileService, options?.token);
	}
	if (copiedSize !== hostArtifact.artifact.uncompressedSize) {
		throw new AgentHostDebugLogSourceError(`Agent Host debug-log directory manifest accounts for ${copiedSize} bytes, expected ${hostArtifact.artifact.uncompressedSize}`);
	}
}

async function createDebugLogFile(path: string, resource: URI, fileService: IFileService, size?: number): Promise<IAgentHostDebugLogFile> {
	const observedSize = size ?? (await fileService.resolve(resource, { resolveMetadata: true })).size;
	return { path, resource, size: observedSize };
}

export async function collectRotatedLogFiles(path: string, current: URI, fileService: IFileService): Promise<IAgentHostDebugLogFile[]> {
	const currentName = basename(current);
	const parent = await fileService.resolve(dirname(current), { resolveMetadata: true });
	const files: IAgentHostDebugLogFile[] = [];
	for (const child of parent.children ?? []) {
		if (child.isFile && !child.isSymbolicLink && isRotatedLogFile(child.name, currentName)) {
			files.push(await createDebugLogFile(`${path}/${child.name}`, child.resource, fileService, child.size));
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
	const result: URI[] = [];
	for (const outputFolder of outputFolders) {
		const folder = await fileService.resolve(outputFolder.resource);
		for (const child of folder.children ?? []) {
			if (child.isFile && !child.isSymbolicLink && fileNames.has(child.name)) {
				result.push(child.resource);
			}
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

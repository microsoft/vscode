/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, newWriteableBufferStream, streamToBuffer, type VSBufferReadableStream } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService, type AgentHostDebugLogsArtifactKind, type IAgentConnection, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostService, remoteAgentHostLogOutputChannelId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId, parseRemoteAuthorityFromScheme } from '../copilotCliEventsUri.js';
import { getRemoteConnectionForSession, sanitizeFilePart } from '../chatDebug/agentHostLogSources.js';
import { buildAgentHostCustomizationsUri, buildAgentHostUsageUri } from '../chatDebug/agentHostUsageSidecar.js';

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

export type IAgentHostDebugLogFile =
	| { readonly path: string; readonly contents: string }
	| { readonly path: string; readonly resource: URI; readonly size: number };

export interface IAgentHostDebugLogsExport {
	readonly files: IAgentHostDebugLogFile[];
	readonly exportName: string;
	readonly hostArtifact: IAgentHostDebugLogsHostArtifact;
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
	save(exportName: string, files: readonly IAgentHostDebugLogFile[], hostArtifact: IAgentHostDebugLogsHostArtifact): Promise<boolean>;
}

export class BrowserAgentHostDebugLogsExportService implements IAgentHostDebugLogsExportService {
	declare readonly _serviceBrand: undefined;
	readonly hostArtifactKind = 'directory';

	constructor(
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
	) { }

	async save(exportName: string, files: readonly IAgentHostDebugLogFile[], hostArtifact: IAgentHostDebugLogsHostArtifact): Promise<boolean> {
		return exportFilesToLocalFolder(this.fileDialogService, this.fileService, exportName, files, hostArtifact);
	}
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
	const outputService = accessor.get(IOutputService);
	const fileService = accessor.get(IFileService);
	const textModelService = accessor.get(ITextModelService);
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IEnvironmentService);
	const exportService = accessor.get(IAgentHostDebugLogsExportService);

	let connection: IAgentConnection;
	let backendSession: URI | undefined;
	if (activeSession) {
		const sessionResolution = agentHostConnectionsService.resolveSessionResource(activeSession.resource);
		if (!sessionResolution) {
			throw new Error(`No live Agent Host connection owns session ${activeSession.resource.toString()}`);
		}
		connection = sessionResolution.connection;
		backendSession = sessionResolution.backendSession;
	} else {
		connection = agentHostConnectionsService.ambientConnection;
	}
	// The Agent Host owns discovery and packaging of its own logs; failures
	// surface to the user rather than being papered over by a second,
	// path-guessing implementation on this side.
	const hostArtifact = await connection.collectDebugLogs(backendSession, exportService.hostArtifactKind);
	onDidCreateHostArtifact(hostArtifact);

	// Collect all output channel IDs relevant for the current session's agent host.
	const channelIds = new Set<string>();

	let ahpLogNameFilter: ((name: string) => boolean) | undefined;
	if (activeSession) {
		if (activeSession.isLocal) {
			const localClientId = sanitizeFilePart(agentHostService.clientId);
			ahpLogNameFilter = name => name.includes(localClientId);
		} else {
			const remoteConnection = getRemoteConnectionForSession(activeSession.resource, remoteAgentHostService.connections);
			if (remoteConnection) {
				channelIds.add(remoteAgentHostLogOutputChannelId(remoteConnection.address));
				const remoteConnectionId = sanitizeFilePart(remoteConnection.address);
				ahpLogNameFilter = name => name.includes(remoteConnectionId);
			}
		}
	} else {
		for (const remoteConnection of remoteAgentHostService.connections) {
			channelIds.add(remoteAgentHostLogOutputChannelId(remoteConnection.address));
		}
	}

	// Always include the window and shared process logs
	channelIds.add(WINDOW_LOG_CHANNEL_ID);
	channelIds.add(SHARED_PROCESS_LOG_CHANNEL_ID);

	const files: IAgentHostDebugLogFile[] = [];

	// 1. Output channels
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
				files.push(await createDebugLogFile(`ahp/${child.name}`, child.resource, fileService, child.size));
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
				files.push(await createDebugLogFile(sidecar.path, sidecar.resource, fileService));
			} catch {
				// Absent when agent-host debug logging was off for this session.
			}
		}
	}

	const titleSlug = activeSession?.title
		? `-${activeSession.title.replace(/[/\\:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}`
		: '';
	return {
		files,
		exportName: `ah-logs${titleSlug}`,
		hostArtifact: { artifact: hostArtifact, readChunk: createChunkReader(connection) },
	};
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
	let hostArtifact: IAgentHostDebugLogsArtifact | undefined;
	try {
		const logs = await collectAgentHostDebugLogs(accessor, activeSession, artifact => hostArtifact = artifact);
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
export function toActiveAgentHostSession(resource: URI, title: string | undefined): IActiveAgentHostSessionForExport | undefined {
	if (resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME) {
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
	hostArtifact: IAgentHostDebugLogsHostArtifact,
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
	if (hostArtifact.artifact.kind !== 'directory') {
		throw new Error(`Expected an Agent Host debug-log directory, got ${hostArtifact.artifact.kind}`);
	}
	await copyHostArtifactDirectory(exportFolder, hostArtifact, fileService);
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

async function createDebugLogFile(path: string, resource: URI, fileService: IFileService, size?: number, maxInlineSize?: number): Promise<IAgentHostDebugLogFile> {
	if (resource.scheme === Schemas.file) {
		const observedSize = size ?? (await fileService.resolve(resource, { resolveMetadata: true })).size;
		return { path, resource, size: observedSize };
	}
	// Non-local resources (e.g. remote agent-host logs) can't be streamed from
	// disk, so read them inline, bounded to the captured size when known.
	if (size !== undefined) {
		const readSize = maxInlineSize === undefined ? size : Math.min(size, maxInlineSize);
		const stream = await fileService.readFileStream(resource, { position: size - readSize, length: readSize });
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, type VSBufferReadableStream } from '../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentHostAhpJsonlLoggingSettingId, IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_LOG_OUTPUT_CHANNEL_ID, IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, remoteAgentHostLogOutputChannelId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService, type IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { buildLocalCopilotLogsUri, buildRemoteCopilotLogsUri, COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId, parseRemoteAuthorityFromScheme, resolveEventsUri } from '../copilotCliEventsUri.js';

/** Output channel ID for the current window's renderer log. */
const WINDOW_LOG_CHANNEL_ID = 'rendererLog';
/** Output channel ID for the shared process compound log. */
const SHARED_PROCESS_LOG_CHANNEL_ID = 'shared';
/** Bound the best-effort scan of Copilot SDK process logs. */
export const MAX_COPILOT_LOG_SCAN_FILES = 20;
export const MAX_COPILOT_LOG_FILE_SIZE = 10 * 1024 * 1024;
/** Default cap for the amount of text loaded into the inline raw-log viewer. */
export const DEFAULT_RAW_LOG_VIEW_CAP_BYTES = 2 * 1024 * 1024;

/**
 * A matching Copilot process log that can be read lazily.
 */
export interface ICopilotLogFile {
	readonly path: string;
	readonly resource: URI;
	readonly size: number;
}

/**
 * Discriminates the kind of agent-host log a {@link IAgentHostLogSource}
 * points at, so the viewer can pick the appropriate reader and syntax.
 */
export const enum AgentHostLogSourceKind {
	/** The Copilot CLI `events.jsonl` model/conversation stream. */
	Events = 'events',
	/** The client-side AHP JSON-RPC wire log (`<logsHome>/ahp/*.jsonl`). */
	WireLog = 'wire',
	/** The Copilot SDK process logs under `~/.copilot/logs`. */
	CliLog = 'cliLog',
	/** A VS Code output channel (agent host process, renderer, shared). */
	ProcessChannel = 'processChannel',
	/** The remote machine's `agenthost.log`, downloaded on demand. */
	RemoteProcessLog = 'remoteProcessLog',
}

/**
 * Describes one raw log source available for an agent-host session. Descriptors
 * are cheap to enumerate; the actual (bounded) content is read lazily via
 * {@link readAgentHostLogSourceContent} when the user selects the source.
 */
export interface IAgentHostLogSource {
	readonly id: string;
	readonly label: string;
	readonly kind: AgentHostLogSourceKind;
	readonly isRemote: boolean;
	/** File resource for file-backed sources (events, wire log). */
	readonly resource?: URI;
	/** Output channel id for channel-backed sources. */
	readonly channelId?: string;
	/** Copilot logs directory + session id, for the lazy content-filtered CLI log read. */
	readonly cliLogs?: { readonly dir: URI; readonly rawSessionId: string };
	/** Remote connection for lazily downloading `agenthost.log`. */
	readonly remoteConnection?: IRemoteAgentHostConnectionInfo;
}

/** Bag of services required to enumerate and read agent-host log sources. */
export interface IAgentHostLogSourceServices {
	readonly pathService: IPathService;
	readonly agentHostService: IAgentHostService;
	readonly remoteAgentHostService: IRemoteAgentHostService;
	readonly outputService: IOutputService;
	readonly fileService: IFileService;
	readonly textModelService: ITextModelService;
	readonly configurationService: IConfigurationService;
	readonly environmentService: IEnvironmentService;
	readonly productService: IProductService;
	readonly logService: ILogService;
}

/** Result of a bounded raw-log read. */
export interface IAgentHostLogContent {
	readonly text: string;
	/** Total size of the underlying source in bytes, when known. */
	readonly totalBytes: number | undefined;
	/** True when only the tail of the source was loaded. */
	readonly truncated: boolean;
	/** Full-fidelity resource to open in an editor, when the source is file-backed. */
	readonly fileResource?: URI;
}

/**
 * Returns true when the chat session belongs to an agent host (local or
 * remote Copilot CLI). Only these sessions have AHP logs and agent-host
 * process logs, so the AHP Log view is gated on this.
 */
export function isAgentHostSession(resource: URI | undefined): boolean {
	if (!resource) {
		return false;
	}
	return resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME || !!parseRemoteAuthorityFromScheme(resource.scheme);
}

/**
 * Resolves the remote agent-host connection that backs a given remote session
 * URI, or `undefined` for local/unknown sessions.
 */
export function getRemoteConnectionForSession(sessionResource: URI, connections: readonly IRemoteAgentHostConnectionInfo[]): IRemoteAgentHostConnectionInfo | undefined {
	const authority = parseRemoteAuthorityFromScheme(sessionResource.scheme);
	return authority ? connections.find(connection => agentHostAuthority(connection.address) === authority) : undefined;
}

/** Sanitizes a value for use as (part of) a file name. */
export function sanitizeFilePart(value: string): string {
	return value.replace(/[\\/:\*\?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'connection';
}

/**
 * Enumerates the raw log sources available for a given agent-host session.
 * Cheap: performs at most a couple of directory stats and never reads file
 * contents. Returns an empty array for non-agent-host sessions.
 */
export async function enumerateAgentHostLogSources(
	services: IAgentHostLogSourceServices,
	sessionResource: URI | undefined,
): Promise<IAgentHostLogSource[]> {
	if (!isAgentHostSession(sessionResource) || !sessionResource) {
		return [];
	}

	const { pathService, agentHostService, remoteAgentHostService, outputService, fileService, configurationService, environmentService } = services;
	const userHome = pathService.userHome({ preferLocal: true });
	const isLocal = sessionResource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME;
	const remoteConnection = isLocal ? undefined : getRemoteConnectionForSession(sessionResource, remoteAgentHostService.connections);

	const sources: IAgentHostLogSource[] = [];

	// 1. events.jsonl (model/conversation stream)
	const eventsResult = resolveEventsUri(
		sessionResource,
		userHome,
		authority => remoteAgentHostService.connections.find(c => agentHostAuthority(c.address) === authority),
	);
	if (eventsResult.kind === 'ok') {
		sources.push({
			id: 'events',
			label: localize('agentHostLogs.events', "Session Events (events.jsonl)"),
			kind: AgentHostLogSourceKind.Events,
			isRemote: !isLocal,
			resource: eventsResult.resource,
		});
	}

	// 2. AHP wire log(s) — only when wire logging is enabled.
	if (configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId)) {
		const nameToken = isLocal
			? sanitizeFilePart(agentHostService.clientId)
			: remoteConnection ? sanitizeFilePart(remoteConnection.address) : undefined;
		const wireFiles = await listWireLogFiles(fileService, environmentService, nameToken);
		wireFiles.forEach((file, index) => {
			sources.push({
				id: `wire:${file.resource.toString()}`,
				label: index === 0
					? localize('agentHostLogs.wire', "AHP Log")
					: localize('agentHostLogs.wireN', "AHP Log — {0}", file.name),
				kind: AgentHostLogSourceKind.WireLog,
				isRemote: !isLocal,
				resource: file.resource,
			});
		});
	}

	// 3. Agent host process log (output channel) + window/shared logs.
	const channelIds: string[] = [];
	if (isLocal) {
		channelIds.push(AGENT_HOST_LOG_OUTPUT_CHANNEL_ID);
	} else if (remoteConnection) {
		channelIds.push(remoteAgentHostLogOutputChannelId(remoteConnection.address));
	}
	channelIds.push(WINDOW_LOG_CHANNEL_ID, SHARED_PROCESS_LOG_CHANNEL_ID);
	for (const channelId of channelIds) {
		const descriptor = outputService.getChannelDescriptor(channelId);
		if (!descriptor) {
			continue;
		}
		sources.push({
			id: `channel:${channelId}`,
			label: localize('agentHostLogs.channel', "{0} (Log)", descriptor.label),
			kind: AgentHostLogSourceKind.ProcessChannel,
			isRemote: !isLocal,
			channelId,
		});
	}

	// 4. Remote agenthost.log (downloaded on demand).
	if (remoteConnection?.defaultDirectory) {
		sources.push({
			id: 'remoteProcessLog',
			label: localize('agentHostLogs.remoteProcess', "Remote Agent Host Log (agenthost.log)"),
			kind: AgentHostLogSourceKind.RemoteProcessLog,
			isRemote: true,
			remoteConnection,
		});
	}

	// 5. Copilot SDK process logs (~/.copilot/logs), content-filtered lazily by session id.
	const rawSessionId = getCopilotCliSessionRawId(sessionResource);
	if (rawSessionId) {
		const copilotLogsDir = isLocal
			? buildLocalCopilotLogsUri(userHome)
			: remoteConnection ? buildRemoteCopilotLogsUri(remoteConnection) : undefined;
		if (copilotLogsDir) {
			sources.push({
				id: 'cliLog',
				label: localize('agentHostLogs.cliLog', "Copilot CLI Logs"),
				kind: AgentHostLogSourceKind.CliLog,
				isRemote: !isLocal,
				cliLogs: { dir: copilotLogsDir, rawSessionId },
			});
		}
	}

	return sources;
}

/**
 * Reads the (bounded) content of a log source. File-backed sources are tailed
 * to at most `capBytes`; the returned {@link IAgentHostLogContent.fileResource}
 * lets callers offer an "open full file" affordance.
 */
export async function readAgentHostLogSourceContent(
	source: IAgentHostLogSource,
	services: IAgentHostLogSourceServices,
	capBytes: number = DEFAULT_RAW_LOG_VIEW_CAP_BYTES,
): Promise<IAgentHostLogContent | undefined> {
	const { fileService, outputService, textModelService, productService, logService } = services;

	switch (source.kind) {
		case AgentHostLogSourceKind.Events:
		case AgentHostLogSourceKind.WireLog: {
			if (!source.resource) {
				return undefined;
			}
			return readFileTail(fileService, source.resource, capBytes);
		}
		case AgentHostLogSourceKind.ProcessChannel: {
			if (!source.channelId) {
				return undefined;
			}
			const channel = outputService.getChannel(source.channelId);
			if (!channel) {
				return undefined;
			}
			const modelRef = await textModelService.createModelReference(channel.uri);
			try {
				const value = modelRef.object.textEditorModel.getValue();
				return tailString(value, capBytes);
			} finally {
				modelRef.dispose();
			}
		}
		case AgentHostLogSourceKind.RemoteProcessLog: {
			if (!source.remoteConnection) {
				return undefined;
			}
			const value = await readRemoteAgentHostLog(source.remoteConnection, productService.serverDataFolderName, fileService);
			return value === undefined ? undefined : tailString(value, capBytes);
		}
		case AgentHostLogSourceKind.CliLog: {
			if (!source.cliLogs) {
				return undefined;
			}
			const files = await readCopilotLogsForSession(source.cliLogs.dir, source.cliLogs.rawSessionId, fileService, logService);
			if (files.length === 0) {
				return { text: '', totalBytes: 0, truncated: false };
			}
			const combined = files.map(f => `===== ${f.path} =====\n${f.contents}`).join('\n\n');
			return tailString(combined, capBytes);
		}
	}
}

/**
 * Lists AHP wire log files for a session's connection.
 *
 * When `nameToken` identifies the session's connection (its filenames embed
 * `ahp-<timestamp>-<connectionId>.jsonl`), only matching files are returned —
 * so unrelated connections' logs are not surfaced as spurious "rotated"
 * sources. Falls back to all AHP logs (newest first) when the token is absent
 * or matches nothing.
 */
async function listWireLogFiles(
	fileService: IFileService,
	environmentService: IEnvironmentService,
	nameToken: string | undefined,
): Promise<{ resource: URI; name: string; mtime: number }[]> {
	const ahpDir = joinPath(environmentService.logsHome, 'ahp');
	let children: IFileStatWithMetadata[] | undefined;
	try {
		children = (await fileService.resolve(ahpDir, { resolveMetadata: true })).children;
	} catch {
		return [];
	}
	const files = (children ?? [])
		.filter(child => !child.isDirectory && child.name.endsWith('.jsonl'))
		.map(child => ({ resource: child.resource, name: child.name, mtime: child.mtime ?? 0 }));

	// Restrict to the session's connection when it can be identified; otherwise
	// fall back to all files so a session is never left without any log.
	const matching = nameToken ? files.filter(file => file.name.includes(nameToken)) : [];
	const selected = matching.length > 0 ? matching : files;

	// Newest first.
	return selected.sort((a, b) => b.mtime - a.mtime);
}

/** Reads at most `capBytes` from the tail of a file. */
async function readFileTail(fileService: IFileService, resource: URI, capBytes: number): Promise<IAgentHostLogContent> {
	let size: number | undefined;
	try {
		size = (await fileService.resolve(resource, { resolveMetadata: true })).size;
	} catch {
		size = undefined;
	}

	if (size !== undefined && size > capBytes) {
		const content = await fileService.readFile(resource, { position: size - capBytes, length: capBytes });
		let text = content.value.toString();
		// Drop the leading partial line so the view starts on a record boundary.
		const firstNewline = text.indexOf('\n');
		if (firstNewline >= 0) {
			text = text.slice(firstNewline + 1);
		}
		return { text, totalBytes: size, truncated: true, fileResource: resource };
	}

	const content = await fileService.readFile(resource, { limits: { size: capBytes } });
	return { text: content.value.toString(), totalBytes: size, truncated: false, fileResource: resource };
}

/** Returns at most `capBytes` worth of text from the tail of a string. */
function tailString(value: string, capBytes: number): IAgentHostLogContent {
	if (value.length <= capBytes) {
		return { text: value, totalBytes: value.length, truncated: false };
	}
	let text = value.slice(value.length - capBytes);
	const firstNewline = text.indexOf('\n');
	if (firstNewline >= 0) {
		text = text.slice(firstNewline + 1);
	}
	return { text, totalBytes: value.length, truncated: true };
}

/**
 * Scans a Copilot logs directory for `.log` files whose content mentions the
 * given session id, returning their contents. Bounded by
 * {@link MAX_COPILOT_LOG_SCAN_FILES} and {@link MAX_COPILOT_LOG_FILE_SIZE}.
 */
export async function readCopilotLogsForSession(
	logsDir: URI,
	rawSessionId: string,
	fileService: IFileService,
	logService: ILogService,
): Promise<{ path: string; contents: string }[]> {
	const matchingLogs = await findCopilotLogsForSession(logsDir, rawSessionId, fileService, logService);
	const files: { path: string; contents: string }[] = [];
	for (const log of matchingLogs) {
		try {
			const content = await fileService.readFile(log.resource, { limits: { size: MAX_COPILOT_LOG_FILE_SIZE } });
			files.push({ path: log.path, contents: content.value.toString() });
		} catch (error) {
			logService.warn(`[AgentHostLogSources] Failed to read Copilot log '${log.resource.path}': ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return files;
}

/**
 * Finds bounded Copilot process logs whose contents mention the session id.
 */
export async function findCopilotLogsForSession(
	logsDir: URI,
	rawSessionId: string,
	fileService: IFileService,
	logService: ILogService,
): Promise<ICopilotLogFile[]> {
	let children: IFileStatWithMetadata[] | undefined;
	try {
		children = (await fileService.resolve(logsDir, { resolveMetadata: true })).children;
	} catch {
		return [];
	}

	const files: ICopilotLogFile[] = [];
	const candidateLogs = (children ?? [])
		.filter(child => !child.isDirectory && child.name.endsWith('.log') && child.size <= MAX_COPILOT_LOG_FILE_SIZE)
		.sort((a, b) => b.mtime - a.mtime)
		.slice(0, MAX_COPILOT_LOG_SCAN_FILES);
	for (const child of candidateLogs) {
		try {
			if (await logStreamContains(child.resource, rawSessionId, fileService)) {
				files.push({ path: `copilot-logs/${child.name}`, resource: child.resource, size: child.size });
			}
		} catch (error) {
			logService.warn(`[AgentHostLogSources] Failed to scan Copilot log '${child.name}': ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return files;
}

async function logStreamContains(
	resource: URI,
	rawSessionId: string,
	fileService: IFileService,
): Promise<boolean> {
	const tokenSource = new CancellationTokenSource();
	let stream: VSBufferReadableStream;
	try {
		stream = (await fileService.readFileStream(resource, {
			length: MAX_COPILOT_LOG_FILE_SIZE,
			limits: { size: MAX_COPILOT_LOG_FILE_SIZE },
		}, tokenSource.token)).value;
	} catch (error) {
		tokenSource.dispose(true);
		throw error;
	}
	return new Promise<boolean>((resolve, reject) => {
		let settled = false;
		let previous = '';

		const cleanup = (removeErrorListener: boolean) => {
			stream.removeListener('data', onData);
			stream.removeListener('end', onEnd);
			if (removeErrorListener) {
				stream.removeListener('error', onError);
			}
		};
		const settle = (contains: boolean) => {
			if (settled) {
				return;
			}
			settled = true;
			tokenSource.dispose(contains);
			cleanup(!contains);
			resolve(contains);
		};
		const onData = (chunk: VSBuffer) => {
			const text = previous + chunk.toString();
			if (text.includes(rawSessionId)) {
				settle(true);
				return;
			}
			previous = text.slice(Math.max(0, text.length - rawSessionId.length + 1));
		};
		const onError = (error: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			tokenSource.dispose();
			cleanup(true);
			reject(error);
		};
		const onEnd = () => {
			settle(false);
		};

		stream.on('error', onError);
		stream.on('end', onEnd);
		stream.on('data', onData);
	});
}

/**
 * Reads the remote agent host's `agenthost.log` from the remote machine via the
 * `vscode-agent-host://` filesystem proxy. The CLI launches the server with its
 * default data dir at `<home>/<serverDataFolderName>/data/logs/<datestamp>/`,
 * so we list the logs directory and pick the most recent date-stamped folder.
 */
export async function readRemoteAgentHostLog(
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

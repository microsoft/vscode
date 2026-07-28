/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { IAgentHostService, type IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ActionType, type ActionEnvelope, type ChatUsageAction, type SessionCustomizationsChangedAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { isDefaultChatUri, parseChatUri, readUsageInfoMeta, type Customization } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { getCopilotCliSessionRawId } from '../copilotCliEventsUri.js';

/**
 * Directory (under the client's user data home) that holds the per-session
 * token-usage sidecar files. Kept separate from VS Code's other user-data
 * folders and never written into the CLI's `~/.copilot` tree.
 */
const USAGE_DIR = 'agentHostUsage';

/**
 * One captured Copilot `ChatUsage` action, i.e. the usage report for a single
 * model call. Persisted as a line in the session's sidecar so per-turn/per-round
 * token metrics survive a VS Code restart (the reduced chat state keeps only the
 * last request's input/cache per turn, and `events.jsonl` only records
 * `outputTokens` until `session.shutdown`).
 */
export interface IAgentHostUsageRecord {
	/** Turn the model call belongs to. */
	readonly turnId: string;
	/** Model that served the call, if reported. */
	readonly model?: string;
	/** Input tokens for this single call. */
	readonly inputTokens?: number;
	/** Output tokens for this single call. */
	readonly outputTokens?: number;
	/** Cache-read tokens for this single call. */
	readonly cacheReadTokens?: number;
	/** Per-turn cumulative Copilot AIU (nano) at the time of this call. */
	readonly totalNanoAiu?: number;
	/** ISO timestamp when the client captured the action. */
	readonly ts: string;
}

/** Builds the sidecar URI for a session's usage records under `baseDir`. */
export function buildAgentHostUsageUri(baseDir: URI, rawSessionId: string): URI {
	return joinPath(baseDir, USAGE_DIR, `${sanitizeSessionId(rawSessionId)}.jsonl`);
}

/** Replaces characters that are unsafe in a file name so a raw id maps to one file. */
function sanitizeSessionId(rawSessionId: string): string {
	return rawSessionId.replace(/[^\w.-]/g, '_');
}

/**
 * Reads a session's usage sidecar. Returns the records in capture order,
 * skipping blank or malformed lines. Returns an empty array when the file does
 * not exist (e.g. a session that ran before capture shipped).
 */
export async function readAgentHostUsageRecords(fileService: IFileService, uri: URI): Promise<IAgentHostUsageRecord[]> {
	let text: string;
	try {
		const content = await fileService.readFile(uri);
		text = content.value.toString();
	} catch {
		return [];
	}
	const records: IAgentHostUsageRecord[] = [];
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed.turnId === 'string' && typeof parsed.ts === 'string') {
				records.push(parsed as IAgentHostUsageRecord);
			}
		} catch {
			// Skip a malformed/partial line rather than dropping the whole file.
		}
	}
	return records;
}

/**
 * The minimal agent-host surface the recorders observe: a stream of protocol
 * actions. Satisfied by {@link IAgentHostService} in production and by a bare
 * emitter in tests, so the recorders don't depend on the full service.
 */
type IAgentHostActionSource = Pick<IAgentHostService, 'onDidAction'>;

/**
 * Shared client-side plumbing for recorders that observe agent-host protocol
 * actions across the ambient (local) connection and every live remote
 * connection, and persist derived data to a client-local sidecar. Enable
 * gating and local/remote fan-out live here; subclasses implement
 * {@link _onAction} for the action(s) they care about.
 *
 * Running on the client (where wire logs are captured) means every session's
 * actions arrive through the same subscription reducers regardless of
 * transport, so subclasses work uniformly for local and remote hosts.
 */
abstract class AgentHostActionRecorder extends Disposable {

	/** Live per-remote-connection action listeners, keyed by agent-host authority. */
	private readonly _remoteListeners = this._register(new DisposableMap<string>());

	/**
	 * The connection object currently subscribed for each authority. Tracked so
	 * a reconnect (which replaces the connection object under the same
	 * authority) is detected and the listener re-subscribed to the live object.
	 */
	private readonly _remoteConnections = new Map<string, IAgentConnection>();

	constructor(
		protected readonly _isEnabled: () => boolean,
		agentHostService: IAgentHostActionSource,
		private readonly _remoteAgentHostService: IRemoteAgentHostService,
	) {
		super();

		// Local agent-host sessions.
		this._register(agentHostService.onDidAction(envelope => this._dispatch(envelope)));

		// Remote agent-host connections (rebuilt as connections come and go).
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._syncRemoteListeners()));
		this._syncRemoteListeners();
	}

	/** Gate on the enable predicate before handing the action to the subclass. */
	private _dispatch(envelope: ActionEnvelope): void {
		if (!this._isEnabled()) {
			return;
		}
		this._onAction(envelope);
	}

	/** Handle a single action from any (local or remote) connection. */
	protected abstract _onAction(envelope: ActionEnvelope): void;

	/** Subscribes to `onDidAction` on each current remote connection; drops stale ones. */
	private _syncRemoteListeners(): void {
		const seen = new Set<string>();
		for (const info of this._remoteAgentHostService.connections) {
			const authority = agentHostAuthority(info.address);
			seen.add(authority);
			const connection = this._remoteAgentHostService.getConnectionByAuthority(authority);
			if (!connection) {
				continue;
			}
			// Skip only when already subscribed to this exact connection object.
			// After a reconnect the object is replaced under the same authority,
			// so we must re-subscribe to the live one (DisposableMap.set
			// disposes the previous, now-dead listener).
			if (this._remoteConnections.get(authority) === connection) {
				continue;
			}
			this._remoteConnections.set(authority, connection);
			this._remoteListeners.set(authority, connection.onDidAction(envelope => this._dispatch(envelope)));
		}
		for (const authority of [...this._remoteListeners.keys()]) {
			if (!seen.has(authority)) {
				this._remoteListeners.deleteAndDispose(authority);
				this._remoteConnections.delete(authority);
			}
		}
	}
}

/**
 * Captures Copilot `ChatUsage` actions on the client and appends them to a
 * stable, client-local per-session sidecar so token metrics survive a VS Code
 * restart and feed accurate per-round Cache Explorer numbers.
 *
 * Dedup: a single model call can surface multiple `ChatUsage` actions —
 *   1. a parent-scope emit on the session's DEFAULT chat channel, and
 *   2. for sub-agent calls, a sub-agent-scope emit on a sub-agent chat channel
 *      (`parseChatUri` maps both to the same session), and
 *   3. an async re-emit carrying the same tokens plus `_meta.contextAttribution`.
 * Capturing only actions on the default chat channel (1) that lack
 * `contextAttribution` yields exactly one record per model call — and the
 * parent aggregate already includes sub-agent token usage.
 */
export class AgentHostUsageRecorder extends AgentHostActionRecorder {

	/** Per-session serialized append queue (keeps records ordered; no in-memory copy of the file). */
	private readonly _queues = new Map<string, Promise<void>>();

	constructor(
		private readonly _baseDir: URI,
		isEnabled: () => boolean,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		agentHostService: IAgentHostActionSource,
		remoteAgentHostService: IRemoteAgentHostService,
	) {
		super(isEnabled, agentHostService, remoteAgentHostService);
	}

	protected _onAction(envelope: ActionEnvelope): void {
		const action = envelope.action;
		if (action.type !== ActionType.ChatUsage) {
			return;
		}
		// Parent aggregate only (skips the sub-agent-scope duplicate on a
		// sub-agent chat channel, which maps to the same session).
		if (!isDefaultChatUri(envelope.channel)) {
			return;
		}
		const usage = (action as ChatUsageAction).usage;
		const meta = readUsageInfoMeta(usage);
		// Skip the async re-emit (same tokens, enriched with context attribution).
		if (meta.contextAttribution) {
			return;
		}
		const session = parseChatUri(envelope.channel)?.session;
		if (!session) {
			return;
		}
		// The backend chat channel encodes a `copilotcli:/<rawId>` session URI;
		// `getCopilotCliSessionRawId` yields the same raw id the reader derives
		// from the client session resource.
		const rawId = getCopilotCliSessionRawId(URI.parse(session));
		if (!rawId) {
			return;
		}
		const record: IAgentHostUsageRecord = {
			turnId: (action as ChatUsageAction).turnId,
			model: usage.model,
			inputTokens: usage.inputTokens,
			outputTokens: usage.outputTokens,
			cacheReadTokens: usage.cacheReadTokens,
			totalNanoAiu: meta.copilotUsage?.totalNanoAiu,
			ts: new Date().toISOString(),
		};
		this._append(rawId, record);
	}

	/**
	 * Appends a record to the session's sidecar. Uses the file system's append
	 * capability so each record is a single small write (no read-modify-write of
	 * the whole file, and no in-memory copy of the growing file) — writes are
	 * still serialized per session to keep records ordered. Records written
	 * before a restart are preserved because we append to the existing file.
	 */
	private _append(rawId: string, record: IAgentHostUsageRecord): void {
		const uri = buildAgentHostUsageUri(this._baseDir, rawId);
		const line = JSON.stringify(record) + '\n';
		const previous = this._queues.get(rawId) ?? Promise.resolve();
		const next = previous
			.then(() => this._fileService.writeFile(uri, VSBuffer.fromString(line), { append: true }))
			.then(() => undefined)
			.catch(err => {
				this._logService.trace(`[AgentHostUsageRecorder] append failed for ${rawId}: ${toErrorMessage(err)}`);
			});
		this._queues.set(rawId, next);
	}
}

/**
 * Directory (under the client's user data home) that holds the per-session
 * customization snapshot sidecar files. Kept alongside — but separate from —
 * the usage sidecar, and never written into the CLI's `~/.copilot` tree.
 */
const CUSTOMIZATIONS_DIR = 'agentHostCustomizations';

/** Builds the sidecar URI for a session's customization snapshot under `baseDir`. */
export function buildAgentHostCustomizationsUri(baseDir: URI, rawSessionId: string): URI {
	return joinPath(baseDir, CUSTOMIZATIONS_DIR, `${sanitizeSessionId(rawSessionId)}.json`);
}

/**
 * Reads a session's persisted customization snapshot — the last
 * full-replacement `SessionCustomizationsChanged` payload captured live.
 * Returns `undefined` when the file is absent (e.g. a session that ran before
 * capture shipped) or malformed, so callers fall back to the live session
 * state rather than showing nothing.
 */
export async function readAgentHostCustomizationsSnapshot(fileService: IFileService, uri: URI): Promise<Customization[] | undefined> {
	let text: string;
	try {
		const content = await fileService.readFile(uri);
		text = content.value.toString();
	} catch {
		return undefined;
	}
	try {
		const parsed = JSON.parse(text);
		if (Array.isArray(parsed)) {
			return parsed as Customization[];
		}
	} catch {
		// Ignore a malformed/partial snapshot rather than throwing.
	}
	return undefined;
}

/**
 * Captures each session's loaded customizations (skills/hooks/agents/MCP) to a
 * stable client-local snapshot so the debug view can surface them even for
 * historical/closed sessions. This is necessary because the live
 * {@link IAgentHostCustomizationService} only knows the customizations of
 * sessions with an active state subscription, and the SDK's `session.*_loaded`
 * events are ephemeral (never written to `events.jsonl`).
 *
 * Listens for the full-replacement `SessionCustomizationsChanged` action — the
 * canonical way a host publishes its effective customization set — on the
 * `<provider>:/<rawId>` session channel, and overwrites the session's snapshot.
 * The raw id derived from the channel matches the one the reader derives from
 * the client session resource (both are the URI path), so the snapshot lines up
 * with the session it belongs to.
 */
export class AgentHostCustomizationRecorder extends AgentHostActionRecorder {

	/** Per-session serialized write queue (last snapshot wins). */
	private readonly _queues = new Map<string, Promise<void>>();

	constructor(
		private readonly _baseDir: URI,
		isEnabled: () => boolean,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		agentHostService: IAgentHostActionSource,
		remoteAgentHostService: IRemoteAgentHostService,
	) {
		super(isEnabled, agentHostService, remoteAgentHostService);
	}

	protected _onAction(envelope: ActionEnvelope): void {
		if (envelope.action.type !== ActionType.SessionCustomizationsChanged) {
			return;
		}
		const rawId = getCopilotCliSessionRawId(URI.parse(envelope.channel));
		if (!rawId) {
			return; // not a Copilot CLI session channel
		}
		this._write(rawId, (envelope.action as SessionCustomizationsChangedAction).customizations);
	}

	/** Overwrites the session's snapshot, serializing writes per session. */
	private _write(rawId: string, customizations: readonly Customization[]): void {
		const uri = buildAgentHostCustomizationsUri(this._baseDir, rawId);
		const content = JSON.stringify(customizations);
		const previous = this._queues.get(rawId) ?? Promise.resolve();
		const next = previous
			.then(() => this._fileService.writeFile(uri, VSBuffer.fromString(content)))
			.then(() => undefined)
			.catch(err => {
				this._logService.trace(`[AgentHostCustomizationRecorder] write failed for ${rawId}: ${toErrorMessage(err)}`);
			});
		this._queues.set(rawId, next);
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { dirname, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { buildDefaultChatUri, CustomizationType, readUsageInfoMeta, StateComponents, type ChatState, type ChildCustomization, type Customization, type UsageInfo } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ChatDebugHookResult, ChatDebugLogLevel, IChatDebugCustomizationLogEntry, IChatDebugEvent, IChatDebugFileEntry, IChatDebugLogProvider, IChatDebugMessageSection, IChatDebugModelTurnEvent, IChatDebugResolvedEventContent, IChatDebugService } from '../../common/chatDebugService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostAgentDebugLogEnabledSettingId, AgentHostAgentDebugLogMaxEventsSettingId } from '../../common/promptSyntax/promptTypes.js';
import { COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId, resolveEventsUri } from '../copilotCliEventsUri.js';
import { AgentHostCustomizationRecorder, AgentHostUsageRecorder, buildAgentHostCustomizationsUri, buildAgentHostUsageUri, readAgentHostCustomizationsSnapshot, readAgentHostUsageRecords, type IAgentHostUsageRecord } from './agentHostUsageSidecar.js';

/**
 * One record in an Agent Host Copilot CLI `events.jsonl` stream. The CLI
 * writes a line-delimited JSON log of the session under
 * `~/.copilot/session-state/<id>/events.jsonl`. Every record shares the same
 * envelope. Note that `parentId` is **not** a logical parent: the SDK defines
 * it as the chronologically preceding event in the session (a flat linked chain
 * over every event), not the user → model-turn → tool-call hierarchy. The
 * panel's trajectory tree is instead reconstructed from each record's logical
 * context (turn / tool-call / agent ids); see
 * {@link convertAgentHostEventsToDebugEvents}.
 */
interface IAgentHostEventRecord {
	readonly type: string;
	readonly id: string;
	readonly parentId: string | null;
	/** Sub-agent instance id; absent for the main agent and session-level events. */
	readonly agentId?: string;
	readonly timestamp: string;
	readonly data: Record<string, unknown>;
}

/** Maximum number of session-state folders scanned for the session list. */
const MAX_DISCOVERED_SESSIONS = 30;
/** Bytes read from the head of each `events.jsonl` to derive a session title. */
const TITLE_READ_BYTES = 64 * 1024;
/** Cap on cached resolved-event details to bound memory. */
const MAX_RESOLVED_DETAILS = 50_000;
/** Fallback in-memory record cap when the configured value is missing/invalid. */
const DEFAULT_MAX_EVENTS_IN_MEMORY = 10_000;
/** Cap on a tool argument/result string stored on the (list-level) event. */
const MAX_EVENT_PAYLOAD = 4_000;
/** Cap on a tool argument/result string stored for the detail (expanded) view. */
const MAX_DETAIL_PAYLOAD = 100_000;

/**
 * Feeds Agent Host (Copilot CLI) sessions into the Agent Debug Logs panel by
 * reading each session's on-disk `events.jsonl` and converting the records
 * into {@link IChatDebugEvent}s. Registers a core-side
 * {@link IChatDebugLogProvider} (the service supports multiple providers
 * alongside the extension's), and adds discovered local sessions to the
 * available-sessions list so they appear in the home view.
 */
export class AgentHostChatDebugContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostChatDebug';

	/** Resolved (expanded) detail for each emitted event id. */
	private readonly _resolved = new Map<string, IChatDebugResolvedEventContent>();

	/** Guards against concurrent/overlapping session discovery scans. */
	private _discovering = false;

	/** True once the lazy fetcher has run at least once (i.e. the panel has been opened). */
	private _hasFetchedOnce = false;

	/** Watches the currently-viewed session's events.jsonl for live refresh. */
	private readonly _liveRefresh = this._register(new MutableDisposable<DisposableStore>());
	private _watchedSessionKey: string | undefined;

	/**
	 * Incremental-read cache for the actively-viewed session's `events.jsonl`.
	 * The CLI appends to the file, so each live refresh reads only the bytes
	 * added since the last read and parses just the new lines, avoiding an
	 * O(N) whole-file re-read + re-parse on every change. Bounded to a single
	 * session (the one being viewed) and released when that session ends.
	 */
	private _liveRead: { key: string; consumedBytes: number; pendingBytes: VSBuffer; records: IAgentHostEventRecord[] } | undefined;

	/**
	 * Size-gated cache for the actively-viewed session's usage sidecar. The
	 * sidecar is read on every live tick, but is append-only, so we re-read and
	 * re-parse it only when its byte size changed since the last read (most
	 * ticks — tool progress, etc. — add no usage records). Bounded to a single
	 * session and released when that session ends.
	 */
	private _usageRead: { key: string; size: number; records: readonly IAgentHostUsageRecord[] } | undefined;

	constructor(
		@IChatDebugService private readonly _chatDebugService: IChatDebugService,
		@IFileService private readonly _fileService: IFileService,
		@IPathService private readonly _pathService: IPathService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IAgentHostCustomizationService private readonly _customizationService: IAgentHostCustomizationService,
	) {
		super();

		const provider: IChatDebugLogProvider = {
			provideChatDebugLog: (sessionResource, token) => this._provideChatDebugLog(sessionResource, token),
			resolveChatDebugLogEvent: async eventId => this._resolved.get(eventId),
		};
		this._register(this._chatDebugService.registerProvider(provider));

		// Capture live token-usage actions to a stable client-local sidecar so
		// per-turn/per-round metrics survive a VS Code restart and feed the Cache
		// Explorer accurately (works for local and remote hosts alike). Gated on
		// the same agent-host setting that gates the panel for CLI sessions.
		this._register(new AgentHostUsageRecorder(
			this._environmentService.userRoamingDataHome,
			() => this._configurationService.getValue<boolean>(AgentHostAgentDebugLogEnabledSettingId),
			this._fileService,
			this._logService,
			this._agentHostService,
			this._remoteAgentHostService,
		));

		// Capture each session's loaded customizations (skills/hooks/agents/MCP)
		// to a client-local snapshot so historical/closed sessions still surface
		// them: the live customization service only knows sessions with an active
		// state subscription, and the SDK's `session.*_loaded` events are ephemeral.
		this._register(new AgentHostCustomizationRecorder(
			this._environmentService.userRoamingDataHome,
			() => this._configurationService.getValue<boolean>(AgentHostAgentDebugLogEnabledSettingId),
			this._fileService,
			this._logService,
			this._agentHostService,
			this._remoteAgentHostService,
		));

		// Stop the live file watcher when the session it follows is closed
		// (e.g. navigating Home or closing the debug editor), so we don't keep
		// re-reading and re-invoking providers for a session no longer shown.
		this._register(this._chatDebugService.onDidEndSession(sessionResource => {
			if (sessionResource.toString() === this._watchedSessionKey) {
				this._liveRefresh.clear();
				this._watchedSessionKey = undefined;
				this._liveRead = undefined; // release the per-session parse cache
				this._usageRead = undefined; // release the per-session usage cache
			}
		}));

		// Discover historical local sessions so they appear in the home list —
		// but only when the debug panel actually needs them. Registering a lazy
		// fetcher (invoked on the first `getAvailableSessionResources()`, i.e.
		// when the home view first renders) keeps the startup/idle footprint at
		// zero when the panel is never opened. When file logging is toggled on
		// after the panel has already loaded once, re-scan directly so sessions
		// surface without a window reload.
		this._register(this._chatDebugService.registerAvailableSessionsFetcher(token => this._fetchLocalSessions(token)));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentHostAgentDebugLogEnabledSettingId) && this._hasFetchedOnce) {
				this._maybeDiscoverLocalSessions();
			}
		}));
	}

	/**
	 * Lazy fetcher registered with {@link IChatDebugService}. Invoked (at most
	 * once) when the home view first requests the available session list, so no
	 * disk scan happens until the panel is opened. Returns nothing when file
	 * logging is disabled.
	 */
	private async _fetchLocalSessions(token: CancellationToken): Promise<{ uri: URI; title?: string }[]> {
		this._hasFetchedOnce = true;
		if (!this._configurationService.getValue<boolean>(AgentHostAgentDebugLogEnabledSettingId)) {
			return [];
		}
		try {
			return await this._discoverLocalSessions(token);
		} catch (err) {
			this._logService.warn(`[AgentHostChatDebug] session discovery failed: ${toErrorMessage(err)}`);
			return [];
		}
	}

	/**
	 * Runs {@link _discoverLocalSessions} when file logging is enabled and adds
	 * the results to the available-sessions list, guarding against overlapping
	 * scans. Used for the re-scan when logging is enabled after the panel has
	 * already loaded once (the initial load goes through {@link _fetchLocalSessions}).
	 * Safe to call repeatedly: {@link IChatDebugService.addAvailableSessionResources}
	 * dedupes by URI.
	 */
	private async _maybeDiscoverLocalSessions(): Promise<void> {
		if (this._discovering || !this._configurationService.getValue<boolean>(AgentHostAgentDebugLogEnabledSettingId)) {
			return;
		}
		this._discovering = true;
		try {
			const sessions = await this._discoverLocalSessions(CancellationToken.None);
			if (sessions.length > 0) {
				this._chatDebugService.addAvailableSessionResources(sessions);
			}
		} catch (err) {
			this._logService.warn(`[AgentHostChatDebug] session discovery failed: ${toErrorMessage(err)}`);
		} finally {
			this._discovering = false;
		}
	}

	private _resolveEventsUri(sessionResource: URI): URI | undefined {
		const userHome = this._pathService.userHome({ preferLocal: true });
		const result = resolveEventsUri(
			sessionResource,
			userHome,
			authority => this._remoteAgentHostService.connections.find(c => agentHostAuthority(c.address) === authority),
		);
		return result.kind === 'ok' ? result.resource : undefined;
	}

	/**
	 * Watches the given session's events.jsonl and re-invokes providers when it
	 * changes, so the panel updates as new turns/requests stream in. Only one
	 * session (the one currently shown) is watched at a time. Remote
	 * (non-`file`) sessions are not watched; they still load on open.
	 */
	private _ensureLiveRefresh(sessionResource: URI, eventsUri: URI): void {
		const key = sessionResource.toString();
		if (this._watchedSessionKey === key) {
			return; // already watching this session
		}
		if (eventsUri.scheme !== Schemas.file) {
			this._liveRefresh.clear();
			this._watchedSessionKey = undefined;
			return;
		}

		this._watchedSessionKey = key;
		const store = new DisposableStore();
		// Debounce: the CLI appends many records per turn; coalesce into one re-read.
		const scheduler = store.add(new RunOnceScheduler(() => {
			this._chatDebugService.invokeProviders(sessionResource);
		}, 400));
		// Watch the session-state directory (scoped to this file) rather than
		// the single `events.jsonl`: the external Copilot CLI process writes
		// that file from another process and a single-file watcher can miss
		// those changes (e.g. atomic rename/replace), leaving the panel stale
		// until the user re-navigates. A directory watch reliably surfaces
		// appends to the file so the Logs view updates live.
		const watcher = store.add(this._fileService.createWatcher(dirname(eventsUri), { recursive: false, excludes: [] }));
		store.add(watcher.onDidChange(e => {
			const affects = e.affects(eventsUri);
			if (affects) {
				scheduler.schedule();
			}
		}));

		// Also refresh when the live AHP chat state changes: input/cache/AIU
		// usage is on the chat channel (not in events.jsonl until
		// session.shutdown), so a usage update mid-turn must re-render the tiles.
		const liveSub = this._sessionChatSubscription(sessionResource);
		if (liveSub) {
			store.add(liveSub.onDidChange(() => scheduler.schedule()));
		}

		// The set of loaded customizations (skills/hooks/agents/MCP) is sourced
		// from live session state, not events.jsonl, so re-read when it changes.
		store.add(this._customizationService.onDidChangeCustomizations(() => scheduler.schedule()));

		this._liveRefresh.value = store; // disposes any previously-watched session
	}

	/**
	 * Returns the live AHP chat-state subscription for a local Agent Host
	 * session, if one is currently active (i.e. the session is open/subscribed).
	 * Turns (and their usage) live on the session's default chat channel, so we
	 * subscribe to that channel rather than the session. Read-only: never
	 * creates a subscription.
	 */
	private _sessionChatSubscription(sessionResource: URI) {
		if (sessionResource.scheme !== COPILOT_CLI_LOCAL_AH_SCHEME) {
			return undefined; // live usage only for local Agent Host sessions
		}
		const rawId = getCopilotCliSessionRawId(sessionResource);
		if (!rawId) {
			return undefined;
		}
		const backendSession = URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${rawId}` });
		// Turns/usage moved off the session onto its default chat channel.
		const chatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		return this._agentHostService.getSubscriptionUnmanaged(StateComponents.Chat, chatUri);
	}

	/**
	 * Reads live Copilot AIU from the AHP session state as a fallback usage
	 * source for in-progress sessions (no `session.shutdown` summary yet).
	 * Only AIU is reliable live; input/cache need the shutdown summary (F1).
	 */
	private _getLiveUsageTotals(sessionResource: URI): ISessionUsageTotals | undefined {
		const chat = this._sessionChatSubscription(sessionResource)?.value;
		if (!chat || chat instanceof Error) {
			return undefined;
		}
		return sumChatStateUsage(chat);
	}

	/**
	 * Reads the client-local usage sidecar for a session (exact per-request
	 * token metrics captured live). Returns `undefined` when the session has no
	 * sidecar (e.g. it ran before capture shipped), so the converter falls back
	 * to the session.shutdown summary / live totals.
	 */
	private async _readUsageRecords(sessionResource: URI): Promise<readonly IAgentHostUsageRecord[] | undefined> {
		const rawId = getCopilotCliSessionRawId(sessionResource);
		if (!rawId) {
			return undefined;
		}
		const uri = buildAgentHostUsageUri(this._environmentService.userRoamingDataHome, rawId);
		const key = uri.toString();

		let size: number;
		try {
			const stat = await this._fileService.stat(uri);
			size = stat.size ?? 0;
		} catch {
			this._usageRead = undefined;
			return undefined; // no sidecar for this session
		}

		// Append-only sidecar: reuse the parsed records when the size is unchanged.
		if (this._usageRead?.key === key && this._usageRead.size === size) {
			return this._usageRead.records.length > 0 ? this._usageRead.records : undefined;
		}

		const records = await readAgentHostUsageRecords(this._fileService, uri);
		this._usageRead = { key, size, records };
		return records.length > 0 ? records : undefined;
	}

	/**
	 * Reads the client-local customization snapshot for a session (the last
	 * loaded skills/hooks/agents/MCP captured live). Used as a fallback for
	 * historical/closed sessions, where the live customization service has no
	 * active state subscription and returns nothing. Returns `undefined` when no
	 * snapshot exists (e.g. the session ran before capture shipped).
	 */
	private async _readCustomizationsSnapshot(sessionResource: URI): Promise<readonly Customization[] | undefined> {
		const rawId = getCopilotCliSessionRawId(sessionResource);
		if (!rawId) {
			return undefined;
		}
		const uri = buildAgentHostCustomizationsUri(this._environmentService.userRoamingDataHome, rawId);
		const snapshot = await readAgentHostCustomizationsSnapshot(this._fileService, uri);
		return snapshot && snapshot.length > 0 ? snapshot : undefined;
	}

	private async _provideChatDebugLog(sessionResource: URI, token: CancellationToken): Promise<IChatDebugEvent[] | undefined> {
		if (!this._configurationService.getValue<boolean>(AgentHostAgentDebugLogEnabledSettingId)) {
			return undefined; // agent-host debug logging disabled
		}
		const eventsUri = this._resolveEventsUri(sessionResource);
		if (!eventsUri) {
			return undefined; // not an Agent Host Copilot CLI session
		}

		// Keep the panel live: watch this session's events.jsonl and re-invoke
		// providers on change. A full re-read handles new turns, tool
		// start→complete transitions, and the session.shutdown usage summary.
		// This must run BEFORE the read below: a brand-new session has no
		// events.jsonl yet, and if we returned early on the failed read without
		// arming the watcher, live updates would never surface until the panel
		// is re-opened. The watcher targets the (already-existing) session-state
		// directory, so it fires when the CLI first creates the file.
		this._ensureLiveRefresh(sessionResource, eventsUri);

		const records = await this._readEventRecords(eventsUri, token);
		if (records === undefined) {
			return undefined; // session has no events.jsonl yet, or read failed
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		// For in-progress sessions (no session.shutdown yet), fall back to live
		// Copilot AIU from the AHP session state so the usage tile isn't blank.
		// (Input/cache stay blank until the session ends — see F1.)
		const liveUsageTotals = this._getLiveUsageTotals(sessionResource);

		// Prefer the client-local usage sidecar: it records exact per-request
		// input/cache/AIU (captured live from ChatUsage actions) so metrics are
		// correct per round and survive a restart. Falls back to the
		// session.shutdown even-split / live totals when no sidecar exists.
		const usageRecords = await this._readUsageRecords(sessionResource);
		if (token.isCancellationRequested) {
			return undefined;
		}

		// Loaded customizations (skills/hooks/agents/MCP) come from live session
		// state — the SDK's `session.*_loaded` events are ephemeral and never
		// written to events.jsonl — so surface them as discovery events, mirroring
		// the local `PromptsDebugContribution`. Live state is empty for
		// historical/closed sessions, so fall back to the client-local snapshot
		// captured by `AgentHostCustomizationRecorder`.
		let customizations = this._customizationService.getCustomizations(sessionResource);
		if (customizations.length === 0) {
			customizations = await this._readCustomizationsSnapshot(sessionResource) ?? customizations;
			if (token.isCancellationRequested) {
				return undefined;
			}
		}

		const { events, resolved } = convertAgentHostEventsToDebugEvents(records, sessionResource, liveUsageTotals, usageRecords, customizations);

		// Merge the resolved-detail map, evicting oldest entries past the cap.
		for (const [id, detail] of resolved) {
			this._resolved.set(id, detail);
			if (this._resolved.size > MAX_RESOLVED_DETAILS) {
				const first = this._resolved.keys().next().value;
				if (first !== undefined) {
					this._resolved.delete(first);
				}
			}
		}

		return events;
	}

	/**
	 * Reads the session's `events.jsonl` into parsed records, reading only the
	 * bytes appended since the last read for the actively-viewed session.
	 *
	 * The Copilot CLI appends to `events.jsonl` line-by-line from a separate
	 * process, so a live session is an append-only stream. Rather than
	 * re-reading and re-`JSON.parse`-ing the whole (potentially multi-MB) file
	 * on every change — which is O(N) per tick and O(N^2) over a long session —
	 * we cache the parsed records plus the byte offset consumed so far and read
	 * only the new tail. A full read is used on first view, a cache miss, or
	 * when the file shrank (rotation/truncation).
	 *
	 * Byte offsets are only ever advanced to a newline boundary (`\n` is a
	 * single byte that never appears inside a multi-byte UTF-8 sequence), so a
	 * tail read never starts mid-codepoint; any trailing partial line is kept
	 * as `pendingBytes` and prepended to the next read.
	 *
	 * Returns `undefined` when the file does not exist yet or cannot be read.
	 */
	/**
	 * The configured in-memory event cap for agent host sessions (see
	 * {@link AgentHostAgentDebugLogMaxEventsSettingId}). The raw record cache is
	 * trimmed to this many entries so a long-running session does not retain an
	 * unbounded array, matching the capped public event buffer.
	 */
	private _maxRecordsInMemory(): number {
		const configured = this._configurationService.getValue<number>(AgentHostAgentDebugLogMaxEventsSettingId);
		if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 1) {
			return Math.floor(configured);
		}
		return DEFAULT_MAX_EVENTS_IN_MEMORY;
	}

	/** Trims `records` in place to the most recent {@link _maxRecordsInMemory} entries. */
	private _capRecordsInMemory(records: IAgentHostEventRecord[]): void {
		const max = this._maxRecordsInMemory();
		if (records.length > max) {
			records.splice(0, records.length - max);
		}
	}

	private async _readEventRecords(eventsUri: URI, token: CancellationToken): Promise<IAgentHostEventRecord[] | undefined> {
		const key = eventsUri.toString();
		let size: number;
		try {
			const stat = await this._fileService.stat(eventsUri);
			size = stat.size ?? 0;
		} catch {
			this._liveRead = undefined;
			return undefined; // session has no events.jsonl yet
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		const cache = this._liveRead?.key === key ? this._liveRead : undefined;

		// Incremental tail read: same session, file grew (or is unchanged).
		if (cache && size >= cache.consumedBytes) {
			if (size === cache.consumedBytes) {
				return cache.records; // no new bytes (e.g. an unrelated dir change)
			}
			try {
				const content = await this._fileService.readFile(eventsUri, { position: cache.consumedBytes, length: size - cache.consumedBytes });
				if (token.isCancellationRequested) {
					return undefined;
				}
				const combined = cache.pendingBytes.byteLength ? VSBuffer.concat([cache.pendingBytes, content.value]) : content.value;
				const lastNewline = lastIndexOfNewline(combined);
				if (lastNewline >= 0) {
					appendJsonlRecords(combined.slice(0, lastNewline + 1).toString(), cache.records);
					cache.pendingBytes = combined.slice(lastNewline + 1);
				} else {
					cache.pendingBytes = combined;
				}
				cache.consumedBytes = size;
				this._capRecordsInMemory(cache.records);
				return cache.records;
			} catch {
				// Fall through to a full read (e.g. transient error / offset moved).
			}
		}

		// Full (re)read: first view, different session, file shrank, or tail read failed.
		let buffer: VSBuffer;
		try {
			const content = await this._fileService.readFile(eventsUri);
			buffer = content.value;
		} catch {
			this._liveRead = undefined;
			return undefined;
		}
		if (token.isCancellationRequested) {
			return undefined;
		}
		const lastNewline = lastIndexOfNewline(buffer);
		const records: IAgentHostEventRecord[] = [];
		if (lastNewline >= 0) {
			appendJsonlRecords(buffer.slice(0, lastNewline + 1).toString(), records);
		}
		this._capRecordsInMemory(records);
		this._liveRead = {
			key,
			consumedBytes: buffer.byteLength,
			pendingBytes: lastNewline >= 0 ? buffer.slice(lastNewline + 1) : buffer,
			records,
		};
		return records;
	}

	private async _discoverLocalSessions(token: CancellationToken): Promise<{ uri: URI; title?: string }[]> {
		const userHome = this._pathService.userHome({ preferLocal: true });
		const sessionStateDir = joinPath(userHome, '.copilot', 'session-state');

		let stat;
		try {
			stat = await this._fileService.resolve(sessionStateDir, { resolveMetadata: true });
		} catch {
			return []; // no local Copilot CLI sessions on disk
		}
		if (token.isCancellationRequested) {
			return [];
		}

		const folders = (stat.children ?? [])
			.filter(child => child.isDirectory)
			.sort((a, b) => b.mtime - a.mtime)
			.slice(0, MAX_DISCOVERED_SESSIONS);

		const found = await Promise.all(folders.map(async folder => {
			const eventsUri = joinPath(folder.resource, 'events.jsonl');
			let title: string | undefined;
			try {
				const head = await this._fileService.readFile(eventsUri, { length: TITLE_READ_BYTES });
				title = extractSessionTitle(head.value.toString()) ?? fallbackSessionTitle(folder.name);
			} catch {
				return undefined; // folder without a readable events.jsonl
			}
			return { uri: URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: `/${folder.name}` }), title };
		}));

		if (token.isCancellationRequested) {
			return [];
		}
		return found.filter((s): s is NonNullable<typeof s> => s !== undefined);
	}
}

/**
 * Converts a parsed `events.jsonl` record stream into debug-panel events plus
 * their expanded detail. Pure (no services) so it can be unit-tested directly.
 *
 * The record `parentId` is **not** a logical parent: the Copilot SDK documents
 * it as "the chronologically preceding event in the session, forming a linked
 * chain" — a flat back-pointer over every event, not the user → model-turn →
 * tool-call hierarchy the panel's flow chart needs. So we reconstruct that
 * hierarchy from each record's logical context as we iterate chronologically:
 *   - `session.start` is the tree root.
 *   - a `user.message` hangs off the session root.
 *   - an `assistant.message` hangs off the current user message (tracked per
 *     agent), unless it carries a `parentToolCallId` (a sub-agent turn), in
 *     which case it hangs off that spawning tool call.
 *   - a `tool.execution_start` hangs off the current assistant message (tracked
 *     per agent), unless it carries a `parentToolCallId` (a nested / sub-agent
 *     tool), in which case it hangs off that parent tool call.
 * `tool.execution_start` and `tool.execution_complete` records share a
 * `toolCallId` and are merged into a single tool-call event.
 */
export function convertAgentHostEventsToDebugEvents(
	records: readonly IAgentHostEventRecord[],
	sessionResource: URI,
	fallbackUsageTotals?: ISessionUsageTotals,
	usageRecords?: readonly IAgentHostUsageRecord[],
	customizations?: readonly Customization[],
): { readonly events: IChatDebugEvent[]; readonly resolved: Map<string, IChatDebugResolvedEventContent> } {
	// Pre-pass: index `tool.execution_complete` records by `toolCallId` (so a
	// start can be merged with its completion) and `assistant.turn_start` records
	// by `turnId` (so a turn's wall-clock duration can be measured). Also index
	// `hook.end`, `permission.completed`, and `subagent.completed` so each can be
	// folded onto its opening record (`hook.start` / `permission.requested` /
	// `subagent.started`).
	const completeByToolCallId = new Map<string, IAgentHostEventRecord>();
	const turnStartByTurnId = new Map<string, IAgentHostEventRecord>();
	const hookEndByInvocationId = new Map<string, IAgentHostEventRecord>();
	const permissionCompleteByRequestId = new Map<string, IAgentHostEventRecord>();
	const subagentCompleteByToolCallId = new Map<string, IAgentHostEventRecord>();
	for (const record of records) {
		if (record.type === 'tool.execution_complete') {
			const toolCallId = asString(record.data.toolCallId);
			if (toolCallId) {
				completeByToolCallId.set(toolCallId, record);
			}
		} else if (record.type === 'assistant.turn_start') {
			const turnId = asString(record.data.turnId);
			if (turnId) {
				turnStartByTurnId.set(turnId, record);
			}
		} else if (record.type === 'hook.end') {
			const invocationId = asString(record.data.hookInvocationId);
			if (invocationId) {
				hookEndByInvocationId.set(invocationId, record);
			}
		} else if (record.type === 'permission.completed') {
			const requestId = asString(record.data.requestId);
			if (requestId) {
				permissionCompleteByRequestId.set(requestId, record);
			}
		} else if (record.type === 'subagent.completed') {
			const toolCallId = asString(record.data.toolCallId);
			if (toolCallId) {
				subagentCompleteByToolCallId.set(toolCallId, record);
			}
		}
	}

	const events: IChatDebugEvent[] = [];
	const resolved = new Map<string, IChatDebugResolvedEventContent>();
	// Positions of emitted model-turn events, so per-round usage from the sidecar
	// (preferred) or session-cumulative usage from `session.shutdown` can be
	// back-filled onto them (see below).
	const modelTurnRefs: IModelTurnRef[] = [];

	// Logical-tree context. The "current message" pointers are tracked per agent
	// (keyed by `agentId`, `''` for the main agent) so a sub-agent turn never
	// re-parents a main-agent tool call, and vice versa.
	let rootEventId: string | undefined;
	let rootCreated: Date | undefined;
	const currentUserMessageByAgent = new Map<string, string>();
	const currentAssistantMessageByAgent = new Map<string, string>();
	// Maps a `toolCallId` to the id of its emitted tool-call event, so a nested
	// tool's `parentToolCallId` can be resolved to a surfaced parent.
	const toolEventByToolCallId = new Map<string, string>();

	// Whether the session has at least one enabled hook customization. The CLI
	// emits `preToolUse` / `postToolUse` lifecycle `hook.start` records on *every*
	// tool call regardless of user configuration (VS Code itself uses the
	// `preToolUse` dispatch for tool-permission gating), and a routine successful
	// run is byte-identical to the internal dispatch. We therefore only surface
	// tool hooks when the user actually configured one — so the debug view can
	// confirm it ran, whether it succeeded or failed — and suppress the pure
	// internal-dispatch noise otherwise. `HookCustomization` does not expose which
	// lifecycle events it registers, so this gate is session-level.
	const hasConfiguredHooks = !!customizations
		&& flattenCustomizations(customizations).some(c => c.type === CustomizationType.Hook && c.enabled);

	for (const record of records) {
		const created = new Date(record.timestamp);
		const agentKey = record.agentId ?? '';
		// Parent for events that annotate the turn in progress (errors, warnings,
		// permissions, hooks, …): the current assistant message, else the current
		// user message, else the session root.
		const turnParent = currentAssistantMessageByAgent.get(agentKey) ?? currentUserMessageByAgent.get(agentKey) ?? rootEventId;

		switch (record.type) {
			case 'session.start': {
				rootEventId = record.id;
				rootCreated = created;
				const model = asString(record.data.selectedModel);
				const effort = asString(record.data.reasoningEffort);
				const version = asString(record.data.copilotVersion);
				const context = asRecord(record.data.context);
				const repository = asString(context?.repository);
				const branch = asString(context?.branch);
				const parts: string[] = [];
				if (model) {
					parts.push(effort
						? localize('agentHost.debug.sessionStartedDetails', "model={0}, reasoningEffort={1}", model, effort)
						: localize('agentHost.debug.sessionStartedModel', "model={0}", model));
				}
				if (version) {
					parts.push(localize('agentHost.debug.sessionCliVersion', "CLI {0}", version));
				}
				if (repository) {
					parts.push(branch
						? localize('agentHost.debug.sessionRepoBranch', "{0}@{1}", repository, branch)
						: repository);
				}
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId: undefined,
					name: localize('agentHost.debug.sessionStarted', "Session Started"),
					details: parts.length ? parts.join(', ') : undefined, level: ChatDebugLogLevel.Info, category: 'session',
				});
				break;
			}
			case 'user.message': {
				const content = asString(record.data.content) ?? '';
				const transformed = asString(record.data.transformedContent);
				const sections: IChatDebugMessageSection[] = [
					{ name: localize('agentHost.debug.userRequest', "User Request"), content },
				];
				if (transformed && transformed !== content) {
					sections.push({ name: localize('agentHost.debug.fullPrompt', "Full Prompt"), content: transformed });
				}
				const message = summarize(content);
				currentUserMessageByAgent.set(agentKey, record.id);
				currentAssistantMessageByAgent.delete(agentKey); // a new user turn starts fresh
				events.push({ kind: 'userMessage', id: record.id, sessionResource, created, parentEventId: rootEventId, message, sections });
				resolved.set(record.id, { kind: 'message', type: 'user', message, sections });
				break;
			}
			case 'assistant.message': {
				const model = asString(record.data.model);
				const outputTokens = asNumber(record.data.outputTokens);
				const content = asString(record.data.content) ?? '';
				const reasoning = asString(record.data.reasoningText);
				// A sub-agent turn nests under its spawning tool call; a normal turn
				// nests under the user message it answers.
				const parentToolCallId = asString(record.data.parentToolCallId);
				const spawningTool = parentToolCallId ? toolEventByToolCallId.get(parentToolCallId) : undefined;
				const parentEventId = spawningTool ?? currentUserMessageByAgent.get(agentKey) ?? rootEventId;
				// The turn's wall-clock duration is the gap from its `assistant.turn_start`.
				const turnId = asString(record.data.turnId);
				const turnStart = turnId ? turnStartByTurnId.get(turnId) : undefined;
				const durationInMillis = turnStart ? diffMillis(turnStart.timestamp, record.timestamp) : undefined;

				currentAssistantMessageByAgent.set(agentKey, record.id);
				modelTurnRefs.push({ index: events.length, id: record.id, turnId, outputTokens });
				events.push({
					kind: 'modelTurn', id: record.id, sessionResource, created, parentEventId,
					model, requestName: 'copilotcli', outputTokens, durationInMillis,
				});

				const sections: IChatDebugMessageSection[] = [];
				if (content) {
					sections.push({ name: localize('agentHost.debug.response', "Response"), content });
				}
				if (reasoning) {
					sections.push({ name: localize('agentHost.debug.reasoning', "Reasoning"), content: reasoning });
				}
				resolved.set(record.id, { kind: 'modelTurn', requestName: 'copilotcli', model, outputTokens, durationInMillis, sections });
				break;
			}
			case 'tool.execution_start': {
				const toolName = asString(record.data.toolName) ?? 'tool';
				const toolCallId = asString(record.data.toolCallId);
				const complete = toolCallId ? completeByToolCallId.get(toolCallId) : undefined;
				const success = complete ? asBoolean(complete.data.success) : undefined;
				const result = success === undefined ? undefined : (success ? 'success' : 'error');
				const durationInMillis = complete ? diffMillis(record.timestamp, complete.timestamp) : undefined;
				const fullInput = stringifyPayload(record.data.arguments);
				const fullOutput = complete ? stringifyPayload(complete.data.result) : undefined;
				// A nested / sub-agent tool nests under its parent tool call; a
				// top-level tool nests under the assistant message that requested it.
				const parentToolCallId = asString(record.data.parentToolCallId);
				const parentTool = parentToolCallId ? toolEventByToolCallId.get(parentToolCallId) : undefined;
				const parentEventId = parentTool ?? currentAssistantMessageByAgent.get(agentKey) ?? currentUserMessageByAgent.get(agentKey) ?? rootEventId;
				if (toolCallId) {
					toolEventByToolCallId.set(toolCallId, record.id);
				}

				events.push({
					kind: 'toolCall', id: record.id, sessionResource, created, parentEventId,
					toolName, toolCallId, result, durationInMillis,
					input: truncate(fullInput, MAX_EVENT_PAYLOAD),
					output: truncate(fullOutput, MAX_EVENT_PAYLOAD),
				});
				resolved.set(record.id, {
					kind: 'toolCall', toolName, result, durationInMillis,
					input: truncate(fullInput, MAX_DETAIL_PAYLOAD),
					output: truncate(fullOutput, MAX_DETAIL_PAYLOAD),
				});
				break;
			}
			// `tool.execution_complete` is folded into its start record above.
			case 'session.error': {
				const message = asString(record.data.message) ?? localize('agentHost.debug.unknownError', "Unknown error");
				const errorType = asString(record.data.errorType);
				const stack = asString(record.data.stack);
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId: turnParent,
					name: errorType
						? localize('agentHost.debug.sessionErrorTyped', "Error ({0})", errorType)
						: localize('agentHost.debug.sessionError', "Error"),
					details: truncate(message, MAX_EVENT_PAYLOAD),
					level: ChatDebugLogLevel.Error, category: 'session',
				});
				const detailText = stack ? `${message}\n\n${stack}` : message;
				resolved.set(record.id, { kind: 'text', value: truncate(detailText, MAX_DETAIL_PAYLOAD) ?? detailText });
				break;
			}
			case 'session.warning': {
				const message = asString(record.data.message) ?? '';
				const warningType = asString(record.data.warningType);
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId: turnParent,
					name: warningType
						? localize('agentHost.debug.sessionWarningTyped', "Warning ({0})", warningType)
						: localize('agentHost.debug.sessionWarning', "Warning"),
					details: truncate(message, MAX_EVENT_PAYLOAD),
					level: ChatDebugLogLevel.Warning, category: 'session',
				});
				if (message) {
					resolved.set(record.id, { kind: 'text', value: truncate(message, MAX_DETAIL_PAYLOAD) ?? message });
				}
				break;
			}
			case 'session.model_change': {
				const previousModel = asString(record.data.previousModel);
				const newModel = asString(record.data.newModel);
				const effort = asString(record.data.reasoningEffort);
				const change = previousModel && newModel
					? localize('agentHost.debug.modelChangeFromTo', "{0} → {1}", previousModel, newModel)
					: newModel;
				const details = change && effort
					? localize('agentHost.debug.modelChangeEffort', "{0} (reasoningEffort={1})", change, effort)
					: change;
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId: turnParent,
					name: localize('agentHost.debug.modelChanged', "Model Changed"),
					details, level: ChatDebugLogLevel.Info, category: 'session',
				});
				break;
			}
			case 'hook.start': {
				const hookType = asString(record.data.hookType) ?? 'hook';
				const invocationId = asString(record.data.hookInvocationId);
				const end = invocationId ? hookEndByInvocationId.get(invocationId) : undefined;
				const success = end ? asBoolean(end.data.success) : undefined;
				const isError = hookType === 'errorOccurred';
				// The CLI emits `preToolUse` / `postToolUse` lifecycle hooks on every
				// tool call regardless of user configuration. Only surface them when the
				// user actually configured a hook (so the view can confirm it ran); hide
				// the pure internal-dispatch noise otherwise.
				if ((hookType === 'preToolUse' || hookType === 'postToolUse') && !hasConfiguredHooks) {
					break;
				}
				// A `preToolUse` hook fires *before* the `assistant.message` of the
				// turn whose tool it precedes is finalized, so `turnParent` still
				// points at the PREVIOUS model turn. Nesting it there is misleading —
				// it belongs to the upcoming turn — so surface it at the
				// turn-container (user message) level, as a sibling of the model
				// turns rather than a child of the prior one.
				const hookParent = hookType === 'preToolUse'
					? (currentUserMessageByAgent.get(agentKey) ?? rootEventId)
					: turnParent;
				// Error notifications (`errorOccurred`) and failed hooks are surfaced
				// prominently below. Routine lifecycle hooks (sessionStart / sessionEnd
				// / userPromptSubmitted / …) are surfaced as low-key informational
				// customization events so users can still see which hooks fired.
				if (!isError && success !== false) {
					events.push({
						kind: 'generic', id: record.id, sessionResource, created, parentEventId: hookParent,
						name: localize('agentHost.debug.hookRan', "Hook: {0}", hookType),
						level: ChatDebugLogLevel.Info, category: 'hook',
					});
					const routineInput = stringifyPayload(record.data.input);
					resolved.set(record.id, {
						kind: 'hook', hookType,
						result: success === undefined ? undefined : (success ? ChatDebugHookResult.Success : ChatDebugHookResult.Error),
						input: truncate(routineInput, MAX_DETAIL_PAYLOAD),
					});
					break;
				}
				const input = asRecord(record.data.input);
				const errorContext = asString(input?.errorContext);
				const recoverable = asBoolean(input?.recoverable);
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId: hookParent,
					name: isError
						? (errorContext
							? localize('agentHost.debug.hookErrorContext', "Error During {0}", errorContext)
							: localize('agentHost.debug.hookError', "Error Occurred"))
						: localize('agentHost.debug.hookFailed', "Hook Failed: {0}", hookType),
					details: isError && recoverable !== undefined
						? (recoverable
							? localize('agentHost.debug.hookRecoverable', "Recoverable; retrying")
							: localize('agentHost.debug.hookUnrecoverable', "Unrecoverable"))
						: undefined,
					level: isError
						? (recoverable === false ? ChatDebugLogLevel.Error : ChatDebugLogLevel.Warning)
						: ChatDebugLogLevel.Error,
					category: 'hook',
				});
				const inputText = stringifyPayload(record.data.input);
				// On failure the `hook.end` record carries the only distinguishing trace
				// of the user's hook: `output` (per-tool denial messages) and `error`
				// ({ message, source }, where `source` is the hook config file). The CLI
				// never records the hook command text or its stdout, so this is the most
				// we can surface about which hook acted and why.
				const endError = asRecord(end?.data.error);
				const errorParts = endError
					? [asString(endError.message), asString(endError.source)].filter((s): s is string => !!s)
					: [];
				const outputText = end && end.data.output !== undefined ? stringifyPayload(end.data.output) : undefined;
				resolved.set(record.id, {
					kind: 'hook', hookType,
					result: success === undefined ? undefined : (success ? ChatDebugHookResult.Success : ChatDebugHookResult.Error),
					input: truncate(inputText, MAX_DETAIL_PAYLOAD),
					output: outputText ? truncate(outputText, MAX_DETAIL_PAYLOAD) : undefined,
					errorMessage: errorParts.length > 0 ? truncate(errorParts.join('\n'), MAX_DETAIL_PAYLOAD) : undefined,
				});
				break;
			}
			// `hook.end` is folded into its `hook.start` above.
			case 'permission.requested': {
				const requestId = asString(record.data.requestId);
				const permissionRequest = asRecord(record.data.permissionRequest);
				const kind = asString(permissionRequest?.kind) ?? 'permission';
				const intention = asString(permissionRequest?.intention);
				const toolCallId = asString(permissionRequest?.toolCallId);
				const completed = requestId ? permissionCompleteByRequestId.get(requestId) : undefined;
				const resultKind = completed ? asString(asRecord(completed.data.result)?.kind) : undefined;
				// A routine approval is happy-path noise (the tool call is already
				// shown); only surface denials and still-pending requests, which
				// explain why a tool was blocked or a session appears stalled.
				if (resultKind === 'approved') {
					break;
				}
				const parentEventId = (toolCallId ? toolEventByToolCallId.get(toolCallId) : undefined) ?? turnParent;
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId,
					name: resultKind
						? localize('agentHost.debug.permissionResolved', "Permission {0}: {1}", resultKind, kind)
						: localize('agentHost.debug.permissionPending', "Awaiting Permission: {0}", kind),
					details: intention,
					level: ChatDebugLogLevel.Warning, category: 'permission',
				});
				const path = asString(permissionRequest?.path);
				const lines = [
					localize('agentHost.debug.permissionKind', "kind: {0}", kind),
					intention ? localize('agentHost.debug.permissionIntention', "intention: {0}", intention) : undefined,
					path ? localize('agentHost.debug.permissionPath', "path: {0}", path) : undefined,
					localize('agentHost.debug.permissionResult', "result: {0}", resultKind ?? localize('agentHost.debug.permissionPendingValue', "pending")),
				].filter((l): l is string => !!l);
				resolved.set(record.id, { kind: 'text', value: lines.join('\n') });
				break;
			}
			// `permission.completed` is folded into its `permission.requested` above.
			case 'subagent.started': {
				const toolCallId = asString(record.data.toolCallId);
				const agentName = asString(record.data.agentDisplayName) ?? asString(record.data.agentName) ?? 'subagent';
				const description = asString(record.data.agentDescription);
				const model = asString(record.data.model);
				const complete = toolCallId ? subagentCompleteByToolCallId.get(toolCallId) : undefined;
				const toolCallCount = complete ? asNumber(complete.data.totalToolCalls) : undefined;
				const totalTokens = complete ? asNumber(complete.data.totalTokens) : undefined;
				const durationInMillis = complete ? asNumber(complete.data.durationMs) : undefined;
				// The sub-agent nests under the tool call that spawned it.
				const parentEventId = (toolCallId ? toolEventByToolCallId.get(toolCallId) : undefined) ?? turnParent;
				events.push({
					kind: 'subagentInvocation', id: record.id, sessionResource, created, parentEventId,
					agentName, description, status: complete ? 'completed' : 'running', toolCallCount, durationInMillis,
				});
				const lines = [
					localize('agentHost.debug.subagentName', "agent: {0}", agentName),
					model ? localize('agentHost.debug.subagentModel', "model: {0}", model) : undefined,
					toolCallCount !== undefined ? localize('agentHost.debug.subagentToolCalls', "tool calls: {0}", toolCallCount) : undefined,
					totalTokens !== undefined ? localize('agentHost.debug.subagentTokens', "tokens: {0}", totalTokens) : undefined,
					description ? `\n${description}` : undefined,
				].filter((l): l is string => !!l);
				resolved.set(record.id, { kind: 'text', value: lines.join('\n') });
				break;
			}
			// `subagent.completed` is folded into its `subagent.started` above.
			case 'session.compaction_start': {
				const systemTokens = asNumber(record.data.systemTokens) ?? 0;
				const conversationTokens = asNumber(record.data.conversationTokens) ?? 0;
				const toolTokens = asNumber(record.data.toolDefinitionsTokens) ?? 0;
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId: turnParent,
					name: localize('agentHost.debug.compaction', "Context Compaction"),
					details: localize('agentHost.debug.compactionTokens', "system={0}, conversation={1}, tools={2} tokens", systemTokens, conversationTokens, toolTokens),
					level: ChatDebugLogLevel.Info, category: 'session',
				});
				break;
			}
			case 'session.compaction_complete': {
				// A successful compaction is implied by its start row; only the
				// failure case is diagnostically interesting.
				if (asBoolean(record.data.success) !== false) {
					break;
				}
				const error = asString(record.data.error);
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId: turnParent,
					name: localize('agentHost.debug.compactionFailed', "Context Compaction Failed"),
					details: truncate(error, MAX_EVENT_PAYLOAD),
					level: ChatDebugLogLevel.Error, category: 'session',
				});
				if (error) {
					resolved.set(record.id, { kind: 'text', value: truncate(error, MAX_DETAIL_PAYLOAD) ?? error });
				}
				break;
			}
			case 'abort': {
				const reason = asString(record.data.reason);
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId: turnParent,
					name: localize('agentHost.debug.aborted', "Aborted"),
					details: reason, level: ChatDebugLogLevel.Warning, category: 'session',
				});
				break;
			}
			case 'skill.invoked': {
				const name = asString(record.data.name) ?? 'skill';
				const trigger = asString(record.data.trigger);
				const source = asString(record.data.pluginName) ?? asString(record.data.source);
				const content = asString(record.data.content);
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId: turnParent,
					name: localize('agentHost.debug.skillInvoked', "Skill Invoked: {0}", name),
					details: [trigger, source].filter(Boolean).join(' \u00b7 ') || undefined,
					level: ChatDebugLogLevel.Info, category: 'customization',
				});
				if (content) {
					resolved.set(record.id, { kind: 'text', value: truncate(content, MAX_DETAIL_PAYLOAD) ?? content });
				}
				break;
			}
			// `assistant.turn_start` seeds turn durations (pre-pass); its
			// `assistant.turn_end` and `system.message` siblings are not surfaced
			// in this slice.
		}
	}

	// Usage back-fill. `events.jsonl` records only `outputTokens` per turn;
	// input/cache-read tokens and Copilot AIU come from elsewhere:
	//   1. The client-local usage sidecar (preferred): exact per-request tokens
	//      captured live from ChatUsage actions, mapped per round — restart-safe
	//      and accurate for the Cache Explorer.
	//   2. Else the `session.shutdown` summary (exact totals, spread evenly).
	//   3. Else the live AHP state (AIU only) for in-progress sessions.
	// The per-turn split in (2) is an even approximation but the column sums are
	// exact; totals that aren't known (e.g. input/cache on a live session) are
	// left blank.

	// Distributes cumulative `totals` evenly across the given turns.
	const fillTurnsWithTotals = (targets: readonly IModelTurnRef[], totals: ISessionUsageTotals) => {
		const n = targets.length;
		if (n === 0) {
			return;
		}
		const inputs = totals.inputTokens !== undefined ? distributeEvenly(totals.inputTokens, n) : undefined;
		const cached = totals.cacheReadTokens !== undefined ? distributeEvenly(totals.cacheReadTokens, n) : undefined;
		const aiu = distributeEvenly(totals.totalNanoAiu, n);
		for (let i = 0; i < n; i++) {
			const ref = targets[i];
			const turn = events[ref.index] as IChatDebugModelTurnEvent;
			const inputTokens = inputs?.[i];
			const cachedTokens = cached?.[i];
			const totalTokens = inputTokens !== undefined ? inputTokens + (ref.outputTokens ?? 0) : undefined;
			const copilotUsageNanoAiu = aiu[i] > 0 ? aiu[i] : undefined;
			events[ref.index] = { ...turn, inputTokens, cachedTokens, totalTokens, copilotUsageNanoAiu };
			const detail = resolved.get(ref.id);
			if (detail?.kind === 'modelTurn') {
				resolved.set(ref.id, { ...detail, inputTokens, cachedTokens, totalTokens });
			}
		}
	};

	if (usageRecords && usageRecords.length > 0 && modelTurnRefs.length > 0) {
		const coverage = applyPerTurnUsage(events, resolved, modelTurnRefs, usageRecords);
		// The sidecar may only cover a prefix of the session's turns (logging
		// enabled mid-session, or a dropped append). Reconcile the remaining
		// turns from the authoritative shutdown/live totals so the Overview
		// aggregates aren't undercounted, keeping the exact per-round values we
		// did capture.
		const uncovered = modelTurnRefs.filter((_ref, i) => !coverage.covered.has(i));
		if (uncovered.length > 0) {
			const totals = extractSessionUsageTotals(records) ?? fallbackUsageTotals;
			if (totals) {
				fillTurnsWithTotals(uncovered, {
					inputTokens: totals.inputTokens !== undefined ? Math.max(0, totals.inputTokens - coverage.assignedInput) : undefined,
					cacheReadTokens: totals.cacheReadTokens !== undefined ? Math.max(0, totals.cacheReadTokens - coverage.assignedCache) : undefined,
					totalNanoAiu: Math.max(0, totals.totalNanoAiu - coverage.assignedAiu),
				});
			}
		}
	} else if (modelTurnRefs.length > 0) {
		const totals = extractSessionUsageTotals(records) ?? fallbackUsageTotals;
		if (totals) {
			fillTurnsWithTotals(modelTurnRefs, totals);
		}
	}

	// Surface the session's loaded customizations (skills / hooks / agents / MCP
	// servers / rules) as discovery events plus a summary, mirroring the local
	// `PromptsDebugContribution`. Sourced from live session state (the SDK's
	// `session.*_loaded` events are ephemeral and absent from events.jsonl).
	if (customizations && customizations.length > 0) {
		const created = rootCreated ?? (records.length > 0 ? new Date(records[0].timestamp) : new Date());
		const { events: customEvents, resolved: customResolved } = buildCustomizationDebugEvents(customizations, sessionResource, rootEventId, created);
		events.push(...customEvents);
		for (const [id, detail] of customResolved) {
			resolved.set(id, detail);
		}
	}

	return { events, resolved };
}

/** Order in which loaded customization types are surfaced as discovery events. */
const CUSTOMIZATION_TYPE_ORDER: readonly CustomizationType[] = [
	CustomizationType.Skill, CustomizationType.Hook, CustomizationType.Agent,
	CustomizationType.McpServer, CustomizationType.Rule, CustomizationType.Prompt,
];

/** A leaf customization flattened out of its container, with its context. */
interface IFlatCustomization {
	readonly type: CustomizationType;
	readonly name: string;
	readonly uri: string;
	readonly enabled: boolean;
	readonly description?: string;
}

/**
 * Flattens the session's customization tree into its leaf children (skills,
 * hooks, agents, MCP servers, rules, prompts). Container entries
 * ({@link CustomizationType.Plugin} / {@link CustomizationType.Directory}) are
 * descended into; a top-level {@link CustomizationType.McpServer} is kept as-is.
 */
function flattenCustomizations(customizations: readonly Customization[]): IFlatCustomization[] {
	const out: IFlatCustomization[] = [];
	const visit = (c: Customization | ChildCustomization): void => {
		if (c.type === CustomizationType.Plugin || c.type === CustomizationType.Directory) {
			for (const child of c.children ?? []) {
				visit(child);
			}
			return;
		}
		out.push({
			type: c.type,
			name: c.name,
			uri: c.uri,
			enabled: (c as { enabled?: boolean }).enabled !== false,
			description: (c as { description?: string }).description,
		});
	};
	for (const c of customizations) {
		visit(c);
	}
	return out;
}

/** Human-readable name for a per-type customization discovery event. */
function customizationDiscoveryName(type: CustomizationType): string {
	switch (type) {
		case CustomizationType.Skill: return localize('agentHost.debug.skillDiscovery', "Skill Discovery");
		case CustomizationType.Hook: return localize('agentHost.debug.hookDiscovery', "Hook Discovery");
		case CustomizationType.Agent: return localize('agentHost.debug.agentDiscovery', "Agent Discovery");
		case CustomizationType.McpServer: return localize('agentHost.debug.mcpDiscovery', "MCP Server Discovery");
		case CustomizationType.Rule: return localize('agentHost.debug.ruleDiscovery', "Instructions Discovery");
		case CustomizationType.Prompt: return localize('agentHost.debug.promptDiscovery', "Prompt Discovery");
		default: return localize('agentHost.debug.customizationDiscovery', "Customization Discovery");
	}
}

/** Maps a flattened customization to a summary-log category, if it has one. */
function customizationSummaryCategory(c: IFlatCustomization): IChatDebugCustomizationLogEntry['category'] | undefined {
	if (!c.enabled) {
		return 'skipped';
	}
	switch (c.type) {
		case CustomizationType.Skill: return 'skill';
		case CustomizationType.Agent: return 'custom-agent';
		case CustomizationType.Hook: return 'hook';
		case CustomizationType.Rule: return 'applying';
		default: return undefined; // Prompt / MCP have no summary category
	}
}

/**
 * Builds the customization discovery + summary debug events for a session from
 * its loaded {@link Customization}s. Ids are deterministic (per session + type)
 * so repeated live refreshes replace rather than duplicate them.
 */
export function buildCustomizationDebugEvents(
	customizations: readonly Customization[],
	sessionResource: URI,
	parentEventId: string | undefined,
	created: Date,
): { readonly events: IChatDebugEvent[]; readonly resolved: Map<string, IChatDebugResolvedEventContent> } {
	const events: IChatDebugEvent[] = [];
	const resolved = new Map<string, IChatDebugResolvedEventContent>();
	const flat = flattenCustomizations(customizations);
	if (flat.length === 0) {
		return { events, resolved };
	}

	const byType = new Map<CustomizationType, IFlatCustomization[]>();
	for (const c of flat) {
		const list = byType.get(c.type);
		if (list) {
			list.push(c);
		} else {
			byType.set(c.type, [c]);
		}
	}

	const key = sessionResource.toString();

	// Per-type discovery events, each expandable to its file list.
	for (const type of CUSTOMIZATION_TYPE_ORDER) {
		const list = byType.get(type);
		if (!list || list.length === 0) {
			continue;
		}
		const id = `agentHostCustomization:${key}:${type}`;
		const loadedCount = list.filter(c => c.enabled).length;
		const skippedCount = list.length - loadedCount;
		events.push({
			kind: 'generic', id, sessionResource, created, parentEventId,
			name: customizationDiscoveryName(type),
			details: skippedCount > 0
				? localize('agentHost.debug.customizationLoadedSkipped', "{0} loaded, {1} disabled", loadedCount, skippedCount)
				: localize('agentHost.debug.customizationLoaded', "{0} loaded", loadedCount),
			level: ChatDebugLogLevel.Info, category: 'discovery',
		});
		const files: IChatDebugFileEntry[] = list.map(c => ({
			uri: URI.parse(c.uri),
			name: c.name,
			status: c.enabled ? 'loaded' : 'skipped',
			skipReason: c.enabled ? undefined : localize('agentHost.debug.customizationDisabled', "disabled"),
		}));
		resolved.set(id, { kind: 'fileList', discoveryType: type, durationInMillis: 0, files });
	}

	// Summary event mirroring the local "Resolve Customizations".
	const logs: IChatDebugCustomizationLogEntry[] = [];
	for (const c of flat) {
		const category = customizationSummaryCategory(c);
		if (!category) {
			continue;
		}
		logs.push({ category, name: c.name, uri: URI.parse(c.uri), reason: c.description });
	}
	if (logs.length > 0) {
		const id = `agentHostCustomization:${key}:summary`;
		const counts = {
			instructions: logs.filter(e => e.category === 'applying' || e.category === 'referenced').length,
			skills: logs.filter(e => e.category === 'skill').length,
			agents: logs.filter(e => e.category === 'custom-agent').length,
			hooks: logs.filter(e => e.category === 'hook').length,
			skipped: logs.filter(e => e.category === 'skipped').length,
		};
		events.push({
			kind: 'generic', id, sessionResource, created, parentEventId,
			name: localize('agentHost.debug.customizationsResolved', "Resolve Customizations"),
			details: localize('agentHost.debug.customizationsResolvedDetails', "{0} skills, {1} agents, {2} hooks, {3} instructions", counts.skills, counts.agents, counts.hooks, counts.instructions),
			level: ChatDebugLogLevel.Info, category: 'customization',
		});
		resolved.set(id, { kind: 'customizationSummary', resolutionLogs: logs, durationInMillis: 0, counts });
	}

	return { events, resolved };
}

/** A model-turn debug event plus the context needed to back-fill its usage. */
interface IModelTurnRef {
	readonly index: number;
	readonly id: string;
	readonly turnId?: string;
	readonly outputTokens?: number;
}

/** What {@link applyPerTurnUsage} assigned, so callers can reconcile the rest. */
interface IPerTurnUsageCoverage {
	/** Positions in `modelTurnRefs` that received a sidecar usage record. */
	readonly covered: ReadonlySet<number>;
	/** Sum of input tokens assigned from the sidecar. */
	readonly assignedInput: number;
	/** Sum of cache-read tokens assigned from the sidecar. */
	readonly assignedCache: number;
	/** Sum of Copilot AIU (nano) assigned from the sidecar. */
	readonly assignedAiu: number;
}

function applyPerTurnUsage(
	events: IChatDebugEvent[],
	resolved: Map<string, IChatDebugResolvedEventContent>,
	modelTurnRefs: readonly IModelTurnRef[],
	usageRecords: readonly IAgentHostUsageRecord[],
): IPerTurnUsageCoverage {
	const assign = (ref: typeof modelTurnRefs[number], inputTokens: number | undefined, cachedTokens: number | undefined, copilotUsageNanoAiu: number | undefined) => {
		const turn = events[ref.index] as IChatDebugModelTurnEvent;
		const totalTokens = inputTokens !== undefined ? inputTokens + (ref.outputTokens ?? 0) : undefined;
		events[ref.index] = { ...turn, inputTokens, cachedTokens, totalTokens, copilotUsageNanoAiu };
		const detail = resolved.get(ref.id);
		if (detail?.kind === 'modelTurn') {
			resolved.set(ref.id, { ...detail, inputTokens, cachedTokens, totalTokens });
		}
	};

	// The sidecar and events.jsonl use DIFFERENT turn-id namespaces — the
	// sidecar keys on the backend request id (one id per user turn, shared by
	// its rounds) while events.jsonl keys on a per-turn round index that resets
	// each user turn — so they can't be correlated by id. Both streams are
	// chronological with one entry per model round, though, so correlate them
	// positionally, using the `outputTokens` both report as an alignment guard:
	// a ref whose output doesn't match the next record has no captured usage
	// (e.g. a sub-agent round, whose usage folds into the parent aggregate and
	// isn't recorded separately), so it's left blank and the record is kept for
	// the next ref.

	// Copilot AIU is cumulative per user turn (it resets each turn), so
	// attribute each turn's max only to its LAST captured round — the summed
	// per-turn total then stays exact. Turn boundaries are the runs of records
	// sharing a `turnId`.
	const aiuByRecordIndex = new Array<number | undefined>(usageRecords.length).fill(undefined);
	for (let start = 0; start < usageRecords.length;) {
		let end = start;
		while (end + 1 < usageRecords.length && usageRecords[end + 1].turnId === usageRecords[start].turnId) {
			end++;
		}
		let maxAiu = 0;
		for (let i = start; i <= end; i++) {
			maxAiu = Math.max(maxAiu, usageRecords[i].totalNanoAiu ?? 0);
		}
		if (maxAiu > 0) {
			aiuByRecordIndex[end] = maxAiu;
		}
		start = end + 1;
	}

	let recordIndex = 0;
	let assignedInput = 0;
	let assignedCache = 0;
	let assignedAiu = 0;
	const covered = new Set<number>();
	for (let refIdx = 0; refIdx < modelTurnRefs.length; refIdx++) {
		if (recordIndex >= usageRecords.length) {
			break;
		}
		const ref = modelTurnRefs[refIdx];
		const record = usageRecords[recordIndex];
		if (ref.outputTokens !== undefined && record.outputTokens !== undefined && ref.outputTokens !== record.outputTokens) {
			continue; // this ref has no captured usage record — leave it blank
		}
		const aiu = aiuByRecordIndex[recordIndex];
		assign(ref, record.inputTokens, record.cacheReadTokens, aiu);
		assignedInput += record.inputTokens ?? 0;
		assignedCache += record.cacheReadTokens ?? 0;
		assignedAiu += aiu ?? 0;
		covered.add(refIdx);
		recordIndex++;
	}
	return { covered, assignedInput, assignedCache, assignedAiu };
}

/** Session usage totals distributed across model turns. */
interface ISessionUsageTotals {
	/** Cumulative input tokens — only set when known from an exact source (`session.shutdown`). */
	readonly inputTokens?: number;
	/** Cumulative cache-read tokens — only set when known from an exact source. */
	readonly cacheReadTokens?: number;
	/** Cumulative Copilot AIU (nano). */
	readonly totalNanoAiu: number;
}

/**
 * Extracts session-cumulative usage from the last `session.shutdown` record.
 * Token totals are summed across `modelMetrics[*].usage`; AIU prefers the
 * top-level `totalNanoAiu`, falling back to the per-model sum. Returns
 * `undefined` only when there is no `session.shutdown` record (e.g. an active
 * session) — once a shutdown summary exists it is authoritative even when its
 * totals are zero, so the caller must not fall back to live usage.
 */
function extractSessionUsageTotals(records: readonly IAgentHostEventRecord[]): ISessionUsageTotals | undefined {
	let shutdown: IAgentHostEventRecord | undefined;
	for (const record of records) {
		if (record.type === 'session.shutdown') {
			shutdown = record; // keep the last one
		}
	}
	if (!shutdown) {
		return undefined;
	}

	let inputTokens = 0;
	let cacheReadTokens = 0;
	let perModelNanoAiu = 0;
	const modelMetrics = shutdown.data.modelMetrics;
	if (modelMetrics && typeof modelMetrics === 'object') {
		for (const metric of Object.values(modelMetrics as Record<string, unknown>)) {
			const entry = metric as Record<string, unknown> | undefined;
			const usage = entry?.usage as Record<string, unknown> | undefined;
			inputTokens += asNumber(usage?.inputTokens) ?? 0;
			cacheReadTokens += asNumber(usage?.cacheReadTokens) ?? 0;
			perModelNanoAiu += asNumber(entry?.totalNanoAiu) ?? 0;
		}
	}
	const totalNanoAiu = asNumber(shutdown.data.totalNanoAiu) ?? perModelNanoAiu;

	// A shutdown summary is authoritative even when its totals are zero: input /
	// cache are then known to be zero (not unknown), so returning the totals here
	// keeps the caller from falling back to live AIU for a finished session.
	return { inputTokens, cacheReadTokens, totalNanoAiu };
}

/** Splits `total` into `n` integer parts that sum exactly to `total`. */
function distributeEvenly(total: number, n: number): number[] {
	if (n <= 0) {
		return [];
	}
	const base = Math.floor(total / n);
	const parts = new Array<number>(n).fill(base);
	let remainder = total - base * n;
	for (let i = n - 1; remainder > 0; i--, remainder--) {
		parts[i] += 1;
	}
	return parts;
}

/**
 * Sums Copilot AIU across a live chat's turns (for in-progress sessions).
 *
 * Deliberately sums AIU only. The producer emits per-request input/cache and
 * the reducer overwrites each turn's `usage` with the latest request —
 * only AIU is accumulated per turn (`_turnCopilotUsageTotalNanoAiu`). So the
 * chat state holds just each turn's *last* request's input/cache; summing
 * those would under-report multi-request (tool-loop) turns. Input/cache are
 * therefore left to the exact `session.shutdown` summary, and live sessions
 * show AIU + output only until they end.
 */
function sumChatStateUsage(chat: ChatState): ISessionUsageTotals | undefined {
	let totalNanoAiu = 0;
	let hasUsage = false;
	const add = (usage: UsageInfo | undefined) => {
		if (!usage) {
			return;
		}
		hasUsage = true;
		totalNanoAiu += readCopilotNanoAiu(usage);
	};
	for (const turn of chat.turns) {
		add(turn.usage);
	}
	add(chat.activeTurn?.usage);
	return hasUsage ? { totalNanoAiu } : undefined;
}

/** Reads `_meta.copilotUsage.totalNanoAiu` (per-turn cumulative AIU) from a usage report. */
function readCopilotNanoAiu(usage: UsageInfo): number {
	return readUsageInfoMeta(usage).copilotUsage?.totalNanoAiu ?? 0;
}

/** Parses a line-delimited JSON stream, skipping blank or malformed lines. */
export function parseJsonl(text: string): IAgentHostEventRecord[] {
	const records: IAgentHostEventRecord[] = [];
	appendJsonlRecords(text, records);
	return records;
}

/**
 * Parses each complete JSONL line in `text` and appends the well-formed
 * records to `records` (used for both full and incremental tail reads).
 */
function appendJsonlRecords(text: string, records: IAgentHostEventRecord[]): void {
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		try {
			const parsed = JSON.parse(trimmed);
			// Require the full envelope so the converter can read `record.*` and
			// `record.data.*` without guarding every access — including a string
			// `timestamp` (else `new Date(...)` yields `Invalid Date`), a
			// `string | null` `parentId`, and a non-array `data` object. A line
			// missing any of these is treated as malformed and skipped rather than
			// throwing downstream (which would drop the whole session's debug log).
			if (parsed && typeof parsed.type === 'string' && typeof parsed.id === 'string'
				&& typeof parsed.timestamp === 'string'
				&& (parsed.parentId === null || typeof parsed.parentId === 'string')
				&& parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
				records.push(parsed as IAgentHostEventRecord);
			}
		} catch {
			// Ignore partial trailing lines (common when reading a bounded head).
		}
	}
}

/** Byte index of the last `\n` in `buffer`, or -1 if none (safe UTF-8 split point). */
function lastIndexOfNewline(buffer: VSBuffer): number {
	const bytes = buffer.buffer;
	for (let i = bytes.length - 1; i >= 0; i--) {
		if (bytes[i] === 0x0A /* \n */) {
			return i;
		}
	}
	return -1;
}

/**
 * Deterministic localized fallback title for a discovered session that has no
 * `user.message` in the scanned head, so the home list shows something
 * meaningful instead of the generic "New Chat" fallback. Uses a short prefix of
 * the session id.
 */
function fallbackSessionTitle(sessionId: string): string {
	return localize('agentHost.debug.untitledSession', "Copilot CLI Session {0}", sessionId.slice(0, 8));
}

/** Derives a session title from the first user message in an events stream. */
function extractSessionTitle(text: string): string | undefined {
	for (const record of parseJsonl(text)) {
		if (record.type === 'user.message') {
			const content = asString(record.data.content);
			if (content) {
				return summarize(content);
			}
		}
	}
	return undefined;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function diffMillis(start: string, end: string): number | undefined {
	const a = new Date(start).getTime();
	const b = new Date(end).getTime();
	return isFinite(a) && isFinite(b) && b >= a ? b - a : undefined;
}

function stringifyPayload(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value === 'string') {
		return value;
	}
	try {
		return JSON.stringify(value, undefined, 2);
	} catch {
		return undefined;
	}
}

function truncate(value: string | undefined, max: number): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return value.length > max ? value.slice(0, max) + '…' : value;
}

/** First non-empty line of a message, trimmed to a short single-line summary. */
function summarize(content: string): string {
	const firstLine = content.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? '';
	return firstLine.length > 100 ? firstLine.slice(0, 100) + '…' : firstLine;
}

function toErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

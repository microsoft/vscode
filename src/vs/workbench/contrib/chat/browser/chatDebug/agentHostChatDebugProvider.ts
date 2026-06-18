/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { buildDefaultChatUri, StateComponents, type ChatState, type UsageInfo } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugLogProvider, IChatDebugMessageSection, IChatDebugModelTurnEvent, IChatDebugResolvedEventContent, IChatDebugService } from '../../common/chatDebugService.js';
import { AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING } from '../../common/promptSyntax/promptTypes.js';
import { COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId, resolveEventsUri } from '../copilotCliEventsUri.js';

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

	/** Watches the currently-viewed session's events.jsonl for live refresh. */
	private readonly _liveRefresh = this._register(new MutableDisposable<DisposableStore>());
	private _watchedSessionKey: string | undefined;

	constructor(
		@IChatDebugService private readonly _chatDebugService: IChatDebugService,
		@IFileService private readonly _fileService: IFileService,
		@IPathService private readonly _pathService: IPathService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const provider: IChatDebugLogProvider = {
			provideChatDebugLog: (sessionResource, token) => this._provideChatDebugLog(sessionResource, token),
			resolveChatDebugLogEvent: async eventId => this._resolved.get(eventId),
		};
		this._register(this._chatDebugService.registerProvider(provider));

		// Stop the live file watcher when the session it follows is closed
		// (e.g. navigating Home or closing the debug editor), so we don't keep
		// re-reading and re-invoking providers for a session no longer shown.
		this._register(this._chatDebugService.onDidEndSession(sessionResource => {
			if (sessionResource.toString() === this._watchedSessionKey) {
				this._liveRefresh.clear();
				this._watchedSessionKey = undefined;
			}
		}));

		// Discover historical local sessions so they appear in the home list.
		// Gated on the same setting that gates the panel; re-run when that
		// setting is toggled on (e.g. via the panel's "Enable in Settings"
		// button) so sessions appear without a window reload.
		this._maybeDiscoverLocalSessions();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING)) {
				this._maybeDiscoverLocalSessions();
			}
		}));
	}

	/**
	 * Runs {@link _discoverLocalSessions} when file logging is enabled,
	 * guarding against overlapping scans. Safe to call repeatedly:
	 * {@link IChatDebugService.addAvailableSessionResources} dedupes by URI.
	 */
	private async _maybeDiscoverLocalSessions(): Promise<void> {
		if (this._discovering || !this._configurationService.getValue<boolean>(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING)) {
			return;
		}
		this._discovering = true;
		try {
			await this._discoverLocalSessions();
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
		const scheduler = store.add(new RunOnceScheduler(() => this._chatDebugService.invokeProviders(sessionResource), 400));
		const watcher = store.add(this._fileService.createWatcher(eventsUri, { recursive: false, excludes: [] }));
		store.add(watcher.onDidChange(e => {
			if (e.affects(eventsUri)) {
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

	private async _provideChatDebugLog(sessionResource: URI, token: CancellationToken): Promise<IChatDebugEvent[] | undefined> {
		const eventsUri = this._resolveEventsUri(sessionResource);
		if (!eventsUri) {
			return undefined; // not an Agent Host Copilot CLI session
		}

		let text: string;
		try {
			const content = await this._fileService.readFile(eventsUri);
			text = content.value.toString();
		} catch {
			return undefined; // session has no events.jsonl yet
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		// Keep the panel live: watch this session's events.jsonl and re-invoke
		// providers on change. A full re-read handles new turns, tool
		// start→complete transitions, and the session.shutdown usage summary.
		this._ensureLiveRefresh(sessionResource, eventsUri);

		// For in-progress sessions (no session.shutdown yet), fall back to live
		// Copilot AIU from the AHP session state so the usage tile isn't blank.
		// (Input/cache stay blank until the session ends — see F1.)
		const liveUsageTotals = this._getLiveUsageTotals(sessionResource);
		const { events, resolved } = convertAgentHostEventsToDebugEvents(parseJsonl(text), sessionResource, liveUsageTotals);

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

	private async _discoverLocalSessions(): Promise<void> {
		const userHome = this._pathService.userHome({ preferLocal: true });
		const sessionStateDir = joinPath(userHome, '.copilot', 'session-state');

		let stat;
		try {
			stat = await this._fileService.resolve(sessionStateDir, { resolveMetadata: true });
		} catch {
			return; // no local Copilot CLI sessions on disk
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

		const sessions = found.filter((s): s is NonNullable<typeof s> => s !== undefined);
		if (sessions.length > 0) {
			this._chatDebugService.addAvailableSessionResources(sessions);
		}
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
): { readonly events: IChatDebugEvent[]; readonly resolved: Map<string, IChatDebugResolvedEventContent> } {
	// Pre-pass: index `tool.execution_complete` records by `toolCallId` (so a
	// start can be merged with its completion) and `assistant.turn_start` records
	// by `turnId` (so a turn's wall-clock duration can be measured).
	const completeByToolCallId = new Map<string, IAgentHostEventRecord>();
	const turnStartByTurnId = new Map<string, IAgentHostEventRecord>();
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
		}
	}

	const events: IChatDebugEvent[] = [];
	const resolved = new Map<string, IChatDebugResolvedEventContent>();
	// Positions of emitted model-turn events, so session-cumulative usage from
	// `session.shutdown` can be back-filled onto them (see below).
	const modelTurnRefs: { readonly index: number; readonly id: string; readonly outputTokens?: number }[] = [];

	// Logical-tree context. The "current message" pointers are tracked per agent
	// (keyed by `agentId`, `''` for the main agent) so a sub-agent turn never
	// re-parents a main-agent tool call, and vice versa.
	let rootEventId: string | undefined;
	const currentUserMessageByAgent = new Map<string, string>();
	const currentAssistantMessageByAgent = new Map<string, string>();
	// Maps a `toolCallId` to the id of its emitted tool-call event, so a nested
	// tool's `parentToolCallId` can be resolved to a surfaced parent.
	const toolEventByToolCallId = new Map<string, string>();

	for (const record of records) {
		const created = new Date(record.timestamp);
		const agentKey = record.agentId ?? '';

		switch (record.type) {
			case 'session.start': {
				rootEventId = record.id;
				const model = asString(record.data.selectedModel);
				const effort = asString(record.data.reasoningEffort);
				const details = model
					? (effort
						? localize('agentHost.debug.sessionStartedDetails', "model={0}, reasoningEffort={1}", model, effort)
						: localize('agentHost.debug.sessionStartedModel', "model={0}", model))
					: undefined;
				events.push({
					kind: 'generic', id: record.id, sessionResource, created, parentEventId: undefined,
					name: localize('agentHost.debug.sessionStarted', "Session Started"),
					details, level: ChatDebugLogLevel.Info, category: 'session',
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
				modelTurnRefs.push({ index: events.length, id: record.id, outputTokens });
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
			// `assistant.turn_start` seeds turn durations (pre-pass); its
			// `assistant.turn_end`, `hook.*`, `permission.*`, and `system.message`
			// siblings are not surfaced in this slice.
		}
	}

	// `events.jsonl` records only `outputTokens` per turn. Cumulative input /
	// cache-read tokens and Copilot AIU come from the `session.shutdown` summary
	// (exact), or — for in-progress sessions — the live AHP state, which can
	// only supply AIU reliably (see `sumChatStateUsage`). Spread the known
	// totals across the model-turn events so the panel's Summary tiles (which
	// sum over model turns) report them; the per-turn split is an even
	// approximation but the column sums are exact. Totals that aren't known
	// (e.g. input/cache on a live session) are left blank.
	const totals = extractSessionUsageTotals(records) ?? fallbackUsageTotals;
	if (totals && modelTurnRefs.length > 0) {
		const n = modelTurnRefs.length;
		const inputs = totals.inputTokens !== undefined ? distributeEvenly(totals.inputTokens, n) : undefined;
		const cached = totals.cacheReadTokens !== undefined ? distributeEvenly(totals.cacheReadTokens, n) : undefined;
		const aiu = distributeEvenly(totals.totalNanoAiu, n);
		for (let i = 0; i < n; i++) {
			const ref = modelTurnRefs[i];
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
	}

	return { events, resolved };
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
	const meta = usage._meta;
	if (!meta || typeof meta !== 'object') {
		return 0;
	}
	const copilotUsage = (meta as Record<string, unknown>).copilotUsage;
	if (!copilotUsage || typeof copilotUsage !== 'object') {
		return 0;
	}
	const nano = (copilotUsage as Record<string, unknown>).totalNanoAiu;
	return typeof nano === 'number' ? nano : 0;
}

/** Parses a line-delimited JSON stream, skipping blank or malformed lines. */
export function parseJsonl(text: string): IAgentHostEventRecord[] {
	const records: IAgentHostEventRecord[] = [];
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
	return records;
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

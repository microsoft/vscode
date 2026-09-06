/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Serves a cloud sandbox session's conversation from Mission Control's persisted AHP frames when
// its sandbox can no longer be reached, rendering them through the same `turnsToHistory` adapter
// the live handler uses.

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agent.js';
import { ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IReplayedTaskHistory } from '../../../../../platform/agentHost/common/taskEventReplay.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { activeTurnToProgress, messageToRequestOrigin, messageToVariableData, turnsToHistory } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';

const LOG_PREFIX = '[CloudSandboxReadOnly]';

export interface ICloudSandboxReadOnlyConfig {
	/** Mission Control task owning the session, which is what persisted history is addressed by. */
	readonly taskId: string;
	/** Chat participant id. Matches the live handler, where `agentId === sessionType`. */
	readonly agentId: string;
	/** Sanitized agent-host authority used to rewrite resource URIs in history. */
	readonly connectionAuthority: string;
	/**
	 * History already in flight, so the first open does not repeat a fetch running alongside the
	 * connect. Consumed once; later opens read afresh so a stale prefetch cannot pin the transcript.
	 */
	readonly prefetchedHistory?: Promise<IReplayedTaskHistory | undefined>;
}

/** A resolved chat session backed entirely by replayed history. */
class ReadOnlyChatSession extends Disposable implements IChatSession {
	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose: Event<void> = this._onWillDispose.event;

	constructor(
		readonly sessionResource: URI,
		readonly history: readonly IChatSessionHistoryItem[],
		readonly title: string | undefined,
		readonly isReadOnly: IObservable<boolean>,
	) {
		super();
	}

	override dispose(): void {
		this._onWillDispose.fire();
		super.dispose();
	}
}

/**
 * Content provider for cloud sandbox sessions whose environment is gone.
 *
 * Registered only after a connect attempt has failed terminally, and disposed as soon as a real
 * connection is established, so it never shadows the live handler.
 */
export class CloudSandboxReadOnlySessionHandler extends Disposable implements IChatSessionContentProvider {

	/** Cleared on first use, so only the opening read benefits from work already in flight. */
	private _prefetchedHistory: Promise<IReplayedTaskHistory | undefined> | undefined;

	/**
	 * Starts `false`: an environment that goes on to wake must not have been shown as read-only.
	 * Observable so an already-rendered session can be settled in place by {@link markReadOnly}.
	 */
	private readonly _isReadOnly = observableValue<boolean>('cloudSandboxReadOnly', false);

	constructor(
		private readonly _config: ICloudSandboxReadOnlyConfig,
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._prefetchedHistory = _config.prefetchedHistory;
	}

	/** Settle as read-only once the connect has failed; open sessions disable their composer. */
	markReadOnly(): void {
		this._isReadOnly.set(true, undefined);
	}

	/** Persisted history, preferring a prefetch already in flight over a fresh read. */
	private async _readHistory(token: CancellationToken): Promise<IReplayedTaskHistory | undefined> {
		const prefetched = this._prefetchedHistory;
		this._prefetchedHistory = undefined;
		if (prefetched) {
			// A prefetch that resolved to nothing was skipped or failed; that is not the same as
			// "this task has no history", so fall through to a real read.
			const replayed = await prefetched;
			if (replayed) {
				return replayed;
			}
		}
		return this._apiService.getSessionHistory(this._config.taskId, token);
	}

	async provideChatSessionContent(sessionResource: URI, token: CancellationToken): Promise<IChatSession> {
		// Resolve from the *requested* resource, not the handler's config: one handler serves a
		// whole session type, and an environment can own several sessions.
		const sessionId = AgentSession.id(sessionResource);
		const replayed = await this._readHistory(token);
		const session = replayed?.sessions.find(s => AgentSession.id(URI.parse(s.session)) === sessionId);
		if (!session) {
			// Better an empty read-only session than a failed open: the entry stays inspectable and
			// the accompanying notification already explains why the environment is unreachable.
			this._logService.warn(`${LOG_PREFIX} No persisted history for session ${sessionId} in task ${this._config.taskId} (replayed sessions: [${replayed?.sessions.map(s => s.session).join(', ') ?? 'none'}]); opening an empty read-only session.`);
			return new ReadOnlyChatSession(sessionResource, [], undefined, this._isReadOnly);
		}

		// Render the default chat only. Peer chats are separate transcripts, and a read-only
		// session has no chat switcher to keep them apart — flattening them into one stream would
		// interleave unrelated conversations rather than show more history.
		const chat = session.chats.get(session.defaultChat) ?? [...session.chats.values()][0];
		const history: IChatSessionHistoryItem[] = chat
			? turnsToHistory(URI.parse(session.session), chat.turns, this._config.agentId, this._config.connectionAuthority, undefined, undefined, undefined, undefined, this._config.agentId)
			: [];

		// The compute most likely died mid-turn, so the unfinished exchange is exactly the one the
		// user wants to see. It lives in `activeTurn` and never reached `turns`; surface it as a
		// completed request/response pair, since nothing will stream into it now.
		const active = chat?.activeTurn;
		if (active) {
			history.push({
				id: active.id,
				type: 'request',
				prompt: active.message.text,
				participant: this._config.agentId,
				variableData: messageToVariableData(active.message, this._config.connectionAuthority),
				origin: messageToRequestOrigin(URI.parse(session.session), active.message, this._config.agentId, this._config.agentId),
			});
			history.push({
				type: 'response',
				parts: activeTurnToProgress(
					URI.parse(session.session),
					active,
					this._config.connectionAuthority,
					sessionResource.authority,
				),
				participant: this._config.agentId,
			});
		}

		if (replayed?.truncated) {
			// A partial tail must not read as a complete transcript, so say so in the conversation
			// itself — a log line is invisible to the person reading it.
			this._logService.warn(`${LOG_PREFIX} History for task ${this._config.taskId} is truncated; the final exchange may be incomplete.`);
			history.push({
				type: 'response',
				parts: [{
					kind: 'warning',
					content: new MarkdownString(localize(
						'cloudSandbox.truncatedHistory',
						"This conversation is incomplete. Its recorded history ends mid-response, so the last exchange may be missing.")),
				}],
				participant: this._config.agentId,
			});
		}

		this._logService.info(`${LOG_PREFIX} Opened ${sessionResource.toString()} read-only with ${history.length} history item(s) from ${chat?.turns.length ?? 0} turn(s); chats=[${[...session.chats.keys()].join(', ')}], default=${session.defaultChat}.`);
		return new ReadOnlyChatSession(sessionResource, history, session.state.title || undefined, this._isReadOnly);
	}
}

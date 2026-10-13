/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Recorded conversations use the same transcript adapter as live sessions without requiring compute.

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agent.js';
import { getAgentHostChatId } from '../../../../../platform/agentHost/common/agentHostChatIdentity.js';
import { ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ChatState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IReplayedSession, IReplayedTaskHistory } from '../../../../../platform/agentHost/common/taskEventReplay.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { activeTurnToProgress, messageToRequestOrigin, messageToVariableData, turnsToHistory } from '../agentSessions/agentHost/stateToProgressAdapter.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem } from '../../common/chatSessionsService.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../common/constants.js';

const LOG_PREFIX = '[CloudSandboxReadOnly]';

export interface ICloudSandboxReadOnlyConfig {
	/** Mission Control task owning the session, which is what persisted history is addressed by. */
	readonly taskId: string;
	/** Chat participant id. Matches the live handler, where `agentId === sessionType`. */
	readonly agentId: string;
	/** Sanitized agent-host authority used to rewrite resource URIs in history. */
	readonly connectionAuthority: string;
}

/** A resolved chat session backed entirely by read-only history. */
export class ReadOnlyChatSession extends Disposable implements IChatSession {
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

/** Loads recorded conversations independently of the sandbox's live connection. */
export class CloudSandboxReadOnlySessionHandler extends Disposable implements IChatSessionContentProvider {

	private readonly _isReadOnly = constObservable(true);

	constructor(
		private readonly _config: ICloudSandboxReadOnlyConfig,
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async provideChatSessionContent(sessionResource: URI, token: CancellationToken, diagnosticId?: string, onCachedSession?: (session: IChatSession) => void, hasHistory = false): Promise<IChatSession> {
		const replayed = await this._apiService.getSessionHistory(this._config.taskId, token, diagnosticId, onCachedSession && (history => {
			const session = this._findSession(sessionResource, history);
			const chatResource = session && this._getChatResource(sessionResource, session);
			const chat = chatResource ? session?.chats.get(chatResource) : undefined;
			if (!this._hasChatHistory(chat)) {
				this._logService.trace(`${LOG_PREFIX} Cached history has no content for the requested conversation; waiting for fresh history.`);
				return;
			}
			hasHistory = true;
			onCachedSession(this._createSession(sessionResource, history));
		}), history => {
			const session = this._findSession(sessionResource, history);
			const chatResource = session && this._getChatResource(sessionResource, session);
			const chat = chatResource ? session?.chats.get(chatResource) : undefined;
			return !!chat && (!hasHistory || this._hasChatHistory(chat));
		});
		return this._createSession(sessionResource, replayed, hasHistory);
	}

	private _findSession(resource: URI, history: IReplayedTaskHistory | undefined): IReplayedSession | undefined {
		return history?.sessions.find(session => AgentSession.id(URI.parse(session.session)) === AgentSession.id(resource));
	}

	private _getChatResource(resource: URI, session: IReplayedSession): string | undefined {
		return new URLSearchParams(resource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM) || (resource.fragment
			? [...session.chats.keys()].find(chat => getAgentHostChatId(chat) === resource.fragment)
			: session.defaultChat);
	}

	private _hasChatHistory(chat: ChatState | undefined): boolean {
		return !!chat && (chat.turns.length > 0 || !!chat.activeTurn);
	}

	private _createSession(sessionResource: URI, replayed: IReplayedTaskHistory | undefined, hasHistory = false): IChatSession {
		// Resolve from the *requested* resource, not the handler's config: one handler serves a
		// whole session type, and an environment can own several sessions.
		const sessionId = AgentSession.id(sessionResource);
		const session = this._findSession(sessionResource, replayed);
		const chatResource = session && this._getChatResource(sessionResource, session);
		const chat = chatResource ? session?.chats.get(chatResource) : undefined;
		if (hasHistory && (!this._hasChatHistory(chat) || replayed?.truncated)) {
			throw new Error(localize('cloudSandbox.incompleteHistoryRefresh', "The latest recorded conversation is unavailable or incomplete."));
		}
		if (!session) {
			// A newly created task may not have recorded a conversation yet.
			this._logService.warn(`${LOG_PREFIX} No persisted history for session ${sessionId} in task ${this._config.taskId} (replayed sessions: [${replayed?.sessions.map(s => s.session).join(', ') ?? 'none'}]); opening an empty read-only session.`);
			return new ReadOnlyChatSession(sessionResource, [], undefined, this._isReadOnly);
		}

		const explicitChat = new URLSearchParams(sessionResource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM);
		if (!chat && (explicitChat || sessionResource.fragment)) {
			throw new Error(localize('cloudSandbox.chatHistoryMissing', "Recorded history for this conversation is unavailable."));
		}
		const history: IChatSessionHistoryItem[] = chat
			? turnsToHistory(URI.parse(session.session), chat.turns, this._config.agentId, this._config.connectionAuthority)
			: [];

		// Recorded active turns remain settled until a live snapshot can resume them.
		const active = chat?.activeTurn;
		if (active) {
			history.push({
				id: active.id,
				type: 'request',
				prompt: active.message.text,
				participant: this._config.agentId,
				variableData: messageToVariableData(active.message, this._config.connectionAuthority),
				origin: messageToRequestOrigin(URI.parse(session.session), active.message, this._config.agentId, this._config.connectionAuthority),
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
		const title = session.state.chats.find(summary => summary.resource === chatResource)?.title
			|| (chatResource === session.defaultChat ? session.state.title : undefined);
		return new ReadOnlyChatSession(sessionResource, history, title || undefined, this._isReadOnly);
	}
}

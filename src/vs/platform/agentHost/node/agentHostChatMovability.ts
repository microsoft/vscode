/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ChatMoveConfigKey, chatMoveRootConfigSchema, isChatMovable } from '../common/agentHostChatMove.js';
import { readSessionMovable, withSessionMovable } from '../common/meta/agentHostSessionMoveMeta.js';
import { ActionType } from '../common/state/sessionActions.js';
import { ChatOriginKind, type URI as ProtocolURI } from '../common/state/sessionState.js';
import type { IAgentConfigurationService } from './agentConfigurationService.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

/**
 * Keeps every registered chat's `movable` flag (`ChatSummary.movable`, `ChatState.movable`) current: on
 * registration, when it changes owner or role (default chat), and when moving chats is enabled or disabled.
 * Also keeps each session's VS Code-only `vscode.movable` flag (Block 4): the session can move under another session
 * while moving chats is enabled and its default chat is its only chat (with that chat's subagents).
 */
export class AgentHostChatMovability extends Disposable {

	private readonly _pending = new Set<ProtocolURI>();
	private readonly _pendingSessions = new Set<ProtocolURI>();
	/** Registration happens before a chat joins its session's catalog, so its flag is published right after. */
	private readonly _scheduler = this._register(new RunOnceScheduler(() => this._flush(), 0));

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _configurationService: IAgentConfigurationService,
	) {
		super();
		this._register(_stateManager.onDidRegisterChat(({ chat, session }) => this._schedule(chat, session)));
		this._register(_stateManager.onDidUnregisterChat(({ session }) => this._schedule(undefined, session)));
		// An owner change happens before the chat joins its new session's catalog.
		this._register(_stateManager.onDidChangeChatOwner(({ chat, previous, current }) => {
			this._schedule(chat, current);
			this._schedule(undefined, previous);
		}));
		this._register(_configurationService.onDidRootConfigChange(() => this._updateAll()));
		this._register(_stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionDefaultChatChanged || envelope.action.type === ActionType.SessionReady) {
				for (const chat of _stateManager.getSessionState(envelope.channel)?.chats ?? []) {
					this.update(chat.resource);
				}
				this.updateSession(envelope.channel);
			} else if (envelope.action.type === ActionType.SessionChatAdded || envelope.action.type === ActionType.SessionChatRemoved) {
				this._schedule(undefined, envelope.channel);
			}
		}));
	}

	/** Publishes the current eligibility of `chat`. */
	update(chat: ProtocolURI): void {
		const owner = this._stateManager.getChatOwner(chat);
		const summary = owner === undefined ? undefined : this._stateManager.getSessionState(owner)?.chats.find(candidate => candidate.resource === chat);
		if (owner === undefined || !summary) {
			return;
		}
		this._stateManager.setChatMovable(chat, isChatMovable({
			enabled: this._configurationService.getRootValue(chatMoveRootConfigSchema, ChatMoveConfigKey.Enabled) === true,
			isDefault: this._stateManager.isDefaultChat(owner, chat),
			origin: summary.origin,
			interactivity: summary.interactivity,
		}));
	}

	/** Publishes whether `session` can move under another session; written only when it changes. */
	updateSession(session: ProtocolURI): void {
		const state = this._stateManager.getSessionState(session);
		if (!state) {
			return;
		}
		const movable = this._configurationService.getRootValue(chatMoveRootConfigSchema, ChatMoveConfigKey.Enabled) === true
			&& state.chats.every(chat => chat.resource === state.defaultChat || chat.origin?.kind === ChatOriginKind.Tool);
		if (readSessionMovable(state._meta) !== movable) {
			this._stateManager.setSessionMeta(session, withSessionMovable(state._meta, movable));
		}
	}

	private _schedule(chat: ProtocolURI | undefined, session: ProtocolURI | undefined): void {
		if (chat !== undefined) {
			this._pending.add(chat);
		}
		if (session !== undefined) {
			this._pendingSessions.add(session);
		}
		this._scheduler.schedule();
	}

	private _flush(): void {
		const chats = [...this._pending];
		const sessions = [...this._pendingSessions];
		this._pending.clear();
		this._pendingSessions.clear();
		for (const chat of chats) {
			this.update(chat);
		}
		for (const session of sessions) {
			this.updateSession(session);
		}
	}

	private _updateAll(): void {
		for (const session of this._stateManager.getSessionUris()) {
			for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
				this.update(chat.resource);
			}
			this.updateSession(session);
		}
	}
}

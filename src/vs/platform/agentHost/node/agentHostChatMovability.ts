/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ChatMoveConfigKey, chatMoveRootConfigSchema, isChatMovable } from '../common/agentHostChatMove.js';
import { ActionType } from '../common/state/sessionActions.js';
import type { URI as ProtocolURI } from '../common/state/sessionState.js';
import type { IAgentConfigurationService } from './agentConfigurationService.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

/**
 * Keeps every registered chat's `movable` flag (`ChatSummary.movable`, `ChatState.movable`) current: on
 * registration, when it changes owner or role (default chat), and when moving chats is enabled or disabled.
 */
export class AgentHostChatMovability extends Disposable {

	private readonly _pending = new Set<ProtocolURI>();
	/** Registration happens before a chat joins its session's catalog, so its flag is published right after. */
	private readonly _scheduler = this._register(new RunOnceScheduler(() => this._flush(), 0));

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _configurationService: IAgentConfigurationService,
	) {
		super();
		this._register(_stateManager.onDidRegisterChat(({ chat }) => this._schedule(chat)));
		// An owner change happens before the chat joins its new session's catalog.
		this._register(_stateManager.onDidChangeChatOwner(({ chat }) => this._schedule(chat)));
		this._register(_configurationService.onDidRootConfigChange(() => this._updateAll()));
		this._register(_stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionDefaultChatChanged || envelope.action.type === ActionType.SessionReady) {
				for (const chat of _stateManager.getSessionState(envelope.channel)?.chats ?? []) {
					this.update(chat.resource);
				}
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

	private _schedule(chat: ProtocolURI): void {
		this._pending.add(chat);
		this._scheduler.schedule();
	}

	private _flush(): void {
		const chats = [...this._pending];
		this._pending.clear();
		for (const chat of chats) {
			this.update(chat);
		}
	}

	private _updateAll(): void {
		for (const session of this._stateManager.getSessionUris()) {
			for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
				this.update(chat.resource);
			}
		}
	}
}

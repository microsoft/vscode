/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IAgentHostSubscriptionService } from '../common/agentHostSubscriptionService.js';
import { readChatInputState, withChatInputState, type AgentChatInputState } from '../common/meta/agentHostChatInputState.js';
import { ActionType } from '../common/state/sessionActions.js';
import { ChatInteractivity, isChatReadOnly, isSessionStatusArchived, parseRequiredSessionUriFromChatUri, type ErrorInfo } from '../common/state/sessionState.js';
import { createAgentChatContext } from './agentChatContext.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export const IAgentHostChatInputService = createDecorator<IAgentHostChatInputService>('agentHostChatInputService');

export interface IAgentHostChatInputService {
	readonly _serviceBrand: undefined;
	prepareChat(chat: URI): Promise<void>;
	setBlocked(chat: string, error: ErrorInfo): void;
	clear(session: string, chat: string): void;
}

/** Owns provider input readiness as ordinary read-only chat state and session metadata. */
export class AgentHostChatInputService extends Disposable implements IAgentHostChatInputService {
	declare readonly _serviceBrand: undefined;
	private readonly _pending = new ResourceMap<{ marker: AgentChatInputState; promise: Promise<void> }>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
		@IAgentHostSubscriptionService private readonly _subscriptions: IAgentHostSubscriptionService,
	) {
		super();
	}

	prepareChat(chat: URI): Promise<void> {
		const chatKey = chat.toString();
		const session = parseRequiredSessionUriFromChatUri(chatKey);
		const state = this._stateManager.getChatState(chatKey);
		const sessionState = this._stateManager.getSessionState(session);
		const previous = readChatInputState(sessionState, chatKey);
		const provider = this._providers.getProviderForSession(session);
		if (this._store.isDisposed || !state || !sessionState || !provider?.chats.prepareChat || state.activeTurn
			|| state.interactivity === ChatInteractivity.Hidden
			|| isSessionStatusArchived(sessionState.status) || (isChatReadOnly(state.interactivity, false) && !previous)) {
			return Promise.resolve();
		}
		const existing = this._pending.get(chat);
		if (existing && existing.marker === previous) {
			return existing.promise;
		}
		const marker: AgentChatInputState = { kind: 'checking' };
		this._setState(session, chatKey, marker);
		const promise = Promise.resolve().then(async () => {
			try {
				if (!this._isCurrent(session, chatKey, marker)) {
					return;
				}
				const result = await provider.chats.prepareChat!(chat, createAgentChatContext(this._stateManager, session, chat));
				if (this._isCurrent(session, chatKey, marker)) {
					this._setState(session, chatKey, result.error ? { kind: 'blocked', error: result.error } : undefined);
				}
			} catch (error) {
				if (this._isCurrent(session, chatKey, marker)) {
					this._setState(session, chatKey, { kind: 'blocked', error: { errorType: 'ChatPreparationFailed', message: error instanceof Error ? error.message : String(error) } });
				}
			} finally {
				if (this._pending.get(chat)?.marker === marker) {
					this._pending.delete(chat);
				}
			}
		});
		this._pending.set(chat, { marker, promise });
		return promise;
	}

	setBlocked(chat: string, error: ErrorInfo): void {
		const session = parseRequiredSessionUriFromChatUri(chat);
		this._setState(session, chat, { kind: 'blocked', error });
	}

	clear(session: string, chat: string): void {
		this._pending.delete(URI.parse(chat));
		this._setState(session, chat, undefined);
	}

	private _isCurrent(session: string, chat: string, marker: AgentChatInputState): boolean {
		return !this._store.isDisposed && !!this._stateManager.getChatState(chat)
			&& this._subscriptions.hasSubscribers(URI.parse(chat))
			&& readChatInputState(this._stateManager.getSessionState(session), chat) === marker;
	}

	private _setState(session: string, chat: string, input: AgentChatInputState | undefined): void {
		const sessionState = this._stateManager.getSessionState(session);
		const chatState = this._stateManager.getChatState(chat);
		if (!sessionState) {
			return;
		}
		const previous = readChatInputState(sessionState, chat);
		if (!input && !previous) {
			return;
		}
		if (input && (!chatState || chatState.interactivity === ChatInteractivity.Hidden || isSessionStatusArchived(sessionState.status)
			|| (isChatReadOnly(chatState.interactivity, false) && !previous))) {
			return;
		}
		// Publish the explanation before blocking, and retain it until the
		// read-only restriction is lifted, so clients never hide an editable draft.
		if (input) {
			this._stateManager.setSessionMeta(session, withChatInputState(sessionState, chat, input));
		}
		if (chatState && chatState.interactivity !== ChatInteractivity.Hidden) {
			this._stateManager.dispatchServerAction(session, {
				type: ActionType.SessionChatUpdated,
				chat,
				changes: { interactivity: input ? ChatInteractivity.ReadOnly : ChatInteractivity.Full },
			});
		}
		if (!input) {
			const current = this._stateManager.getSessionState(session);
			if (current) {
				this._stateManager.setSessionMeta(session, withChatInputState(current, chat, undefined));
			}
		}
	}

	override dispose(): void {
		this._pending.clear();
		super.dispose();
	}
}

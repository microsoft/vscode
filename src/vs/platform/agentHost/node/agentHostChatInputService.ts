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
import { ChatInteractivity, isChatReadOnly, isSessionStatusArchived, type ErrorInfo } from '../common/state/sessionState.js';
import { IAgentHostSessionStateStore } from '../common/agentHostSessionStateStore.js';
import { createAgentChatContext } from './agentChatContext.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';

export const IAgentHostChatInputService = createDecorator<IAgentHostChatInputService>('agentHostChatInputService');

export interface IAgentHostChatInputService {
	readonly _serviceBrand: undefined;
	prepareChat(chat: URI): Promise<void>;
	setBlocked(chat: string, error: ErrorInfo): void;
	clear(session: string, chat: string): void;
	/** Carries a moved chat's input state from the session it left to its current owner. */
	transfer(previous: string, chat: string): void;
	/**
	 * Carries a moved chat's input state to `session` once it lists the chat, from the session it left: also when that
	 * session never removes it, as a session that ends by moving its chat under another doesn't.
	 */
	transferAdded(session: string, chat: string): void;
}

/** Owns provider input readiness as ordinary read-only chat state and session metadata. */
export class AgentHostChatInputService extends Disposable implements IAgentHostChatInputService {
	declare readonly _serviceBrand: undefined;
	private readonly _pending = new ResourceMap<{ marker: AgentChatInputState; promise: Promise<void> }>();
	/** The session a chat moved from, until its input state follows it. */
	private readonly _movedFrom = new Map<string, string>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
		@IAgentHostSubscriptionService private readonly _subscriptions: IAgentHostSubscriptionService,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
	) {
		super();
		// Fired while the previous session still holds the chat's input state, also when it ends by moving its chat.
		this._register(this._chatOwnership.onDidChangeChatOwner(({ chat, previous }) => this.transfer(previous, chat)));
	}

	prepareChat(chat: URI): Promise<void> {
		const chatKey = chat.toString();
		const session = this._chatOwnership.getChatOwner(chatKey);
		if (session === undefined) {
			return Promise.resolve();
		}
		const state = this._stateManager.getChatState(chatKey);
		const sessionState = this._stateManager.getSessionState(session);
		const previous = readChatInputState(sessionState, chatKey);
		const provider = this._providers.getProviderForSession(session);
		if (this._store.isDisposed || !state || !sessionState || !provider?.chats.prepareChat || state.activeTurn
			|| state.interactivity === ChatInteractivity.Hidden
			|| isSessionStatusArchived(sessionState.status) || isSessionStatusArchived(state.status)
			|| (isChatReadOnly(state.interactivity, false) && !previous)) {
			return Promise.resolve();
		}
		const existing = this._pending.get(chat);
		if (existing && existing.marker === previous) {
			return existing.promise;
		}
		const marker: AgentChatInputState = { kind: 'checking' };
		this._setState(session, chatKey, marker);
		// The chat may move while it is prepared, and its marker moves with it: completions go to its owner at that time.
		const currentOwner = () => {
			const owner = this._chatOwnership.getChatOwner(chatKey);
			return owner !== undefined && this._isCurrent(owner, chatKey, marker) ? owner : undefined;
		};
		const promise = Promise.resolve().then(async () => {
			try {
				const owner = currentOwner();
				if (owner === undefined) {
					return;
				}
				const result = await provider.chats.prepareChat!(chat, createAgentChatContext(this._stateManager, this._authenticationService, owner, chat, this._chatOwnership.resolveChatStorageResource(owner, chatKey), this._sessionStateStore.peek(URI.parse(owner))));
				const completed = currentOwner();
				if (completed !== undefined) {
					this._setState(completed, chatKey, result.error ? { kind: 'blocked', error: result.error } : undefined);
				}
			} catch (error) {
				const completed = currentOwner();
				if (completed !== undefined) {
					this._setState(completed, chatKey, { kind: 'blocked', error: { errorType: 'ChatPreparationFailed', message: error instanceof Error ? error.message : String(error) } });
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
		const session = this._chatOwnership.getChatOwner(chat);
		if (session !== undefined) {
			this._setState(session, chat, { kind: 'blocked', error });
		}
	}

	clear(session: string, chat: string): void {
		this._movedFrom.delete(chat);
		this._pending.delete(URI.parse(chat));
		this._setState(session, chat, undefined);
	}

	transferAdded(session: string, chat: string): void {
		const previous = this._movedFrom.get(chat);
		if (previous !== undefined && previous !== session) {
			this.transfer(previous, chat);
		}
	}

	transfer(previous: string, chat: string): void {
		const previousState = this._stateManager.getSessionState(previous);
		const input = previousState && readChatInputState(previousState, chat);
		const owner = this._chatOwnership.getChatOwner(chat);
		if (!previousState || !input || owner === undefined || owner === previous) {
			this._movedFrom.delete(chat);
			return;
		}
		const ownerState = this._stateManager.getSessionState(owner);
		if (!ownerState?.chats.some(summary => summary.resource === chat)) {
			// A session action on an owner that doesn't list its chat yet would drop the chat's live state: wait for the add.
			this._movedFrom.set(chat, previous);
			return;
		}
		this._movedFrom.delete(chat);
		// The chat's summary (read-only while blocked) came along to the owner's catalog: only the marker that explains
		// the restriction moves.
		this._stateManager.setSessionMeta(previous, withChatInputState(previousState, chat, undefined));
		this._stateManager.setSessionMeta(owner, withChatInputState(ownerState, chat, input));
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
			|| isSessionStatusArchived(chatState.status)
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
		this._movedFrom.clear();
		super.dispose();
	}
}

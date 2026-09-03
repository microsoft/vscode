/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ChatInteractivity, IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

export const AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING = 'chat.agentSessions.transientSideChat';

export interface ITransientSideChatState {
	readonly sessionResource: URI;
	readonly sourceChatResource: URI;
	readonly sideChatResource: URI;
	readonly question: string;
	readonly promoting: boolean;
	readonly failed: boolean;
	readonly replacedExisting: boolean;
}

export interface IResolvedTransientSideChatState extends ITransientSideChatState {
	readonly session: ISession;
	readonly sourceChat: IChat;
	readonly sideChat: IChat;
}

export const ITransientSideChatService = createDecorator<ITransientSideChatService>('transientSideChatService');

export interface ITransientSideChatService {
	readonly _serviceBrand: undefined;
	readonly states: IObservable<readonly ITransientSideChatState[]>;
	registerHost(sourceChat: URI): IDisposable;
	show(session: ISession, sourceChat: IChat, sideChat: IChat, question: string): Promise<boolean>;
	resolveState(state: ITransientSideChatState, reader?: IReader): IResolvedTransientSideChatState | undefined;
	promote(sourceChat: URI): Promise<boolean>;
	dismiss(sourceChat: URI): void;
	markFailed(sideChat: URI): boolean;
	removeBySideChat(sideChat: URI): void;
}

export class TransientSideChatService extends Disposable implements ITransientSideChatService {
	declare readonly _serviceBrand: undefined;

	private readonly _states = observableValue<readonly ITransientSideChatState[]>(this, []);
	readonly states: IObservable<readonly ITransientSideChatState[]> = this._states;

	private readonly _hosts = new ResourceMap<Set<object>>();
	private readonly _presentationIds = new ResourceMap<number>();
	private readonly _catalogChanged: IObservable<void>;
	private _presentationIdPool = 0;

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._catalogChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		this._register(sessionsManagementService.onDidDeleteSession(session => {
			this._removeWhere(state => isEqual(state.sessionResource, session.resource));
		}));
		this._register(sessionsManagementService.onDidDeleteChat(({ chatResource }) => {
			this._removeWhere(state => isEqual(state.sourceChatResource, chatResource) || isEqual(state.sideChatResource, chatResource));
		}));
		this._register(sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			const states = this._states.get();
			let changed = false;
			const next = states.map(state => {
				if (!isEqual(state.sessionResource, from.resource)) {
					return state;
				}
				changed = true;
				return { ...state, sessionResource: to.resource };
			});
			if (changed) {
				this._states.set(next, undefined);
			}
		}));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING) && !this._isEnabled()) {
				this._presentationIds.clear();
				this._states.set([], undefined);
			}
		}));
		this._register(autorun(reader => {
			const states = this._states.read(reader);
			const next = states.filter(state => this.resolveState(state, reader) !== undefined);
			if (next.length !== states.length) {
				this._states.set(next, undefined);
			}
		}));
	}

	registerHost(sourceChat: URI): IDisposable {
		const registration = {};
		let registrations = this._hosts.get(sourceChat);
		if (!registrations) {
			registrations = new Set();
			this._hosts.set(sourceChat, registrations);
		}
		registrations.add(registration);
		return toDisposable(() => {
			const current = this._hosts.get(sourceChat);
			current?.delete(registration);
			if (current?.size === 0) {
				this._hosts.delete(sourceChat);
				this._remove(sourceChat);
			}
		});
	}

	async show(session: ISession, sourceChat: IChat, sideChat: IChat, question: string): Promise<boolean> {
		if (!this._isEnabled()) {
			return false;
		}
		if (!this._hasHost(sourceChat.resource)) {
			return false;
		}
		if (sourceChat.interactivity.get() !== ChatInteractivity.Full) {
			return false;
		}

		const presentationId = ++this._presentationIdPool;
		this._presentationIds.set(sourceChat.resource, presentationId);
		await this.sessionsService.closeChat(session, sideChat, { skipHistory: true });
		if (this._presentationIds.get(sourceChat.resource) !== presentationId
			|| !this._isEnabled()
			|| !this._hasHost(sourceChat.resource)) {
			if (this._presentationIds.get(sourceChat.resource) === presentationId) {
				this._presentationIds.delete(sourceChat.resource);
			}
			return false;
		}
		const liveSession = this.sessionsManagementService.getSession(session.resource);
		const liveChats = liveSession?.chats.get();
		const liveSourceChat = liveChats?.find(chat => isEqual(chat.resource, sourceChat.resource));
		if (!liveSession
			|| !liveChats
			|| !liveSourceChat
			|| liveSourceChat.interactivity.get() !== ChatInteractivity.Full
			|| !liveChats.some(chat => isEqual(chat.resource, sideChat.resource))) {
			this._presentationIds.delete(sourceChat.resource);
			return false;
		}
		this._setState({
			sessionResource: liveSession.resource,
			sourceChatResource: sourceChat.resource,
			sideChatResource: sideChat.resource,
			question,
			promoting: false,
			failed: false,
			replacedExisting: this._getState(sourceChat.resource) !== undefined,
		});
		return true;
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING) === true;
	}

	resolveState(state: ITransientSideChatState, reader?: IReader): IResolvedTransientSideChatState | undefined {
		if (reader) {
			this._catalogChanged.read(reader);
		}
		const session = this.sessionsManagementService.getSession(state.sessionResource);
		if (!session) {
			return undefined;
		}
		const chats = reader ? session.chats.read(reader) : session.chats.get();
		const sourceChat = chats.find(chat => isEqual(chat.resource, state.sourceChatResource));
		const sideChat = chats.find(chat => isEqual(chat.resource, state.sideChatResource));
		const sourceInteractivity = sourceChat && (reader ? sourceChat.interactivity.read(reader) : sourceChat.interactivity.get());
		return sourceChat && sourceInteractivity === ChatInteractivity.Full && sideChat ? { ...state, session, sourceChat, sideChat } : undefined;
	}

	async promote(sourceChat: URI): Promise<boolean> {
		const state = this._getState(sourceChat);
		if (!state || state.promoting) {
			return false;
		}

		const resolved = this.resolveState(state);
		if (!resolved) {
			this._remove(sourceChat);
			throw new Error('The transient side chat is no longer available');
		}

		this._setState({ ...state, promoting: true });
		try {
			await this.sessionsService.openChat(resolved.session, state.sideChatResource);
			if (!this._isActiveChat(resolved.session, state.sideChatResource)) {
				throw new Error('The transient side chat did not open');
			}
			const current = this._getState(sourceChat);
			if (current && isEqual(current.sideChatResource, state.sideChatResource) && current.promoting) {
				this._remove(sourceChat);
			}
			return true;
		} catch (error) {
			const current = this._getState(sourceChat);
			if (current && isEqual(current.sideChatResource, state.sideChatResource) && current.promoting) {
				this._setState({ ...current, promoting: false });
			}
			throw error;
		}
	}

	dismiss(sourceChat: URI): void {
		this._remove(sourceChat);
	}

	markFailed(sideChat: URI): boolean {
		const state = this._states.get().find(candidate => isEqual(candidate.sideChatResource, sideChat));
		if (!state) {
			return false;
		}
		if (!state.failed) {
			this._setState({ ...state, failed: true });
		}
		return true;
	}

	removeBySideChat(sideChat: URI): void {
		const state = this._states.get().find(candidate => isEqual(candidate.sideChatResource, sideChat));
		if (state) {
			this._remove(state.sourceChatResource);
		}
	}

	private _getState(sourceChat: URI): ITransientSideChatState | undefined {
		return this._states.get().find(state => isEqual(state.sourceChatResource, sourceChat));
	}

	private _setState(nextState: ITransientSideChatState): void {
		const states = this._states.get();
		const index = states.findIndex(state => isEqual(state.sourceChatResource, nextState.sourceChatResource));
		const next = [...states];
		if (index === -1) {
			next.push(nextState);
		} else {
			next[index] = nextState;
		}
		this._states.set(next, undefined);
	}

	private _remove(sourceChat: URI): void {
		this._removeWhere(state => isEqual(state.sourceChatResource, sourceChat));
	}

	private _removeWhere(predicate: (state: ITransientSideChatState) => boolean): void {
		const states = this._states.get();
		const next: ITransientSideChatState[] = [];
		for (const state of states) {
			if (predicate(state)) {
				this._presentationIds.delete(state.sourceChatResource);
			} else {
				next.push(state);
			}
		}
		if (next.length !== states.length) {
			this._states.set(next, undefined);
		}
	}

	private _hasHost(sourceChat: URI): boolean {
		return (this._hosts.get(sourceChat)?.size ?? 0) > 0;
	}

	private _isActiveChat(session: ISession, chatResource: URI): boolean {
		const activeSession: IActiveSession | undefined = this.sessionsService.activeSession.get();
		return activeSession?.sessionId === session.sessionId && isEqual(activeSession.activeChat.get().resource, chatResource);
	}

}

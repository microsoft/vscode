/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError } from '../../../base/common/async.js';
import { CancellationTokenSource, type CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { parseChatUri } from '../common/state/sessionState.js';
import type { IAgentHostClientConnectionService } from './agentHostClientConnectionService.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';
import type { IAgentCanvasApprovalClient, IAgentCanvasOperation } from '../common/agentHostCanvases.js';

/** Bounded connection-owned consent outside turns; never answered by model or autopilot input. */
export class AgentHostCanvasApproval extends Disposable {
	private readonly _pending = new Map<string, { chat: string; cancellation: CancellationTokenSource }>();

	constructor(
		private readonly _state: AgentHostStateManager,
		private readonly _connections: IAgentHostClientConnectionService,
		private readonly _initialization: (chat: string) => IAgentCanvasOperation | undefined = () => undefined,
	) {
		super();
		this._register(_state.onDidRemoveSession(session => {
			for (const pending of this._pending.values()) {
				if (parseChatUri(pending.chat)?.session === session) {
					pending.cancellation.cancel();
				}
			}
		}));
		this._register(toDisposable(() => {
			for (const pending of this._pending.values()) {
				pending.cancellation.cancel();
			}
		}));
	}

	async request(chat: string, message: string, token: CancellationToken, initiatingClientId?: string, initiator?: IAgentCanvasApprovalClient): Promise<boolean> {
		const session = parseChatUri(chat)?.session;
		const initialization = this._initialization(chat);
		const authority = initiator ?? initialization?.initiator;
		const generation = this._state.getChatGeneration(chat);
		const ownsChat = () => !initialization?.token.isCancellationRequested && (initialization
			? this._initialization(chat) === initialization
			: !!session && this._state.getSessionState(session)?.chats.some(entry => entry.resource === chat) === true)
			&& generation === this._state.getChatGeneration(chat) && !authority?.token.isCancellationRequested;
		if (this._store.isDisposed || token.isCancellationRequested || !session || !ownsChat()
			|| this._pending.size >= 32 || message.length > 16384) {
			return false;
		}
		const subscribers = [...new Set([...this._connections.getSubscribedClients(chat), ...this._connections.getSubscribedClients(session)])].filter(client => this._connections.isClientConnected(client));
		if (initialization?.clientId !== undefined && initiatingClientId !== undefined && initialization.clientId !== initiatingClientId
			|| initialization?.initiator && authority !== initialization.initiator
			|| authority && initiatingClientId !== undefined && authority.clientId !== initiatingClientId) {
			return false;
		}
		const clientId = initialization?.clientId ?? initiatingClientId ?? (subscribers.length === 1 ? subscribers[0] : undefined);
		if (!clientId || !this._connections.isClientConnected(clientId) || !authority && this._connections.getConnectionCounts(clientId).clientTransportCount !== 1) {
			return false;
		}
		const requestId = generateUuid();
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		if (initialization) {
			store.add(initialization.token.onCancellationRequested(() => cancellation.cancel()));
		}
		if (authority) {
			store.add(authority.token.onCancellationRequested(() => cancellation.cancel()));
		}
		store.add(disposableTimeout(() => cancellation.cancel(), 120_000));
		this._pending.set(requestId, { chat, cancellation });
		try {
			const request = { requestId, chat, message };
			return await raceCancellationError(authority ? authority.requestApproval(request, cancellation.token) : this._connections.requestCanvasApproval(clientId, request, cancellation.token), cancellation.token)
				&& !cancellation.token.isCancellationRequested && this._connections.isClientConnected(clientId)
				&& ownsChat();
		} catch {
			return false;
		} finally {
			this._pending.delete(requestId);
			store.dispose();
		}
	}
}

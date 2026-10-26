/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../base/common/async.js';
import { Disposable, DisposableMap, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { getPendingSteeringMessages } from '../../../../../../platform/agentHost/common/agentSessionMessage.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ChatState, Message, PendingMessageKind, TurnState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { isMessageHiddenFromTranscript, isMessageRequestHiddenFromTranscript } from '../../../../../../platform/agentHost/common/meta/agentMessageMeta.js';
import { IChatModel, IChatRequestModel } from '../../../common/model/chatModel.js';
import { ChatRequestQueueKind } from '../../../common/chatService/chatService.js';

/** Bridges hosts that consume steering before publishing its transcript turn, without retaining sendable queue entries. */
export class AgentHostSteeringMessageHandoff extends Disposable {
	/** Steering consumption need not produce a transcript echo, so display retention must be bounded. */
	static readonly GRACE_PERIOD_MS = 10_000;

	private readonly _messages = new Map<string, { request: IChatRequestModel; message: Message; sourceTurnId: string; turnId?: string }>();
	private readonly _timeouts = this._register(new DisposableMap<string>());

	constructor(private readonly model: IChatModel, subscription: IAgentSubscription<ChatState>) {
		super();

		const publish = () => model.setPendingRequestHandoffs([...this._messages.values()].map(entry => entry.request));
		const remove = (id: string) => {
			if (this._messages.delete(id)) {
				this._timeouts.deleteAndDispose(id);
				publish();
			}
		};
		this._register(toDisposable(() => this.clear()));
		this._register(model.onDidDispose(() => {
			// The model clears its display state after disposal listeners; do not publish during teardown.
			this._messages.clear();
			this.dispose();
		}));
		this._register(model.onDidChange(event => {
			if (event.kind === 'addRequest') {
				for (const [id, entry] of this._messages) {
					if (entry.turnId === event.request.id) {
						remove(id);
					}
				}
			}
		}));
		if (subscription.onDidApplySnapshot) {
			this._register(subscription.onDidApplySnapshot(() => this.clear()));
		}
		this._register(subscription.onDidChange(state => {
			for (const [id, entry] of this._messages) {
				const sourceTurn = state.turns.find(turn => turn.id === entry.sourceTurnId);
				if (sourceTurn?.state === TurnState.Cancelled || sourceTurn?.state === TurnState.Error
					|| !sourceTurn && state.activeTurn?.id !== entry.sourceTurnId && !(entry.turnId && state.activeTurn?.id === entry.turnId)) {
					remove(id);
				}
			}
		}));
		this._register(subscription.onWillApplyAction(envelope => {
			if (envelope.rejectionReason) {
				return;
			}
			const action = envelope.action;
			switch (action.type) {
				case ActionType.ChatPendingMessageRemoved: {
					if (action.kind !== PendingMessageKind.Steering) {
						return;
					}
					if (envelope.origin) {
						remove(action.id);
						return;
					}
					const state = subscription.value;
					if (!state || state instanceof Error) {
						return;
					}
					const sourceTurnId = state.activeTurn?.id
						?? (state.turns.at(-1)?.state === TurnState.Complete ? state.turns.at(-1)?.id : undefined);
					if (!sourceTurnId) {
						return;
					}
					const pending = getPendingSteeringMessages(state).find(message => message.id === action.id);
					const request = model.getPendingRequests().find(pending => pending.kind === ChatRequestQueueKind.Steering && pending.request.id === action.id)?.request;
					if (!pending || !request || request.isHiddenFromTranscript || request.isRequestHiddenFromTranscript
						|| isMessageHiddenFromTranscript(pending.message) || isMessageRequestHiddenFromTranscript(pending.message)) {
						return;
					}
					this._messages.set(action.id, { request, message: pending.message, sourceTurnId });
					this._timeouts.set(action.id, disposableTimeout(() => remove(action.id), AgentHostSteeringMessageHandoff.GRACE_PERIOD_MS));
					publish();
					break;
				}
				case ActionType.ChatTurnStarted: {
					if (envelope.origin) {
						this.clear();
						break;
					}
					if (action.queuedMessageId) {
						const entry = this._messages.get(action.queuedMessageId);
						if (entry) {
							entry.turnId = action.turnId;
						}
					} else {
						// Older hosts do not correlate the turn; match one identical consumed message in arrival order.
						const entry = [...this._messages.values()].find(entry => !entry.turnId
							&& entry.message.text === action.message.text
							&& equals(entry.message.attachments ?? [], action.message.attachments ?? [])
							&& equals(entry.message.origin, action.message.origin));
						if (entry) {
							entry.turnId = action.turnId;
						}
					}
					break;
				}
				case ActionType.ChatPendingMessageSet:
					remove(action.id);
					break;
				case ActionType.ChatTruncated:
				case ActionType.ChatTurnCancelled:
				case ActionType.ChatError:
					this.clear();
					break;
			}
		}));
	}

	clear(): void {
		if (this._messages.size === 0) {
			return;
		}
		this._messages.clear();
		this._timeouts.clearAndDisposeAll();
		this.model.setPendingRequestHandoffs([]);
	}
}

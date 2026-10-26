/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatStateSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionEnvelope, ActionType, ChatAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { createActiveTurn, createChatState, createDefaultChatSummary, createErrorResponsePart, Message, MessageAttachmentKind, MessageKind, PendingMessageKind, SessionStatus, withMessageRequestHiddenFromTranscript } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostSteeringMessageHandoff } from '../../../browser/agentSessions/agentHost/agentHostSteeringMessageHandoff.js';
import { ChatRequestQueueKind, IChatService } from '../../../common/chatService/chatService.js';
import { ChatModel, ChatRequestModel, IChatChangeEvent, IChatModel, IChatPendingRequest, IChatRequestModel } from '../../../common/model/chatModel.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ChatAgentService, IChatAgentNameService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

suite('AgentHostSteeringMessageHandoff', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const chatURI = 'test-host-chat:/opaque-conversation';
	const message: Message = { text: 'change direction', origin: { kind: MessageKind.User } };

	function setupHandoff() {
		const changed = store.add(new Emitter<IChatChangeEvent>());
		const disposed = store.add(new Emitter<void>());
		const handoffs = observableValue<readonly IChatRequestModel[]>('handoffs', []);
		let pending: IChatPendingRequest[] = [];
		let serverSeq = 0;
		const subscription = store.add(new ChatStateSubscription(chatURI, 'this-client', () => 1, () => { }));
		const state = createChatState(createDefaultChatSummary({
			resource: 'opaque-host:/session', provider: 'test', title: 'Test', status: SessionStatus.InProgress,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
		}, chatURI));
		state.activeTurn = createActiveTurn('active', { ...message, text: 'initial request' }, new Date(0).toISOString());
		subscription.handleSnapshot(state, 0);
		const model = upcastPartial<IChatModel>({
			onDidChange: changed.event,
			onDidDispose: disposed.event,
			getPendingRequests: () => pending,
			pendingRequestHandoffs: handoffs,
			setPendingRequestHandoffs: requests => handoffs.set(requests, undefined),
		});
		const handoff = store.add(new AgentHostSteeringMessageHandoff(model, subscription));
		const fire = (action: ChatAction, origin?: ActionEnvelope['origin'], rejectionReason?: string) => {
			subscription.receiveEnvelope({ channel: chatURI, action, origin, rejectionReason, serverSeq: ++serverSeq });
		};
		const addPending = (id = 'steer', value = message) => {
			const request = upcastPartial<IChatRequestModel>({ id, message: { text: value.text, parts: [] } });
			pending.push({ request, kind: ChatRequestQueueKind.Steering, sendOptions: {} });
			fire({ type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Steering, id, message: value });
			return request;
		};
		const consume = (id = 'steer', origin?: ActionEnvelope['origin'], rejectionReason?: string) => {
			fire({ type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Steering, id }, origin, rejectionReason);
			if (!rejectionReason) {
				pending = pending.filter(entry => entry.request.id !== id);
			}
		};
		const start = (id = 'next', value = message, queuedMessageId?: string, origin?: ActionEnvelope['origin']) => {
			fire({ type: ActionType.ChatTurnStarted, turnId: id, message: value, queuedMessageId, startedAt: new Date(0).toISOString() }, origin);
		};
		const applyRequest = (id: string) => changed.fire({ kind: 'addRequest', request: upcastPartial<IChatRequestModel>({ id }) });
		const ids = () => handoffs.get().map(request => request.id);
		return { subscription, model, handoff, state, addPending, consume, start, applyRequest, fire, ids, disposed };
	}

	test('retains display through a delayed turn without retaining the send queue', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = setupHandoff();
		h.addPending();
		h.consume();
		const afterRemoval = { display: h.ids(), queue: h.model.getPendingRequests().length };
		await timeout(4000);
		const duringGap = h.ids();
		h.start();
		const beforeModel = h.ids();
		h.applyRequest('next');
		const afterModel = h.ids();
		await timeout(AgentHostSteeringMessageHandoff.GRACE_PERIOD_MS);
		assert.deepStrictEqual({ afterRemoval, duringGap, beforeModel, afterModel, afterTimeout: h.ids() }, {
			afterRemoval: { display: ['steer'], queue: 0 }, duringGap: ['steer'], beforeModel: ['steer'], afterModel: [], afterTimeout: [],
		});
	}));

	test('does not buffer the normal atomic VS Code host handoff', () => {
		const h = setupHandoff();
		h.addPending();
		h.start('next', message, 'steer');
		const state = h.subscription.value;
		assert.deepStrictEqual({ display: h.ids(), pending: state && !(state instanceof Error) ? state.queuedMessages : undefined }, { display: [], pending: undefined });
	});

	test('expires at the bounded grace period when no transcript turn arrives', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = setupHandoff();
		h.addPending();
		h.consume();
		await timeout(AgentHostSteeringMessageHandoff.GRACE_PERIOD_MS - 1);
		const before = h.ids();
		await timeout(1);
		assert.deepStrictEqual({ before, after: h.ids(), queue: h.model.getPendingRequests() }, { before: ['steer'], after: [], queue: [] });
	}));

	test('uses queuedMessageId when the host transforms the prompt', () => {
		const h = setupHandoff();
		h.addPending();
		h.consume();
		h.start('next', { ...message, text: 'transformed' }, 'steer');
		h.applyRequest('next');
		assert.deepStrictEqual(h.ids(), []);
	});

	test('matches repeated steering in order without claiming a turn with different attachments', () => {
		const h = setupHandoff();
		h.addPending('one');
		h.consume('one');
		h.addPending('two');
		h.consume('two');
		h.fire({ type: ActionType.ChatTurnComplete, turnId: 'active', duration: 1 });
		h.start('different', { ...message, attachments: [{ type: MessageAttachmentKind.Simple, label: 'context', modelRepresentation: 'different context' }] });
		h.applyRequest('different');
		const unmatched = h.ids();
		h.start('first');
		h.applyRequest('first');
		const first = h.ids();
		h.start('second');
		h.applyRequest('second');
		assert.deepStrictEqual({ unmatched, first, second: h.ids() }, { unmatched: ['one', 'two'], first: ['two'], second: [] });
	});

	test('new client turns retire unmatched display rows instead of leaving them below a new request', () => {
		const h = setupHandoff();
		h.addPending();
		h.consume();
		h.start('client', message, undefined, { clientId: 'other-client', clientSeq: 1 });
		assert.deepStrictEqual(h.ids(), []);
	});

	test('retains successful completion then removal until the new model request arrives', () => {
		const h = setupHandoff();
		h.addPending();
		h.fire({ type: ActionType.ChatTurnComplete, turnId: 'active', duration: 1 });
		h.consume();
		const beforeTurn = h.ids();
		h.start();
		const beforeModel = h.ids();
		h.applyRequest('next');
		assert.deepStrictEqual({ beforeTurn, beforeModel, afterModel: h.ids() }, {
			beforeTurn: ['steer'], beforeModel: ['steer'], afterModel: [],
		});
	});

	for (const action of [
		{ type: ActionType.ChatTurnCancelled, turnId: 'active', duration: 0 },
		{ type: ActionType.ChatTruncated },
	] satisfies ChatAction[]) {
		test(`optimistic ${action.type} clears display before the server echoes it`, () => {
			const h = setupHandoff();
			h.addPending();
			h.consume();
			h.subscription.applyOptimistic(action);
			assert.deepStrictEqual(h.ids(), []);
		});
	}

	test('treats absent and empty attachment lists as the same message', () => {
		const h = setupHandoff();
		h.addPending();
		h.consume();
		h.start('next', { ...message, attachments: [] });
		h.applyRequest('next');
		assert.deepStrictEqual(h.ids(), []);
	});

	for (const origin of [{ clientId: 'this-client', clientSeq: 1 }, { clientId: 'another-client', clientSeq: 1 }]) {
		test(`does not retain steering cancelled by ${origin.clientId}`, () => {
			const h = setupHandoff();
			h.addPending();
			h.consume('steer', origin);
			assert.deepStrictEqual(h.ids(), []);
		});
	}

	test('does not retain a rejected removal, unknown ID, queued message or hidden request', () => {
		const h = setupHandoff();
		h.addPending();
		h.consume('steer', undefined, 'rejected');
		h.consume('unknown');
		h.fire({ type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Queued, id: 'steer' });
		h.addPending('hidden', withMessageRequestHiddenFromTranscript(message, true));
		h.consume('hidden');
		assert.deepStrictEqual(h.ids(), []);
	});

	test('pending replacement does not fabricate a consumed message', () => {
		const h = setupHandoff();
		h.addPending('old');
		h.addPending('new');
		assert.deepStrictEqual(h.ids(), []);
	});

	test('does not retain cleanup removals after a turn was cancelled', () => {
		const h = setupHandoff();
		h.addPending();
		h.fire({ type: ActionType.ChatTurnCancelled, turnId: 'active', duration: 0 });
		h.consume();
		assert.deepStrictEqual(h.ids(), []);
	});

	for (const handoffFirst of [true, false]) {
		test(`real model disposal does not refresh a view with a retained handoff (handoff first=${handoffFirst})`, () => {
			const instantiation = workbenchInstantiationService(undefined, store);
			instantiation.stub(IChatService, new MockChatService());
			instantiation.stub(IChatAgentService, store.add(instantiation.createInstance(ChatAgentService)));
			instantiation.stub(IChatAgentNameService, upcastPartial<IChatAgentNameService>({}));
			const model = store.add(instantiation.createInstance(ChatModel, undefined, {
				initialLocation: ChatAgentLocation.Chat, canUseTools: false, disableBackgroundKeepAlive: true,
			}));
			const subscription = store.add(new ChatStateSubscription(chatURI, 'this-client', () => 1, () => { }));
			const state = createChatState({
				resource: chatURI, title: 'Steering', modifiedAt: new Date(0).toISOString(), status: SessionStatus.InProgress,
			});
			state.activeTurn = createActiveTurn('active', message, new Date(0).toISOString());
			subscription.handleSnapshot(state, 0);
			if (handoffFirst) {
				store.add(new AgentHostSteeringMessageHandoff(model, subscription));
			}
			const view = store.add(instantiation.createInstance(ChatViewModel, model, undefined));
			if (!handoffFirst) {
				store.add(new AgentHostSteeringMessageHandoff(model, subscription));
			}
			model.addPendingRequest(new ChatRequestModel({
				session: model, message: { text: message.text, parts: [] }, variableData: { variables: [] }, restoredId: 'steer',
			}), ChatRequestQueueKind.Steering, {});
			subscription.receiveEnvelope({
				channel: chatURI, serverSeq: 1, origin: undefined,
				action: { type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Steering, id: 'steer', message },
			});
			subscription.receiveEnvelope({
				channel: chatURI, serverSeq: 2, origin: undefined,
				action: { type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Steering, id: 'steer' },
			});
			model.removePendingRequest('steer');
			const retained = model.pendingRequestHandoffs.get().map(request => request.id);
			let refreshes = 0;
			store.add(view.onDidChange(() => refreshes++));
			model.dispose();
			assert.deepStrictEqual({ retained, refreshes, afterDispose: model.pendingRequestHandoffs.get() }, {
				retained: ['steer'], refreshes: 0, afterDispose: [],
			});
		});
	}

	for (const reason of ['cancel', 'error', 'truncate', 'snapshot', 'replacement', 'dispose', 'modelDispose'] as const) {
		test(`clears the display buffer on ${reason}`, () => {
			const h = setupHandoff();
			h.addPending();
			h.consume();
			switch (reason) {
				case 'cancel':
					h.fire({ type: ActionType.ChatTurnCancelled, turnId: 'active', duration: 0 });
					break;
				case 'error':
					h.fire({ type: ActionType.ChatError, turnId: 'active', duration: 0, part: createErrorResponsePart({ errorType: 'test', message: 'failed' }) });
					break;
				case 'truncate':
					h.fire({ type: ActionType.ChatTruncated });
					break;
				case 'snapshot':
					h.subscription.handleSnapshot(h.state, 10);
					break;
				case 'replacement':
					h.addPending('steer', { ...message, text: 'edited' });
					break;
				case 'dispose':
					h.handoff.dispose();
					break;
				case 'modelDispose':
					h.disposed.fire();
					h.model.setPendingRequestHandoffs([]);
					break;
			}
			assert.deepStrictEqual(h.ids(), []);
		});
	}
});

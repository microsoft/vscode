/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostChannelSubscription, agentHostStateChannelPolicy, type IAgentHostChannelPolicy } from '../../common/agentHostChannel.js';
import { AgentHostChannelScheduler } from '../../common/agentHostChannelDelivery.js';
import { AgentHostChannelError, AgentHostChannelErrorCode } from '../../common/agentHostChannelTelemetry.js';
import { ActionType, type ActionEnvelope, type ChatDeltaAction, type StateAction } from '../../common/state/sessionActions.js';
import { TerminalClaimKind, TerminalLifecycleStatus } from '../../common/state/protocol/channels-terminal/state.js';
import { isJsonRpcNotification, type IStateSnapshot, type JsonRpcNotification } from '../../common/state/sessionProtocol.js';
import { parseProtocolMessage, type IProtocolTransport } from '../../common/state/sessionTransport.js';

suite('AgentHostChannelSubscription', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const channel = 'test:/subscription';
	const limits = { windowBytes: 2048, maximumFrameBytes: 1024 };
	let clock: ReturnType<typeof sinon.useFakeTimers>;

	setup(() => {
		clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		store.add(toDisposable(() => clock.restore()));
	});

	teardown(() => sinon.restore());

	const notification = (data: string): JsonRpcNotification => ({
		jsonrpc: '2.0', method: 'example/data', params: { channel, data },
	});
	const blocker = notification('block');
	const actionNotification = (action: StateAction, serverSeq: number, metadata: Partial<Pick<ActionEnvelope, 'origin' | 'rejectionReason'>> = {}): JsonRpcNotification => ({
		jsonrpc: '2.0', method: 'action', params: { channel, action, serverSeq, ...metadata },
	});
	const chatDelta = (content: string, overrides: Partial<Omit<ChatDeltaAction, 'type' | 'content'>> = {}): ChatDeltaAction => ({
		type: ActionType.ChatDelta, turnId: 'turn', partId: 'part', content, ...overrides,
	});

	function fixture(options: { isHost?: boolean; sendWindowBytes?: number; receiveWindowBytes?: number; policy?: IAgentHostChannelPolicy; accept?: (message: JsonRpcNotification) => void | Promise<void> } = {}) {
		const sent: JsonRpcNotification[] = [];
		const received: JsonRpcNotification[] = [];
		const errors: Error[] = [];
		const closeEvents: { error: Error; notifiedPeer: boolean }[] = [];
		let receive: ((message: JsonRpcNotification) => void) | undefined;
		let transportDisposeCount = 0;
		const transport: IProtocolTransport = {
			onMessage: Event.None, onClose: Event.None,
			dispose() { transportDisposeCount++; },
			send(message) {
				const parsed = parseProtocolMessage(JSON.stringify(message));
				assert.ok(isJsonRpcNotification(parsed));
				sent.push(parsed);
				receive?.(parsed);
			},
		};
		const scheduler = store.add(new AgentHostChannelScheduler(transport, error => errors.push(error)));
		const isHost = options.isHost ?? true;
		const sendLimits = { ...limits, windowBytes: options.sendWindowBytes ?? limits.windowBytes };
		const receiveLimits = { ...limits, windowBytes: options.receiveWindowBytes ?? limits.windowBytes };
		const flowControl = isHost
			? { clientReceive: sendLimits, hostReceive: receiveLimits }
			: { clientReceive: receiveLimits, hostReceive: sendLimits };
		const subscription = store.add(new AgentHostChannelSubscription(channel, flowControl, isHost, transport, scheduler, options.policy ?? agentHostStateChannelPolicy, message => {
			received.push(message);
			return options.accept?.(message);
		}, (error, notifiedPeer) => {
			errors.push(error);
			closeEvents.push({ error, notifiedPeer });
		}));
		return {
			subscription, sent, received, errors, closeEvents,
			route: (callback: (message: JsonRpcNotification) => void) => receive = callback,
			receive(message: JsonRpcNotification) {
				const parsed = parseProtocolMessage(JSON.stringify(message));
				assert.ok(isJsonRpcNotification(parsed));
				scheduler.acceptMessage(parsed);
			},
			get transportDisposed() { return transportDisposeCount > 0; },
			get transportDisposeCount() { return transportDisposeCount; },
		};
	}

	function pair(policy?: IAgentHostChannelPolicy) {
		const host = fixture({ policy });
		const client = fixture({ isHost: false, policy });
		host.route(client.receive);
		client.route(host.receive);
		return { host, client };
	}

	function sendBehindFullWindow(messages: JsonRpcNotification[]) {
		const h = fixture({ sendWindowBytes: 1 });
		h.subscription.send(blocker);
		clock.runMicrotasks();
		for (const message of messages) {
			h.subscription.send(message);
		}
		clock.runMicrotasks();
		const whileFull = [...h.sent];
		h.subscription.setPeerReceiveLimits(limits);
		clock.runMicrotasks();
		return { whileFull, sent: h.sent, errors: h.errors };
	}

	test('coalesces queued terminal data', () => {
		const first = actionNotification({ type: ActionType.TerminalData, data: 'first' }, 1);
		const second = actionNotification({ type: ActionType.TerminalData, data: 'second' }, 2);
		assert.deepStrictEqual(sendBehindFullWindow([first, second]), {
			whileFull: [blocker],
			sent: [blocker, actionNotification({ type: ActionType.TerminalData, data: 'firstsecond' }, 2)],
			errors: [],
		});
	});

	test('coalesces matching chat deltas', () => {
		const cases = [
			{ name: 'absent metadata', first: chatDelta('first'), second: chatDelta('second') },
			{
				name: 'deeply equal metadata',
				first: chatDelta('first', { _meta: { source: { id: 'agent', tags: ['one', 'two'] }, version: 1 } }),
				second: chatDelta('second', { _meta: { version: 1, source: { tags: ['one', 'two'], id: 'agent' } } }),
			},
		];
		assert.deepStrictEqual(cases.map(({ name, first, second }) => ({
			name, ...sendBehindFullWindow([actionNotification(first, 1), actionNotification(second, 2)]),
		})), cases.map(({ name, second }) => ({
			name, whileFull: [blocker],
			sent: [blocker, actionNotification({ ...second, content: 'firstsecond' }, 2)], errors: [],
		})));
	});

	test('separates mismatched chat deltas', () => {
		const first = actionNotification(chatDelta('first', { _meta: { source: { id: 'agent' } } }), 1);
		const cases = [
			{ name: 'different turn', next: chatDelta('second', { turnId: 'other', _meta: { source: { id: 'agent' } } }) },
			{ name: 'different part', next: chatDelta('second', { partId: 'other', _meta: { source: { id: 'agent' } } }) },
			{ name: 'different metadata', next: chatDelta('second', { _meta: { source: { id: 'other' } } }) },
			{ name: 'missing metadata', next: chatDelta('second') },
		];
		assert.deepStrictEqual(cases.map(({ name, next }) => ({
			name, ...sendBehindFullWindow([first, actionNotification(next, 2)]),
		})), cases.map(({ name, next }) => ({
			name, whileFull: [blocker], sent: [blocker, first, actionNotification(next, 2)], errors: [],
		})));
	});

	test('preserves origins and rejections', () => {
		const origin = { clientId: 'client', clientSeq: 7 };
		const metadata: Partial<Pick<ActionEnvelope, 'origin' | 'rejectionReason'>>[] = [
			{ origin }, { rejectionReason: 'Rejected' },
		];
		const cases = metadata.flatMap(value => [
			[
				actionNotification({ type: ActionType.TerminalData, data: 'first' }, 1, value),
				actionNotification({ type: ActionType.TerminalData, data: 'second' }, 2),
			],
			[
				actionNotification({ type: ActionType.TerminalData, data: 'first' }, 1),
				actionNotification({ type: ActionType.TerminalData, data: 'second' }, 2, value),
			],
		]);
		assert.deepStrictEqual(cases.map(messages => sendBehindFullWindow(messages)), cases.map(messages => ({
			whileFull: [blocker], sent: [blocker, ...messages], errors: [],
		})));
	});

	test('preserves empty rejection reasons', () => {
		const first: StateAction = { type: ActionType.TerminalData, data: 'first' };
		const second: StateAction = { type: ActionType.TerminalData, data: 'second' };
		const cases = [
			[actionNotification(first, 1, { rejectionReason: '' }), actionNotification(second, 2)],
			[actionNotification(first, 1), actionNotification(second, 2, { rejectionReason: '' })],
		];
		assert.deepStrictEqual(cases.map(messages => sendBehindFullWindow(messages)), cases.map(messages => ({
			whileFull: [blocker], sent: [blocker, ...messages], errors: [],
		})));
	});

	test('keeps non-action notifications separate', () => {
		const first = actionNotification({ type: ActionType.TerminalData, data: 'first' }, 1);
		const second = actionNotification({ type: ActionType.TerminalData, data: 'second' }, 2);
		const nonActionFirst = { ...first, method: 'example/data' };
		const nonActionSecond = { ...second, method: 'example/data' };
		const cases = [[nonActionFirst, nonActionSecond], [nonActionFirst, second], [first, nonActionSecond]];
		assert.deepStrictEqual(cases.map(messages => sendBehindFullWindow(messages)), cases.map(messages => ({
			whileFull: [blocker], sent: [blocker, ...messages], errors: [],
		})));
	});

	test('credits data after acceptance', () => {
		const accepted: JsonRpcNotification[] = [];
		let duringAccept: JsonRpcNotification[] | undefined;
		const h: ReturnType<typeof fixture> = fixture({
			isHost: false, receiveWindowBytes: 1,
			accept: message => {
				accepted.push(message);
				clock.runMicrotasks();
				duringAccept = [...h.sent];
			},
		});
		const snapshot: JsonRpcNotification = {
			jsonrpc: '2.0', method: 'channel/snapshot',
			params: { channel, snapshot: { resource: channel, state: {}, fromSeq: 0 } },
		};
		h.receive(snapshot);
		h.subscription.flushCredit();
		h.sent.length = 0;
		const message = notification('inbound');
		h.receive(message);
		const beforeCredit = [...h.sent];
		clock.runMicrotasks();
		assert.deepStrictEqual({ accepted, duringAccept, beforeCredit, sent: h.sent, errors: h.errors }, {
			accepted: [message], duringAccept: [], beforeCredit: [],
			sent: [{ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: (JSON.stringify(snapshot).length + JSON.stringify(message).length) * 2 } }],
			errors: [],
		});
	});

	test('preserves transports on disposal', async () => {
		const h = fixture({ sendWindowBytes: 1 });
		h.subscription.send(blocker);
		clock.runMicrotasks();
		h.subscription.send(actionNotification({ type: ActionType.TerminalData, data: 'queued' }, 1));
		clock.runMicrotasks();
		h.subscription.dispose();
		clock.runMicrotasks();
		await Promise.resolve();
		assert.deepStrictEqual({ sent: h.sent, errors: h.errors, closeEvents: h.closeEvents, transportDisposed: h.transportDisposed }, {
			sent: [blocker], errors: [], closeEvents: [], transportDisposed: false,
		});
	});

	test('closes transports on invalid credit', () => {
		const h = fixture();
		h.receive({ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: 1 } });
		assert.deepStrictEqual({ received: h.received, errors: h.errors.map(error => error.message), transportDisposed: h.transportDisposed }, {
			received: [], errors: ['Invalid channel credit'], transportDisposed: true,
		});
	});

	test('reports pending-send failures and disposes the transport once', async () => {
		const h = fixture({ sendWindowBytes: 1 });
		h.subscription.send(blocker);
		clock.runMicrotasks();
		for (const data of ['first', 'second', 'third']) {
			h.subscription.send(notification(data));
		}
		clock.runMicrotasks();
		h.receive({ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: Number.MAX_SAFE_INTEGER } });
		await Promise.resolve();
		clock.runMicrotasks();
		assert.deepStrictEqual({ sent: h.sent, errors: h.errors.map(error => error.message), transportDisposeCount: h.transportDisposeCount }, {
			sent: [blocker], errors: ['Invalid channel credit'], transportDisposeCount: 1,
		});
	});

	test('closes transports on receive-limit violations', () => {
		const h = fixture();
		h.receive(notification('x'.repeat(limits.maximumFrameBytes)));
		assert.deepStrictEqual({ received: h.received, errors: h.errors.map(error => error.message), transportDisposed: h.transportDisposed }, {
			received: [], errors: ['Channel receive limit exceeded'], transportDisposed: true,
		});
	});

	test('enforces the host-role state receive message limit', () => {
		const allowed = notification('allowed');
		const maximumMessageBytes = JSON.stringify(allowed).length * 2;
		const h = fixture({
			policy: { ...agentHostStateChannelPolicy, maximumReceivedMessageBytes: { host: maximumMessageBytes } },
		});
		h.receive(allowed);
		h.receive(notification('allowed!'));
		assert.deepStrictEqual({
			received: h.received,
			closeEvents: h.closeEvents.map(({ error, notifiedPeer }) => ({ message: error.message, code: error instanceof AgentHostChannelError ? error.code : undefined, notifiedPeer })),
			transportDisposeCount: h.transportDisposeCount,
		}, {
			received: [allowed],
			closeEvents: [{ message: 'Channel consumer capacity exceeded', code: AgentHostChannelErrorCode.MessageLimitExceeded, notifiedPeer: true }],
			transportDisposeCount: 1,
		});
	});

	test('rejects data before the first snapshot', async () => {
		const h = fixture({ isHost: false });
		const rejected = assert.rejects(h.subscription.nextSnapshot(), /Channel data before its snapshot/);
		h.receive(notification('early'));
		await rejected;
		assert.deepStrictEqual({ received: h.received, errors: h.errors.map(error => error.message), transportDisposeCount: h.transportDisposeCount }, {
			received: [], errors: ['Channel data before its snapshot'], transportDisposeCount: 1,
		});
	});

	test('accepts actions after resuming without a snapshot and resolves the next snapshot', async () => {
		const h = fixture({ isHost: false });
		const next = h.subscription.nextSnapshot();
		h.subscription.resumeWithoutSnapshot();
		const action = actionNotification(chatDelta('replayed'), 1);
		h.receive(action);
		const beforeSnapshot = [...h.received];
		const snapshot: IStateSnapshot = { resource: channel, state: {}, fromSeq: 2 };
		h.receive({ jsonrpc: '2.0', method: 'channel/snapshot', params: { channel, snapshot } });
		assert.deepStrictEqual({ beforeSnapshot, snapshot: await next, received: h.received, errors: h.errors, transportDisposed: h.transportDisposed }, {
			beforeSnapshot: [action], snapshot, received: [action], errors: [], transportDisposed: false,
		});
	});

	test('classifies early data and malformed snapshots', () => {
		const early = fixture({ isHost: false });
		early.receive(notification('early'));
		const malformed = fixture({ isHost: false });
		malformed.receive({ jsonrpc: '2.0', method: 'channel/snapshot', params: { channel, snapshot: {} } });
		const mismatched = fixture({ isHost: false });
		mismatched.receive({
			jsonrpc: '2.0', method: 'channel/snapshot',
			params: { channel, snapshot: { resource: 'test:/other', state: {}, fromSeq: 0 } },
		});
		assert.deepStrictEqual([early, malformed, mismatched].map(h => h.errors.map(error => error instanceof AgentHostChannelError ? error.code : undefined)), [
			[AgentHostChannelErrorCode.DataBeforeSnapshot],
			[AgentHostChannelErrorCode.InvalidSnapshot],
			[AgentHostChannelErrorCode.InvalidSnapshot],
		]);
	});

	test('delivers controls before the first snapshot', () => {
		const h = fixture({ isHost: false, policy: { maximumBufferedBytes: 1024, resetMethod: 'tcp/reset' } });
		const reset: JsonRpcNotification = { jsonrpc: '2.0', method: 'tcp/reset', params: { channel } };
		h.receive(reset);
		clock.runMicrotasks();
		h.subscription.flushCredit();
		assert.deepStrictEqual({ received: h.received, sent: h.sent, closeEvents: h.closeEvents, transportDisposeCount: h.transportDisposeCount }, {
			received: [reset], sent: [], closeEvents: [], transportDisposeCount: 0,
		});
	});

	test('accepts synchronous snapshot-data ordering and validates every snapshot', async () => {
		const validated: IStateSnapshot[] = [];
		const h = fixture({
			isHost: false,
			policy: { ...agentHostStateChannelPolicy, validateSnapshot: snapshot => { validated.push(snapshot); } },
		});
		const first: IStateSnapshot = { resource: channel, state: {}, fromSeq: 1 };
		const second: IStateSnapshot = { resource: channel, state: {}, fromSeq: 2 };
		const firstNext = h.subscription.nextSnapshot();
		h.receive({ jsonrpc: '2.0', method: 'channel/snapshot', params: { channel, snapshot: first } });
		const message = notification('after snapshot');
		h.receive(message);
		const secondNext = h.subscription.nextSnapshot();
		h.receive({ jsonrpc: '2.0', method: 'channel/snapshot', params: { channel, snapshot: second } });
		const synchronous = { validated: [...validated], received: [...h.received] };
		assert.deepStrictEqual({ synchronous, snapshots: await Promise.all([firstNext, secondNext]), errors: h.errors }, {
			synchronous: { validated: [first, second], received: [message] }, snapshots: [first, second], errors: [],
		});
	});

	for (const fragmented of [false, true]) {
		test(fragmented ? 'delivers fragmented snapshots to clients' : 'delivers snapshots to clients', async () => {
			const { host, client } = pair();
			const snapshot: IStateSnapshot = {
				resource: channel,
				state: fragmented ? {
					title: 'x'.repeat(2048), content: [],
					lifecycle: { status: TerminalLifecycleStatus.Running },
					claim: { kind: TerminalClaimKind.Client, clientId: 'client' },
				} : {},
				fromSeq: 42,
			};
			const next = client.subscription.nextSnapshot();
			const delivered = Promise.all([host.subscription.sendSnapshot(snapshot), next]);
			clock.runMicrotasks();
			const [, receivedSnapshot] = await delivered;
			client.subscription.flushCredit();
			clock.runMicrotasks();
			await host.subscription.drain();
			assert.deepStrictEqual({
				snapshot: receivedSnapshot,
				methods: [...new Set(host.sent.map(message => message.method))],
				fragmented: host.sent.length > 1,
				bounded: host.sent.every(message => JSON.stringify(message).length * 2 <= limits.maximumFrameBytes),
				accepted: client.received,
				errors: [...host.errors, ...client.errors],
			}, {
				snapshot, methods: [fragmented ? 'channel/frame' : 'channel/snapshot'],
				fragmented, bounded: true, accepted: [], errors: [],
			});
		});
	}

	test('delivers snapshots larger than the backlog and host-only message bounds', async () => {
		const { host, client } = pair({
			...agentHostStateChannelPolicy,
			maximumBufferedBytes: 128,
			maximumReceivedMessageBytes: { host: 128 },
		});
		const snapshot: IStateSnapshot = {
			resource: channel,
			state: {
				title: 'x'.repeat(2048), content: [],
				lifecycle: { status: TerminalLifecycleStatus.Running },
				claim: { kind: TerminalClaimKind.Client, clientId: 'client' },
			},
			fromSeq: 42,
		};
		const next = client.subscription.nextSnapshot();
		const delivered = Promise.all([host.subscription.sendSnapshot(snapshot), next]);
		clock.runMicrotasks();
		const [, receivedSnapshot] = await delivered;
		client.subscription.flushCredit();
		clock.runMicrotasks();
		await host.subscription.drain();
		assert.deepStrictEqual({
			snapshot: receivedSnapshot,
			fragmented: host.sent.length > 1 && host.sent.every(message => message.method === 'channel/frame'),
			accepted: client.received,
			errors: [...host.errors, ...client.errors],
			transportDisposed: host.transportDisposed || client.transportDisposed,
		}, {
			snapshot, fragmented: true, accepted: [], errors: [], transportDisposed: false,
		});
	});

	test('rejects snapshots for other resources', async () => {
		const h = fixture({ isHost: false });
		const rejected = assert.rejects(h.subscription.nextSnapshot(), /Invalid channel snapshot/);
		h.receive({
			jsonrpc: '2.0', method: 'channel/snapshot',
			params: { channel, snapshot: { resource: 'test:/other', state: {}, fromSeq: 0 } },
		});
		await rejected;
		assert.deepStrictEqual({ received: h.received, errors: h.errors.map(error => error.message), transportDisposeCount: h.transportDisposeCount }, {
			received: [], errors: ['Invalid channel snapshot'], transportDisposeCount: 1,
		});
	});

	test('rejects snapshots received by hosts', () => {
		const h = fixture();
		h.receive({
			jsonrpc: '2.0', method: 'channel/snapshot',
			params: { channel, snapshot: { resource: channel, state: {}, fromSeq: 0 } },
		});
		assert.deepStrictEqual({ received: h.received, errors: h.errors.map(error => error.message), transportDisposeCount: h.transportDisposeCount }, {
			received: [], errors: ['Invalid channel snapshot'], transportDisposeCount: 1,
		});
	});

	test('fails on synchronous snapshot validation rejection', async () => {
		const failure = new Error('Rejected snapshot state');
		const validated: IStateSnapshot[] = [];
		const h = fixture({
			isHost: false,
			policy: {
				...agentHostStateChannelPolicy,
				validateSnapshot: snapshot => {
					validated.push(snapshot);
					throw failure;
				},
			},
		});
		const snapshot: IStateSnapshot = { resource: channel, state: {}, fromSeq: 0 };
		const rejected = assert.rejects(h.subscription.nextSnapshot(), /Rejected snapshot state/);
		h.receive({ jsonrpc: '2.0', method: 'channel/snapshot', params: { channel, snapshot } });
		const synchronous = {
			validated: [...validated],
			closeEvents: h.closeEvents.map(({ error, notifiedPeer }) => ({ message: error.message, code: error instanceof AgentHostChannelError ? error.code : undefined, notifiedPeer })),
			transportDisposeCount: h.transportDisposeCount,
		};
		await rejected;
		assert.deepStrictEqual({ synchronous, received: h.received, sent: h.sent }, {
			synchronous: { validated: [snapshot], closeEvents: [{ message: failure.message, code: AgentHostChannelErrorCode.InvalidSnapshot, notifiedPeer: true }], transportDisposeCount: 1 },
			received: [], sent: [],
		});
	});

	test('rejects snapshot waiters with the failure error', async () => {
		const h = fixture({ isHost: false });
		const failure = new Error('Snapshot failed');
		const rejected = assert.rejects(h.subscription.nextSnapshot(), error => error === failure);
		h.subscription.fail(failure, false);
		await rejected;
	});

	test('cancels snapshot waiters on disposal', async () => {
		const h = fixture({ isHost: false });
		const rejected = assert.rejects(h.subscription.nextSnapshot(), CancellationError);
		h.subscription.dispose();
		await rejected;
	});

	test('cancels snapshot requests after close', async () => {
		const disposed = fixture({ isHost: false });
		const failed = fixture({ isHost: false });
		disposed.subscription.dispose();
		failed.subscription.fail(new Error('Closed'), false);
		await Promise.all([
			assert.rejects(disposed.subscription.nextSnapshot(), CancellationError),
			assert.rejects(failed.subscription.nextSnapshot(), CancellationError),
		]);
	});

	test('withholds credit until acceptance settles', async () => {
		const message = notification('pending');
		const exercise = async (reject: boolean) => {
			const accepted = new DeferredPromise<void>();
			const h = fixture({ receiveWindowBytes: 1, accept: () => accepted.p });
			h.receive(message);
			clock.runMicrotasks();
			h.subscription.flushCredit();
			const before = [...h.sent];
			if (reject) {
				await accepted.error(new Error('Acceptance rejected'));
			} else {
				await accepted.complete();
			}
			clock.runMicrotasks();
			h.subscription.flushCredit();
			return { before, received: h.received, sent: h.sent, closeEvents: h.closeEvents };
		};
		const expected = {
			before: [], received: [message],
			sent: [{ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: JSON.stringify(message).length * 2 } }],
			closeEvents: [],
		};
		assert.deepStrictEqual([await exercise(false), await exercise(true)], [expected, expected]);
	});

	test('resets peers once without closing transports', () => {
		const policy: IAgentHostChannelPolicy = { maximumBufferedBytes: 1024, resetMethod: 'tcp/reset' };
		const failure = new Error('Reset channel');
		assert.deepStrictEqual([true, false].map(isHost => {
			const h = fixture({ isHost, policy });
			h.subscription.fail(failure);
			h.subscription.fail(new Error('Already closed'));
			h.subscription.dispose();
			clock.runMicrotasks();
			return { isHost, sent: h.sent, closeEvents: h.closeEvents, transportDisposeCount: h.transportDisposeCount };
		}), [true, false].map(isHost => ({
			isHost,
			sent: (isHost ? ['tcp/reset'] : ['tcp/reset', 'unsubscribe']).map(method => ({ jsonrpc: '2.0', method, params: { channel } })),
			closeEvents: [{ error: failure, notifiedPeer: true }], transportDisposeCount: 0,
		})));
	});

	test('fails quietly when the peer already knows', () => {
		const policies: IAgentHostChannelPolicy[] = [
			agentHostStateChannelPolicy,
			{ maximumBufferedBytes: 1024, resetMethod: 'tcp/reset' },
		];
		const failure = new Error('Peer closed');
		assert.deepStrictEqual(policies.map(policy => {
			const h = fixture({ isHost: false, policy });
			h.subscription.fail(failure, false);
			h.subscription.fail(new Error('Already closed'));
			h.subscription.dispose();
			clock.runMicrotasks();
			return { sent: h.sent, closeEvents: h.closeEvents, transportDisposeCount: h.transportDisposeCount };
		}), policies.map(() => ({
			sent: [], closeEvents: [{ error: failure, notifiedPeer: false }], transportDisposeCount: 0,
		})));
	});

	test('closes transports once without a reset policy', () => {
		const h = fixture();
		const failure = new Error('Channel failed');
		h.subscription.fail(failure);
		h.subscription.fail(new Error('Already closed'), false);
		h.subscription.dispose();
		assert.deepStrictEqual({ sent: h.sent, closeEvents: h.closeEvents, transportDisposeCount: h.transportDisposeCount }, {
			sent: [], closeEvents: [{ error: failure, notifiedPeer: true }], transportDisposeCount: 1,
		});
	});

	test('handles ignored send rejections and rejects awaiting callers', async () => {
		const h = fixture({ sendWindowBytes: 1 });
		h.subscription.send(blocker);
		clock.runMicrotasks();
		const failure = new Error('Pending send failed');
		const unhandledRejections: Error[] = [];
		const onUnhandledRejection = (error: Error) => unhandledRejections.push(error);
		const onBrowserUnhandledRejection = (event: PromiseRejectionEvent) => onUnhandledRejection(event.reason);
		if (isWeb) {
			globalThis.addEventListener('unhandledrejection', onBrowserUnhandledRejection);
		} else {
			process.on('unhandledRejection', onUnhandledRejection);
		}
		const listeners = store.add(toDisposable(() => {
			if (isWeb) {
				globalThis.removeEventListener('unhandledrejection', onBrowserUnhandledRejection);
			} else {
				process.off('unhandledRejection', onUnhandledRejection);
			}
		}));
		try {
			void h.subscription.send(notification('ignored'));
			const rejected = assert.rejects(h.subscription.send(notification('awaited')), error => error === failure);
			h.subscription.fail(failure, false);
			await rejected;
			clock.runMicrotasks();
			clock.restore();
			await timeout(0);
			assert.deepStrictEqual({ unhandledRejections, sent: h.sent, closeEvents: h.closeEvents, transportDisposeCount: h.transportDisposeCount }, {
				unhandledRejections: [], sent: [blocker], closeEvents: [{ error: failure, notifiedPeer: false }], transportDisposeCount: 0,
			});
		} finally {
			listeners.dispose();
		}
	});
});

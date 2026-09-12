/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { mock } from '../../../../base/test/common/mock.js';
import { NullLogService } from '../../../log/common/log.js';
import { isBoundedCanvasJson, isInlineCanvasSchema, validateCanvasActions, validateCanvasRequest } from '../../common/agentHostCanvasValidation.js';
import { CANVAS_EXTERNAL_RUNTIME_MESSAGE_ORIGIN, type IAgentCanvasInstance } from '../../common/agentHostCanvases.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, type CanvasIdentityKey } from '../../common/state/protocol/channels-canvas/state.js';
import type { IAgentHostChatContributionContext } from '../../common/agentHostChatContributionsService.js';
import type { OpenCanvasParams } from '../../common/state/protocol/channels-canvas/commands.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, MessageAttachmentKind, MessageKind, TurnState, type Turn } from '../../common/state/sessionState.js';
import { CanvasStateSubscription } from '../../common/state/agentSubscription.js';
import { AgentHostCanvasApproval } from '../../node/agentHostCanvasApproval.js';
import { AgentHostCanvasOperationLedger, CanvasOperationIndeterminateError } from '../../node/agentHostCanvasOperationLedger.js';
import { validateCanvasInput } from '../../node/agentHostCanvasSchema.js';
import { CanvasesContribution } from '../../node/chatContributions/canvases/canvasesContribution.js';
import { createSessionDataService } from '../common/sessionTestHelpers.js';
import { canvasChat, canvasIdentity, canvasSession, createCanvasServices, createCanvasSession } from './agentHostCanvasTestUtils.js';
import { isCanvasSessionRetained } from '../../common/meta/agentCanvasSessionMeta.js';

const openParams: OpenCanvasParams = { channel: canvasSession, canvas: 'ahp-canvas:/test', identity: canvasIdentity, title: 'Counter', requestId: 'open' };
const invalidParams = (error: unknown) => error instanceof ProtocolError && error.code === JsonRpcErrorCodes.InvalidParams;
const conflict = (error: unknown) => error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict;
const denied = (error: unknown) => error instanceof ProtocolError && error.code === AhpErrorCodes.PermissionDenied;

suite('Agent Host canvas validation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('JSON bounds reject getters, cycles, holes, non-JSON values and oversized UTF-16', () => {
		let getterRead = false;
		const cycle: { child?: object } = {};
		cycle.child = cycle;
		const values: unknown[] = [undefined, NaN, Infinity, BigInt(1), () => { }, new Date(), new Array(1), cycle,
			Object.defineProperty({}, 'value', { enumerable: true, get: () => { getterRead = true; return 1; } }), '😀'.repeat(32768)];
		assert.deepStrictEqual({ accepted: values.map(value => isBoundedCanvasJson(value)), getterRead }, { accepted: values.map(() => false), getterRead: false });
		assert.strictEqual(isBoundedCanvasJson({ value: 'a'.repeat(65524) }), true);
	});

	test('inline schemas enforce property, action, combinator and reference depth bounds', () => {
		const properties = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`p${index}`, { type: 'string' }]));
		let schema: object = { type: 'object' };
		for (let index = 0; index < 4; index++) {
			schema = { type: 'object', allOf: [schema] };
		}
		assert.deepStrictEqual([
			isInlineCanvasSchema({ type: 'object', properties }),
			isInlineCanvasSchema({ type: 'object', properties: { ...properties, extra: {} } }),
			isInlineCanvasSchema(schema),
			isInlineCanvasSchema({ type: 'object', $ref: '#/$defs/cycle', $defs: { cycle: { $ref: '#/$defs/cycle' } } }),
		], [true, false, false, false]);
		assert.throws(() => validateCanvasActions(Array.from({ length: 65 }, (_, index) => ({ id: `${index}` }))), invalidParams);
		assert.throws(() => validateCanvasActions([{ id: 'a' }, { id: 'a' }]), invalidParams);
	});

	test('commands bind exact owning chat and reject oversized or malformed parameters', () => {
		assert.throws(() => validateCanvasRequest('openCanvas', { ...openParams, channel: 'copilot:/other' }), invalidParams);
		assert.throws(() => validateCanvasRequest('openCanvas', { ...openParams, identity: { ...canvasIdentity, chat: 'not a chat' } }), invalidParams);
		assert.throws(() => validateCanvasRequest('openCanvas', { ...openParams, requestId: 'x'.repeat(257) }), invalidParams);
		assert.throws(() => validateCanvasRequest('closeCanvas', { channel: openParams.canvas, revision: Infinity, requestId: 'close' }), invalidParams);
		assert.throws(() => validateCanvasRequest('invokeCanvasAction', { channel: openParams.canvas, actionId: 'a', incarnation: 'i', requestId: 'action', input: { value: undefined } }), invalidParams);
	});

	test('schema validation is non-transforming and supports Unicode, tuples, refs and exact decimals', () => {
		const input = { word: '😀', amount: 0.3, tuple: ['x', 2], requiredOnly: true };
		validateCanvasInput({
			type: 'object', additionalProperties: true, required: ['word', 'amount', 'requiredOnly'],
			$defs: { word: { type: 'string', minLength: 1, maxLength: 1 } },
			properties: {
				word: { $ref: '#/$defs/word' }, amount: { type: 'number', multipleOf: 0.1 },
				tuple: { type: 'array', prefixItems: [{ type: 'string' }, { type: 'integer' }], items: false },
				notSupplied: { type: 'string', default: 'not inserted' },
			},
		}, input);
		assert.deepStrictEqual(input, { word: '😀', amount: 0.3, tuple: ['x', 2], requiredOnly: true });
	});

	test('schema assertions are conjoined and malformed or unsupported schemas fail explicitly', () => {
		for (const [schema, input] of [
			[{ enum: [1, 2], const: 3 }, 1],
			[{ type: 'number', multipleOf: 0.1 }, 0.31],
			[{ type: 'number', minimum: 'bad' }, 4],
			[{ type: 'number', multipleOf: 0 }, 4],
			[{ type: 'string', pattern: '.*' }, 'x'],
			[{ $ref: 'https://untrusted.example/schema' }, {}],
			[{ $defs: { node: { $ref: '#/$defs/node' } }, $ref: '#/$defs/node' }, {}],
			[{ type: 'object', required: ['missing'], properties: { missing: { default: 'not admitted', type: 'string' } } }, {}],
			[{ oneOf: [{ type: 'number' }, { minimum: 1 }] }, 4],
		] as const) {
			assert.throws(() => validateCanvasInput(schema, input), invalidParams);
		}
	});
});

suite('Agent Host canvas retry ledger', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('same request bytes deduplicate success and failure; new IDs execute again', async () => {
		const ledger = store.add(new AgentHostCanvasOperationLedger<number>());
		let calls = 0;
		const gate = new DeferredPromise<number>();
		const first = ledger.execute('one', { input: 1 }, async operation => { operation.willExecute(); calls++; return gate.p; });
		const retry = ledger.execute('one', { input: 1 }, async () => { calls++; return 2; });
		assert.strictEqual(first, retry);
		assert.throws(() => ledger.execute('one', { input: 2 }, async () => 0), conflict);
		await gate.complete(1);
		const next = await ledger.execute('two', { input: 1 }, async () => ++calls);
		assert.deepStrictEqual([await first, await retry, calls, next], [1, 1, 2, 2]);
	});

	test('capacity never evicts pending requests, expiry permits new work', async () => {
		let now = 0;
		const ledger = store.add(new AgentHostCanvasOperationLedger<number>(1, 10, () => now));
		const gate = new DeferredPromise<number>();
		const first = ledger.execute('one', {}, async () => gate.p);
		now = 100;
		assert.throws(() => ledger.execute('two', {}, async () => 2), conflict);
		await gate.complete(1);
		await first;
		now += 10;
		assert.strictEqual(await ledger.execute('two', {}, async () => 2), 2);
	});

	test('timeout and disconnect are indeterminate after dispatch, never automatic retries', async () => {
		await runWithFakedTimers({}, async () => {
			const ledger = store.add(new AgentHostCanvasOperationLedger(2, 100, Date.now, 10));
			let calls = 0;
			const run = () => ledger.execute('one', {}, async operation => {
				operation.willExecute();
				calls++;
				await new Promise<void>(() => { });
			});
			await assert.rejects(run(), CanvasOperationIndeterminateError);
			await assert.rejects(run(), CanvasOperationIndeterminateError);
			assert.strictEqual(calls, 1);
		});
		const ledger = store.add(new AgentHostCanvasOperationLedger());
		const pending = ledger.execute('late', {}, async operation => { operation.willExecute(); await new Promise<void>(() => { }); });
		const result = assert.rejects(pending, CanvasOperationIndeterminateError);
		ledger.dispose();
		await result;
	});
});

suite('Agent Host canvas initialization', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('identity-free initialization deduplicates effects and retains an empty session without a turn', async () => {
		const f = createCanvasServices(store);
		createCanvasSession(f.state);
		f.facet.initialized = false;
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		let launches = 0;
		f.facet.onInitialize = async (chat, operation) => {
			assert.strictEqual(operation.clientId, 'owner');
			launches++;
			await f.service.retainChat(chat, operation.token);
			await entered.complete();
			await release.p;
		};
		const connection = store.add(f.service.connect('owner'));
		const params = { channel: canvasChat, requestId: 'initialize' };
		assert.deepStrictEqual(await connection.listCanvasTypes({ channel: canvasChat }), { types: [] });
		const first = connection.initializeCanvasChat(params);
		const retry = connection.initializeCanvasChat(params);
		await entered.p;
		assert.strictEqual(f.service.holdsSession(canvasSession), true);
		await release.complete();
		await Promise.all([first, retry]);
		await connection.initializeCanvasChat({ ...params, requestId: 'ensure-again' });
		connection.dispose();
		const state = f.state.getSessionState(canvasSession)!;
		assert.deepStrictEqual({
			launches, retained: isCanvasSessionRetained(state), unused: f.state.isUnusedDraft(canvasSession),
			active: state.activeTurn, turns: state.turns, members: f.state.getChatCanvasStates(canvasChat), held: f.service.holdsSession(canvasSession),
			reloaded: await f.service.loadChat(canvasChat),
		}, { launches: 1, retained: true, unused: false, active: undefined, turns: [], members: [], held: false, reloaded: [] });
	});

	test('cancellation remains indeterminate after initialization starts and never retries the same request', async () => {
		const f = createCanvasServices(store);
		createCanvasSession(f.state);
		f.facet.initialized = false;
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		f.facet.onInitialize = async () => { await entered.complete(); await release.p; };
		const connection = store.add(f.service.connect('owner'));
		const params = { channel: canvasChat, requestId: 'cancel' };
		const first = connection.initializeCanvasChat(params);
		await entered.p;
		assert.throws(() => connection.cancelCanvasChatInitialization({ ...params, channel: buildChatUri(canvasSession, 'wrong-chat') }), conflict);
		assert.strictEqual(f.service.getChatInitialization(canvasChat)?.token.isCancellationRequested, false);
		const rejected = assert.rejects(first, CanvasOperationIndeterminateError);
		connection.cancelCanvasChatInitialization(params);
		await rejected;
		await assert.rejects(connection.initializeCanvasChat(params), CanvasOperationIndeterminateError);
		await release.complete();
		await timeout(0);
		assert.deepStrictEqual({
			calls: f.facet.calls, snapshot: f.facet.getSnapshot(canvasChat),
			initializing: f.service.isChatInitializing(canvasChat), held: f.service.holdsSession(canvasSession),
			turns: f.state.getChatState(canvasChat)?.turns, members: f.state.getChatCanvasStates(canvasChat),
		}, { calls: ['initialize'], snapshot: undefined, initializing: false, held: false, turns: [], members: [] });
	});

	for (const cancellation of ['dispose', 'disconnect', 'delete'] as const) {
		test(`pending-chat ${cancellation} invalidates its exact creator and late callbacks`, async () => {
			const f = createCanvasServices(store);
			const connection = store.add(f.service.connect('owner'));
			const lease = store.add(connection.beginChatCreation(canvasChat));
			const generation = f.state.getChatGeneration(canvasChat);
			f.facet.publish({ ...f.facet.snapshot, instances: [f.facet.instance()] });
			assert.deepStrictEqual([f.state.getSnapshot(canvasChat), f.state.getSessionState(canvasSession)], [undefined, undefined]);
			if (cancellation === 'dispose') {
				lease.dispose();
			} else if (cancellation === 'disconnect') {
				connection.dispose();
			} else {
				f.service.cancelSessionInitialization(canvasSession);
			}
			assert.throws(() => lease.willExecute(), /Canceled/);
			lease.dispose();
			f.facet.publish({ ...f.facet.snapshot, instances: [f.facet.instance()] });
			createCanvasSession(f.state);
			await timeout(0);
			assert.deepStrictEqual({
				replaced: generation !== f.state.getChatGeneration(canvasChat),
				members: f.state.getChatCanvasStates(canvasChat), held: f.service.holdsSession(canvasSession),
			}, { replaced: true, members: [], held: false });
		});
	}

	test('pending peer registration transfers its exact state generation without advertising a ready chat first', async () => {
		const f = createCanvasServices(store);
		createCanvasSession(f.state);
		const peer = buildChatUri(canvasSession, 'pending-peer');
		const connection = store.add(f.service.connect('creator'));
		const lease = store.add(connection.beginChatCreation(peer));
		const generation = f.state.getChatGeneration(peer);
		f.state.dispatchServerAction(peer, {
			type: ActionType.ChatTurnStarted, turnId: 'native-message', startedAt: '2026-01-01T00:00:00Z',
			message: { text: 'Genuine native input', origin: { kind: MessageKind.Tool } },
		});
		assert.strictEqual(f.state.getSessionState(canvasSession)?.chats.some(chat => chat.resource === peer), false);
		f.state.addChat(canvasSession, peer);
		lease.commit();
		lease.dispose();
		assert.deepStrictEqual({
			generationPreserved: f.state.getChatGeneration(peer) === generation,
			active: f.state.getSnapshot(peer)?.state,
		}, { generationPreserved: true, active: f.state.getChatState(peer) });
		assert.strictEqual(f.state.getActiveTurnId(peer), 'native-message');
	});

	test('a late initializer cannot commit onto a replacement chat with the same URI', async () => {
		const f = createCanvasServices(store);
		createCanvasSession(f.state);
		const peer = buildChatUri(canvasSession, 'peer');
		f.state.addChat(canvasSession, peer);
		const lease = store.add(f.service.beginChatCreation(peer));
		f.state.removeChat(canvasSession, peer);
		f.state.addChat(canvasSession, peer);
		assert.throws(() => lease.commit(), /Canceled/);
		assert.throws(() => lease.willExecute(), /Canceled/);
	});

	test('lazy peer initialization ingests pre-return events and merges restored history without duplicates', async () => {
		const f = createCanvasServices(store);
		createCanvasSession(f.state);
		const peer = buildChatUri(canvasSession, 'restored-peer');
		let historyReads = 0;
		const native: Turn = { id: 'native', state: TurnState.Complete, message: { text: 'Native', origin: { kind: MessageKind.Tool } }, responseParts: [], usage: undefined };
		f.state.registerRestoredChatSummary(canvasSession, peer, {
			draft: { text: 'Preserved draft', origin: { kind: MessageKind.User } },
			resolver: async () => {
				historyReads++;
				return { turns: [{ ...native, id: 'old', message: { text: 'Old', origin: { kind: MessageKind.User } } }, native] };
			},
		});
		const generation = f.state.getChatGeneration(peer);
		f.facet.snapshot = { ...f.facet.snapshot, chat: peer };
		f.facet.initialized = false;
		f.facet.onInitialize = async chat => {
			assert.strictEqual(f.state.getSnapshot(chat), undefined);
			f.state.dispatchServerAction(chat, { type: ActionType.ChatTurnStarted, turnId: native.id, startedAt: '2026-01-01T00:00:00Z', message: native.message });
			f.state.dispatchServerAction(chat, { type: ActionType.ChatTurnComplete, turnId: native.id, duration: 0 });
		};
		const connection = store.add(f.service.connect('owner'));
		assert.deepStrictEqual([await connection.listCanvasTypes({ channel: peer }), historyReads], [{ types: [] }, 0]);
		await connection.initializeCanvasChat({ channel: peer, requestId: 'initialize' });
		assert.deepStrictEqual({
			ids: f.state.getChatState(peer)?.turns.map(turn => turn.id), historyReads,
			draft: f.state.getChatState(peer)?.draft?.text, generation: f.state.getChatGeneration(peer),
		}, { ids: ['old', 'native'], historyReads: 1, draft: 'Preserved draft', generation });
	});
});

suite('Agent Host canvas coordinator', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let fixture: ReturnType<typeof createCanvasServices>;

	setup(() => {
		fixture = createCanvasServices(store);
		createCanvasSession(fixture.state);
	});

	test('catalogue browsing and subscriptions never prepare or admit providers', async () => {
		const connection = store.add(fixture.service.connect('client'));
		assert.strictEqual((await connection.listCanvasTypes({ channel: canvasChat })).types.length, 1);
		assert.throws(() => connection.snapshot(openParams.canvas));
		assert.deepStrictEqual({ calls: fixture.facet.calls, members: fixture.state.getChatCanvasStates(canvasChat) }, { calls: [], members: [] });
	});

	test('open and native observation publish one membership, retries do not repeat open', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const first = await connection.openCanvas(openParams);
		const retry = await connection.openCanvas(openParams);
		await connection.openCanvas({ ...openParams, requestId: 'new-id', canvas: 'ahp-canvas:/ignored' });
		await timeout(0);
		assert.deepStrictEqual({
			sameResult: first.canvas.resource === retry.canvas.resource,
			resources: fixture.state.getChatCanvasStates(canvasChat).map(state => state.resource),
			opens: fixture.facet.calls.filter(call => call === 'open').length,
			draft: fixture.state.isUnusedDraft(canvasSession),
		}, { sameResult: true, resources: [openParams.canvas], opens: 2, draft: false });
	});

	test('native-open ingestion is already executed, not a second provider open', async () => {
		fixture.facet.publish({ ...fixture.facet.snapshot, instances: [fixture.facet.instance()] });
		await timeout(0);
		assert.deepStrictEqual({
			members: fixture.state.getChatCanvasStates(canvasChat).map(state => state.identity.instanceId),
			calls: fixture.facet.calls,
		}, { members: ['main'], calls: [] });
		fixture.facet.publish({ ...fixture.facet.snapshot, instances: [], closed: [canvasIdentity] });
		await timeout(0);
		assert.deepStrictEqual(fixture.state.getChatCanvasStates(canvasChat), []);
	});

	test('canonical identity remains source-qualified; native chat-wide namespaces are opt-in', async () => {
		const other: CanvasIdentityKey = { ...canvasIdentity, source: { kind: CanvasSourceKind.Extension, extensionId: 'user:other' } };
		fixture.facet.publish({
			...fixture.facet.snapshot,
			types: [...fixture.facet.snapshot.types, { source: other.source, canvasType: other.canvasType, title: 'Other' }],
			instances: [fixture.facet.instance(), fixture.facet.instance(other)],
		});
		await timeout(0);
		assert.deepStrictEqual([fixture.state.getChatCanvasStates(canvasChat).length, (await fixture.service.loadChat(canvasChat)).length], [2, 2]);
		fixture.facet.instanceIdScope = 'chat';
		const connection = store.add(fixture.service.connect('client'));
		await assert.rejects(connection.openCanvas(openParams), conflict);
		assert.deepStrictEqual(fixture.facet.calls, []);
	});

	test('an explicit native close frees its ID even when a replacement snapshot coalesces the events', async () => {
		fixture.facet.instanceIdScope = 'chat';
		fixture.facet.publish({ ...fixture.facet.snapshot, instances: [fixture.facet.instance()] });
		await timeout(0);
		const replacement = { ...canvasIdentity, canvasType: 'replacement' };
		fixture.facet.publish({
			...fixture.facet.snapshot, closed: [canvasIdentity],
			types: [{ source: replacement.source, canvasType: replacement.canvasType, title: 'Replacement' }],
			instances: [fixture.facet.instance(replacement)],
		});
		await timeout(0);
		assert.deepStrictEqual(fixture.state.getChatCanvasStates(canvasChat).map(state => state.identity.canvasType), ['replacement']);
	});

	test('membership limits are checked for the whole observation before any new entry is installed', async () => {
		fixture.facet.publish({ ...fixture.facet.snapshot, instances: Array.from({ length: 63 }, (_, index) => fixture.facet.instance({ ...canvasIdentity, instanceId: `existing-${index}` })) });
		await timeout(0);
		fixture.facet.publish({ ...fixture.facet.snapshot, instances: ['new-one', 'new-two'].map(instanceId => fixture.facet.instance({ ...canvasIdentity, instanceId })) });
		await timeout(0);
		const states = fixture.state.getChatCanvasStates(canvasChat);
		assert.deepStrictEqual([states.length, states.some(state => state.identity.instanceId.startsWith('new-')), states.every(state => state.availability.status === CanvasAvailabilityStatus.Failed)], [63, false, true]);
	});

	test('logical close cannot be undone by a still-live, untrusted snapshot', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const { canvas } = await connection.openCanvas(openParams);
		fixture.facet.trust = { status: CanvasTrustStatus.Pending };
		await connection.closeCanvas({ channel: canvas.resource, revision: canvas.revision, requestId: 'close' });
		fixture.facet.trust = { status: CanvasTrustStatus.Trusted };
		fixture.facet.publish({ ...fixture.facet.snapshot });
		await timeout(0);
		assert.deepStrictEqual(fixture.state.getChatCanvasStates(canvasChat), []);
		fixture.facet.publish({ ...fixture.facet.snapshot, instances: [{ ...fixture.facet.instance(), generation: 'replacement' }] });
		await timeout(0);
		assert.deepStrictEqual([fixture.state.getChatCanvasStates(canvasChat).length, fixture.facet.calls], [1, ['prepare', 'open']]);
	});

	test('durable state remains browsable and logically closable after its provider is removed', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const { canvas } = await connection.openCanvas(openParams);
		fixture.providers.dispose();
		const current = fixture.state.getCanvasState(canvas.resource)!;
		assert.deepStrictEqual({
			status: current.availability.status,
			snapshot: connection.snapshot(canvas.resource).resource,
			types: (await connection.listCanvasTypes({ channel: canvasChat })).types,
			source: (await connection.resolveCanvasSource({ channel: canvas.resource })).source,
		}, { status: CanvasAvailabilityStatus.NotLoaded, snapshot: canvas.resource, types: [], source: undefined });
		await connection.closeCanvas({ channel: canvas.resource, revision: current.revision, requestId: 'close' });
		assert.deepStrictEqual(await fixture.service.loadChat(canvasChat), []);
	});

	test('early attachments wait for their exact chat and can be discarded with a failed backing', async () => {
		const peer = buildChatUri(canvasSession, 'pending-peer');
		const attachment = { type: MessageAttachmentKind.Simple, label: 'Native', modelRepresentation: 'Captured state' } as const;
		fixture.service.appendAttachments(peer, [attachment]);
		assert.strictEqual(fixture.state.getChatState(canvasChat)?.draft, undefined);
		fixture.state.addChat(canvasSession, peer, { title: 'Peer' });
		assert.deepStrictEqual(fixture.state.getChatState(peer)?.draft?.attachments, [attachment]);
		const discarded = buildChatUri(canvasSession, 'discarded-peer');
		fixture.service.appendAttachments(discarded, [attachment]);
		fixture.service.discardPendingAttachments(discarded);
		fixture.state.addChat(canvasSession, discarded, { title: 'Discarded' });
		assert.deepStrictEqual([fixture.state.getChatState(discarded)?.draft, fixture.facet.calls], [undefined, []]);
	});

	test('early observations expire rather than resurrecting an abandoned chat', async () => {
		await runWithFakedTimers({}, async () => {
			for (const expired of [false, true]) {
				const early = createCanvasServices(store);
				const initialization = store.add(early.service.beginChatCreation(canvasChat));
				early.facet.publish({ ...early.facet.snapshot, instances: [early.facet.instance()] });
				if (expired) {
					await timeout(120_001);
				}
				createCanvasSession(early.state);
				if (!expired) {
					initialization.commit();
				}
				await timeout(0);
				assert.deepStrictEqual([early.state.getChatCanvasStates(canvasChat).length, early.facet.calls], [expired ? 0 : 1, []]);
			}
		});
	});

	test('lifecycle hydration preserves recorded native provenance without touching a provider', async () => {
		await fixture.database.setTurnMessageOrigin('host-turn', CANVAS_EXTERNAL_RUNTIME_MESSAGE_ORIGIN);
		await fixture.database.setTurnEventId('host-turn', 'sdk-native');
		const contribution = store.add(new CanvasesContribution(new class extends mock<IAgentHostChatContributionContext>() { }(), fixture.service, new NullLogService(), createSessionDataService(fixture.database), fixture.state));
		const turns: Turn[] = ['sdk-native', 'ordinary-user'].map(id => ({ id, message: { text: id, origin: { kind: MessageKind.User } }, responseParts: [], state: TurnState.Complete, usage: undefined }));
		const restored = await contribution.onHydrateTurns({ session: canvasSession, chat: canvasChat }, turns);
		assert.deepStrictEqual([restored.map(turn => turn.message.origin.kind), restored[0].message._meta?.copilotOrigin, fixture.facet.calls], [[MessageKind.Tool, MessageKind.User], CANVAS_EXTERNAL_RUNTIME_MESSAGE_ORIGIN, []]);
	});

	test('live action declarations, not catalogue previews, authorize invocation', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const { canvas } = await connection.openCanvas(openParams);
		const params = { channel: canvas.resource, incarnation: canvas.identity.incarnation, requestId: 'action', actionId: 'increment' };
		await assert.rejects(connection.invokeCanvasAction({ ...params, requestId: 'preview', actionId: 'preview-only' }));
		assert.deepStrictEqual(await connection.invokeCanvasAction(params), { result: { count: 1 } });
	});

	test('action declarations are rechecked after asynchronous schema validation', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const { canvas } = await connection.openCanvas(openParams);
		const instance: IAgentCanvasInstance = { ...fixture.facet.instance(), availability: { status: CanvasAvailabilityStatus.Ready, actions: [{ id: 'increment', inputSchema: { type: 'object' } }] } };
		fixture.facet.publish({ ...fixture.facet.snapshot, instances: [instance] });
		await timeout(0);
		fixture.facet.beforeValidate = () => fixture.facet.publish({ ...fixture.facet.snapshot, instances: [fixture.facet.instance({ ...canvasIdentity })].map(instance => ({ ...instance, availability: { status: CanvasAvailabilityStatus.Ready, actions: [] } })) });
		await assert.rejects(connection.invokeCanvasAction({ channel: canvas.resource, incarnation: canvas.identity.incarnation, requestId: 'action', actionId: 'increment', input: {} }), conflict);
		assert.strictEqual(fixture.facet.calls.includes('invoke'), false);
	});

	test('source pulls are fresh, independently authorized, and never persisted', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const { canvas } = await connection.openCanvas(openParams);
		const first = await connection.resolveCanvasSource({ channel: canvas.resource });
		fixture.facet.resolveResult = { url: 'http://127.0.0.1:8123/canvas?ephemeral=renewed' };
		const second = await connection.resolveCanvasSource({ channel: canvas.resource });
		fixture.facet.trust = { status: CanvasTrustStatus.Blocked };
		await assert.rejects(connection.resolveCanvasSource({ channel: canvas.resource }), denied);
		assert.deepStrictEqual({
			refreshed: first.source?.url !== second.source?.url,
			sameRevision: first.revision === second.revision,
			persistedEndpoint: fixture.database.setMetadataCalls.some(call => call.value.includes('ephemeral') || call.value.includes('incarnation')),
			pulls: fixture.facet.calls.filter(call => call.startsWith('resolve:')),
		}, { refreshed: true, sameRevision: true, persistedEndpoint: false, pulls: ['resolve:client', 'resolve:client'] });
	});

	test('superseded pulls lose presentation authority and restart invalidates stale preconditions', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const { canvas } = await connection.openCanvas(openParams);
		const gate = new DeferredPromise<{ url: string }>();
		fixture.facet.resolveGate = gate.p;
		const pull = connection.resolveCanvasSource({ channel: canvas.resource });
		await connection.restartCanvasProvider({ channel: canvas.resource, incarnation: canvas.identity.incarnation, requestId: 'restart' });
		await gate.complete({ url: 'http://127.0.0.1:8123/stale' });
		assert.strictEqual((await pull).source, undefined);
		await assert.rejects(connection.invokeCanvasAction({ channel: canvas.resource, incarnation: canvas.identity.incarnation, requestId: 'stale-action', actionId: 'increment' }), conflict);
		await assert.rejects(connection.closeCanvas({ channel: canvas.resource, revision: canvas.revision, requestId: 'stale-close' }), conflict);
	});

	test('close removes membership, preserves retained session data and tolerates unknown resources', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const { canvas } = await connection.openCanvas(openParams);
		const current = fixture.state.getCanvasState(canvas.resource)!;
		await connection.closeCanvas({ channel: canvas.resource, revision: current.revision, requestId: 'close' });
		await connection.closeCanvas({ channel: canvas.resource, revision: 0, requestId: 'close-unknown' });
		assert.deepStrictEqual({ members: fixture.state.getChatCanvasStates(canvasChat), sessionRetained: fixture.state.isUnusedDraft(canvasSession) }, { members: [], sessionRetained: false });
	});

	test('connection disposal releases bounded operation residency and reports uncertainty', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const { canvas } = await connection.openCanvas(openParams);
		fixture.facet.invokeGate = new Promise<void>(() => { });
		const pending = connection.invokeCanvasAction({ channel: canvas.resource, incarnation: canvas.identity.incarnation, requestId: 'long', actionId: 'increment' });
		await timeout(0);
		assert.strictEqual(fixture.service.holdsSession(canvasSession), true);
		const rejected = assert.rejects(pending, CanvasOperationIndeterminateError);
		connection.dispose();
		await rejected;
		await timeout(0);
		assert.strictEqual(fixture.service.holdsSession(canvasSession), false);
	});

	test('restoration is metadata-only, with fresh incarnation and bounded identity', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const { canvas } = await connection.openCanvas(openParams);
		const calls = fixture.facet.calls.slice();
		const restored = await fixture.service.loadChat(canvasChat);
		assert.deepStrictEqual({
			identities: restored.map(state => ({ ...state.identity, incarnation: 'fresh' })),
			fresh: restored[0].identity.incarnation !== canvas.identity.incarnation,
			revisionIncreased: restored[0].revision > canvas.revision,
			availability: restored[0].availability,
			trust: restored[0].trust,
			calls: fixture.facet.calls,
		}, {
			identities: [{ ...canvasIdentity, incarnation: 'fresh' }], fresh: true, revisionIncreased: true,
			availability: { status: CanvasAvailabilityStatus.NotLoaded }, trust: { status: CanvasTrustStatus.Pending }, calls,
		});
	});

	test('bad schema references and oversized results never lead to silent retries', async () => {
		const connection = store.add(fixture.service.connect('client'));
		fixture.facet.snapshot = { ...fixture.facet.snapshot, types: [{ ...fixture.facet.snapshot.types[0], openInputSchemaRef: 'ahp-canvas-schema:/missing' }] };
		await assert.rejects(connection.openCanvas(openParams), invalidParams);
		fixture.facet.schemaReference = { type: 'object' };
		const { canvas } = await connection.openCanvas({ ...openParams, requestId: 'with-schema' });
		fixture.facet.invokeResult = 'x'.repeat(65536);
		const params = { channel: canvas.resource, incarnation: canvas.identity.incarnation, requestId: 'large-result', actionId: 'increment' };
		await assert.rejects(connection.invokeCanvasAction(params), CanvasOperationIndeterminateError);
		await assert.rejects(connection.invokeCanvasAction(params), CanvasOperationIndeterminateError);
		assert.strictEqual(fixture.facet.calls.filter(call => call === 'invoke').length, 1);
	});

	test('native observations bind exact chat and reject an entire colliding snapshot', async () => {
		const wrong = fixture.facet.instance({ ...canvasIdentity, chat: buildChatUri(canvasSession, 'peer') });
		fixture.facet.publish({ ...fixture.facet.snapshot, instances: [fixture.facet.instance(), wrong] });
		await timeout(0);
		assert.deepStrictEqual(fixture.state.getChatCanvasStates(canvasChat), []);
	});

	test('canvas state subscriptions reduce host actions without optimistic effect replay', async () => {
		const connection = store.add(fixture.service.connect('client'));
		const { canvas } = await connection.openCanvas(openParams);
		const subscription = store.add(new CanvasStateSubscription(canvas.resource, 'client', () => { }));
		const initial = fixture.state.getCanvasState(canvas.resource)!;
		const fromSeq = fixture.state.serverSeq;
		store.add(fixture.state.onDidEmitEnvelope(envelope => subscription.receiveEnvelope(envelope)));
		fixture.state.dispatchServerAction(canvas.resource, { type: ActionType.CanvasTitleChanged, title: 'Changed', revision: canvas.revision + 1 });
		subscription.handleSnapshot(initial, fromSeq);
		assert.strictEqual(subscription.verifiedValue?.title, 'Changed');
	});
});

suite('Agent Host out-of-turn canvas approval', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('real client denial outside any model turn cannot be answered by autopilot', async () => {
		const fixture = createCanvasServices(store);
		createCanvasSession(fixture.state);
		const calls: string[] = [];
		store.add(fixture.connections.registerSource({
			hasSeenClient: () => true, isClientConnected: () => true,
			getConnectedClientTransportCounts: () => new Map([['client', 1]]), getSubscribedClients: () => ['client'],
			requestWorkspaceTrust: async () => true,
			requestCanvasApproval: async (_client, request) => { calls.push(request.chat); return false; },
		}));
		const approval = store.add(new AgentHostCanvasApproval(fixture.state, fixture.connections));
		assert.deepStrictEqual({ approved: await approval.request(canvasChat, 'Admit source?', CancellationToken.None), turn: fixture.state.getChatState(canvasChat)?.activeTurn, calls }, { approved: false, turn: undefined, calls: [canvasChat] });
	});

	test('cancelled, late, ambiguous-client and headless grants fail closed', async () => {
		const fixture = createCanvasServices(store);
		createCanvasSession(fixture.state);
		const gate = new DeferredPromise<boolean>();
		store.add(fixture.connections.registerSource({
			hasSeenClient: () => true, isClientConnected: () => true,
			getConnectedClientTransportCounts: () => new Map([['client', 1], ['other', 1]]), getSubscribedClients: () => ['client', 'other'],
			requestWorkspaceTrust: async () => true, requestCanvasApproval: async () => gate.p,
		}));
		const approval = store.add(new AgentHostCanvasApproval(fixture.state, fixture.connections));
		assert.strictEqual(await approval.request(canvasChat, 'Ambiguous', CancellationToken.None), false);
		const cancellation = store.add(new CancellationTokenSource());
		const pending = approval.request(canvasChat, 'Exact client', cancellation.token, 'client');
		cancellation.cancel();
		await gate.complete(true);
		assert.strictEqual(await pending, false);
	});

	test('source prompts time out without executing or creating a turn', async () => {
		await runWithFakedTimers({}, async () => {
			const fixture = createCanvasServices(store);
			createCanvasSession(fixture.state);
			store.add(fixture.connections.registerSource({
				hasSeenClient: () => true, isClientConnected: () => true,
				getConnectedClientTransportCounts: () => new Map([['client', 1]]), getSubscribedClients: () => ['client'],
				requestWorkspaceTrust: async () => true, requestCanvasApproval: async () => new Promise<boolean>(() => { }),
			}));
			const approval = store.add(new AgentHostCanvasApproval(fixture.state, fixture.connections));
			assert.strictEqual(await approval.request(canvasChat, 'Wait for a real person', CancellationToken.None), false);
		});
	});

	test('a grant arriving after its exact peer chat is removed is denied', async () => {
		const fixture = createCanvasServices(store);
		createCanvasSession(fixture.state);
		const peer = buildChatUri(canvasSession, 'removed-peer');
		fixture.state.addChat(canvasSession, peer, { title: 'Peer' });
		const gate = new DeferredPromise<boolean>();
		store.add(fixture.connections.registerSource({
			hasSeenClient: () => true, isClientConnected: () => true,
			getConnectedClientTransportCounts: () => new Map([['client', 1]]), getSubscribedClients: () => ['client'],
			requestWorkspaceTrust: async () => true, requestCanvasApproval: async () => gate.p,
		}));
		const approval = store.add(new AgentHostCanvasApproval(fixture.state, fixture.connections));
		const pending = approval.request(peer, 'Admit this source?', CancellationToken.None);
		fixture.state.removeChat(canvasSession, peer);
		await gate.complete(true);
		assert.strictEqual(await pending, false);
	});
});

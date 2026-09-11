/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, SessionEvent } from '@github/copilot-sdk';
import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { readAgentCanvases } from '../../common/meta/agentCanvasMeta.js';
import { buildChatUri, buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostCanvasController } from '../../node/agentHostCanvasController.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

suite('AgentHostCanvasController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('copilotcli:/canvas-session');
	const chat = URI.parse(buildDefaultChatUri(session.toString()));
	const instance = { instanceId: 'one', canvasId: 'main', extensionId: 'project:counter', title: 'Counter', url: 'http://127.0.0.1:1234/' };
	const expected = { chat: chat.toString(), instanceId: 'one', canvasTypeId: 'main', extensionId: 'project:counter', title: 'Counter', status: undefined, url: instance.url };

	function setup() {
		const manager = store.add(new AgentHostStateManager(new NullLogService()));
		const create = () => manager.createSession({
			resource: session.toString(), provider: 'copilotcli', title: '', status: SessionStatus.Idle,
			createdAt: '2026-01-01T00:00:00Z', modifiedAt: '2026-01-01T00:00:00Z',
		});
		create();
		manager.setSessionMeta(session.toString(), { other: 'preserved' });
		const controller = store.add(new AgentHostCanvasController(manager, new NullLogService()));
		return { manager, controller, create, read: () => readAgentCanvases(manager.getSessionState(session.toString())!) };
	}

	function provider() {
		const events = store.add(new Emitter<SessionEvent>());
		const snapshot = new DeferredPromise<{ openCanvases: typeof instance[] }>();
		const closed: string[] = [];
		const sdk = {
			on: (listener: (event: SessionEvent) => void) => {
				const subscription = events.event(listener);
				return () => subscription.dispose();
			},
			rpc: { canvas: { listOpen: () => snapshot.p, close: async ({ instanceId }: { instanceId: string }) => { closed.push(instanceId); } } },
		} as unknown as CopilotSession;
		const emit = (event: Pick<SessionEvent, 'type' | 'data'>) => events.fire({
			id: 'event', timestamp: '2026-01-01T00:00:00Z', parentId: null, ...event,
		} as SessionEvent);
		const seed = async (openCanvases: typeof instance[] = []) => {
			await snapshot.complete({ openCanvases });
			await Promise.resolve();
		};
		return { sdk, emit, seed, snapshot, closed };
	}

	test('publishes initial snapshots and preserves other metadata and chat slices', async () => {
		const { controller, read, manager } = setup();
		const first = provider();
		const peer = provider();
		const peerChat = URI.parse(buildChatUri(session.toString(), 'peer'));
		store.add(controller.registerSession(session, chat, first.sdk));
		store.add(controller.registerSession(session, peerChat, peer.sdk));
		await first.seed([instance]);
		await peer.seed([instance]);
		assert.deepStrictEqual({ canvases: read(), other: manager.getSessionState(session.toString())?._meta?.other }, {
			canvases: [expected, { ...expected, chat: peerChat.toString() }], other: 'preserved',
		});
	});

		test('lists on demand and forwards schema input without a model turn', async () => {
			const { controller, read } = setup();
			const runtime = provider();
			const inputSchema = { type: 'object', required: ['count'], properties: { count: { type: 'number' } } };
			runtime.sdk.rpc.canvas.list = async () => ({ canvases: [{ canvasId: 'main', extensionId: 'project:counter', displayName: 'Counter', description: 'Counts', inputSchema }] });
			const calls: object[] = [];
			runtime.sdk.rpc.canvas.open = async params => {
				calls.push(params);
				return { ...instance, instanceId: params.instanceId };
			};
			store.add(controller.registerSession(session, chat, runtime.sdk));
			const catalog = await controller.listCanvases(session, chat);
			const opened = await controller.openCanvas(session, chat, 'project:counter', 'main', { count: 2 });
			await runtime.seed();
			const reopened = await controller.openCanvas(session, chat, 'project:counter', 'main', { count: 3 });
			assert.deepStrictEqual({
				catalog, calls, instanceReused: opened.instanceId === reopened.instanceId,
				revisionChanged: opened.revision !== reopened.revision, live: read(),
			}, {
				catalog: [{ canvasTypeId: 'main', extensionId: 'project:counter', displayName: 'Counter', description: 'Counts', inputSchema }],
				calls: [2, 3].map(count => ({ canvasId: 'main', extensionId: 'project:counter', instanceId: opened.instanceId, input: { count } })),
				instanceReused: true, revisionChanged: true, live: [reopened],
			});
		});

		test('rejects unknown types, cross-chat access, and propagates runtime schema validation', async () => {
			const { controller, read } = setup();
			const runtime = provider();
			runtime.sdk.rpc.canvas.list = async () => ({ canvases: [{ canvasId: 'main', extensionId: 'project:counter', displayName: 'Counter', description: '' }] });
			runtime.sdk.rpc.canvas.open = async () => { throw new Error('Required property count is missing'); };
			store.add(controller.registerSession(session, chat, runtime.sdk));
			await runtime.seed();
			await assert.rejects(controller.listCanvases(URI.parse('copilotcli:/other'), chat), /owned live chat/);
			await assert.rejects(controller.openCanvas(session, chat, 'missing', 'main'), /not available/);
			await assert.rejects(controller.openCanvas(session, chat, 'project:counter', 'missing'), /not available/);
			await assert.rejects(controller.openCanvas(session, chat, 'project:counter', 'main', {}), /Required property/);
			assert.deepStrictEqual(read(), []);
		});

		test('open events retain their revision and a subsequent close wins over an open response', async () => {
			const { controller, read } = setup();
			const runtime = provider();
			runtime.sdk.rpc.canvas.list = async () => ({ canvases: [{ canvasId: 'main', extensionId: 'project:counter', displayName: 'Counter', description: '' }] });
			runtime.sdk.rpc.canvas.open = async params => {
				const opened = { ...instance, instanceId: params.instanceId };
				runtime.emit({ type: 'session.canvas.opened', data: opened });
				return opened;
			};
			store.add(controller.registerSession(session, chat, runtime.sdk));
			await runtime.seed();
			const opened = await controller.openCanvas(session, chat, 'project:counter', 'main');
			assert.strictEqual(opened.revision, 'event');
			runtime.sdk.rpc.canvas.open = async params => {
				runtime.emit({ type: 'session.canvas.closed', data: { ...instance, instanceId: params.instanceId } });
				return { ...instance, instanceId: params.instanceId };
			};
			await assert.rejects(controller.openCanvas(session, chat, 'project:counter', 'main'), /closed while opening/);
			assert.deepStrictEqual(read(), []);
		});

	test('events during a snapshot win over stale results, including close and unavailable', async () => {
		const { controller, read } = setup();
		const runtime = provider();
		store.add(controller.registerSession(session, chat, runtime.sdk));
		runtime.emit({ type: 'session.canvas.opened', data: { ...instance, title: 'Newest' } });
		runtime.emit({ type: 'session.canvas.unavailable', data: instance });
		runtime.emit({ type: 'session.canvas.closed', data: { ...instance, instanceId: 'two' } });
		await runtime.seed([instance, { ...instance, instanceId: 'two' }]);
		assert.deepStrictEqual(read(), [{ ...expected, title: 'Newest', unavailable: true, revision: 'event' }]);
		runtime.emit({ type: 'session.canvas.opened', data: { ...instance, url: 'http://127.0.0.1:5678/' } });
		assert.deepStrictEqual(read(), [{ ...expected, url: 'http://127.0.0.1:5678/', revision: 'event' }]);
	});

	test('unavailable arriving before its initial snapshot is retained', async () => {
		const { controller, read } = setup();
		const runtime = provider();
		store.add(controller.registerSession(session, chat, runtime.sdk));
		runtime.emit({ type: 'session.canvas.unavailable', data: instance });
		await runtime.seed([instance]);
		assert.deepStrictEqual(read(), [{ ...expected, unavailable: true }]);
	});

	test('disposal and replacement ignore late snapshots and callbacks', async () => {
		const { controller, read } = setup();
		const old = provider();
		const current = provider();
		const oldRegistration = store.add(controller.registerSession(session, chat, old.sdk));
		store.add(controller.registerSession(session, chat, current.sdk));
		await current.seed([{ ...instance, title: 'Current' }]);
		oldRegistration.dispose();
		await old.seed([instance]);
		old.emit({ type: 'session.canvas.closed', data: instance });
		assert.deepStrictEqual(read(), [{ ...expected, title: 'Current' }]);
	});

	test('session removal and recreation cannot inherit an old provider', async () => {
		const { controller, manager, create, read } = setup();
		const runtime = provider();
		store.add(controller.registerSession(session, chat, runtime.sdk));
		manager.removeSession(session.toString());
		create();
		await runtime.seed([instance]);
		runtime.emit({ type: 'session.canvas.opened', data: instance });
		assert.deepStrictEqual(read(), []);
	});

	test('SDK shutdown clears live instances', async () => {
		const { controller, read } = setup();
		const runtime = provider();
		store.add(controller.registerSession(session, chat, runtime.sdk));
		await runtime.seed([instance]);
		runtime.emit({ type: 'session.shutdown', data: {} });
		assert.deepStrictEqual(read(), []);
	});

	test('close validates session, chat and instance ownership without creating a runtime', async () => {
		const { controller, read } = setup();
		const runtime = provider();
		store.add(controller.registerSession(session, chat, runtime.sdk));
		await runtime.seed([instance]);
		await assert.rejects(controller.closeCanvas(URI.parse('copilotcli:/other'), chat, 'one'));
		await assert.rejects(controller.closeCanvas(session, URI.parse(buildChatUri(session.toString(), 'peer')), 'one'));
		await assert.rejects(controller.closeCanvas(session, chat, 'missing'));
		await assert.rejects(controller.closeCanvas(session, chat, ' '));
		await controller.closeCanvas(session, chat, 'one');
		assert.deepStrictEqual({ closed: runtime.closed, canvases: read() }, { closed: ['one'], canvases: [] });
	});

	test('close failures preserve the instance', async () => {
		const { controller, read } = setup();
		const runtime = provider();
		runtime.sdk.rpc.canvas.close = async () => { throw new Error('offline'); };
		store.add(controller.registerSession(session, chat, runtime.sdk));
		await runtime.seed([instance]);
		await assert.rejects(controller.closeCanvas(session, chat, 'one'), /offline/);
		assert.deepStrictEqual(read(), [expected]);
	});

	test('a completed close cannot remove a newer reopen', async () => {
		const { controller, read } = setup();
		const runtime = provider();
		const close = new DeferredPromise<void>();
		runtime.sdk.rpc.canvas.close = () => close.p;
		store.add(controller.registerSession(session, chat, runtime.sdk));
		await runtime.seed([instance]);
		const closing = controller.closeCanvas(session, chat, 'one');
		runtime.emit({ type: 'session.canvas.opened', data: { ...instance, title: 'Reopened' } });
		await close.complete();
		await closing;
		assert.deepStrictEqual(read(), [{ ...expected, title: 'Reopened', revision: 'event' }]);
	});

	test('a successful close before the snapshot cannot resurrect the instance', async () => {
		const { controller, read } = setup();
		const runtime = provider();
		store.add(controller.registerSession(session, chat, runtime.sdk));
		runtime.emit({ type: 'session.canvas.opened', data: instance });
		await controller.closeCanvas(session, chat, 'one');
		await runtime.seed([instance]);
		assert.deepStrictEqual(read(), []);
	});

	test('a snapshot completing during close does not invalidate that close', async () => {
		const { controller, read } = setup();
		const runtime = provider();
		const close = new DeferredPromise<void>();
		runtime.sdk.rpc.canvas.close = () => close.p;
		store.add(controller.registerSession(session, chat, runtime.sdk));
		runtime.emit({ type: 'session.canvas.opened', data: instance });
		const closing = controller.closeCanvas(session, chat, 'one');
		await runtime.seed([instance]);
		await close.complete();
		await closing;
		assert.deepStrictEqual(read(), []);
	});

	test('publishes a provider materialized before its host session', async () => {
		const { controller, manager, create, read } = setup();
		manager.removeSession(session.toString());
		const runtime = provider();
		store.add(controller.registerSession(session, chat, runtime.sdk));
		await runtime.seed([instance]);
		create();
		assert.deepStrictEqual(read(), [expected]);
	});

	test('disposal rejects pending catalog and open results without resurrecting metadata', async () => {
		const { controller, read } = setup();
		const runtime = provider();
		const catalog = new DeferredPromise<Awaited<ReturnType<CopilotSession['rpc']['canvas']['list']>>>();
		runtime.sdk.rpc.canvas.list = () => catalog.p;
		const registration = store.add(controller.registerSession(session, chat, runtime.sdk));
		await runtime.seed();
		const listing = controller.listCanvases(session, chat);
		registration.dispose();
		await catalog.complete({ canvases: [] });
		await assert.rejects(listing, /disposed while listing/);

		const next = provider();
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<typeof instance>();
		next.sdk.rpc.canvas.list = async () => ({ canvases: [{ canvasId: 'main', extensionId: 'project:counter', displayName: 'Counter', description: '' }] });
		next.sdk.rpc.canvas.open = async () => { started.complete(); return response.p; };
		const current = store.add(controller.registerSession(session, chat, next.sdk));
		await next.seed();
		const opening = controller.openCanvas(session, chat, 'project:counter', 'main');
		await started.p;
		current.dispose();
		await response.complete(instance);
		await assert.rejects(opening, /disposed while opening/);
		assert.deepStrictEqual(read(), []);
	});

	test('snapshot failures do not discard live events', async () => {
		const { controller, read } = setup();
		const runtime = provider();
		store.add(controller.registerSession(session, chat, runtime.sdk));
		runtime.emit({ type: 'session.canvas.opened', data: instance });
		await runtime.snapshot.error(new Error('offline'));
		await Promise.resolve();
		assert.deepStrictEqual(read(), [{ ...expected, revision: 'event' }]);
	});
});

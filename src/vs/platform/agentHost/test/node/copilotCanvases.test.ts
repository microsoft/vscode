/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CanvasOpenedData, CanvasRegistryChangedCanvas, CopilotSession, SessionEvent, SessionEventHandler, SessionEventPayload, SessionEventType } from '@github/copilot-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { upcastDeepPartial, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { AgentHostCanvasJson, IAgentHostCanvasActionParams, IAgentHostCanvasOpenParams } from '../../common/agentHostCanvases.js';
import { CopilotCanvases } from '../../node/copilot/copilotCanvases.js';

type CanvasEventType = Extract<SessionEventType, `session.canvas.${string}`>;
type CanvasTestEvent = { [T in CanvasEventType]: { type: T; data: SessionEventPayload<T>['data'] } }[CanvasEventType];

const definition: CanvasRegistryChangedCanvas = {
	extensionId: 'user:fixture', canvasId: 'counter', displayName: 'Counter', description: 'Shared counter.',
	inputSchema: { type: 'object' },
	actions: [{ name: 'increment', description: 'Add an amount.', inputSchema: { type: 'object' } }],
};
const identity = { extensionId: definition.extensionId, canvasId: definition.canvasId, instanceId: 'one' };
const opened: CanvasOpenedData = { ...identity, title: 'Counter', url: 'http://127.0.0.1:4321/one', input: { documentId: 'demo' }, status: 'ready' };
const ready = { ...identity, title: opened.title, input: opened.input, availability: 'ready', url: opened.url };
const retired = { ...identity, title: opened.title, input: opened.input, availability: 'unavailable' };

function event(payload: CanvasTestEvent): SessionEvent {
	return { ...payload, id: 'event', timestamp: '2026-09-08T00:00:00.000Z', parentId: null, ephemeral: true };
}

suite('CopilotCanvases', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture() {
		const events = store.add(new Emitter<SessionEvent>());
		const state = {
			catalog: [definition],
			history: [] as SessionEvent[],
			live: [] as CanvasOpenedData[],
			listOpenGate: undefined as DeferredPromise<{ openCanvases: CanvasOpenedData[] }> | undefined,
			openResult: opened,
			onOpen: undefined as (() => void) | undefined,
			onReload: undefined as (() => void) | undefined,
			actionResult: { result: { value: 3 } } as AgentHostCanvasJson,
		};
		const calls: { method: string; params?: IAgentHostCanvasOpenParams | IAgentHostCanvasActionParams | { instanceId: string } }[] = [];
		const sdk = upcastPartial<CopilotSession>({
			sessionId: 'sdk-session',
			openCanvases: [opened],
			on: (handler: SessionEventHandler | SessionEventType) => {
				assert.strictEqual(typeof handler, 'function');
				if (typeof handler !== 'function') {
					throw new Error('Unexpected typed subscription');
				}
				const listener = events.event(handler);
				return () => listener.dispose();
			},
			getEvents: async () => state.history,
			rpc: upcastDeepPartial<CopilotSession['rpc']>({
				canvas: {
					list: async () => ({ canvases: state.catalog }),
					listOpen: async () => state.listOpenGate ? state.listOpenGate.p : { openCanvases: state.live },
					open: async (params: Parameters<CopilotSession['rpc']['canvas']['open']>[0]) => {
						calls.push({ method: 'open', params: { ...params, extensionId: params.extensionId ?? definition.extensionId } });
						state.onOpen?.();
						return state.openResult;
					},
					close: async (params: Parameters<CopilotSession['rpc']['canvas']['close']>[0]) => { calls.push({ method: 'close', params }); },
					action: { invoke: async (params: Parameters<CopilotSession['rpc']['canvas']['action']['invoke']>[0]) => { calls.push({ method: 'action', params }); return state.actionResult; } },
				},
				extensions: { reload: async () => { calls.push({ method: 'reload' }); state.onReload?.(); } },
			}),
		});
		return {
			state, calls, sdk,
			controller: store.add(new CopilotCanvases(sdk)),
			fire: (payload: CanvasTestEvent) => events.fire(event(payload)),
		};
	}

	test('hydrates durable identities but never trusts stale SDK openCanvases URLs', async () => {
		const f = fixture();
		f.state.history = [
			event({ type: 'session.canvas.recorded', data: opened }),
			event({ type: 'session.canvas.recorded', data: { ...identity, instanceId: 'removed' } }),
			event({ type: 'session.canvas.removed', data: { ...identity, instanceId: 'removed' } }),
		];
		assert.deepStrictEqual({ state: await f.controller.getState(), calls: f.calls }, {
			state: { supported: true, catalog: [definition], instances: [retired] }, calls: [],
		});
	});

	test('translates registry/open/record/unavailable/reconnect/close without replaying actions', async () => {
		const f = fixture();
		await f.controller.initialize();
		f.fire({ type: 'session.canvas.opened', data: opened });
		f.fire({ type: 'session.canvas.recorded', data: opened });
		const first = f.controller.state;
		f.fire({ type: 'session.canvas.unavailable', data: identity });
		f.fire({ type: 'session.canvas.registry_changed', data: { canvases: [] } });
		const lost = await f.controller.getState();
		f.fire({ type: 'session.canvas.registry_changed', data: { canvases: [definition] } });
		f.fire({ type: 'session.canvas.opened', data: { ...opened, url: 'http://127.0.0.1:5678/fresh' } });
		const fresh = f.controller.state;
		f.fire({ type: 'session.canvas.closed', data: identity });
		f.fire({ type: 'session.canvas.removed', data: identity });
		assert.deepStrictEqual({ first, lost, fresh, closed: f.controller.state, calls: f.calls }, {
			first: { supported: true, catalog: [definition], instances: [ready] },
			lost: { supported: true, catalog: [], instances: [retired] },
			fresh: { supported: true, catalog: [definition], instances: [{ ...ready, url: 'http://127.0.0.1:5678/fresh' }] },
			closed: { supported: true, catalog: [definition], instances: [] },
			calls: [],
		});
	});

	test('explicit repeated open remains effectful and action returns the SDK result envelope', async () => {
		const f = fixture();
		const params = { ...identity, input: { documentId: 'demo' } };
		await f.controller.open(params);
		await f.controller.getState();
		await f.controller.open(params);
		const action = { instanceId: identity.instanceId, actionName: 'increment', input: { amount: 3 } };
		const result = await f.controller.invokeAction(action);
		await f.controller.close(identity.instanceId);
		assert.deepStrictEqual({ result, calls: f.calls, instances: f.controller.state.instances }, {
			result: { result: { value: 3 } },
			calls: [{ method: 'open', params }, { method: 'open', params }, { method: 'action', params: action }, { method: 'close', params: { instanceId: identity.instanceId } }],
			instances: [],
		});
	});

	test('disposing a backing releases its hung action and rejects queued effects without awaiting the callback', async () => {
		const f = fixture();
		await f.controller.open(identity);
		const started = new DeferredPromise<void>();
		const completed = new DeferredPromise<{ result: string }>();
		f.sdk.rpc.canvas.action.invoke = async () => {
			void started.complete();
			return completed.p;
		};
		const action = assert.rejects(f.controller.invokeAction({ instanceId: 'one', actionName: 'increment' }), isCancellationError);
		await started.p;
		const reload = assert.rejects(f.controller.reload(), isCancellationError);
		f.controller.dispose();
		await Promise.all([action, reload]);
		assert.deepStrictEqual({
			stillHung: !completed.isSettled, state: f.controller.state.instances,
			reloads: f.calls.filter(call => call.method === 'reload'),
		}, { stillHung: true, state: [retired], reloads: [] });
		await completed.complete({ result: 'late' });
		assert.deepStrictEqual(f.controller.state.instances, [retired]);
	});

	test('disposing a backing aborts initialization without waiting for its live snapshot', async () => {
		const f = fixture();
		const snapshot = new DeferredPromise<{ openCanvases: CanvasOpenedData[] }>();
		f.state.listOpenGate = snapshot;
		const initializing = assert.rejects(f.controller.initialize(), isCancellationError);
		f.controller.dispose();
		await initializing;
		assert.strictEqual(snapshot.isSettled, false);
		await snapshot.complete({ openCanvases: [opened] });
		assert.deepStrictEqual(f.controller.state.instances, []);
	});

	test('unavailability racing a live snapshot or an open response retires both stale endpoints', async () => {
		const f = fixture();
		f.state.listOpenGate = new DeferredPromise();
		const initialization = f.controller.initialize();
		f.fire({ type: 'session.canvas.recorded', data: opened });
		f.fire({ type: 'session.canvas.unavailable', data: identity });
		await f.state.listOpenGate.complete({ openCanvases: [opened] });
		await initialization;
		const initialized = f.controller.state.instances;
		f.state.onOpen = () => {
			f.fire({ type: 'session.canvas.opened', data: opened });
			f.fire({ type: 'session.canvas.unavailable', data: identity });
		};
		const result = await f.controller.open(identity);
		assert.deepStrictEqual({ initialized, result }, { initialized: [retired], result: retired });
	});

	test('a durable record alone does not supersede the explicit open result', async () => {
		const f = fixture();
		f.state.onOpen = () => f.fire({ type: 'session.canvas.recorded', data: opened });
		assert.deepStrictEqual(await f.controller.open(identity), ready);
	});

	test('empty listOpen during reload retains logical identities without their old URLs', async () => {
		const f = fixture();
		f.state.live = [opened];
		await f.controller.initialize();
		f.state.live = [];
		f.state.onReload = () => f.fire({ type: 'session.canvas.unavailable', data: identity });
		await f.controller.reload();
		assert.deepStrictEqual({ state: f.controller.state, calls: f.calls }, {
			state: { supported: true, catalog: [definition], instances: [retired] }, calls: [{ method: 'reload' }],
		});
	});

	test('a removed catalog definition retires its endpoints until another opened event', async () => {
		const f = fixture();
		f.state.live = [opened];
		await f.controller.initialize();
		f.fire({ type: 'session.canvas.registry_changed', data: { canvases: [] } });
		f.fire({ type: 'session.canvas.registry_changed', data: { canvases: [definition] } });
		assert.deepStrictEqual(f.controller.state.instances, [retired]);
	});

	test('rejects missing instances, undeclared actions, cross-provider ID reuse and unavailable actions', async () => {
		const f = fixture();
		await assert.rejects(f.controller.open({ ...identity, extensionId: 'other' }), /catalog/);
		await assert.rejects(f.controller.invokeAction({ instanceId: 'missing', actionName: 'increment' }), /no such/);
		await assert.rejects(f.controller.close('missing'), /no such/);
		await f.controller.open(identity);
		f.state.catalog.push({ ...definition, extensionId: 'other' });
		f.fire({ type: 'session.canvas.registry_changed', data: { canvases: f.state.catalog } });
		await assert.rejects(f.controller.open({ ...identity, extensionId: 'other' }), /already owned/);
		await assert.rejects(f.controller.invokeAction({ instanceId: identity.instanceId, actionName: 'not-declared' }), /not declared/);
		f.fire({ type: 'session.canvas.unavailable', data: identity });
		await assert.rejects(f.controller.invokeAction({ instanceId: identity.instanceId, actionName: 'increment' }), /unavailable/);
		assert.deepStrictEqual(f.calls, [{ method: 'open', params: identity }]);
	});

	test('only live loopback HTTP endpoints become ready; disposal retires them', async () => {
		const f = fixture();
		f.state.live = [opened, { ...opened, instanceId: 'invalid', url: 'file:///sensitive' }, { ...opened, instanceId: 'remote', url: 'https://example.com/' }];
		await f.controller.initialize();
		const instances = f.controller.state.instances;
		f.controller.dispose();
		await assert.rejects(f.controller.getState(), /Canceled/);
		assert.deepStrictEqual({ instances, disposed: f.controller.state.instances }, {
			instances: [ready, { ...retired, instanceId: 'invalid' }, { ...retired, instanceId: 'remote' }],
			disposed: [retired, { ...retired, instanceId: 'invalid' }, { ...retired, instanceId: 'remote' }],
		});
	});
});

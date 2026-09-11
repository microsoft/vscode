/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostCanvasesMetaKey, readAgentHostCanvasState, type AgentHostCanvasJson, type IAgentHostCanvasOpenParams, type IAgentHostCanvasState, type IAgentHostCanvasStateChange } from '../../common/agentHostCanvases.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatInteractivity, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostCanvasesService } from '../../node/agentHostCanvasesService.js';
import { AgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { CanvasRequestConflictError } from '../../node/agentHostCanvasOperationLedger.js';
import { MockAgent } from './mockAgent.js';
import type { ISessionDataService } from '../../common/sessionDataService.js';
import { TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { CanvasAvailabilityStatus, CanvasSourceKind } from '../../common/state/protocol/channels-canvas/state.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { OpenCanvasParams, OpenCanvasResult } from '../../common/state/protocol/channels-canvas/commands.js';
import type { IAgent } from '../../common/agent.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';

const canvasState: IAgentHostCanvasState = { supported: true, catalog: [], instances: [{ instanceId: 'one', extensionId: 'fixture', canvasId: 'counter', availability: 'unavailable' }] };

class CanvasAgent extends MockAgent {
	readonly supportsCanvasProtocol = true;
	legacyCanvasMetadata = true;
	readonly canvasEvents = new Emitter<IAgentHostCanvasStateChange>();
	readonly onDidChangeCanvases = this.canvasEvents.event;
	readonly calls: { method: string; chat: string }[] = [];
	readResult: Promise<IAgentHostCanvasState> | undefined;
	openGate: Promise<void> | undefined;
	onOpen: (() => void) | undefined;
	stateValue: IAgentHostCanvasState = canvasState;
	authorized = true;
	actionError: Error | undefined;
	openError: Error | undefined;
	restarts = 0;
	prepareCanvasExecution: IAgent['prepareCanvasExecution'];
	getCanvasExecution: IAgent['getCanvasExecution'];

	async getCanvases(chat: URI): Promise<IAgentHostCanvasState> {
		this.calls.push({ method: 'get', chat: chat.toString() });
		return this.readResult ?? this.stateValue;
	}

	async openCanvas(chat: URI, params: IAgentHostCanvasOpenParams) {
		this.calls.push({ method: 'open', chat: chat.toString() });
		this.onOpen?.();
		await this.openGate;
		if (this.openError) {
			throw this.openError;
		}
		const instance = this.stateValue.catalog.length
			? { ...params, availability: 'ready' as const, url: `http://127.0.0.1:3000/${this.restarts}?credential=secret` }
			: { ...params, availability: 'unavailable' as const };
		if (this.stateValue.catalog.length) {
			this.stateValue = { ...this.stateValue, instances: [...this.stateValue.instances.filter(value => value.instanceId !== instance.instanceId), instance] };
			this.canvasEvents.fire({ chat, state: this.stateValue });
		}
		return instance;
	}

	isCanvasExecutionAuthorized(): boolean { return this.authorized; }

	async invokeCanvasAction(chat: URI): Promise<AgentHostCanvasJson> {
		this.calls.push({ method: 'action', chat: chat.toString() });
		if (this.actionError) {
			throw this.actionError;
		}
		return { result: { count: 3 } };
	}

	async closeCanvas(chat: URI, instanceId: string): Promise<void> {
		this.calls.push({ method: 'close', chat: chat.toString() });
		this.stateValue = { ...this.stateValue, instances: this.stateValue.instances.filter(instance => instance.instanceId !== instanceId) };
		this.canvasEvents.fire({ chat, state: this.stateValue });
	}

	async reloadCanvases(chat: URI): Promise<void> {
		this.calls.push({ method: 'restart', chat: chat.toString() });
		this.restarts++;
		this.stateValue = { ...this.stateValue, instances: this.stateValue.instances.map(instance => ({ ...instance, availability: 'ready', url: `http://127.0.0.1:3000/${this.restarts}?credential=secret` })) };
		this.canvasEvents.fire({ chat, state: this.stateValue });
	}

	override dispose(): void {
		this.canvasEvents.dispose();
		super.dispose();
	}
}

suite('AgentHostCanvasesService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());
	const session = 'copilot:/canvas-session';
	const first = URI.parse(buildDefaultChatUri(session));
	const second = URI.parse(buildChatUri(session, 'peer'));

	function fixture(createState = true, databases = new Map<string, TestSessionDatabase>()) {
		const log = new NullLogService();
		const state = store.add(new AgentHostStateManager(log));
		const providers = store.add(new AgentHostProviderService(store.add(new AgentHostAuthenticationService(log)), log));
		const sessionData = upcastPartial<ISessionDataService>({
			tryOpenDatabase: async chat => {
				const object = databases.get(chat.toString());
				return object ? { object, dispose() { } } : undefined;
			},
			openDatabase: chat => {
				let object = databases.get(chat.toString());
				if (!object) {
					object = new TestSessionDatabase();
					databases.set(chat.toString(), object);
				}
				return { object, dispose() { } };
			},
		});
		const configuration = store.add(new AgentConfigurationService(state, log));
		const worktree = new NullAgentHostWorktreeIsolation();
		const canvases = store.add(new AgentHostCanvasesService(providers, state, sessionData, log, configuration, worktree));
		const provider = new CanvasAgent('copilot');
		providers.registerProvider(provider);
		const summary = { resource: session, provider: provider.id, title: 'Canvases', status: SessionStatus.Idle, createdAt: '', modifiedAt: '', workingDirectories: ['file:///workspace'], project: { uri: 'file:///workspace', displayName: 'Workspace' } };
		if (createState) {
			state.createSession(summary);
			state.addChat(session, second.toString());
			state.setSessionMeta(session, { unrelated: 'preserved' });
		}
		return { state, providers, provider, canvases, summary, databases, worktree, log };
	}

	function canonicalFixture(databases?: Map<string, TestSessionDatabase>) {
		const f = fixture(true, databases);
		f.provider.legacyCanvasMetadata = false;
		f.provider.stateValue = { supported: true, catalog: [{ extensionId: 'fixture', canvasId: 'counter', displayName: 'Counter', description: '', actions: [{ name: 'increment' }] }], instances: [] };
		const params: OpenCanvasParams = {
			channel: session, canvas: 'ahp-canvas:/chosen',
			identity: { chat: first.toString(), source: { kind: CanvasSourceKind.Extension, extensionId: 'fixture' }, canvasType: 'counter', instanceId: 'canonical' },
			title: 'Counter', requestId: 'open-1', input: { seed: 1 },
		};
		return { ...f, params };
	}

	async function interruptibleFixture() {
		const f = canonicalFixture();
		const opened = await f.canvases.protocol.open('client', f.params);
		const live = f.provider.stateValue;
		const actionStarted = new DeferredPromise<void>();
		const actionResult = new DeferredPromise<AgentHostCanvasJson>();
		const actions = sinon.stub(f.provider, 'invokeCanvasAction').callThrough();
		actions.onFirstCall().callsFake(async () => {
			void actionStarted.complete();
			return actionResult.p;
		});
		const retired: number[] = [];
		let nextBacking = 0;
		let currentBacking: number | undefined = 0;
		let preparations = 0;
		const shutdown = { run: async () => { } };
		const replaceBacking = () => {
			currentBacking = ++nextBacking;
			f.provider.stateValue = {
				...live,
				instances: live.instances.map(instance => ({ ...instance, availability: 'ready', url: `http://127.0.0.1:3000/backing-${currentBacking}` })),
			};
			f.provider.canvasEvents.fire({ chat: first, state: f.provider.stateValue });
		};
		f.provider.getCanvasExecution = chat => {
			assert.strictEqual(chat.toString(), first.toString());
			const backing = currentBacking;
			return backing === undefined ? undefined : {
				isCurrent: () => currentBacking === backing,
				retire: async () => {
					retired.push(backing);
					if (currentBacking === backing) {
						currentBacking = undefined;
						f.provider.stateValue = { supported: true, loaded: false, catalog: [], instances: [] };
						f.provider.canvasEvents.fire({ chat, state: f.provider.stateValue });
					}
					await shutdown.run();
				},
			};
		};
		f.provider.prepareCanvasExecution = async (_chat, _extensionId, _directories, begin) => {
			if (currentBacking === undefined) {
				begin();
				preparations++;
				replaceBacking();
			}
		};
		return { ...f, opened: opened.canvas, actionStarted, actionResult, actions, retired, shutdown, replaceBacking, preparations: () => preparations };
	}

	test('canonical open preserves one chosen resource, retries only once, and never persists endpoints', async () => {
		const f = canonicalFixture();
		const initial = await f.canvases.protocol.open('client', f.params);
		const retry = await f.canvases.protocol.open('client', f.params);
		const reopened = await f.canvases.protocol.open('client', { ...f.params, requestId: 'open-2', canvas: 'ahp-canvas:/ignored', input: { seed: 2 } });
		const source = f.canvases.protocol.resolveSource({ channel: initial.canvas.resource });
		const serialized = await f.databases.get(first.toString())?.getMetadata('canvasRegistry.v1');
		assert.deepStrictEqual({
			resources: [initial.canvas.resource, retry.canvas.resource, reopened.canvas.resource],
			openCalls: f.provider.calls.filter(call => call.method === 'open').length,
			members: f.state.getSessionState(session)?.canvases?.length,
			live: source.source?.url,
			persistedEndpoint: serialized?.includes('credential'),
			summaryEndpoint: JSON.stringify(f.state.getSessionState(session)).includes('credential'),
			ready: f.state.getCanvasState(initial.canvas.resource)?.availability.status,
		}, { resources: ['ahp-canvas:/chosen', 'ahp-canvas:/chosen', 'ahp-canvas:/chosen'], openCalls: 2, members: 1, live: 'http://127.0.0.1:3000/0?credential=secret', persistedEndpoint: false, summaryEndpoint: false, ready: CanvasAvailabilityStatus.Ready });
	});

	test('only an explicit open prepares a cold canvas backing and validates its live catalogue', async () => {
		const f = canonicalFixture();
		const live = f.provider.stateValue;
		f.provider.stateValue = { supported: true, loaded: false, catalog: [], instances: [] };
		const preparations: { chat: string; extensionId: string; directories: string[]; persisted: boolean; resource: string; configuration: string }[] = [];
		f.provider.prepareCanvasExecution = async (chat, extensionId, directories, begin, context) => {
			preparations.push({
				chat: chat.toString(), extensionId, directories: directories.map(directory => directory.toString()),
				persisted: !!await f.databases.get(chat.toString())?.getMetadata('canvasRegistry.v1'),
				resource: context.resource.toString(), configuration: context.configurationResource.toString(),
			});
			begin();
			f.provider.stateValue = live;
		};
		const catalog = await f.canvases.protocol.listTypes({ channel: first.toString() });
		assert.deepStrictEqual({ catalog: catalog.types, preparations }, { catalog: [], preparations: [] });
		const opened = await f.canvases.protocol.open('client', f.params);
		assert.deepStrictEqual({
			preparations,
			resource: opened.canvas.resource,
			opens: f.provider.calls.filter(call => call.method === 'open').length,
			turns: f.state.getChatState(first.toString())?.turns ?? [],
		}, {
			preparations: [{ chat: first.toString(), extensionId: 'fixture', directories: ['file:///workspace'], persisted: true, resource: session, configuration: session }],
			resource: f.params.canvas, opens: 1, turns: [],
		});
	});

	test('unchanged canonical reads reuse only the successful durable projection', async () => {
		const f = canonicalFixture();
		await f.canvases.protocol.open('client', f.params);
		const database = f.databases.get(first.toString());
		assert.ok(database);
		const writes = database.setMetadataCalls.length;
		for (let index = 0; index < 3; index++) {
			await f.canvases.getCanvases(first);
			await f.canvases.protocol.listTypes({ channel: first.toString() });
		}
		assert.deepStrictEqual({
			writes: database.setMetadataCalls.length,
			members: f.state.getSessionState(session)?.canvases?.map(entry => entry.resource),
		}, { writes, members: [f.params.canvas] });
	});

	test('each queued persistence failure rejects its caller and a later unchanged read retries durability', async () => {
		const f = canonicalFixture();
		await f.canvases.protocol.open('client', f.params);
		const database = f.databases.get(first.toString());
		assert.ok(database);
		const writing = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const firstFailure = new Error('First SQLite write failed');
		const secondFailure = new Error('Second SQLite write failed');
		const setMetadata = sinon.stub(database, 'setMetadata').callThrough();
		setMetadata.onFirstCall().callsFake(async () => {
			void writing.complete();
			await release.p;
			throw firstFailure;
		});
		setMetadata.onSecondCall().rejects(secondFailure);
		f.provider.stateValue = { ...f.provider.stateValue, instances: f.provider.stateValue.instances.map(instance => ({ ...instance, title: 'First change' })) };
		const firstRead = assert.rejects(f.canvases.getCanvases(first), error => error === firstFailure);
		await writing.p;
		f.provider.stateValue = { ...f.provider.stateValue, instances: f.provider.stateValue.instances.map(instance => ({ ...instance, title: 'Second change' })) };
		const secondRead = assert.rejects(f.canvases.getCanvases(first), error => error === secondFailure);
		await release.complete();
		await Promise.all([firstRead, secondRead]);
		await f.canvases.getCanvases(first);
		await f.canvases.getCanvases(first);
		assert.deepStrictEqual({
			attempts: setMetadata.callCount,
			durable: await database.getMetadata('canvasRegistry.v1'),
		}, {
			attempts: 3,
			durable: JSON.stringify(f.state.getSessionState(session)?.canvases),
		});
	});

	test('a failed first write with an uncertain commit still durably removes unadmitted membership', async () => {
		const failure = new Error('SQLite acknowledgment lost after commit');
		const database = new class extends TestSessionDatabase {
			override async setMetadata(key: string, value: string): Promise<void> {
				await super.setMetadata(key, value);
				if (this.setMetadataCalls.length === 1) {
					throw failure;
				}
			}
		}();
		const f = canonicalFixture(new Map([[first.toString(), database]]));
		await assert.rejects(f.canvases.protocol.open('client', f.params), error => error === failure);
		await f.canvases.getCanvases(first);
		assert.deepStrictEqual({
			writes: database.setMetadataCalls.length,
			durable: await database.getMetadata('canvasRegistry.v1'),
			members: f.state.getSessionState(session)?.canvases,
			effects: f.provider.calls.filter(call => call.method !== 'get'),
		}, { writes: 2, durable: '[]', members: [], effects: [] });
	});

	test('an unchanged projection queued behind a failed write still performs its own durability retry', async () => {
		const f = canonicalFixture();
		await f.canvases.protocol.open('client', f.params);
		const database = f.databases.get(first.toString());
		assert.ok(database);
		const writing = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const failure = new Error('The pending write failed');
		const setMetadata = sinon.stub(database, 'setMetadata').callThrough();
		setMetadata.onFirstCall().callsFake(async () => {
			void writing.complete();
			await release.p;
			throw failure;
		});
		f.provider.stateValue = { ...f.provider.stateValue, instances: f.provider.stateValue.instances.map(instance => ({ ...instance, title: 'Unchanged retry' })) };
		const rejected = assert.rejects(f.canvases.getCanvases(first), error => error === failure);
		await writing.p;
		const retry = f.canvases.getCanvases(first);
		await release.complete();
		await rejected;
		await retry;
		await f.canvases.getCanvases(first);
		assert.deepStrictEqual({
			attempts: setMetadata.callCount, durable: await database.getMetadata('canvasRegistry.v1'),
		}, { attempts: 2, durable: JSON.stringify(f.state.getSessionState(session)?.canvases) });
	});

	test('a stale provider read retries a newer notification whose projection failed', async () => {
		const f = canonicalFixture();
		await f.canvases.protocol.open('client', f.params);
		const database = f.databases.get(first.toString());
		assert.ok(database);
		const failure = new Error('Notification persistence failed');
		const logged = new DeferredPromise<void>();
		sinon.stub(f.log, 'error').callsFake((_message, error) => {
			if (error === failure) {
				void logged.complete();
			}
		});
		const setMetadata = sinon.stub(database, 'setMetadata').callThrough();
		setMetadata.onFirstCall().rejects(failure);
		const reading = new DeferredPromise<void>();
		const response = new DeferredPromise<IAgentHostCanvasState>();
		sinon.stub(f.provider, 'getCanvases').onFirstCall().callsFake(async () => {
			void reading.complete();
			return response.p;
		});
		const previous = f.provider.stateValue;
		const read = f.canvases.getCanvases(first);
		await reading.p;
		f.provider.stateValue = { ...previous, instances: previous.instances.map(instance => ({ ...instance, title: 'Newer notification' })) };
		f.provider.canvasEvents.fire({ chat: first, state: f.provider.stateValue });
		await logged.p;
		await response.complete(previous);
		const result = await read;
		assert.deepStrictEqual({
			attempts: setMetadata.callCount, state: result, durable: await database.getMetadata('canvasRegistry.v1'),
		}, { attempts: 2, state: f.provider.stateValue, durable: JSON.stringify(f.state.getSessionState(session)?.canvases) });
	});

	test('cold backing denial has no open effects and failure after admission preserves membership', async () => {
		for (const admitted of [false, true]) {
			const f = canonicalFixture();
			f.provider.stateValue = { supported: true, loaded: false, catalog: [], instances: [] };
			f.provider.prepareCanvasExecution = async (_chat, _extensionId, _directories, begin) => {
				if (admitted) {
					begin();
				}
				throw new Error('Canvas startup failed');
			};
			await assert.rejects(f.canvases.protocol.open('client', f.params), admitted ? { data: { outcome: 'indeterminate' } } : /Canvas startup failed/);
			assert.deepStrictEqual({
				opens: f.provider.calls.filter(call => call.method === 'open').length,
				members: f.state.getSessionState(session)?.canvases?.map(entry => entry.resource),
				unused: f.state.isUnusedDraft(session),
			}, { opens: 0, members: admitted ? [f.params.canvas] : [], unused: !admitted });
		}
	});

	test('canonical source resolution is read-only and effectful calls require current generations', async () => {
		const f = canonicalFixture();
		const { canvas } = await f.canvases.protocol.open('client', f.params);
		f.provider.calls.length = 0;
		f.canvases.protocol.resolveSource({ channel: canvas.resource });
		assert.deepStrictEqual(f.provider.calls, []);
		const stale = (error: unknown) => error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict;
		await assert.rejects(f.canvases.protocol.invokeAction('client', { channel: canvas.resource, actionId: 'increment', incarnation: 'stale', requestId: 'action-stale' }), stale);
		await assert.rejects(f.canvases.protocol.restart('client', { channel: canvas.resource, incarnation: 'stale', requestId: 'restart-stale' }), stale);
		await assert.rejects(f.canvases.protocol.close('client', { channel: canvas.resource, revision: 0, requestId: 'close-stale' }), stale);
		assert.deepStrictEqual(f.provider.calls, []);
	});

	test('browsing leaves a draft unused while admitted canvas membership protects it without a fake turn', async () => {
		const f = canonicalFixture();
		await f.canvases.protocol.listTypes({ channel: first.toString() });
		const before = f.state.isUnusedDraft(session);
		await f.canvases.protocol.open('client', f.params);
		assert.deepStrictEqual({
			before,
			after: f.state.isUnusedDraft(session),
			turns: f.state.getChatState(first.toString())?.turns,
		}, { before: true, after: false, turns: [] });
	});

	test('canonical open cannot substitute package provenance for another extension source', async () => {
		const f = canonicalFixture();
		await assert.rejects(f.canvases.protocol.open('client', {
			...f.params,
			identity: { ...f.params.identity, source: { kind: CanvasSourceKind.Package, sourceId: 'fixture', packageName: 'Forged' } },
		}), error => error instanceof ProtocolError && error.code === AhpErrorCodes.PermissionDenied);
		assert.deepStrictEqual(f.provider.calls, []);
	});

	test('canonical actions preserve the SDK envelope and report uncertain failures without replay', async () => {
		const f = canonicalFixture();
		const { canvas } = await f.canvases.protocol.open('client', f.params);
		const params = { channel: canvas.resource, incarnation: canvas.identity.incarnation, actionId: 'increment', requestId: 'action-1' };
		const firstResult = await f.canvases.protocol.invokeAction('client', params);
		await f.canvases.protocol.invokeAction('client', params);
		f.provider.actionError = new Error('Disconnected after writing');
		const uncertain = { ...params, requestId: 'action-2' };
		for (let i = 0; i < 2; i++) {
			await assert.rejects(f.canvases.protocol.invokeAction('client', uncertain), { code: JsonRpcErrorCodes.InternalError, data: { outcome: 'indeterminate' } });
		}
		assert.deepStrictEqual({ firstResult, calls: f.provider.calls.filter(call => call.method === 'action').length }, { firstResult: { result: { result: { count: 3 } } }, calls: 2 });
	});

	test('canonical retry receipts survive later close and cannot be reused for another chat', async () => {
		const f = canonicalFixture();
		const { canvas } = await f.canvases.protocol.open('client', f.params);
		await assert.rejects(f.canvases.protocol.open('client', { ...f.params, identity: { ...f.params.identity, chat: second.toString() } }), error => error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict);
		const action = { channel: canvas.resource, actionId: 'increment', incarnation: canvas.identity.incarnation, requestId: 'action' };
		const initial = await f.canvases.protocol.invokeAction('client', action);
		await f.canvases.protocol.close('client', { channel: canvas.resource, revision: canvas.revision, requestId: 'close' });
		const replay = await f.canvases.protocol.invokeAction('client', action);
		await assert.rejects(f.canvases.protocol.close('client', { channel: canvas.resource, revision: canvas.revision, requestId: 'action' }), error => error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict);
		assert.deepStrictEqual({ replay, initial, actionCalls: f.provider.calls.filter(call => call.method === 'action').length }, { replay: { result: { result: { count: 3 } } }, initial: { result: { result: { count: 3 } } }, actionCalls: 1 });
	});

	test('a timed-out action retires its backing and a later restart recovers without replay', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const f = await interruptibleFixture();
		const action = { channel: f.opened.resource, incarnation: f.opened.identity.incarnation, actionId: 'increment', requestId: 'hung-action' };
		const interrupted = assert.rejects(f.canvases.protocol.invokeAction('client', action), { data: { outcome: 'indeterminate' } });
		await f.actionStarted.p;
		await interrupted;
		await f.canvases.interruptCanvasOperation(first, () => { });
		const unavailable = f.canvases.protocol.resolveSource({ channel: f.opened.resource });
		await f.canvases.protocol.restart('client', { channel: f.opened.resource, incarnation: unavailable.incarnation, requestId: 'recover' });
		const ready = f.canvases.protocol.resolveSource({ channel: f.opened.resource });
		await assert.rejects(f.canvases.protocol.invokeAction('client', action), { data: { outcome: 'indeterminate' } });
		const result = await f.canvases.protocol.invokeAction('client', { ...action, incarnation: ready.incarnation, requestId: 'new-action' });
		assert.deepStrictEqual({
			retired: f.retired, preparations: f.preparations(), calls: f.actions.callCount, stillHung: !f.actionResult.isSettled,
			oldSource: unavailable.source, newSource: ready.source?.url, result,
		}, {
			retired: [0], preparations: 1, calls: 2, stillHung: true,
			oldSource: undefined, newSource: 'http://127.0.0.1:3000/backing-1', result: { result: { result: { count: 3 } } },
		});
		await f.actionResult.complete({ result: 'late' });
	}));

	test('explicit restart interrupts the action queue before the callback or shutdown acknowledgment completes', async () => {
		const f = await interruptibleFixture();
		const stopping = new DeferredPromise<void>();
		const stopped = new DeferredPromise<void>();
		f.shutdown.run = async () => {
			void stopping.complete();
			await stopped.p;
		};
		const action = { channel: f.opened.resource, incarnation: f.opened.identity.incarnation, actionId: 'increment', requestId: 'hung-action' };
		const interrupted = assert.rejects(f.canvases.protocol.invokeAction('client', action), { data: { outcome: 'indeterminate' } });
		await f.actionStarted.p;
		const restarting = f.canvases.protocol.restart('client', { channel: f.opened.resource, incarnation: f.opened.identity.incarnation, requestId: 'interrupt' });
		await stopping.p;
		await interrupted;
		const duringShutdown = await f.canvases.getCanvases(first);
		await stopped.complete();
		await restarting;
		await assert.rejects(f.canvases.protocol.invokeAction('client', action), { data: { outcome: 'indeterminate' } });
		const source = f.canvases.protocol.resolveSource({ channel: f.opened.resource });
		assert.deepStrictEqual({
			retired: f.retired, loadedDuringShutdown: duringShutdown.loaded,
			callbackStillHung: !f.actionResult.isSettled, calls: f.actions.callCount,
			preparations: f.preparations(), source: source.source?.url,
		}, { retired: [0], loadedDuringShutdown: false, callbackStillHung: true, calls: 1, preparations: 1, source: 'http://127.0.0.1:3000/backing-1' });
		await f.actionResult.complete({ result: 'late' });
	});

	for (const kind of ['open', 'close', 'restart'] as const) {
		test(`a hung ${kind} callback is bounded without forgetting membership or replaying its effects`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const f = await interruptibleFixture();
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			const callback = async () => {
				void started.complete();
				await release.p;
			};
			const requestId = `hung-${kind}`;
			let request: () => Promise<OpenCanvasResult | void>;
			if (kind === 'open') {
				f.provider.openGate = release.p;
				f.provider.onOpen = () => { void started.complete(); };
				request = () => f.canvases.protocol.open('client', { ...f.params, requestId });
			} else if (kind === 'close') {
				sinon.stub(f.provider, 'closeCanvas').callsFake(callback);
				request = () => f.canvases.protocol.close('client', { channel: f.opened.resource, revision: f.opened.revision, requestId });
			} else {
				sinon.stub(f.provider, 'reloadCanvases').callsFake(callback);
				request = () => f.canvases.protocol.restart('client', { channel: f.opened.resource, incarnation: f.opened.identity.incarnation, requestId });
			}
			const interrupted = assert.rejects(request(), { data: { outcome: 'indeterminate' } });
			await started.p;
			await interrupted;
			await assert.rejects(request(), { data: { outcome: 'indeterminate' } });
			await f.canvases.getCanvases(first);
			assert.deepStrictEqual({
				retired: f.retired, callbackStillHung: !release.isSettled,
				members: f.state.getSessionState(session)?.canvases?.map(entry => entry.resource),
				source: f.canvases.protocol.resolveSource({ channel: f.opened.resource }).source,
			}, { retired: [0], callbackStillHung: true, members: [f.opened.resource], source: undefined });
			await release.complete();
		}));
	}

	test('failed backing retirement stays quarantined until an explicit shutdown retry succeeds', async () => {
		const f = await interruptibleFixture();
		const failure = new Error('The backing disconnect failed');
		f.shutdown.run = async () => { throw failure; };
		const action = { channel: f.opened.resource, incarnation: f.opened.identity.incarnation, actionId: 'increment', requestId: 'hung-action' };
		const interrupted = assert.rejects(f.canvases.protocol.invokeAction('client', action), { data: { outcome: 'indeterminate' } });
		await f.actionStarted.p;
		const restart = { channel: f.opened.resource, incarnation: f.opened.identity.incarnation, requestId: 'failed-stop' };
		await assert.rejects(f.canvases.protocol.restart('client', restart), { data: { outcome: 'indeterminate' } });
		await interrupted;
		await assert.rejects(f.canvases.openCanvas(first, { extensionId: 'fixture', canvasId: 'counter', instanceId: 'blocked' }), /still retiring/);
		f.shutdown.run = async () => { };
		await f.canvases.protocol.restart('client', { ...restart, requestId: 'retry-stop' });
		await assert.rejects(f.canvases.protocol.restart('client', restart), { data: { outcome: 'indeterminate' } });
		assert.deepStrictEqual({
			retired: f.retired, preparations: f.preparations(), actionCalls: f.actions.callCount,
			source: f.canvases.protocol.resolveSource({ channel: f.opened.resource }).source?.url,
		}, { retired: [0, 0], preparations: 1, actionCalls: 1, source: 'http://127.0.0.1:3000/backing-1' });
		await f.actionResult.complete({ result: 'late' });
	});

	test('a hung shutdown has a bounded result and can recover after its real acknowledgment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const f = await interruptibleFixture();
		const stopped = new DeferredPromise<void>();
		f.shutdown.run = () => stopped.p;
		const interrupted = assert.rejects(f.canvases.protocol.invokeAction('client', {
			channel: f.opened.resource, incarnation: f.opened.identity.incarnation, actionId: 'increment', requestId: 'hung-action',
		}), { data: { outcome: 'indeterminate' } });
		await f.actionStarted.p;
		const restart = { channel: f.opened.resource, incarnation: f.opened.identity.incarnation, requestId: 'hung-stop' };
		await assert.rejects(f.canvases.protocol.restart('client', restart), { data: { outcome: 'indeterminate' } });
		await interrupted;
		await assert.rejects(f.canvases.openCanvas(first, { extensionId: 'fixture', canvasId: 'counter', instanceId: 'blocked' }), /still retiring/);
		await stopped.complete();
		await f.canvases.protocol.restart('client', { ...restart, requestId: 'after-stop' });
		assert.deepStrictEqual({
			retired: f.retired, preparations: f.preparations(), calls: f.actions.callCount,
			source: f.canvases.protocol.resolveSource({ channel: f.opened.resource }).source?.url,
		}, { retired: [0], preparations: 1, calls: 1, source: 'http://127.0.0.1:3000/backing-1' });
		await f.actionResult.complete({ result: 'late' });
	}));

	test('a timeout from an old backing cannot retire the replacement or its endpoint', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const f = await interruptibleFixture();
		const interrupted = assert.rejects(f.canvases.protocol.invokeAction('client', {
			channel: f.opened.resource, incarnation: f.opened.identity.incarnation, actionId: 'increment', requestId: 'old-action',
		}), { data: { outcome: 'indeterminate' } });
		await f.actionStarted.p;
		f.replaceBacking();
		await f.canvases.getCanvases(first);
		const replacement = f.canvases.protocol.resolveSource({ channel: f.opened.resource });
		await interrupted;
		await f.canvases.getCanvases(first);
		assert.deepStrictEqual({
			retired: f.retired, current: f.canvases.protocol.resolveSource({ channel: f.opened.resource }), preparations: f.preparations(),
		}, { retired: [0], current: replacement, preparations: 0 });
		await f.actionResult.complete({ result: 'late' });
	}));

	for (const delayedPhase of ['worktree', 'provider']) {
		test(`restart rechecks incarnation after delayed ${delayedPhase} preparation before touching a replacement`, async () => {
			const f = canonicalFixture();
			const opened = await f.canvases.protocol.open('client', f.params);
			const preparing = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			let preparations = 0;
			f.provider.prepareCanvasExecution = async () => {
				if (++preparations === 1 && delayedPhase === 'provider') {
					void preparing.complete();
					await release.p;
				}
			};
			if (delayedPhase === 'worktree') {
				sinon.stub(f.worktree, 'resolveWorkingDirectoryForResume').callThrough().onFirstCall().callsFake(async () => {
					void preparing.complete();
					await release.p;
					return URI.parse('file:///workspace');
				});
			}
			const retired = assert.rejects(f.canvases.protocol.restart('client', {
				channel: opened.canvas.resource, incarnation: opened.canvas.identity.incarnation, requestId: 'delayed-restart',
			}), { code: AhpErrorCodes.Conflict });
			await preparing.p;
			f.provider.stateValue = { ...f.provider.stateValue, instances: f.provider.stateValue.instances.map(instance => ({ ...instance, availability: 'ready', url: 'http://127.0.0.1:3000/replacement' })) };
			f.provider.canvasEvents.fire({ chat: first, state: f.provider.stateValue });
			await f.canvases.getCanvases(first);
			const replacement = f.canvases.protocol.resolveSource({ channel: opened.canvas.resource });
			await f.canvases.protocol.restart('client', {
				channel: opened.canvas.resource, incarnation: replacement.incarnation, requestId: 'replacement-restart',
			});
			const restarted = f.canvases.protocol.resolveSource({ channel: opened.canvas.resource });
			await release.complete();
			await retired;
			assert.deepStrictEqual({
				restarts: f.provider.restarts, current: f.canvases.protocol.resolveSource({ channel: opened.canvas.resource }),
			}, { restarts: 1, current: restarted });
		});
	}

	test('canonical close clears durable membership and cold restore never revives a persisted endpoint', async () => {
		const f = canonicalFixture();
		const { canvas } = await f.canvases.protocol.open('client', f.params);
		const restored = canonicalFixture(f.databases);
		restored.provider.stateValue = { ...restored.provider.stateValue, instances: [{ extensionId: 'fixture', canvasId: 'counter', instanceId: 'canonical', availability: 'unavailable' }] };
		await restored.canvases.getCanvases(first);
		const source = restored.canvases.protocol.resolveSource({ channel: canvas.resource });
		assert.ok(source.incarnation !== canvas.identity.incarnation);
		assert.strictEqual(source.source, undefined);
		const current = f.state.getCanvasState(canvas.resource);
		assert.ok(current);
		await f.canvases.protocol.close('client', { channel: canvas.resource, revision: current.revision, requestId: 'close' });
		assert.deepStrictEqual({
			members: f.state.getSessionState(session)?.canvases,
			persisted: await f.databases.get(first.toString())?.getMetadata('canvasRegistry.v1'),
		}, { members: [], persisted: '[]' });
	});

	test('an indeterminate open survives cold restore and can be forgotten without replaying backend effects', async () => {
		const f = canonicalFixture();
		f.provider.openError = new Error('Lost the provider after possible data creation');
		await assert.rejects(f.canvases.protocol.open('client', f.params), { data: { outcome: 'indeterminate' } });
		const restored = canonicalFixture(f.databases);
		await restored.canvases.getCanvases(first);
		const state = restored.state.getCanvasState(f.params.canvas);
		assert.ok(state);
		assert.strictEqual(state.availability.status, CanvasAvailabilityStatus.Failed);
		await restored.canvases.protocol.close('client', { channel: state.resource, revision: state.revision, requestId: 'forget' });
		assert.deepStrictEqual({
			effects: restored.provider.calls.filter(call => call.method !== 'get'),
			remaining: restored.state.getSessionState(session)?.canvases,
		}, { effects: [], remaining: [] });
	});

	test('close cannot forget membership while the admitted open is still executing', async () => {
		const f = canonicalFixture();
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		f.provider.openGate = finish.p;
		f.provider.onOpen = () => { void started.complete(); };
		const opening = f.canvases.protocol.open('client', f.params);
		await started.p;
		const pending = f.state.getCanvasState(f.params.canvas);
		assert.ok(pending);
		await assert.rejects(f.canvases.protocol.close('client', {
			channel: pending.resource, revision: pending.revision, requestId: 'close-pending',
		}), { code: AhpErrorCodes.Conflict });
		const preserved = f.state.getSessionState(session)?.canvases?.map(entry => entry.resource);
		await finish.complete();
		const opened = await opening;
		const current = f.state.getCanvasState(opened.canvas.resource);
		assert.ok(current);
		await f.canvases.protocol.close('client', {
			channel: current.resource, revision: current.revision, requestId: 'close-settled',
		});
		assert.deepStrictEqual({
			preserved,
			openedResource: opened.canvas.resource,
			closeCalls: f.provider.calls.filter(call => call.method === 'close').length,
			remaining: f.state.getSessionState(session)?.canvases,
			persisted: await f.databases.get(first.toString())?.getMetadata('canvasRegistry.v1'),
		}, { preserved: [f.params.canvas], openedResource: f.params.canvas, closeCalls: 1, remaining: [], persisted: '[]' });
	});

	test('open completion does not resurrect another canvas removed by a newer provider event', async () => {
		const f = canonicalFixture();
		const firstOpen = await f.canvases.protocol.open('client', f.params);
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		f.provider.openGate = finish.p;
		f.provider.onOpen = () => { void started.complete(); };
		const secondResource = 'ahp-canvas:/second';
		const opening = f.canvases.protocol.open('client', {
			...f.params, canvas: secondResource, identity: { ...f.params.identity, instanceId: 'second' }, requestId: 'open-second',
		});
		await started.p;
		f.provider.stateValue = { ...f.provider.stateValue, instances: [] };
		f.provider.canvasEvents.fire({ chat: first, state: f.provider.stateValue });
		await f.canvases.getCanvases(first);
		await finish.complete();
		await opening;
		assert.deepStrictEqual({
			removed: f.state.getCanvasState(firstOpen.canvas.resource),
			members: f.state.getSessionState(session)?.canvases?.map(entry => entry.resource),
		}, { removed: undefined, members: [secondResource] });
	});

	test('a rejected overlapping open cannot release another open of the same canvas', async () => {
		const f = canonicalFixture();
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		f.provider.openGate = finish.p;
		f.provider.onOpen = () => { void started.complete(); };
		sinon.stub(f.canvases, 'openCanvas').callThrough().onSecondCall().rejects(new Error('Rejected before provider invocation'));
		const opening = f.canvases.protocol.open('client', f.params);
		await started.p;
		try {
			await assert.rejects(f.canvases.protocol.open('client', { ...f.params, requestId: 'overlapping-open' }), /Rejected before provider invocation/);
			const pending = f.state.getCanvasState(f.params.canvas);
			assert.ok(pending);
			await assert.rejects(f.canvases.protocol.close('client', {
				channel: pending.resource, revision: pending.revision, requestId: 'close-overlapping',
			}), { code: AhpErrorCodes.Conflict });
			await f.canvases.getCanvases(first);
			assert.deepStrictEqual(f.state.getSessionState(session)?.canvases?.map(entry => entry.resource), [f.params.canvas]);
		} finally {
			await finish.complete();
			await opening;
		}
	});

	test('an unresolved backing read does not erase restored logical membership', async () => {
		const f = canonicalFixture();
		const { canvas } = await f.canvases.protocol.open('client', f.params);
		const restored = canonicalFixture(f.databases);
		restored.provider.stateValue = { supported: true, loaded: false, catalog: [], instances: [] };
		await restored.canvases.getCanvases(first);
		const source = restored.canvases.protocol.resolveSource({ channel: canvas.resource });
		await assert.rejects(restored.canvases.protocol.close('client', { channel: canvas.resource, revision: source.revision, requestId: 'close-unresolved' }), /not yet loaded/);
		assert.deepStrictEqual({
			availability: source.availability,
			endpoint: source.source,
			members: restored.state.getSessionState(session)?.canvases?.map(entry => entry.resource),
			effects: restored.provider.calls.filter(call => call.method !== 'get'),
		}, { availability: CanvasAvailabilityStatus.NotLoaded, endpoint: undefined, members: [canvas.resource], effects: [] });
	});

	test('explicit cold restart materializes once without replaying open or issuing a second reload', async () => {
		const f = canonicalFixture();
		const opened = await f.canvases.protocol.open('client', f.params);
		const restored = canonicalFixture(f.databases);
		const live = f.provider.stateValue;
		restored.provider.stateValue = { supported: true, loaded: false, catalog: [], instances: [] };
		let prepared = 0;
		restored.provider.prepareCanvasExecution = async (_chat, _extensionId, _directories, begin) => {
			begin();
			prepared++;
			restored.provider.stateValue = live;
		};
		await restored.canvases.getCanvases(first);
		const before = restored.canvases.protocol.resolveSource({ channel: opened.canvas.resource });
		await restored.canvases.protocol.restart('client', { channel: opened.canvas.resource, incarnation: before.incarnation, requestId: 'cold-restart' });
		assert.deepStrictEqual({
			prepared,
			replayed: restored.provider.calls.filter(call => call.method !== 'get'),
			availability: restored.canvases.protocol.resolveSource({ channel: opened.canvas.resource }).availability,
		}, { prepared: 1, replayed: [], availability: CanvasAvailabilityStatus.Ready });
	});

	test('a crash during a persisted loading state is retained as indeterminate on restore', async () => {
		const f = canonicalFixture();
		const { canvas } = await f.canvases.protocol.open('client', f.params);
		const database = f.databases.get(first.toString());
		assert.ok(database);
		await database.setMetadata('canvasRegistry.v1', JSON.stringify([{ ...canvas, availability: CanvasAvailabilityStatus.Loading }]));
		const restored = canonicalFixture(f.databases);
		await restored.canvases.getCanvases(first);
		assert.strictEqual(restored.canvases.protocol.resolveSource({ channel: canvas.resource }).availability, CanvasAvailabilityStatus.Failed);
	});

	test('publishes per-chat metadata over SessionMetaChanged and preserves host and peer metadata', async () => {
		const f = fixture();
		const changes: string[] = [];
		store.add(f.state.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionMetaChanged) {
				changes.push(envelope.channel);
			}
		}));
		await f.canvases.getCanvases(first);
		f.provider.canvasEvents.fire({ chat: second, state: { ...canvasState, instances: [] } });
		f.provider.canvasEvents.fire({ chat: first, state: canvasState });
		assert.deepStrictEqual({ meta: f.state.getSessionState(session)?._meta, changes, calls: f.provider.calls }, {
			meta: { unrelated: 'preserved', [AgentHostCanvasesMetaKey]: { [first.toString()]: canvasState, [second.toString()]: { ...canvasState, instances: [] } } },
			changes: [session, session],
			calls: [{ method: 'get', chat: first.toString() }],
		});
	});

	test('routes exact peer chat and rejects unknown or read-only chats before calling the provider', async () => {
		const f = fixture();
		const params = { extensionId: 'fixture', canvasId: 'counter', instanceId: 'one' };
		await f.canvases.openCanvas(second, params);
		const readOnly = URI.parse(buildChatUri(session, 'read-only'));
		f.state.addChat(session, readOnly.toString(), { interactivity: ChatInteractivity.ReadOnly });
		assert.throws(() => f.canvases.openCanvas(readOnly, params), /read-only/);
		assert.throws(() => f.canvases.openCanvas(URI.parse(buildChatUri(session, 'missing')), params), /registered/);
		await assert.rejects(f.canvases.getCanvases(URI.parse(session)), /registered/);
		assert.deepStrictEqual(f.provider.calls, [{ method: 'open', chat: second.toString() }]);
	});

	test('deduplicates request retries, not canvas identity, and scopes retries to the sender', async () => {
		const f = fixture();
		const identity = { clientId: 'first-client', chat: first, requestId: 'first-request' };
		const operation = { kind: 'open', params: { extensionId: 'fixture', canvasId: 'counter', instanceId: 'one', input: 1 } } as const;
		const target = f.canvases.getOperationTarget(first);
		const initial = await f.canvases.runOperation(identity, target, operation);
		const retry = await f.canvases.runOperation(identity, target, operation);
		assert.throws(() => f.canvases.runOperation(identity, target, { ...operation, params: { ...operation.params, input: 2 } }), CanvasRequestConflictError);
		await f.canvases.runOperation({ ...identity, requestId: 'second-request' }, target, operation);
		await f.canvases.runOperation({ ...identity, clientId: 'other-client' }, target, operation);
		assert.deepStrictEqual({ initial, retry, calls: f.provider.calls }, {
			initial: { kind: 'open', instance: { ...operation.params, availability: 'unavailable' } },
			retry: { kind: 'open', instance: { ...operation.params, availability: 'unavailable' } },
			calls: Array.from({ length: 3 }, () => ({ method: 'open', chat: first.toString() })),
		});
	});

	test('rejects stale generation and reincarnated chats without provider effects', async () => {
		const f = fixture();
		const identity = { clientId: 'client', chat: second, requestId: 'old-generation' };
		const operation = { kind: 'open', params: { extensionId: 'fixture', canvasId: 'counter', instanceId: 'one' } } as const;
		const beforeUpdate = f.canvases.getOperationTarget(second);
		f.provider.canvasEvents.fire({ chat: second, state: canvasState });
		await assert.rejects(f.canvases.runOperation(identity, beforeUpdate, operation), /stale/);
		const beforeRemoval = f.canvases.getOperationTarget(second);
		f.state.removeChat(session, second.toString());
		f.canvases.disposeChatState(second);
		f.state.addChat(session, second.toString());
		await assert.rejects(f.canvases.runOperation({ ...identity, requestId: 'old-incarnation' }, beforeRemoval, operation), /stale/);
		assert.deepStrictEqual(f.provider.calls, []);
	});

	test('rechecks archive admission after an earlier operation releases the per-chat queue', async () => {
		const f = fixture();
		const gate = new DeferredPromise<void>();
		const entered = new DeferredPromise<void>();
		f.provider.openGate = gate.p;
		f.provider.onOpen = () => { void entered.complete(); };
		const params = { extensionId: 'fixture', canvasId: 'counter', instanceId: 'one' };
		const firstOpen = f.canvases.openCanvas(first, params);
		await entered.p;
		const queued = assert.rejects(f.canvases.openCanvas(first, { ...params, instanceId: 'two' }), /archived/);
		f.state.dispatchServerAction(session, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		await gate.complete();
		await firstOpen;
		await queued;
		assert.deepStrictEqual(f.provider.calls, [{ method: 'open', chat: first.toString() }]);
	});

	test('ignores state from a different provider or an unregistered chat', () => {
		const f = fixture();
		const other = new CanvasAgent('claude');
		f.providers.registerProvider(other);
		other.canvasEvents.fire({ chat: first, state: canvasState });
		f.provider.canvasEvents.fire({ chat: URI.parse(buildChatUri(session, 'missing')), state: canvasState });
		assert.deepStrictEqual(readAgentHostCanvasState(f.state.getSessionState(session)?._meta, first), undefined);
	});

	for (const scenario of [
		{ name: 'new logical membership', stale: { ...canvasState, instances: [] }, current: canvasState },
		{
			name: 'endpoint retirement',
			stale: { ...canvasState, instances: [{ instanceId: 'one', extensionId: 'fixture', canvasId: 'counter', availability: 'ready', url: 'http://127.0.0.1:3000/old' }] },
			current: canvasState,
		},
	] satisfies { name: string; stale: IAgentHostCanvasState; current: IAgentHostCanvasState }[]) {
		test(`a pending read cannot overwrite ${scenario.name} published by the provider`, async () => {
			const f = fixture();
			const read = new DeferredPromise<IAgentHostCanvasState>();
			f.provider.readResult = read.p;
			const pending = f.canvases.getCanvases(first);
			f.provider.canvasEvents.fire({ chat: first, state: scenario.current });
			await read.complete(scenario.stale);
			assert.deepStrictEqual({
				returned: await pending,
				published: readAgentHostCanvasState(f.state.getSessionState(session)?._meta, first),
			}, { returned: scenario.current, published: scenario.current });
		});
	}

	test('publishes materialization buffered before restored session registration without another read', async () => {
		const f = fixture(false);
		await assert.rejects(f.canvases.getCanvases(first), /registered/);
		f.provider.canvasEvents.fire({ chat: first, state: canvasState });
		f.state.restoreSession({ ...f.summary, _meta: { unrelated: 'preserved' } }, []);
		f.canvases.publishPendingState(URI.parse(session));
		assert.deepStrictEqual({ meta: f.state.getSessionState(session)?._meta, reads: f.provider.calls }, {
			meta: { unrelated: 'preserved', [AgentHostCanvasesMetaKey]: { [first.toString()]: canvasState } },
			reads: [],
		});
	});

	test('publishes a peer snapshot only after its chat is registered', () => {
		const f = fixture();
		const peer = URI.parse(buildChatUri(session, 'later'));
		f.provider.canvasEvents.fire({ chat: peer, state: canvasState });
		const before = f.state.getSessionState(session)?._meta;
		f.state.addChat(session, peer.toString());
		f.canvases.publishPendingState(URI.parse(session));
		assert.deepStrictEqual({ before, after: f.state.getSessionState(session)?._meta }, {
			before: { unrelated: 'preserved' },
			after: { unrelated: 'preserved', [AgentHostCanvasesMetaKey]: { [peer.toString()]: canvasState } },
		});
	});

	test('evicts a deleted peer and cannot republish its pending read', async () => {
		const f = fixture();
		f.provider.canvasEvents.fire({ chat: first, state: canvasState });
		f.provider.canvasEvents.fire({ chat: second, state: canvasState });
		const read = new DeferredPromise<IAgentHostCanvasState>();
		f.provider.readResult = read.p;
		const pending = assert.rejects(f.canvases.getCanvases(second), /Cancel/);
		f.state.removeChat(session, second.toString());
		f.canvases.disposeChatState(second);
		await read.complete(canvasState);
		await pending;
		f.canvases.publishPendingState(URI.parse(session));
		assert.deepStrictEqual(f.state.getSessionState(session)?._meta, {
			unrelated: 'preserved', [AgentHostCanvasesMetaKey]: { [first.toString()]: canvasState },
		});
	});

	test('evicting a session clears buffered snapshots from its previous lifetime', () => {
		const f = fixture();
		f.provider.canvasEvents.fire({ chat: first, state: canvasState });
		f.state.removeSession(session);
		f.state.restoreSession(f.summary, []);
		f.canvases.publishPendingState(URI.parse(session));
		assert.deepStrictEqual(readAgentHostCanvasState(f.state.getSessionState(session)?._meta, first), undefined);
	});
});

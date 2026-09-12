/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { realpath } from 'fs/promises';
import type { CopilotClient, CopilotSession, ExtensionLaunchProviderResolveRequest, SessionEvent, SessionEventPayload, SessionEventType } from '@github/copilot-sdk';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentCanvasOperation } from '../../common/agentHostCanvases.js';
import { isCanvasSessionRetained } from '../../common/meta/agentCanvasSessionMeta.js';
import { CanvasAvailabilityStatus, CanvasTrustStatus, type CanvasState } from '../../common/state/protocol/channels-canvas/state.js';
import type { OpenCanvasParams } from '../../common/state/protocol/channels-canvas/commands.js';
import type { IAgentHostCanvasesService } from '../../node/agentHostCanvasesService.js';
import { CopilotCanvases, type ICopilotCanvasHost } from '../../node/copilot/copilotCanvases.js';
import { CopilotSessionEventBuffer, CopilotSessionWrapper } from '../../node/copilot/copilotSessionWrapper.js';
import { unavailableCanvases } from '../common/agentHostCanvasesTestUtils.js';
import { canvasChat, canvasIdentity, canvasSession, createCanvasHostServices, createCanvasSession } from './agentHostCanvasTestUtils.js';
import { MockAgent } from './mockAgent.js';

type NativeCanvas = Awaited<ReturnType<CopilotSession['rpc']['canvas']['list']>>['canvases'][number];
type NativeInstance = Awaited<ReturnType<CopilotSession['rpc']['canvas']['listOpen']>>['openCanvases'][number];

const nativeIdentity = { extensionId: 'project:counter', canvasId: 'counter', instanceId: 'main' };
const endpoint = 'http://127.0.0.1:8123/app?transient=not-persisted';
const openParams: OpenCanvasParams = { channel: canvasSession, canvas: 'ahp-canvas:/native', identity: canvasIdentity, title: 'Counter', requestId: 'open' };

function nativeEvent<K extends SessionEventType>(type: K, data: SessionEventPayload<K>['data']): SessionEventPayload<K> {
	// The public SDK event union is discriminated by the supplied type.
	return { type, data, id: 'event', timestamp: '2026-01-01T00:00:00Z', parentId: null, ...(type === 'user.message' ? {} : { ephemeral: true }) } as SessionEventPayload<K>;
}

function createFixture(store: Pick<DisposableStore, 'add'>, canvases?: IAgentHostCanvasesService) {
	const calls: string[] = [];
	const approvals: Array<{ chat: string; message: string; clientId: string | undefined }> = [];
	const attachments: Array<{ chat: string; count: number }> = [];
	let approve = async () => true;
	let retainGate = Promise.resolve();
	let retainResponse = 'null';
	let listGate = Promise.resolve();
	let listOpenGate = Promise.resolve();
	let openGate = Promise.resolve();
	let openEndpoint = endpoint;
	const openInputs: Parameters<CopilotSession['rpc']['canvas']['open']>[0][] = [];
	let closeGate = Promise.resolve();
	let connected = true;
	let busy = false;
	let onPrepare = async () => { };
	let onRecover = async () => { };
	const events = store.add(new Emitter<SessionEvent>());
	let catalog: NativeCanvas[] = [{ ...nativeIdentity, displayName: 'Counter', description: 'Counter', actions: [{ name: 'increment' }] }];
	let instances: NativeInstance[] = [{ ...nativeIdentity, title: 'Counter', url: endpoint }];
	const rpc = new class extends mock<CopilotSession['rpc']>() {
		override readonly canvas = {
			list: async () => { calls.push('list'); const canvases = catalog; await listGate; return { canvases }; },
			listOpen: async () => { calls.push('listOpen'); const openCanvases = instances; await listOpenGate; return { openCanvases }; },
			open: async (params: Parameters<CopilotSession['rpc']['canvas']['open']>[0]) => {
				calls.push('open');
				openInputs.push(params);
				await openGate;
				assert.ok(params.extensionId);
				return { ...params, extensionId: params.extensionId, url: openEndpoint };
			},
			close: async () => { calls.push('close'); await closeGate; },
			action: { invoke: async () => { calls.push('invoke'); return { count: 1 }; } },
		};
	}();
	const session = new class extends mock<CopilotSession>() {
		override readonly sessionId = 'native-session';
		override get rpc() { return rpc; }
		override on(handler: (event: SessionEvent) => void): () => void;
		override on<K extends SessionEventType>(type: K, handler: (event: SessionEventPayload<K>) => void): () => void;
		override on<K extends SessionEventType>(type: K | ((event: SessionEvent) => void), handler?: (event: SessionEventPayload<K>) => void): () => void {
			const listener = typeof type === 'function'
				? events.event(type)
				: Event.filter<SessionEventPayload<K>, SessionEvent>(events.event, (event): event is SessionEventPayload<K> => event.type === type)(event => handler?.(event));
			return () => listener.dispose();
		}
		override async disconnect(): Promise<void> { calls.push('disconnect'); }
	}();
	const clientRpc = new class extends mock<CopilotClient['rpc']>() {
		override readonly session = new class extends mock<CopilotClient['rpc']['session']>() {
			override retain = async (params: Parameters<CopilotClient['rpc']['session']['retain']>[0]): Promise<null> => {
				calls.push(`retain:${params.sessionId}`);
				await retainGate;
				return JSON.parse(retainResponse);
			};
		}();
	}();
	const client = new class extends mock<CopilotClient>() {
		override get rpc() {
			if (!connected) {
				throw new Error('Client is not connected.');
			}
			return clientRpc;
		}
	}();
	const host: ICopilotCanvasHost = {
		prepare: async () => { calls.push('prepare'); await onPrepare(); },
		isBusy: () => busy,
		residentChats: () => [canvasChat],
		recoverOwnedRuntime: async () => { calls.push('recover'); await onRecover(); },
	};
	const adapter = store.add(new CopilotCanvases(host, canvases ?? {
		...unavailableCanvases,
		requestApproval: async (chat, message, token, clientId) => {
			approvals.push({ chat, message, clientId });
			return raceCancellationError(approve(), token);
		},
		appendAttachments: (chat, values) => attachments.push({ chat, count: values.length }),
	}));
	const operation: IAgentCanvasOperation = { token: CancellationToken.None, willExecute: () => calls.push('effect'), clientId: 'origin-client' };
	const request: ExtensionLaunchProviderResolveRequest = {
		source: 'project', id: 'project:counter', name: 'counter', modulePath: URI.parse(import.meta.url).fsPath,
		sessionId: session.sessionId, defaultLaunch: { executable: process.execPath, args: ['unchanged-bootstrap'], env: { ORIGINAL: 'preserved' } },
	};
	const wrapper = store.add(new CopilotSessionWrapper(session));
	const start = () => { adapter.clientStarting(client); adapter.clientStarted(client); };
	const bind = (startup: 'complete' | 'pending' = 'complete') => {
		const launch = store.add(adapter.beginLaunch(session.sessionId, canvasChat));
		if (startup === 'complete') {
			launch.onEvent(nativeEvent('session.extensions_loaded', { extensions: [{ id: request.id, name: request.name, source: request.source, status: 'running' }] }));
		}
		return launch;
	};
	const admit = () => adapter.launchProvider.resolve(request);
	const state = (): CanvasState => {
		const instance = adapter.getSnapshot(canvasChat)?.instances[0];
		assert.ok(instance);
		return { resource: openParams.canvas, ...instance, identity: { ...instance.identity, incarnation: 'incarnation' }, trust: { status: CanvasTrustStatus.Trusted }, revision: 1 };
	};
	return {
		adapter, client, session, events, wrapper, operation, request, calls, approvals, attachments, openInputs, start, bind, admit, state,
		setApproval: (value: () => Promise<boolean>) => { approve = value; },
		setRetainGate: (value: Promise<void>) => { retainGate = value; },
		setRetainResponse: (value: string) => { retainResponse = value; },
		setListGate: (value: Promise<void>) => { listGate = value; },
		setListOpenGate: (value: Promise<void>) => { listOpenGate = value; },
		setOpenGate: (value: Promise<void>) => { openGate = value; },
		setOpenEndpoint: (value: string) => { openEndpoint = value; },
		setCloseGate: (value: Promise<void>) => { closeGate = value; },
		setCatalog: (value: NativeCanvas[]) => { catalog = value; },
		setInstances: (value: NativeInstance[]) => { instances = value; },
		setConnected: (value: boolean) => { connected = value; },
		setBusy: (value: boolean) => { busy = value; },
		setPrepare: (value: () => Promise<void>) => { onPrepare = value; },
		setRecover: (value: () => Promise<void>) => { onRecover = value; },
	};
}

suite('Copilot canvases', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('support requires completed launch-provider startup; cached reads never start it', async () => {
		const f = createFixture(store);
		f.adapter.clientStarting(f.client);
		assert.deepStrictEqual([f.adapter.available, f.adapter.getSnapshot(canvasChat), await f.admit(), f.calls], [false, undefined, { launch: null }, []]);
		f.adapter.clientStarted(f.client);
		assert.strictEqual(f.adapter.available, true);
	});

	test('admission binds the exact chat and retains before returning the original recipe', async () => {
		const f = createFixture(store);
		f.start();
		f.bind();
		const retained = new DeferredPromise<void>();
		f.setRetainGate(retained.p);
		let settled = false;
		const result = f.admit().then(value => { settled = true; return value; });
		while (!f.calls.length) {
			await timeout(0);
		}
		assert.deepStrictEqual([settled, f.calls, f.approvals[0].chat], [false, ['retain:native-session'], canvasChat]);
		await retained.complete();
		assert.strictEqual((await result).launch, f.request.defaultLaunch);
		assert.match(f.approvals[0].message, /mutable-directory trust.*unsandboxed.*separate from Workspace Trust/);
	});

	test('initialization is not ready before the complete registry returns and never reloads a ready backing', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		const listed = new DeferredPromise<void>();
		f.setListGate(listed.p);
		const attach = launch.attach(f.wrapper);
		assert.strictEqual(f.adapter.getSnapshot(canvasChat), undefined);
		await listed.complete();
		await attach;
		const effects = [...f.calls];
		await f.adapter.initializeChat(canvasChat, f.operation);
		await f.adapter.initializeChat(canvasChat, f.operation);
		assert.deepStrictEqual({ calls: f.calls, types: f.adapter.getSnapshot(canvasChat)?.types.length }, { calls: effects, types: 1 });
	});

	for (const query of ['list', 'listOpen'] as const) {
		test(`startup completion is followed by a complete ${query} before registry readiness`, async () => {
			const f = createFixture(store);
			f.start();
			const launch = f.bind('pending');
			await f.admit();
			const listed = new DeferredPromise<void>();
			if (query === 'list') {
				f.setListGate(listed.p);
			} else {
				f.setListOpenGate(listed.p);
			}
			let settled = false;
			const attached = launch.attach(f.wrapper).then(() => { settled = true; });
			await timeout(0);
			const beforeStartup = { settled, snapshot: f.adapter.getSnapshot(canvasChat), calls: [...f.calls] };
			launch.onEvent(nativeEvent('session.extensions_loaded', {
				extensions: [{ id: f.request.id, name: f.request.name, source: f.request.source, status: 'running' }],
			}));
			await timeout(0);
			const duringQuery = { settled, snapshot: f.adapter.getSnapshot(canvasChat), calls: [...f.calls] };
			await listed.complete();
			await attached;
			assert.deepStrictEqual({
				beforeStartup, duringQuery, settled, types: f.adapter.getSnapshot(canvasChat)?.types.length,
			}, {
				beforeStartup: { settled: false, snapshot: undefined, calls: ['retain:native-session'] },
				duringQuery: { settled: false, snapshot: undefined, calls: ['retain:native-session', 'list', 'listOpen'] },
				settled: true, types: 1,
			});
		});

		test(`the original ${query} failure survives startup completion`, async () => {
			const f = createFixture(store);
			f.start();
			const launch = f.bind();
			const listed = new DeferredPromise<void>();
			if (query === 'list') {
				f.setListGate(listed.p);
			} else {
				f.setListOpenGate(listed.p);
			}
			const failure = new Error('Native registry query failed');
			const rejected = assert.rejects(launch.attach(f.wrapper), error => error === failure);
			await timeout(0);
			await listed.error(failure);
			await rejected;
			assert.strictEqual(f.adapter.getSnapshot(canvasChat), undefined);
		});
	}

	for (const cancellation of ['launch', 'wrapper', 'authority'] as const) {
		test(`${cancellation} cancellation fences a late extension startup completion`, async () => {
			const f = createFixture(store);
			f.start();
			const launch = f.bind('pending');
			const rejected = assert.rejects(launch.attach(f.wrapper), isCancellationError);
			switch (cancellation) {
				case 'launch': launch.dispose(); break;
				case 'wrapper': f.wrapper.dispose(); break;
				case 'authority': f.adapter.loseAuthority(); break;
			}
			await rejected;
			launch.onEvent(nativeEvent('session.extensions_loaded', { extensions: [] }));
			assert.deepStrictEqual({
				cancelled: launch.token.isCancellationRequested, snapshot: f.adapter.getSnapshot(canvasChat),
				calls: f.calls, authorityLost: f.adapter.authorityLost,
			}, {
				cancelled: true, snapshot: undefined,
				calls: cancellation === 'wrapper' ? ['disconnect'] : [], authorityLost: cancellation === 'authority',
			});
		});
	}

	for (const command of ['initialize', 'open'] as const) {
		test(`host ${command} keeps source approvals authoritative after the SDK handle returns and before startup completes`, async () => {
			const services = createCanvasHostServices(store);
			const f = createFixture(store, services.service);
			services.providers.registerProvider(new class extends MockAgent {
				readonly canvases = f.adapter;
			}('copilot'));
			createCanvasSession(services.state);
			store.add(services.connections.registerSource({
				hasSeenClient: () => true, isClientConnected: () => true,
				getConnectedClientTransportCounts: () => new Map([['owner', 1]]), getSubscribedClients: () => ['owner'],
				requestWorkspaceTrust: async () => false, requestCanvasApproval: async () => { throw new Error('Use the original physical transport.'); },
			}));
			const entered = new DeferredPromise<void>();
			const approved = new DeferredPromise<boolean>();
			const connection = store.add(services.service.connect('owner', async () => {
				await entered.complete();
				return approved.p;
			}));
			f.start();
			f.setCatalog([]);
			f.setInstances([]);
			const materialized = new DeferredPromise<{ launch: ReturnType<typeof f.bind>; resolving: ReturnType<typeof f.admit> }>();
			f.setPrepare(async () => {
				const launch = f.bind('pending');
				const resolving = f.admit();
				await entered.p;
				const attached = launch.attach(f.wrapper);
				await materialized.complete({ launch, resolving });
				await attached;
			});
			const initializing = command === 'initialize'
				? connection.initializeCanvasChat({ channel: canvasChat, requestId: command })
				: connection.openCanvas({ ...openParams, requestId: command });
			const outcome = initializing.then(() => 'complete', () => 'rejected');
			const { launch, resolving } = await materialized.p;
			await timeout(0);
			const early = {
				snapshot: f.adapter.getSnapshot(canvasChat),
				initializing: services.service.isChatInitializing(canvasChat),
			};
			await approved.complete(true);
			const result = await resolving;
			const granted = result.launch === f.request.defaultLaunch;
			if (granted) {
				const declaration: NativeCanvas = { ...nativeIdentity, displayName: 'Counter', description: '', actions: [] };
				f.setCatalog([declaration]);
				launch.onEvent(nativeEvent('session.canvas.registry_changed', { canvases: [declaration] }));
			}
			launch.onEvent(nativeEvent('session.extensions_loaded', {
				extensions: [{ id: f.request.id, name: f.request.name, source: f.request.source, status: granted ? 'running' : 'failed' }],
			}));
			if (!granted) {
				connection.dispose();
			}
			const settled = await outcome;
			const session = services.state.getSessionState(canvasSession)!;
			const observer = store.add(services.service.connect('reader'));
			assert.deepStrictEqual({
				early, granted, settled, retained: isCanvasSessionRetained(session),
				turns: session.turns, members: services.state.getChatCanvasStates(canvasChat).length,
				types: (await observer.listCanvasTypes({ channel: canvasChat })).types.length,
				initializing: services.service.isChatInitializing(canvasChat),
			}, {
				early: { snapshot: undefined, initializing: true }, granted: true, settled: 'complete', retained: true,
				turns: [], members: command === 'open' ? 1 : 0, types: 1, initializing: false,
			});
		});
	}

	test('same-identity reopen forwards new input and replaces the effective endpoint', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		await launch.attach(f.wrapper);
		await f.adapter.open({ ...openParams, input: { revision: 1 } }, f.operation);
		const firstGeneration = f.adapter.getSnapshot(canvasChat)?.instances[0].generation;
		f.setOpenEndpoint('http://127.0.0.1:8123/reopened?revision=2');
		await f.adapter.open({ ...openParams, input: { revision: 2 }, requestId: 'open-again' }, f.operation);
		const source = await f.adapter.resolve(f.state(), 'client', CancellationToken.None);
		assert.deepStrictEqual({
			inputs: f.openInputs.map(input => input.input), instances: f.adapter.getSnapshot(canvasChat)?.instances.length,
			changed: f.adapter.getSnapshot(canvasChat)?.instances[0].generation !== firstGeneration, source,
		}, { inputs: [{ revision: 1 }, { revision: 2 }], instances: 1, changed: true, source: { url: 'http://127.0.0.1:8123/reopened?revision=2' } });
	});

	test('native file presentation resolves canonically without granting trusted-file authority or calling the runtime', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		const file = new URL(import.meta.url);
		file.host = 'localhost';
		file.search = '?view=two';
		file.hash = '#counter';
		f.setInstances([{ ...nativeIdentity, title: 'File', url: file.toString() }]);
		await launch.attach(f.wrapper);
		const calls = [...f.calls];
		const source = await f.adapter.resolve(f.state(), 'client', CancellationToken.None);
		const canonical = URI.file(await realpath(URI.parse(import.meta.url).fsPath)).toString();
		assert.deepStrictEqual({
			source, identitySource: f.state().identity.source, calls: f.calls,
		}, { source: { url: `${canonical}?view=two#counter` }, identitySource: canvasIdentity.source, calls });
	});

	test('non-null retention responses cannot authorize top-level execution', async () => {
		const f = createFixture(store);
		f.start();
		f.bind();
		const launches = [];
		for (const response of ['false', '{}', '[]', '0', '""']) {
			f.setRetainResponse(response);
			launches.push((await f.admit()).launch);
		}
		assert.deepStrictEqual(launches, [null, null, null, null, null]);
	});

	test('denial, wrong session, relative source, namespace mismatch and racing IDs cannot launch', async () => {
		const f = createFixture(store);
		f.start();
		f.bind();
		f.setApproval(async () => false);
		const denied = await f.admit();
		const wrong = await f.adapter.launchProvider.resolve({ ...f.request, sessionId: 'other-chat' });
		const relative = await f.adapter.launchProvider.resolve({ ...f.request, modulePath: 'relative.js' });
		const namespace = await f.adapter.launchProvider.resolve({ ...f.request, id: 'user:counter' });
		const approval = new DeferredPromise<boolean>();
		f.setApproval(() => approval.p);
		const pending = f.admit();
		const duplicate = await f.admit();
		await approval.complete(false);
		assert.deepStrictEqual([denied, wrong, relative, namespace, duplicate, await pending, f.calls], [
			{ launch: null }, { launch: null }, { launch: null }, { launch: null }, { launch: null }, { launch: null }, [],
		]);
	});

	test('SDK cancellation prevents late consent and retention', async () => {
		const f = createFixture(store);
		f.start();
		f.bind();
		const cancellation = store.add(new CancellationTokenSource());
		const approval = new DeferredPromise<boolean>();
		f.setApproval(() => approval.p);
		const result = f.adapter.launchProvider.resolve(f.request, cancellation.token);
		while (!f.approvals.length) {
			await timeout(0);
		}
		cancellation.cancel();
		await assert.rejects(result, /Canceled/);
		await approval.complete(true);
		assert.deepStrictEqual(f.calls, []);
	});

	test('canvas-first cancellation retires pending source admission without a synthetic turn', async () => {
		const f = createFixture(store);
		f.start();
		const cancellation = store.add(new CancellationTokenSource());
		const approval = new DeferredPromise<boolean>();
		f.setApproval(() => approval.p);
		f.setPrepare(async () => { f.bind(); await f.admit(); });
		const prepared = f.adapter.prepare(canvasIdentity, { ...f.operation, token: cancellation.token });
		while (!f.approvals.length) {
			await timeout(0);
		}
		cancellation.cancel();
		await assert.rejects(prepared, /Canceled/);
		await approval.complete(true);
		assert.deepStrictEqual([f.approvals[0].clientId, f.calls, f.adapter.getSnapshot(canvasChat)], ['origin-client', ['effect', 'prepare'], undefined]);
	});

	test('environment consent names an admitted original source and exact variables, without toolCallId', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		const approved = await launch.permission({ kind: 'extension-env-access', extensionName: 'project:counter', environmentVariables: ['PROJECT_TOKEN'] });
		const rejected = await launch.permission({ kind: 'extension-env-access', extensionName: 'user:counter', environmentVariables: ['PROJECT_TOKEN'] });
		const invalidName = await launch.permission({ kind: 'extension-env-access', extensionName: 'project:counter', environmentVariables: ['NOT-A-NAME'] });
		assert.deepStrictEqual([approved, rejected, invalidName, f.approvals.map(value => value.chat)], [{ kind: 'approve-once' }, { kind: 'reject' }, { kind: 'reject' }, [canvasChat, canvasChat]]);
		assert.match(f.approvals[1].message, /project:counter.*PROJECT_TOKEN.*Values are never included/);
	});

	test('native opens are observations, expose live actions and never trigger a second open', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		await launch.attach(f.wrapper);
		const state = f.state();
		const source = await f.adapter.resolve(state, 'client', CancellationToken.None);
		assert.deepStrictEqual([state.availability, source, f.calls], [
			{ status: CanvasAvailabilityStatus.Ready, actions: [{ id: 'increment' }] }, { url: endpoint }, ['retain:native-session', 'list', 'listOpen'],
		]);
		assert.ok(!JSON.stringify(f.adapter.getSnapshot(canvasChat)).includes(endpoint));
	});

	test('early close fences a stale listOpen result', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		const listed = new DeferredPromise<void>();
		f.setListGate(listed.p);
		const attached = launch.attach(f.wrapper);
		launch.onEvent(nativeEvent('session.canvas.closed', nativeIdentity));
		await listed.complete();
		await attached;
		assert.deepStrictEqual(f.adapter.getSnapshot(canvasChat)?.instances, []);
	});

	test('a close during open does not publish the stale RPC completion', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		await launch.attach(f.wrapper);
		const gate = new DeferredPromise<void>();
		f.setOpenGate(gate.p);
		const opened = f.adapter.open(openParams, f.operation);
		launch.onEvent(nativeEvent('session.canvas.closed', nativeIdentity));
		await gate.complete();
		await assert.rejects(opened, /closed while/);
		assert.deepStrictEqual(f.adapter.getSnapshot(canvasChat)?.instances, []);
	});

	test('close and recreation rotate individual endpoint identity without replacing the backing', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		await launch.attach(f.wrapper);
		const before = f.adapter.getSnapshot(canvasChat)!;
		launch.onEvent(nativeEvent('session.canvas.closed', nativeIdentity));
		launch.onEvent(nativeEvent('session.canvas.opened', { ...nativeIdentity, url: endpoint }));
		const after = f.adapter.getSnapshot(canvasChat)!;
		assert.deepStrictEqual([after.generation === before.generation, after.instances[0].generation === before.instances[0].generation], [true, false]);
	});

	test('close ACK cannot delete a replacement instance', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		await launch.attach(f.wrapper);
		const gate = new DeferredPromise<void>();
		f.setCloseGate(gate.p);
		const closed = f.adapter.close(f.state(), f.operation);
		launch.onEvent(nativeEvent('session.canvas.closed', nativeIdentity));
		launch.onEvent(nativeEvent('session.canvas.opened', { ...nativeIdentity, title: 'Replacement', url: endpoint }));
		await gate.complete();
		await assert.rejects(closed, /different native instance/);
		assert.strictEqual(f.state().title, 'Replacement');
	});

	test('coalesced close and cross-type open retain both full canonical identities', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		f.setCatalog([
			{ ...nativeIdentity, displayName: 'Counter', description: '' },
			{ ...nativeIdentity, canvasId: 'triage', displayName: 'Triage', description: '' },
		]);
		await launch.attach(f.wrapper);
		launch.onEvent(nativeEvent('session.canvas.closed', nativeIdentity));
		launch.onEvent(nativeEvent('session.canvas.opened', { ...nativeIdentity, canvasId: 'triage', url: endpoint }));
		const snapshot = f.adapter.getSnapshot(canvasChat);
		assert.deepStrictEqual({
			closed: snapshot?.closed?.map(identity => identity.canvasType),
			open: snapshot?.instances.map(instance => instance.identity.canvasType),
		}, { closed: ['counter'], open: ['triage'] });
	});

	test('source revocation and public connection loss invalidate pulls without restart or replacement', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		await launch.attach(f.wrapper);
		const state = f.state();
		f.setConnected(false);
		const source = await f.adapter.resolve(state, 'client', CancellationToken.None);
		assert.deepStrictEqual([f.adapter.available, f.adapter.authorityLost, source, f.calls], [false, true, undefined, ['retain:native-session', 'list', 'listOpen']]);
		assert.throws(() => f.adapter.clientStarting(f.client), /Explicit owned-runtime recovery/);
	});

	test('schema references are bounded, immutable, generation- and source-bound', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		const schema = { type: 'object', properties: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`p${index}`, { type: 'string' }])) };
		const catalog: NativeCanvas[] = [{ ...nativeIdentity, displayName: 'Counter', description: '', inputSchema: schema }];
		f.setCatalog(catalog);
		await launch.attach(f.wrapper);
		const reference = f.adapter.getSnapshot(canvasChat)?.types[0].openInputSchemaRef;
		assert.ok(reference && reference.length < 128);
		const resolved = await f.adapter.resolveSchema(canvasChat, canvasIdentity.source, reference);
		launch.onEvent(nativeEvent('session.canvas.registry_changed', { canvases: [{ ...catalog[0], inputSchema: { ...schema, required: ['p0'] } }] }));
		assert.deepStrictEqual([resolved, await f.adapter.resolveSchema(canvasChat, canvasIdentity.source, reference), await f.adapter.resolveSchema(`${canvasChat}/other`, canvasIdentity.source, reference)], [schema, schema, undefined]);
		assert.notStrictEqual(f.adapter.getSnapshot(canvasChat)?.types[0].openInputSchemaRef, reference);
		launch.onEvent(nativeEvent('session.extensions_loaded', { extensions: [{ id: nativeIdentity.extensionId, name: 'counter', source: 'project', status: 'disabled' }] }));
		assert.deepStrictEqual([
			await f.adapter.resolveSchema(canvasChat, canvasIdentity.source, reference),
			await f.adapter.resolve({ resource: openParams.canvas, identity: { ...canvasIdentity, incarnation: 'old' }, title: 'Counter', availability: { status: CanvasAvailabilityStatus.NotLoaded }, trust: { status: CanvasTrustStatus.Pending }, revision: 1 }, 'client', CancellationToken.None),
		], [undefined, undefined]);
	});

	test('live registry metadata and retained schema references have aggregate bounds', async () => {
		for (const oversizedEvent of [false, true]) {
			const f = createFixture(store);
			f.start();
			const launch = f.bind();
			await f.admit();
			await launch.attach(f.wrapper);
			for (let index = 0; index < (oversizedEvent ? 1 : 9); index++) {
				launch.onEvent(nativeEvent('session.canvas.registry_changed', {
					canvases: [{
						...nativeIdentity, displayName: 'Counter', description: oversizedEvent ? 'x'.repeat(8 * 1024 * 1024) : '',
						inputSchema: { type: 'object', properties: Object.fromEntries(Array.from({ length: 65 }, (_, property) => [`p${property}`, { type: 'string' }])), description: `${index}${'x'.repeat(950_000)}` },
					}],
				}));
			}
			assert.deepStrictEqual([f.adapter.getSnapshot(canvasChat)?.instances[0].availability.status, f.adapter.getTrust(canvasChat, canvasIdentity.source).status], [CanvasAvailabilityStatus.Failed, CanvasTrustStatus.Blocked]);
		}
	});

	test('pushed attachments stay on their owning chat and reject unadmitted or oversized contexts', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		const context = { type: 'extension_context', extensionId: nativeIdentity.extensionId, title: 'Counter state', capturedAt: '2026-01-01T00:00:00Z', payload: { count: 1 } } as const;
		launch.onEvent(nativeEvent('session.extensions.attachments_pushed', { attachments: [context] }));
		await f.admit();
		launch.onEvent(nativeEvent('session.extensions.attachments_pushed', { attachments: [context] }));
		launch.onEvent(nativeEvent('session.extensions.attachments_pushed', { attachments: [{ ...context, extensionId: 'user:other' }] }));
		launch.onEvent(nativeEvent('session.extensions.attachments_pushed', { attachments: [{ ...context, payload: { content: 'x'.repeat(65_537) } }] }));
		assert.deepStrictEqual(f.attachments, [{ chat: canvasChat, count: 1 }]);
	});

	test('lost launch authority requires an explicit owned-runtime restart and never replays an action', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		await launch.attach(f.wrapper);
		const state = f.state();
		f.adapter.loseAuthority();
		f.calls.length = 0;
		f.setApproval(async () => false);
		await assert.rejects(f.adapter.restart(state, f.operation), /not approved/);
		assert.deepStrictEqual(f.calls, []);
		f.setApproval(async () => true);
		f.setRecover(async () => f.start());
		f.setPrepare(async () => {
			const replacement = f.bind();
			await f.admit();
			await replacement.attach(f.wrapper);
		});
		await f.adapter.restart(state, f.operation);
		assert.deepStrictEqual([f.adapter.available, f.calls], [true, ['effect', 'recover', 'effect', 'prepare', 'retain:native-session', 'list', 'listOpen']]);
		assert.match(f.approvals[1].message, /disconnects 1 resident chats.*No canvas action or model turn will be replayed/);
	});

	test('invalid current declarations retire ready endpoints instead of preserving stale actions', async () => {
		const f = createFixture(store);
		f.start();
		const launch = f.bind();
		await f.admit();
		await launch.attach(f.wrapper);
		launch.onEvent(nativeEvent('session.canvas.registry_changed', { canvases: [{ ...nativeIdentity, displayName: 'Counter', description: '', actions: [{ name: 'duplicate' }, { name: 'duplicate' }] }] }));
		assert.deepStrictEqual([f.adapter.getSnapshot(canvasChat)?.instances[0].availability.status, f.adapter.getTrust(canvasChat, canvasIdentity.source).status], [CanvasAvailabilityStatus.Failed, CanvasTrustStatus.Blocked]);
	});

	test('early live SDK messages and assistant events replay once after handlers exist', () => {
		const f = createFixture(store);
		const buffer = new CopilotSessionEventBuffer();
		const first = nativeEvent('user.message', { content: 'Native message' });
		buffer.capture(first);
		const wrapper = store.add(new CopilotSessionWrapper(f.session, buffer));
		const received: string[] = [];
		store.add(wrapper.onUserMessage(event => received.push(event.data.content)));
		store.add(wrapper.onMessageDelta(event => received.push(event.data.deltaContent)));
		const delta = nativeEvent('assistant.message_delta', { messageId: 'response', deltaContent: 'Early response' });
		buffer.capture(delta);
		f.events.fire(delta);
		assert.deepStrictEqual(received, []);
		wrapper.releaseBufferedEvents();
		wrapper.releaseBufferedEvents();
		assert.deepStrictEqual(received, ['Native message', 'Early response']);
	});

	test('early event overflow fails explicitly rather than silently losing a turn', () => {
		const f = createFixture(store);
		const buffer = new CopilotSessionEventBuffer();
		for (let i = 0; i < 1025; i++) {
			buffer.capture(nativeEvent('user.message', { content: 'message' }));
		}
		const wrapper = store.add(new CopilotSessionWrapper(f.session, buffer));
		assert.throws(() => wrapper.releaseBufferedEvents(), /bounded buffer/);
	});

	test('pending wrappers deliver early events once and disconnect late SDK objects after disposal', async () => {
		const f = createFixture(store);
		const pending = store.add(new CopilotSessionWrapper(f.session.sessionId));
		const received: string[] = [];
		store.add(pending.onUserMessage(event => received.push(event.data.content)));
		pending.acceptSessionEvent(nativeEvent('user.message', { content: 'Before create completed' }));
		await pending.attachSession(f.session);
		f.events.fire(nativeEvent('user.message', { content: 'After create completed' }));
		const cancelled = store.add(new CopilotSessionWrapper(f.session.sessionId));
		cancelled.dispose();
		await assert.rejects(cancelled.attachSession(f.session), /Canceled/);
		assert.deepStrictEqual({
			received, ready: await pending.whenReady === f.session,
			cancelled: await cancelled.whenReady, calls: f.calls,
		}, { received: ['Before create completed', 'After create completed'], ready: true, cancelled: undefined, calls: ['disconnect'] });
	});
});

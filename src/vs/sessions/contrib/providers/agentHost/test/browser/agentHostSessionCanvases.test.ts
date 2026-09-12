/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getAgentHostExtensionInitializeResultMeta, type InitializeCanvasChatParams } from '../../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import type { CloseCanvasParams, InvokeCanvasActionParams, ListCanvasTypesParams, ListCanvasTypesResult, OpenCanvasParams, OpenCanvasResult, ResolveCanvasSourceParams, RestartCanvasProviderParams } from '../../../../../../platform/agentHost/common/state/protocol/channels-canvas/commands.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, type CanvasEntry, type CanvasState, type CanvasTypeDeclaration } from '../../../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostSessionCanvases, type IAgentHostCanvasBinding } from '../../browser/agentHostSessionCanvases.js';
import { canvasEntry, createCanvasState } from '../../../../canvases/test/common/sessionCanvasTestUtils.js';

type CanvasConnection = IAgentHostCanvasBinding['connection'];

class TestCanvasConnection extends Disposable implements CanvasConnection {
	readonly initializeResult = observableValue<InitializeResult | undefined>(this, { protocolVersion: '1', serverSeq: 0, snapshots: [], canvases: {}, _meta: getAgentHostExtensionInitializeResultMeta(true) });
	readonly changed = this._register(new Emitter<CanvasState>());
	readonly failed = this._register(new Emitter<Error>());
	readonly listings: ListCanvasTypesParams[] = [];
	readonly initializations: InitializeCanvasChatParams[] = [];
	readonly resolutions: ResolveCanvasSourceParams[] = [];
	readonly effects: (OpenCanvasParams | InvokeCanvasActionParams | CloseCanvasParams | RestartCanvasProviderParams)[] = [];
	readonly subscriptions: string[] = [];
	activeSubscriptions = 0;
	state = createCanvasState();
	onList: ((params: ListCanvasTypesParams) => Promise<ListCanvasTypesResult>) | undefined;
	onOpen: ((params: OpenCanvasParams) => Promise<OpenCanvasResult>) | undefined;
	onInitialize: ((params: InitializeCanvasChatParams, token: CancellationToken) => Promise<void>) | undefined;
	subscribeError: Error | undefined;

	async initializeCanvasChat(params: InitializeCanvasChatParams, token = CancellationToken.None): Promise<void> {
		this.initializations.push(params);
		await this.onInitialize?.(params, token);
	}

	async listCanvasTypes(params: ListCanvasTypesParams): Promise<ListCanvasTypesResult> {
		this.listings.push(params);
		return this.onList?.(params) ?? { types: [] };
	}
	async openCanvas(params: OpenCanvasParams): Promise<OpenCanvasResult> {
		this.effects.push(params);
		return this.onOpen?.(params) ?? { canvas: { ...canvasEntry(this.state), resource: params.canvas, identity: { ...params.identity, incarnation: this.state.identity.incarnation } } };
	}
	async resolveCanvasSource(params: ResolveCanvasSourceParams) {
		this.resolutions.push(params);
		return { availability: CanvasAvailabilityStatus.Ready, revision: this.state.revision, incarnation: this.state.identity.incarnation, source: { url: 'https://fixture.invalid/current' } };
	}
	async invokeCanvasAction(params: InvokeCanvasActionParams) { this.effects.push(params); return { result: 'reply' }; }
	async closeCanvas(params: CloseCanvasParams): Promise<void> { this.effects.push(params); }
	async restartCanvasProvider(params: RestartCanvasProviderParams): Promise<void> { this.effects.push(params); }
	getSubscription(kind: StateComponents.Canvas, resource: URI) {
		if (this.subscribeError) {
			throw this.subscribeError;
		}
		assert.strictEqual(kind, StateComponents.Canvas);
		this.subscriptions.push(resource.toString());
		this.activeSubscriptions++;
		const connection = this;
		return {
			object: {
				get value() { return connection.state; },
				get verifiedValue() { return connection.state; },
				onDidChange: this.changed.event, onDidError: this.failed.event,
				onWillApplyAction: Event.None, onDidApplyAction: Event.None,
			},
			dispose: () => this.activeSubscriptions--,
		};
	}
}

suite('Agent Host session canvas projection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('ahp-session:/one');
	const chat = URI.parse('ahp-session:/one/chat/default');
	const declaration: CanvasTypeDeclaration = { source: { kind: CanvasSourceKind.Extension, extensionId: 'fixture.counter' }, canvasType: 'counter', title: 'Counter' };

	function fixture(waitForSession?: () => Promise<void>) {
		const connection = store.add(new TestCanvasConnection());
		const binding = observableValue<IAgentHostCanvasBinding | undefined>('connection', { connection });
		const enabled = observableValue('enabled', true);
		const entries = observableValue<readonly CanvasEntry[] | undefined>('entries', [canvasEntry(connection.state)]);
		let keepAlive = 0;
		const canvases = store.add(new AgentHostSessionCanvases(session, chat, binding, enabled, entries, () => { keepAlive++; }, waitForSession));
		return { connection, binding, enabled, entries, canvases, keepAlive: () => keepAlive };
	}

	test('catalog and source reads route to the exact chat without keeping or starting a backing', async () => {
		const { canvases, connection, keepAlive } = fixture();
		connection.onList = async params => params.cursor ? { types: [{ ...declaration, canvasType: 'second' }] } : { types: [declaration], nextCursor: 'page-2' };
		await canvases.refresh();
		await canvases.resolveSource(canvasEntry(connection.state));
		assert.deepStrictEqual({
			listings: connection.listings, resolutions: connection.resolutions, types: canvases.catalog.get().map(type => type.canvasType),
			effects: connection.effects, initializations: connection.initializations, keepAlive: keepAlive(),
		}, {
			listings: [{ channel: chat.toString(), cursor: undefined }, { channel: chat.toString(), cursor: 'page-2' }],
			resolutions: [{ channel: connection.state.resource }], types: ['counter', 'second'], effects: [], initializations: [], keepAlive: 0,
		});
	});

	test('explicit initialization waits for the exact owner then refreshes only its live catalog', async () => {
		const ready = new DeferredPromise<void>();
		const f = fixture(() => ready.p);
		f.connection.onList = async () => ({ types: [declaration] });
		const initializing = f.canvases.initialize(CancellationToken.None);
		const before = { initializations: f.connection.initializations.length, keepAlive: f.keepAlive(), busy: f.canvases.initializing.get() };
		await ready.complete();
		await initializing;
		assert.deepStrictEqual({
			before, channels: f.connection.initializations.map(request => request.channel),
			requestIds: new Set(f.connection.initializations.map(request => request.requestId)).size,
			catalog: f.canvases.catalog.get(), busy: f.canvases.initializing.get(), effects: f.connection.effects, keepAlive: f.keepAlive(),
		}, {
			before: { initializations: 0, keepAlive: 0, busy: true }, channels: [chat.toString()], requestIds: 1,
			catalog: [declaration], busy: false, effects: [], keepAlive: 1,
		});
	});

	test('initialization requires its explicit negotiated capability and a noncancelled request', async () => {
		const f = fixture();
		await assert.rejects(f.canvases.initialize(CancellationToken.Cancelled), isCancellationError);
		f.connection.initializeResult.set({ protocolVersion: '1', serverSeq: 0, snapshots: [], canvases: {} }, undefined);
		await assert.rejects(f.canvases.initialize(CancellationToken.None), /does not support explicit/);
		assert.deepStrictEqual({
			supported: f.canvases.supportsInitialization.get(), initializations: f.connection.initializations, keepAlive: f.keepAlive(),
		}, { supported: false, initializations: [], keepAlive: 0 });
	});

	test('connection loss while waiting for an owner cancels initialization before its effect', async () => {
		const ready = new DeferredPromise<void>();
		const f = fixture(() => ready.p);
		const rejected = assert.rejects(f.canvases.initialize(CancellationToken.None), /changed before provider initialization/);
		f.binding.set(undefined, undefined);
		await rejected;
		await ready.complete();
		assert.deepStrictEqual({ initializations: f.connection.initializations, busy: f.canvases.initializing.get(), keepAlive: f.keepAlive() },
			{ initializations: [], busy: false, keepAlive: 0 });
	});

	test('cancellation reaches the original initialization and concurrent calls cannot replace it', async () => {
		const f = fixture();
		const pending = new DeferredPromise<void>();
		const cancellation = store.add(new CancellationTokenSource());
		let requestToken = CancellationToken.None;
		f.connection.onInitialize = async (_params, token) => { requestToken = token; await pending.p; };
		const rejected = assert.rejects(f.canvases.initialize(cancellation.token), isCancellationError);
		await assert.rejects(f.canvases.initialize(CancellationToken.None), /already being initialized/);
		cancellation.cancel();
		await rejected;
		await pending.complete();
		assert.deepStrictEqual({
			requests: f.connection.initializations.length, cancelled: requestToken.isCancellationRequested,
			busy: f.canvases.initializing.get(), listings: f.connection.listings,
		}, { requests: 1, cancelled: true, busy: false, listings: [] });
	});

	test('in-flight connection loss is an uncertain outcome, never an automatic initialization replay', async () => {
		const f = fixture();
		const pending = new DeferredPromise<void>();
		let requestToken = CancellationToken.None;
		f.connection.onInitialize = async (_params, token) => { requestToken = token; await pending.p; };
		const rejected = assert.rejects(f.canvases.initialize(CancellationToken.None), /outcome may be uncertain/);
		f.binding.set(undefined, undefined);
		await rejected;
		f.binding.set({ connection: f.connection }, undefined);
		await pending.complete();
		assert.deepStrictEqual({
			requests: f.connection.initializations.length, cancelled: requestToken.isCancellationRequested,
			supported: f.canvases.supportsInitialization.get(), busy: f.canvases.initializing.get(), listings: f.connection.listings,
		}, { requests: 1, cancelled: true, supported: true, busy: false, listings: [] });
	});

	test('disposing the owner cancels outstanding initialization without accepting a late catalog', async () => {
		const f = fixture();
		const pending = new DeferredPromise<void>();
		let requestToken = CancellationToken.None;
		f.connection.onInitialize = async (_params, token) => { requestToken = token; await pending.p; };
		const rejected = assert.rejects(f.canvases.initialize(CancellationToken.None), /outcome may be uncertain/);
		f.canvases.dispose();
		await rejected;
		await pending.complete();
		assert.deepStrictEqual({
			cancelled: requestToken.isCancellationRequested, busy: f.canvases.initializing.get(), listings: f.connection.listings,
		}, { cancelled: true, busy: false, listings: [] });
	});

	test('logical close of an unloaded member does not resume its session backing', async () => {
		const f = fixture();
		const entry = { ...canvasEntry(f.connection.state), availability: CanvasAvailabilityStatus.NotLoaded };
		f.entries.set([entry], undefined);
		await f.canvases.close(entry);
		assert.deepStrictEqual({
			keepAlive: f.keepAlive(), channels: f.connection.effects.map(effect => effect.channel), sourceReads: f.connection.resolutions,
		}, { keepAlive: 0, channels: [entry.resource], sourceReads: [] });
	});

	test('explicit canvas open waits for its owning session before issuing an effect', async () => {
		const ready = new DeferredPromise<void>();
		const f = fixture(() => ready.p);
		const open = f.canvases.open({ ...declaration, instanceId: 'counter' });
		const before = { effects: f.connection.effects.length, keepAlive: f.keepAlive() };
		await ready.complete();
		const entry = await open;
		assert.deepStrictEqual({
			before, channels: f.connection.effects.map(effect => effect.channel), keepAlive: f.keepAlive(), owner: entry.identity.chat,
		}, { before: { effects: 0, keepAlive: 0 }, channels: [session.toString()], keepAlive: 1, owner: chat.toString() });
	});

	test('a connection change while awaiting a canvas owner prevents the open effect', async () => {
		const ready = new DeferredPromise<void>();
		const f = fixture(() => ready.p);
		const rejected = assert.rejects(f.canvases.open({ ...declaration, instanceId: 'counter' }), /changed before opening/);
		f.binding.set({ connection: f.connection }, undefined);
		await ready.complete();
		await rejected;
		assert.deepStrictEqual({ effects: f.connection.effects, keepAlive: f.keepAlive() }, { effects: [], keepAlive: 0 });
	});

	test('catalog refresh ordering suppresses earlier successful reads and earlier failures', async () => {
		const { canvases, connection } = fixture();
		const first = new DeferredPromise<ListCanvasTypesResult>();
		const second = new DeferredPromise<ListCanvasTypesResult>();
		connection.onList = () => connection.listings.length === 1 ? first.p : second.p;
		const earlier = canvases.refresh();
		const earlierFailure = assert.rejects(earlier);
		const latest = canvases.refresh();
		await second.complete({ types: [declaration] });
		await latest;
		await first.error(new Error('Controlled stale catalog failure'));
		await earlierFailure;
		assert.deepStrictEqual({ types: canvases.catalog.get(), error: canvases.error.get(), loading: canvases.loading.get() }, { types: [declaration], error: undefined, loading: false });
	});

	test('repeated pagination cursors fail rather than loop', async () => {
		const { canvases, connection } = fixture();
		connection.onList = async () => ({ types: [declaration], nextCursor: 'same' });
		await assert.rejects(canvases.refresh(), /continuation/);
		assert.deepStrictEqual({ calls: connection.listings.length, loading: canvases.loading.get(), catalog: canvases.catalog.get() }, { calls: 2, loading: false, catalog: [] });
	});

	test('new connection wrappers invalidate catalogs and full-state subscriptions even for a reused service', async () => {
		const { canvases, connection, binding } = fixture();
		connection.onList = async () => ({ types: [declaration] });
		await canvases.refresh();
		const subscription = store.add(canvases.observeCanvas(connection.state.resource));
		const generation = canvases.generation.get();
		binding.set({ connection }, undefined);
		assert.deepStrictEqual({
			generation: canvases.generation.get() - generation, catalog: canvases.catalog.get(), subscriptions: connection.subscriptions.length,
			active: connection.activeSubscriptions, state: subscription.object.state.get()?.resource,
		}, { generation: 1, catalog: [], subscriptions: 2, active: 1, state: connection.state.resource });
	});

	test('disabling the preview and peers without negotiated capability release subscriptions', async () => {
		const { canvases, connection, enabled } = fixture();
		const subscription = store.add(canvases.observeCanvas(connection.state.resource));
		enabled.set(false, undefined);
		await assert.rejects(canvases.refresh(), /unavailable/);
		enabled.set(true, undefined);
		connection.initializeResult.set({ protocolVersion: '1', serverSeq: 0, snapshots: [] }, undefined);
		assert.deepStrictEqual({ availability: canvases.availability.get(), active: connection.activeSubscriptions, state: subscription.object.state.get(), effects: connection.effects },
			{ availability: 'unsupported', active: 0, state: undefined, effects: [] });
	});

	test('membership and subscription state exclude siblings and clear mismatched updates', () => {
		const { canvases, entries, connection } = fixture();
		const sibling = createCanvasState('ahp-session:/one/chat/peer', 'ahp-canvas:/sibling');
		entries.set([canvasEntry(connection.state), canvasEntry(sibling)], undefined);
		const subscription = store.add(canvases.observeCanvas(connection.state.resource));
		connection.changed.fire(sibling);
		assert.throws(() => canvases.resolveSource(canvasEntry(sibling)), /belong/);
		assert.deepStrictEqual({ entries: canvases.entries.get().map(entry => entry.resource), state: subscription.object.state.get(), error: !!subscription.object.error.get() },
			{ entries: [connection.state.resource], state: undefined, error: true });
	});

	test('synchronous subscription loss is an observable failed state, not an uncaught autorun error', () => {
		const { canvases, connection } = fixture();
		connection.subscribeError = new Error('Controlled connection loss');
		const subscription = store.add(canvases.observeCanvas(connection.state.resource));
		assert.deepStrictEqual({ state: subscription.object.state.get(), failed: !!subscription.object.error.get(), active: connection.activeSubscriptions }, { state: undefined, failed: true, active: 0 });
	});

	test('all effect routes preserve observed owner, revision and incarnation with distinct request IDs', async () => {
		const { canvases, connection } = fixture();
		const entry = canvasEntry(connection.state);
		await canvases.open({ ...declaration, instanceId: 'new-instance', input: { count: 3 } });
		await canvases.invokeAction(connection.state, 'increment', { by: 1 });
		await canvases.close(entry);
		await canvases.restart(entry);
		const [open, invoke, close, restart] = connection.effects;
		assert.deepStrictEqual({
			open: { ...open, canvas: '<new-resource>', requestId: '<request>' },
			invoke: { ...invoke, requestId: '<request>' }, close: { ...close, requestId: '<request>' }, restart: { ...restart, requestId: '<request>' },
			requests: new Set(connection.effects.map(effect => effect.requestId)).size,
		}, {
			open: { channel: session.toString(), canvas: '<new-resource>', identity: { chat: chat.toString(), source: declaration.source, canvasType: declaration.canvasType, instanceId: 'new-instance' }, title: 'Counter', icon: undefined, input: { count: 3 }, requestId: '<request>' },
			invoke: { channel: entry.resource, actionId: 'increment', input: { by: 1 }, incarnation: entry.identity.incarnation, requestId: '<request>' },
			close: { channel: entry.resource, revision: entry.revision, requestId: '<request>' },
			restart: { channel: entry.resource, incarnation: entry.identity.incarnation, requestId: '<request>' }, requests: 4,
		});
	});

	test('reconnect while opening reports an uncertain outcome without replay', async () => {
		const { canvases, connection, binding } = fixture();
		const pending = new DeferredPromise<OpenCanvasResult>();
		connection.onOpen = () => pending.p;
		const opened = canvases.open({ ...declaration, instanceId: 'new' });
		const rejected = assert.rejects(opened, /uncertain/);
		binding.set(undefined, undefined);
		await pending.complete({ canvas: canvasEntry(connection.state) });
		await rejected;
		assert.strictEqual(connection.effects.length, 1);
	});

	test('a provider cannot redirect an open response into a different logical identity', async () => {
		const { canvases, connection } = fixture();
		connection.onOpen = async () => ({ canvas: { ...canvasEntry(connection.state), identity: { ...connection.state.identity, canvasType: 'another-type' } } });
		await assert.rejects(canvases.open({ ...declaration, instanceId: 'counter' }), /match/);
	});

	test('untrusted actions are not sent', () => {
		const { canvases, connection } = fixture();
		assert.throws(() => canvases.invokeAction({ ...connection.state, trust: { status: CanvasTrustStatus.Pending } }, 'increment'), /approved/);
		assert.deepStrictEqual(connection.effects, []);
	});
});

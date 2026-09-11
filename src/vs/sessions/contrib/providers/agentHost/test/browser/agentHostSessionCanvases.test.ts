/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { autorun, derived, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { unsupportedAgentHostCanvasState, withAgentHostCanvasState, type AgentHostCanvasJson, type IAgentHostCanvasInstance, type IAgentHostCanvasOperations, type IAgentHostCanvasState } from '../../../../../../platform/agentHost/common/agentHostCanvases.js';
import { buildDefaultChatUri, type SessionMeta } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { unavailableSessionCanvasState } from '../../../../../services/sessions/common/sessionCanvases.js';
import { AgentHostSessionCanvases } from '../../browser/agentHostSessionCanvases.js';
import type { IAgentHostCanvasProtocolClient } from '../../../../../../platform/agentHost/common/agentHostCanvasProtocol.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, type CanvasEntry, type CanvasState, type CanvasTypeDeclaration } from '../../../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
import type { ListCanvasTypesResult } from '../../../../../../platform/agentHost/common/state/protocol/channels-canvas/commands.js';
import type { IAgentHostCanvasPackagesClient } from '../../../../../../platform/agentHost/common/agentHostCanvasPackages.js';

suite('AgentHostSessionCanvases', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const mainChat = URI.parse('ahp-chat:/session/main');
	const peerChat = URI.parse('ahp-chat:/session/peer');
	const instance: IAgentHostCanvasInstance = {
		extensionId: 'user:test', canvasId: 'counter', instanceId: 'one',
		availability: 'ready', url: 'http://127.0.0.1:41000/?token=current',
	};
	const liveState: IAgentHostCanvasState = {
		supported: true,
		catalog: [{ extensionId: 'user:test', canvasId: 'counter', displayName: 'Counter', description: '', actions: [{ name: 'increment' }] }],
		instances: [instance],
	};

	function fixture(initial = liveState) {
		const metadata = observableValue<SessionMeta | undefined>('metadata', withAgentHostCanvasState(undefined, mainChat, initial));
		const version = observableValue('version', 0);
		const hostSupported = observableValue('hostSupported', true);
		let live = initial;
		const calls: { operation: string; chat: string; input?: AgentHostCanvasJson }[] = [];
		const connection: Required<IAgentHostCanvasOperations> = {
			getCanvases: async chat => { calls.push({ operation: 'get', chat: chat.toString() }); return live; },
			openCanvas: async (chat, params) => {
				calls.push({ operation: 'open', chat: chat.toString(), input: params.input });
				const opened: IAgentHostCanvasInstance = { ...params, availability: 'ready', url: 'http://localhost:42000/' };
				live = { ...live, instances: [...live.instances.filter(instance => instance.instanceId !== opened.instanceId), opened] };
				return opened;
			},
			invokeCanvasAction: async (chat, params) => {
				calls.push({ operation: params.actionName, chat: chat.toString(), input: params.input });
				return { result: { count: 3 } };
			},
			closeCanvas: async (chat, instanceId) => {
				calls.push({ operation: 'close', chat: chat.toString() });
				live = { ...live, instances: live.instances.filter(instance => instance.instanceId !== instanceId) };
			},
			reloadCanvases: async chat => { calls.push({ operation: 'reload', chat: chat.toString() }); },
		};
		const canvases = store.add(new AgentHostSessionCanvases(mainChat, metadata, () => connection, version, hostSupported));
		return { canvases, metadata, version, hostSupported, calls, connection, setLive: (state: IAgentHostCanvasState) => { live = state; } };
	}

	function canonicalFixture(prepareOpen?: () => Promise<IDisposable>, canvasPackages?: IAgentHostCanvasPackagesClient) {
		const legacy = fixture();
		const chat = URI.parse(buildDefaultChatUri('copilot:/session'));
		let current: CanvasState = {
			resource: 'ahp-canvas:/one',
			identity: { chat: chat.toString(), source: { kind: CanvasSourceKind.Extension, extensionId: 'user:test' }, canvasType: 'counter', instanceId: 'one', incarnation: 'generation-1' },
			title: 'Counter', trust: { status: CanvasTrustStatus.Trusted },
			availability: { status: CanvasAvailabilityStatus.Ready, actions: [{ id: 'increment' }] },
			revision: 1,
		};
		const entries = observableValue<readonly CanvasEntry[]>('canvasEntries', [{ ...current, availability: current.availability.status }]);
		const calls: { method: string; incarnation?: string; revision?: number; requestId?: string; input?: unknown }[] = [];
		const protocol: IAgentHostCanvasProtocolClient = {
			getState: async () => { calls.push({ method: 'state' }); return current; },
			listTypes: async () => {
				calls.push({ method: 'types' });
				return { types: [{ source: current.identity.source, canvasType: current.identity.canvasType, title: current.title, declaredActions: [{ id: 'catalogue-only-action' }] }] };
			},
			resolveSource: async () => {
				calls.push({ method: 'source' });
				return { availability: current.availability.status, incarnation: current.identity.incarnation, revision: current.revision, source: { url: 'http://localhost:45000/current' } };
			},
			open: async params => {
				calls.push({ method: 'open', requestId: params.requestId, input: params.input });
				return { canvas: { ...current, availability: current.availability.status } };
			},
			invokeAction: async params => {
				calls.push({ method: 'action', incarnation: params.incarnation, requestId: params.requestId, input: params.input });
				return { result: { result: { count: 4 } } };
			},
			restart: async params => {
				calls.push({ method: 'restart', incarnation: params.incarnation, requestId: params.requestId });
				current = { ...current, identity: { ...current.identity, incarnation: 'generation-2' }, revision: 2 };
				entries.set([{ ...current, availability: current.availability.status }], undefined);
			},
			close: async params => {
				calls.push({ method: 'close', revision: params.revision, requestId: params.requestId });
				entries.set([], undefined);
			},
		};
		const connection = { ...legacy.connection, canvasProtocol: protocol, canvasPackages };
		const canvases = store.add(new AgentHostSessionCanvases(chat, legacy.metadata, () => connection, legacy.version, legacy.hostSupported, entries, prepareOpen));
		return { canvases, calls, legacyCalls: legacy.calls, protocol, entries, connection, version: legacy.version, current: () => current };
	}

	test('explicit open can address an approved installed package before the runtime catalogue exists', async () => {
		const f = canonicalFixture(undefined, upcastPartial<IAgentHostCanvasPackagesClient>({
			list: async () => [{
				id: 'package', name: 'Counter', source: 'file:///source', snapshot: 'file:///snapshot',
				revision: 'revision', approval: { revision: 'revision' }, fileCount: 1, byteLength: 1,
			}],
		}));
		f.entries.set([], undefined);
		f.protocol.listTypes = async () => ({ types: [] });
		const { canvasProtocol } = f.connection;
		assert.ok(canvasProtocol);
		const opens: Parameters<typeof canvasProtocol.open>[0][] = [];
		f.protocol.open = async params => {
			opens.push(params);
			return { canvas: { ...f.current(), identity: { ...params.identity, incarnation: 'first' }, availability: CanvasAvailabilityStatus.Ready } };
		};
		await f.canvases.refresh();
		assert.deepStrictEqual({ opens }, { opens: [] });
		await f.canvases.open({ extensionId: 'plugin:canvas-package:main', canvasId: 'counter', instanceId: 'first' });
		assert.deepStrictEqual(opens.map(open => ({ source: open.identity.source, type: open.identity.canvasType })), [{
			source: { kind: CanvasSourceKind.Package, sourceId: 'plugin:canvas-package:main', packageName: 'Counter', version: 'revision' },
			type: 'counter',
		}]);
	});

	test('package discovery lists only current approvals without preparing or opening a backing', async () => {
		let preparations = 0;
		const candidate = { id: 'package', name: 'Counter', source: 'file:///source', snapshot: 'file:///snapshot', revision: 'revision', fileCount: 1, byteLength: 1 };
		const packages = upcastPartial<IAgentHostCanvasPackagesClient>({
			list: async () => [
				{ ...candidate, approval: { revision: 'revision' } },
				{ ...candidate, id: 'stale', approval: { revision: 'old' } },
				{ ...candidate, id: 'unapproved' },
			],
		});
		const f = canonicalFixture(async () => { preparations++; return toDisposable(() => { }); }, packages);
		await f.canvases.refresh();
		f.calls.length = 0;
		const choices = await f.canvases.getOpenPackages();
		assert.deepStrictEqual({ choices, preparations, operations: f.calls }, {
			choices: [{ extensionId: 'plugin:canvas-package:main', name: 'Counter', revision: 'revision' }],
			preparations: 0,
			operations: [],
		});
	});

	test('package discovery excludes grants for a different workspace', async () => {
		const candidate = { id: 'package', name: 'Counter', source: 'file:///source', snapshot: 'file:///snapshot', revision: 'revision', fileCount: 1, byteLength: 1 };
		const f = canonicalFixture(undefined, upcastPartial<IAgentHostCanvasPackagesClient>({
			list: async () => [
				{ ...candidate, id: 'profile', approval: { revision: 'revision' } },
				{ ...candidate, id: 'matching', approval: { revision: 'revision', workspaces: ['file:///workspace'] } },
				{ ...candidate, id: 'other', approval: { revision: 'revision', workspaces: ['file:///other'] } },
			],
		}));
		assert.deepStrictEqual((await f.canvases.getOpenPackages(URI.parse('file:///workspace'))).map(pkg => pkg.extensionId), [
			'plugin:canvas-profile:main', 'plugin:canvas-matching:main',
		]);
	});

	test('canvas draft preparation is not browsing and settles after the open leaves its busy state', async () => {
		const events: string[] = [];
		const f = canonicalFixture(async () => {
			events.push('prepare');
			return toDisposable(() => {
				events.push(`settled:${f.canvases.loading.get()}`);
				f.canvases.dispose();
			});
		});
		await f.canvases.refresh();
		assert.deepStrictEqual(events, []);
		const opened = await f.canvases.open({ extensionId: 'user:test', canvasId: 'counter', instanceId: 'one' });
		assert.deepStrictEqual({ instance: opened.instanceId, events }, { instance: 'one', events: ['prepare', 'settled:false'] });
	});

	test('canonical refresh uses declared live actions and source reads rather than PoC metadata or mutations', async () => {
		const f = canonicalFixture();
		const state = await f.canvases.refresh();
		assert.deepStrictEqual({
			actions: state.catalog[0].actions.map(action => action.name),
			endpoint: state.instances[0].availability === 'ready' ? state.instances[0].url : undefined,
			mutations: f.calls.filter(call => !['types', 'state', 'source'].includes(call.method)),
			legacy: f.legacyCalls,
			context: f.canvases.getContextReference('one'),
		}, { actions: ['increment'], endpoint: 'http://localhost:45000/current', mutations: [], legacy: [], context: { resource: 'ahp-canvas:/one', incarnation: 'generation-1' } });
	});

	test('a refresh cannot restore a retired source while another canvas read is pending', async () => {
		const f = canonicalFixture();
		const first = f.current();
		const second: CanvasState = {
			...first, resource: 'ahp-canvas:/two',
			identity: { ...first.identity, instanceId: 'two' },
		};
		const firstSourceRead = new DeferredPromise<void>();
		const secondRead = new DeferredPromise<CanvasState>();
		f.protocol.getState = resource => resource === second.resource ? secondRead.p : Promise.resolve(first);
		f.protocol.resolveSource = async params => {
			if (params.channel === first.resource) {
				void firstSourceRead.complete();
			}
			return { availability: CanvasAvailabilityStatus.Ready, incarnation: first.identity.incarnation, revision: 1, source: { url: 'http://localhost:45000/retired' } };
		};
		f.entries.set([
			{ ...first, availability: CanvasAvailabilityStatus.Ready },
			{ ...second, availability: CanvasAvailabilityStatus.Ready },
		], undefined);
		const refreshing = f.canvases.refresh();
		await firstSourceRead.p;
		f.entries.set([
			{ ...first, revision: 2, availability: CanvasAvailabilityStatus.NotLoaded },
			{ ...second, availability: CanvasAvailabilityStatus.Ready },
		], undefined);
		await secondRead.complete(second);
		const refreshed = await refreshing;
		assert.deepStrictEqual(refreshed.instances.map(instance => ({
			id: instance.instanceId, availability: instance.availability,
			url: instance.availability === 'ready' ? instance.url : undefined,
		})), [
			{ id: 'one', availability: 'unavailable', url: undefined },
			{ id: 'two', availability: 'ready', url: 'http://localhost:45000/retired' },
		]);
	});

	test('catalogue pagination exposes later types to open and action operations', async () => {
		const f = canonicalFixture();
		await f.canvases.refresh();
		const types: CanvasTypeDeclaration[] = Array.from({ length: 70 }, (_, index) => ({
			source: f.current().identity.source, canvasType: `type-${index}`, title: `Type ${index}`, declaredActions: [{ id: 'declared' }],
		}));
		const current: CanvasState = { ...f.current(), identity: { ...f.current().identity, canvasType: 'type-69', incarnation: 'later-type' }, revision: 2 };
		const pages: (string | undefined)[] = [];
		const openedTypes: string[] = [];
		f.protocol.listTypes = async params => {
			pages.push(params.cursor);
			assert.strictEqual(params.limit, 64);
			const offset = Number(params.cursor ?? 0);
			return { types: types.slice(offset, offset + 64), ...(offset + 64 < types.length ? { nextCursor: String(offset + 64) } : {}) };
		};
		f.protocol.getState = async () => current;
		f.protocol.resolveSource = async () => ({ availability: CanvasAvailabilityStatus.Ready, incarnation: current.identity.incarnation, revision: current.revision, source: { url: 'http://localhost:45000/later' } });
		f.protocol.open = async params => {
			openedTypes.push(params.identity.canvasType);
			return { canvas: { ...current, availability: current.availability.status } };
		};
		f.entries.set([{ ...current, availability: current.availability.status }], undefined);
		const refreshed = await f.canvases.refresh();
		const discoveryPages = [...pages];
		await f.canvases.open({ extensionId: 'user:test', canvasId: 'type-69', instanceId: 'one' });
		const result = await f.canvases.invokeAction({ instanceId: 'one', actionName: 'increment' });
		assert.deepStrictEqual({
			discoveryPages, count: refreshed.catalog.length, last: refreshed.catalog.at(-1)?.canvasId,
			actions: refreshed.catalog.at(-1)?.actions.map(action => action.name), openedTypes, result,
		}, {
			discoveryPages: [undefined, '64'], count: 70, last: 'type-69', actions: ['increment'], openedTypes: ['type-69'], result: { result: { count: 4 } },
		});
	});

	test('accepts 4096 types in 64 pages and refuses an oversized page without replacing the catalogue', async () => {
		const f = canonicalFixture();
		await f.canvases.refresh();
		const types: CanvasTypeDeclaration[] = Array.from({ length: 4096 }, (_, index) => ({
			source: f.current().identity.source, canvasType: `type-${index}`, title: `Type ${index}`,
		}));
		let pages = 0;
		f.protocol.listTypes = async params => {
			pages++;
			const offset = Number(params.cursor ?? 0);
			return { types: types.slice(offset, offset + 64), ...(offset + 64 < types.length ? { nextCursor: String(offset + 64) } : {}) };
		};
		const before = (await f.canvases.refresh()).catalog;
		f.protocol.listTypes = async () => ({ types: types.slice(0, 65) });
		await assert.rejects(f.canvases.refresh(), /discovery limit/);
		assert.deepStrictEqual({
			pages, count: before.length, last: before.at(-1)?.canvasId,
			unchanged: f.canvases.state.get().catalog === before,
		}, { pages: 64, count: 4096, last: 'type-4095', unchanged: true });
	});

	for (const repeatedCursor of [true, false]) {
		test(`catalogue pagination rejects ${repeatedCursor ? 'repeated cursors' : 'an unbounded page stream'} without publishing partial types`, async () => {
			const f = canonicalFixture();
			await f.canvases.refresh();
			const before = f.canvases.state.get().catalog;
			let calls = 0;
			f.protocol.listTypes = async () => {
				calls++;
				return { types: [], nextCursor: repeatedCursor ? 'same' : String(calls) };
			};
			await assert.rejects(f.canvases.refresh(), /pagination limit/);
			assert.deepStrictEqual({
				calls, catalog: f.canvases.state.get().catalog, loading: f.canvases.loading.get(),
			}, { calls: repeatedCursor ? 2 : 64, catalog: before, loading: false });
		});
	}

	test('a retired paginated refresh makes no subsequent requests and cannot publish its types', async () => {
		const f = canonicalFixture();
		await f.canvases.refresh();
		const before = f.canvases.state.get().catalog;
		const secondPage = new DeferredPromise<ListCanvasTypesResult>();
		const reading = new DeferredPromise<void>();
		const cursors: (string | undefined)[] = [];
		f.protocol.listTypes = async params => {
			cursors.push(params.cursor);
			if (params.cursor === undefined) {
				return { types: [], nextCursor: 'second' };
			}
			void reading.complete();
			return secondPage.p;
		};
		const retired = assert.rejects(f.canvases.refresh(), isCancellationError);
		await reading.p;
		f.version.set(1, undefined);
		await secondPage.complete({ types: [], nextCursor: 'third' });
		await retired;
		assert.deepStrictEqual({
			cursors, catalog: f.canvases.state.get().catalog, loading: f.canvases.loading.get(),
		}, { cursors: [undefined, 'second'], catalog: before, loading: false });
	});

	for (const failedRead of [false, true]) {
		test(`new ready notifications during a ${failedRead ? 'failed' : 'stale'} refresh coalesce into one follow-up`, async () => {
			const f = canonicalFixture();
			await f.canvases.refresh();
			const old = f.current();
			let latest = old;
			const reading = new DeferredPromise<void>();
			const oldRead = new DeferredPromise<CanvasState>();
			const ready = new DeferredPromise<void>();
			let reads = 0;
			f.protocol.getState = async () => {
				if (++reads === 1) {
					void reading.complete();
					return oldRead.p;
				}
				return latest;
			};
			f.protocol.resolveSource = async () => ({
				availability: latest.availability.status, incarnation: latest.identity.incarnation, revision: latest.revision,
				source: { url: `http://localhost:45000/${latest.identity.incarnation}` },
			});
			store.add(autorun(reader => {
				if (!f.canvases.loading.read(reader) && f.canvases.state.read(reader).instances[0]?.url === 'http://localhost:45000/generation-3') {
					void ready.complete();
				}
			}));
			const failure = new Error('The old backing read failed');
			const refreshing = failedRead ? assert.rejects(f.canvases.refresh(), error => error === failure) : f.canvases.refresh();
			await reading.p;
			for (const revision of [2, 3]) {
				latest = { ...old, identity: { ...old.identity, incarnation: `generation-${revision}` }, revision };
				f.entries.set([{ ...latest, availability: CanvasAvailabilityStatus.Ready }], undefined);
			}
			if (failedRead) {
				await oldRead.error(failure);
			} else {
				await oldRead.complete(old);
			}
			await refreshing;
			await ready.p;
			assert.deepStrictEqual({
				reads, error: f.canvases.error.get(), loading: f.canvases.loading.get(),
				endpoint: f.canvases.state.get().instances[0].url,
				mutations: f.calls.filter(call => !['types', 'state', 'source'].includes(call.method)),
			}, { reads: 2, error: undefined, loading: false, endpoint: 'http://localhost:45000/generation-3', mutations: [] });
		});
	}

	test('an unresolved notification gets only one follow-up instead of an automatic refresh loop', async () => {
		const f = canonicalFixture();
		await f.canvases.refresh();
		const old = f.current();
		const reading = new DeferredPromise<void>();
		const response = new DeferredPromise<CanvasState>();
		const settled = new DeferredPromise<void>();
		let reads = 0;
		f.protocol.getState = async () => {
			if (++reads === 1) {
				void reading.complete();
				return response.p;
			}
			return old;
		};
		store.add(autorun(reader => {
			if (!f.canvases.loading.read(reader) && reads === 2) {
				void settled.complete();
			}
		}));
		const refreshing = f.canvases.refresh();
		await reading.p;
		f.entries.set([{ ...old, identity: { ...old.identity, incarnation: 'new' }, revision: 2, availability: CanvasAvailabilityStatus.Ready }], undefined);
		await response.complete(old);
		await refreshing;
		await settled.p;
		assert.deepStrictEqual({
			reads, loading: f.canvases.loading.get(), availability: f.canvases.state.get().instances[0].availability,
		}, { reads: 2, loading: false, availability: 'unavailable' });
	});

	test('retiring a refresh generation drops its pending follow-up without issuing another old read', async () => {
		const f = canonicalFixture();
		await f.canvases.refresh();
		const old = f.current();
		const response = new DeferredPromise<CanvasState>();
		const reading = new DeferredPromise<void>();
		let reads = 0;
		f.protocol.getState = async () => {
			reads++;
			void reading.complete();
			return response.p;
		};
		const retired = assert.rejects(f.canvases.refresh(), isCancellationError);
		await reading.p;
		f.entries.set([{ ...old, identity: { ...old.identity, incarnation: 'new' }, revision: 2, availability: CanvasAvailabilityStatus.Ready }], undefined);
		f.canvases.dispose();
		await response.complete(old);
		await retired;
		assert.strictEqual(reads, 1);
	});

	test('canonical mutations carry fresh request IDs, exact incarnations and membership revisions', async () => {
		const f = canonicalFixture();
		await f.canvases.refresh();
		await f.canvases.open({ extensionId: 'user:test', canvasId: 'counter', instanceId: 'one', input: { seed: 3 } });
		await f.canvases.open({ extensionId: 'user:test', canvasId: 'counter', instanceId: 'one', input: { seed: 5 } });
		const result = await f.canvases.invokeAction({ instanceId: 'one', actionName: 'increment', input: { amount: 4 } });
		await f.canvases.reload();
		await f.canvases.close('one');
		const mutations = f.calls.filter(call => !['types', 'state', 'source'].includes(call.method));
		assert.deepStrictEqual({
			methods: mutations.map(call => call.method),
			uniqueRequests: new Set(mutations.map(call => call.requestId)).size,
			inputs: mutations.filter(call => call.method === 'open').map(call => call.input),
			actionGeneration: mutations.find(call => call.method === 'action')?.incarnation,
			restartGeneration: mutations.find(call => call.method === 'restart')?.incarnation,
			closeRevision: mutations.find(call => call.method === 'close')?.revision,
			result,
			legacy: f.legacyCalls,
		}, { methods: ['open', 'open', 'action', 'restart', 'close'], uniqueRequests: 5, inputs: [{ seed: 3 }, { seed: 5 }], actionGeneration: 'generation-1', restartGeneration: 'generation-1', closeRevision: 2, result: { result: { count: 4 } }, legacy: [] });
	});

	test('projects only the owning chat and follows metadata changes without RPCs', () => {
		const f = fixture();
		const peer = store.add(new AgentHostSessionCanvases(peerChat, f.metadata, () => f.connection, f.version, f.hostSupported));
		f.metadata.set(withAgentHostCanvasState(f.metadata.get(), peerChat, { ...liveState, instances: [{ ...instance, instanceId: 'peer' }] }), undefined);
		assert.deepStrictEqual({
			main: f.canvases.state.get().instances.map(instance => instance.instanceId),
			peer: peer.state.get().instances.map(instance => instance.instanceId),
			calls: f.calls,
		}, { main: ['one'], peer: ['peer'], calls: [] });
	});

	test('an explicit repeated open forwards new input instead of treating it as reveal', async () => {
		const f = fixture();
		const result = await f.canvases.open({ extensionId: instance.extensionId, canvasId: instance.canvasId, instanceId: instance.instanceId, input: { changed: true } });
		assert.deepStrictEqual({ result, calls: f.calls }, {
			result: { extensionId: instance.extensionId, canvasId: instance.canvasId, instanceId: instance.instanceId, input: { changed: true }, availability: 'ready', url: 'http://localhost:42000/' },
			calls: [
				{ operation: 'get', chat: mainChat.toString() },
				{ operation: 'open', chat: mainChat.toString(), input: { changed: true } },
				{ operation: 'get', chat: mainChat.toString() },
			],
		});
	});

	test('reading live state to reveal an existing instance never opens or replays input', async () => {
		const f = fixture();
		const state = await f.canvases.refresh();
		assert.deepStrictEqual({ state, calls: f.calls }, {
			state: liveState,
			calls: [{ operation: 'get', chat: mainChat.toString() }],
		});
	});

	test('opens a new instance and forwards declared action input and the SDK result envelope', async () => {
		const f = fixture({ ...liveState, instances: [] });
		await f.canvases.open({ extensionId: instance.extensionId, canvasId: instance.canvasId, instanceId: 'new', input: { documentId: 'one' } });
		const result = await f.canvases.invokeAction({ instanceId: 'new', actionName: 'increment', input: { amount: 3 } });
		assert.deepStrictEqual({
			mutations: f.calls.filter(call => call.operation !== 'get'),
			result,
			instances: f.canvases.state.get().instances.map(instance => instance.instanceId),
		}, {
			mutations: [
				{ operation: 'open', chat: mainChat.toString(), input: { documentId: 'one' } },
				{ operation: 'increment', chat: mainChat.toString(), input: { amount: 3 } },
			],
			result: { result: { count: 3 } },
			instances: ['new'],
		});
	});

	test('rejects missing instances and undeclared actions before mutation', async () => {
		const f = fixture();
		await assert.rejects(f.canvases.invokeAction({ instanceId: 'other-chat-instance', actionName: 'increment' }), /unavailable/);
		await assert.rejects(f.canvases.invokeAction({ instanceId: 'one', actionName: 'undeclared' }), /not declared/);
		assert.deepStrictEqual(f.calls.map(call => call.operation), ['get', 'get']);
	});

	test('normal sessions remain unsupported and cannot open or restart a canvas runtime', async () => {
		const f = fixture(unsupportedAgentHostCanvasState);
		await assert.rejects(f.canvases.open({ extensionId: 'user:test', canvasId: 'counter', instanceId: 'one' }), /opted-in/);
		await assert.rejects(f.canvases.reload(), /opted-in/);
		assert.deepStrictEqual({
			state: f.canvases.state.get(),
			operations: f.calls.map(call => call.operation),
		}, { state: unsupportedAgentHostCanvasState, operations: ['get'] });
	});

	test('a non-negotiated host ignores stale metadata and performs no discovery RPCs', async () => {
		const f = fixture();
		f.hostSupported.set(false, undefined);
		const disabledState = await f.canvases.refresh();
		await assert.rejects(f.canvases.open({ extensionId: instance.extensionId, canvasId: instance.canvasId, instanceId: 'new' }), /not enabled/);
		const callsBeforeHandshake = f.calls.length;
		f.hostSupported.set(true, undefined);
		await f.canvases.refresh();
		assert.deepStrictEqual({
			disabledState,
			callsBeforeHandshake,
			current: f.canvases.state.get(),
			operations: f.calls.map(call => call.operation),
		}, { disabledState: unsupportedAgentHostCanvasState, callsBeforeHandshake: 0, current: liveState, operations: ['get'] });
	});

	test('unsupported facades stay dormant through reconnect and metadata churn until negotiation', async () => {
		const f = fixture();
		f.hostSupported.set(false, undefined);
		let metadataReads = 0;
		let versionReads = 0;
		const metadata = derived(store, reader => { metadataReads++; return f.metadata.read(reader); });
		const version = derived(store, reader => { versionReads++; return f.version.read(reader); });
		const supported = observableValue('negotiated', false);
		const canvases = store.add(new AgentHostSessionCanvases(mainChat, metadata, () => f.connection, version, supported));
		const publications: boolean[] = [];
		store.add(autorun(reader => { publications.push(canvases.state.read(reader).supported); }));
		f.version.set(1, undefined);
		f.metadata.set(withAgentHostCanvasState(f.metadata.get(), mainChat, { ...liveState, instances: [] }), undefined);
		f.version.set(2, undefined);
		await canvases.refresh();
		const dormant = { metadataReads, versionReads, publications: [...publications], requests: f.calls.length };
		supported.set(true, undefined);
		await canvases.refresh();
		supported.set(false, undefined);
		const afterOptOutReads = { metadataReads, versionReads };
		f.version.set(3, undefined);
		f.metadata.set(withAgentHostCanvasState(f.metadata.get(), mainChat, liveState), undefined);
		assert.deepStrictEqual({
			dormant, publications,
			stillDormant: metadataReads === afterOptOutReads.metadataReads && versionReads === afterOptOutReads.versionReads,
		}, {
			dormant: { metadataReads: 0, versionReads: 1, publications: [false], requests: 0 },
			publications: [false, true, false], stillDormant: true,
		});
	});

	test('keeps the original action error and can retry without reopening', async () => {
		const f = fixture();
		const failure = new Error('Canvas action failed');
		f.connection.invokeCanvasAction = async () => { throw failure; };
		await assert.rejects(f.canvases.invokeAction({ instanceId: 'one', actionName: 'increment' }), error => error === failure);
		const reportedError = f.canvases.error.get();
		f.connection.invokeCanvasAction = async () => ({ result: 'recovered' });
		const result = await f.canvases.invokeAction({ instanceId: 'one', actionName: 'increment' });
		assert.deepStrictEqual({ reportedError, result, error: f.canvases.error.get(), loading: f.canvases.loading.get() }, {
			reportedError: failure, result: { result: 'recovered' }, error: undefined, loading: false,
		});
	});

	test('invalidates an old endpoint on host restart and ignores a retired refresh', async () => {
		const f = fixture();
		const oldRequest = new DeferredPromise<IAgentHostCanvasState>();
		f.connection.getCanvases = () => oldRequest.p;
		const retired = f.canvases.refresh();
		f.version.set(1, undefined);
		const whileUnavailable = f.canvases.state.get().instances;
		const current: IAgentHostCanvasState = { ...liveState, instances: [{ ...instance, url: 'http://localhost:43000/?token=fresh' }] };
		f.connection.getCanvases = async () => current;
		await f.canvases.refresh();
		const busyWithRetiredRequest = f.canvases.loading.get();
		const rejected = assert.rejects(retired, isCancellationError);
		await oldRequest.complete(liveState);
		await rejected;
		assert.deepStrictEqual({
			whileUnavailable: whileUnavailable.map(instance => ({ availability: instance.availability, url: instance.url })),
			current: f.canvases.state.get(),
			error: f.canvases.error.get(),
			busyWithRetiredRequest,
		}, { whileUnavailable: [{ availability: 'unavailable', url: undefined }], current, error: undefined, busyWithRetiredRequest: false });
	});

	test('failed refresh drops endpoint authority but preserves logical instances for retry', async () => {
		const f = fixture();
		f.connection.getCanvases = async () => { throw new Error('Host unavailable'); };
		await assert.rejects(f.canvases.refresh(), /Host unavailable/);
		const unavailable = f.canvases.state.get().instances.map(instance => ({ id: instance.instanceId, availability: instance.availability, url: instance.url }));
		f.connection.getCanvases = async () => liveState;
		await f.canvases.refresh();
		assert.deepStrictEqual({ unavailable, recovered: f.canvases.state.get().instances, calls: f.calls }, {
			unavailable: [{ id: 'one', availability: 'unavailable', url: undefined }], recovered: [instance], calls: [],
		});
	});

	test('reload retires endpoints before the guarded RPC and refreshes without opening', async () => {
		const f = fixture();
		const reload = new DeferredPromise<void>();
		f.connection.reloadCanvases = async chat => {
			f.calls.push({ operation: 'reload', chat: chat.toString() });
			await reload.p;
		};
		const pending = f.canvases.reload();
		const duringReload = f.canvases.state.get().instances.map(instance => instance.url);
		f.setLive({ ...liveState, instances: [{ ...instance, url: 'http://localhost:44000/' }] });
		await reload.complete();
		await pending;
		assert.deepStrictEqual({
			duringReload,
			afterReload: f.canvases.state.get().instances.map(instance => instance.url),
			operations: f.calls.map(call => call.operation),
		}, { duringReload: [undefined], afterReload: ['http://localhost:44000/'], operations: ['reload', 'get'] });
	});

	test('ready metadata during the post-acknowledgment read survives its older unavailable response', async () => {
		const f = fixture();
		const acknowledgment = new DeferredPromise<void>();
		const reading = new DeferredPromise<void>();
		const snapshot = new DeferredPromise<IAgentHostCanvasState>();
		f.connection.reloadCanvases = async chat => {
			f.calls.push({ operation: 'reload', chat: chat.toString() });
			await acknowledgment.p;
		};
		f.connection.getCanvases = async chat => {
			f.calls.push({ operation: 'get', chat: chat.toString() });
			void reading.complete();
			return snapshot.p;
		};
		const reload = f.canvases.reload();
		await acknowledgment.complete();
		await reading.p;
		const ready: IAgentHostCanvasState = { ...liveState, instances: [{ ...instance, url: 'http://localhost:45000/' }] };
		f.metadata.set(withAgentHostCanvasState(f.metadata.get(), mainChat, ready), undefined);
		const duringRead = f.canvases.state.get();
		await snapshot.complete(unavailableSessionCanvasState(liveState));
		await reload;
		assert.deepStrictEqual({
			duringRead, afterReload: f.canvases.state.get(),
			operations: f.calls.map(call => call.operation), loading: f.canvases.loading.get(),
		}, { duringRead: ready, afterReload: ready, operations: ['reload', 'get'], loading: false });
	});

	test('readiness arriving after reload finishes is published without a further request', async () => {
		const f = fixture();
		f.setLive(unavailableSessionCanvasState(liveState));
		await f.canvases.reload();
		const atAcknowledgment = f.canvases.state.get().instances.map(instance => instance.availability);
		const ready: IAgentHostCanvasState = { ...liveState, instances: [{ ...instance, url: 'http://localhost:46000/' }] };
		f.metadata.set(withAgentHostCanvasState(f.metadata.get(), mainChat, ready), undefined);
		assert.deepStrictEqual({
			atAcknowledgment, afterMetadata: f.canvases.state.get(), operations: f.calls.map(call => call.operation),
		}, { atAcknowledgment: ['unavailable'], afterMetadata: ready, operations: ['reload', 'get'] });
	});

	test('a failing read cannot invalidate newer authoritative ready metadata', async () => {
		const f = fixture();
		const response = new DeferredPromise<IAgentHostCanvasState>();
		f.connection.getCanvases = () => response.p;
		const refresh = f.canvases.refresh();
		const failure = new Error('Old read failed');
		const rejected = assert.rejects(refresh, error => error === failure);
		const ready: IAgentHostCanvasState = { ...liveState, instances: [{ ...instance, url: 'http://localhost:47000/' }] };
		f.metadata.set(withAgentHostCanvasState(f.metadata.get(), mainChat, ready), undefined);
		await response.error(failure);
		await rejected;
		assert.deepStrictEqual({ state: f.canvases.state.get(), error: f.canvases.error.get() }, { state: ready, error: failure });
	});

	test('only explicit close removes a logical instance', async () => {
		const f = fixture();
		await f.canvases.close('one');
		assert.deepStrictEqual({
			instances: f.canvases.state.get().instances,
			operations: f.calls.map(call => call.operation),
		}, { instances: [], operations: ['get', 'close', 'get'] });
	});
});

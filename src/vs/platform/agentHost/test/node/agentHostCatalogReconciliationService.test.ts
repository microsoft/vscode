/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { type IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { ISessionDataService } from '../../common/sessionDataService.js';
import { AgentHostCatalogReconciliationService, AgentHostCatalogReconciliationSourceResult, IAgentHostCatalogReconciliationOptions } from '../../node/agentHostCatalogReconciliationService.js';
import { AgentHostCatalogSyncService } from '../../node/agentHostCatalogSyncService.js';
import { AgentHostCatalogData, AGENT_HOST_CATALOG_PAYLOAD_VERSION } from '../../node/agentHostCatalogProjection.js';
import { AgentHostDatabase, AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabaseSessionV2Envelope } from '../../node/agentHostDatabase.js';
import type { IRegisteredSession } from '../../node/agentSessionRegistry.js';
import type { IAgentHostStorageService } from '../../node/agentHostStorageService.js';
import { TestSessionDatabase } from '../common/sessionTestHelpers.js';

function catalogData(summary: string): AgentHostCatalogData {
	return {
		modifiedTime: 1,
		summary,
		titleSource: 'user',
		isRead: false,
		isArchived: false,
		workingDirectories: [],
		chats: [{
			uri: `agenthost-chat:${summary}/default`,
			order: 0,
			kind: 'default',
			summary,
			titleSource: 'user',
		}],
	};
}

/** Reads the opaque payload the way a downstream reader would, without a SQL projection. */
function summaryOf(payload: string): string {
	return JSON.parse(payload).data.summary;
}

function registered(name: string): IRegisteredSession {
	return {
		session: URI.parse(`agenthost:${name}`),
		provider: 'copilot',
		startTime: 1,
		modifiedTime: 1,
		external: false,
		source: 'explicit',
	};
}

class TestStorageService implements IAgentHostStorageService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	private readonly _values = new Map<string, unknown>();

	get<T>(key: string): T | undefined {
		return this._values.get(key) as T | undefined;
	}

	set<T>(key: string, value: T): void {
		this._values.set(key, value);
	}

	delete(key: string): void {
		this._values.delete(key);
	}

	async whenIdle(): Promise<void> { }
}

class RecordingCatalogDatabase extends AgentHostDatabase {
	upsertCalls = 0;
	failUpsert = false;
	failUpsertCount = 0;
	failMarkAll = 0;

	constructor() {
		super(':memory:');
	}

	override async upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
		this.upsertCalls++;
		if (this.failUpsert || this.failUpsertCount > 0) {
			this.failUpsertCount = Math.max(0, this.failUpsertCount - 1);
			throw new Error('central unavailable');
		}
		return super.upsertSessionV2(envelope, expectedSessionGeneration);
	}

	override async markAllSessionsV2PayloadsDirty(): Promise<void> {
		if (this.failMarkAll > 0) {
			this.failMarkAll--;
			throw new Error('dirty marker unavailable');
		}
		return super.markAllSessionsV2PayloadsDirty();
	}
}

interface ITestHarness {
	readonly central: RecordingCatalogDatabase;
	readonly locals: Map<string, TestSessionDatabase>;
	readonly sync: AgentHostCatalogSyncService;
	readonly getDatabaseOpenAttempts: () => number;
	createService(resolveSource?: (session: IRegisteredSession) => Promise<AgentHostCatalogReconciliationSourceResult>, options?: IAgentHostCatalogReconciliationOptions): AgentHostCatalogReconciliationService;
}

suite('AgentHostCatalogReconciliationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createHarness(names: readonly string[], missing: ReadonlySet<string> = new Set()): Promise<ITestHarness> {
		const central = store.add(new RecordingCatalogDatabase());
		const sessions = names.map(registered);
		for (const session of sessions) {
			await central.registerSessionV2(session.session.toString(), {
				provider: session.provider,
				startTime: session.startTime,
				source: session.source,
			}, { checkTombstone: false });
		}
		const locals = new Map<string, TestSessionDatabase>();
		let databaseOpenAttempts = 0;
		for (const session of sessions) {
			if (!missing.has(session.session.toString())) {
				locals.set(session.session.toString(), new TestSessionDatabase());
			}
		}
		const sessionDataService: ISessionDataService = {
			_serviceBrand: undefined,
			getSessionDataDir: session => URI.from({ scheme: Schemas.inMemory, path: `/session-data/${session.path}` }),
			getSessionDataDirById: sessionId => URI.from({ scheme: Schemas.inMemory, path: `/session-data/${sessionId}` }),
			openDatabase: session => reference(requiredLocal(locals, session)),
			tryOpenDatabase: async session => {
				databaseOpenAttempts++;
				const database = locals.get(session.toString());
				return database ? reference(database) : undefined;
			},
			deleteSessionData: async () => { },
			onWillDeleteSessionData: Event.None,
			cleanupOrphanedData: async () => { },
			whenIdle: async () => { },
		};
		const storage = new TestStorageService();
		const sync = new AgentHostCatalogSyncService(sessionDataService, central, new NullLogService());
		return {
			central,
			locals,
			sync,
			getDatabaseOpenAttempts: () => databaseOpenAttempts,
			createService: (resolveSource = async session => ({
				status: 'available',
				request: { data: catalogData(session.session.path), legacyMetadata: { customTitle: session.session.path } },
			}), options) => store.add(new AgentHostCatalogReconciliationService(
				sessionDataService,
				central,
				sync,
				storage,
				async () => sessions,
				resolveSource,
				new NullLogService(),
				options,
			)),
		};
	}

	test('opens and re-projects dirty rows once, then skips clean rows before session.db', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		await harness.sync.synchronize(session.session, { data: catalogData('one'), legacyMetadata: { customTitle: 'one' } });
		harness.central.upsertCalls = 0;
		let sourceResolutions = 0;
		const service = harness.createService(async registeredSession => {
			sourceResolutions++;
			return {
				status: 'available',
				request: { data: catalogData(registeredSession.session.path), legacyMetadata: { customTitle: registeredSession.session.path } },
			};
		});

		const first = await service.runPass();
		const firstDatabaseOpenAttempts = harness.getDatabaseOpenAttempts();
		const second = await service.runPass();

		assert.deepStrictEqual({
			first: first.outcomes,
			second: second.outcomes,
			upsertCalls: harness.central.upsertCalls,
			firstDatabaseOpenAttempts,
			finalDatabaseOpenAttempts: harness.getDatabaseOpenAttempts(),
			sourceResolutions,
		}, {
			first: [{ session: 'agenthost:one', status: 'skipped', reason: 'synchronized' }],
			second: [],
			upsertCalls: 0,
			firstDatabaseOpenAttempts: 1,
			finalDatabaseOpenAttempts: 1,
			sourceResolutions: 1,
		});
	});

	test('replays a pending payload into missing sessions_v2 and clears the payload after acknowledgement', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		harness.central.failUpsert = true;
		await harness.sync.synchronize(session.session, { data: catalogData('one'), legacyMetadata: { customTitle: 'one' } });
		const pending = await requiredLocal(harness.locals, session.session).getCatalogSyncSnapshot();
		harness.central.failUpsert = false;

		const service = harness.createService();
		const report = await service.runPass();
		const converged = await service.runPass();
		const acknowledged = await requiredLocal(harness.locals, session.session).getCatalogSyncSnapshot();

		assert.deepStrictEqual({
			before: { state: pending?.state, hasPayload: pending?.payload !== undefined },
			outcomes: report.outcomes,
			converged: converged.outcomes,
			after: { state: acknowledged?.state, payload: acknowledged?.payload },
			catalogTitle: summaryOf((await harness.central.getSessionV2(session.session.toString()))!.payload),
		}, {
			before: { state: 'pending', hasPayload: true },
			outcomes: [{ session: 'agenthost:one', status: 'retry', reason: 'superseded' }],
			converged: [{ session: 'agenthost:one', status: 'skipped', reason: 'synchronized' }],
			after: { state: 'acknowledged', payload: undefined },
			catalogTitle: 'one',
		});
	});

	test('periodically verifies clean rows when provider state has no dirty event', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		await harness.sync.synchronize(session.session, { data: catalogData('one'), legacyMetadata: { customTitle: 'one' } });
		let now = 0;
		let sourceResolutions = 0;
		const service = harness.createService(async () => {
			sourceResolutions++;
			return { status: 'available', request: { data: catalogData('one'), legacyMetadata: { customTitle: 'one' } } };
		}, {
			fullVerificationIntervalMs: 100,
			now: () => now,
		});

		await service.runPass();
		const clean = await service.runPass();
		now = 100;
		const safetySweep = await service.runPass();

		assert.deepStrictEqual({
			clean: clean.outcomes,
			safetySweep: safetySweep.outcomes,
			databaseOpenAttempts: harness.getDatabaseOpenAttempts(),
			sourceResolutions,
		}, {
			clean: [],
			safetySweep: [{ session: 'agenthost:one', status: 'skipped', reason: 'synchronized' }],
			databaseOpenAttempts: 2,
			sourceResolutions: 2,
		});
	});

	test('retries the startup dirty sweep after a transient central failure', async () => {
		const harness = await createHarness(['one']);
		harness.central.failMarkAll = 1;
		const service = harness.createService();

		await assert.rejects(service.runPass(), /dirty marker unavailable/);
		const retried = await service.runPass();

		assert.deepStrictEqual(retried.outcomes, [
			{ session: 'agenthost:one', status: 'succeeded', reason: 'synchronized', sourceRevision: 0 },
		]);
	});

	test('rebuilds from legacy/provider state and advances revision after an old-build mutation', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		await harness.sync.synchronize(session.session, { data: catalogData('one'), legacyMetadata: { customTitle: 'one' } });
		await requiredLocal(harness.locals, session.session).setMetadata('customTitle', 'old-title');

		const report = await harness.createService(async () => ({
			status: 'available',
			request: { data: catalogData('old-title'), legacyMetadata: { customTitle: 'old-title' } },
		})).runPass();
		const receipt = await requiredLocal(harness.locals, session.session).getCatalogSyncSnapshot();

		assert.deepStrictEqual({
			outcomes: report.outcomes,
			title: summaryOf((await harness.central.getSessionV2(session.session.toString()))!.payload),
			revision: receipt?.sourceRevision,
			payload: receipt?.payload,
		}, {
			outcomes: [{ session: 'agenthost:one', status: 'succeeded', reason: 'synchronized', sourceRevision: 1 }],
			title: 'old-title',
			revision: 1,
			payload: undefined,
		});
	});

	test('re-projects instead of failing when an older build left a pending snapshot in its own projection', async () => {
		// A downgraded build writes the user's rename into the session database
		// and leaves a pending snapshot this build cannot replay. The central
		// row it could not update is still structurally valid, so nothing else
		// would ever repair it.
		const harness = await createHarness(['one']);
		const session = registered('one');
		await harness.sync.synchronize(session.session, { data: catalogData('one'), legacyMetadata: { customTitle: 'one' } });
		const local = requiredLocal(harness.locals, session.session);
		const acknowledged = await local.getCatalogSyncSnapshot();
		assert.ok(acknowledged);
		await local.setMetadataValuesAndCatalogSyncSnapshot({ customTitle: 'renamed-by-older-build' }, {
			sessionGeneration: acknowledged.sessionGeneration,
			sourceRevision: acknowledged.sourceRevision + 1,
			projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION + 3,
			payload: '{"projectionVersion":4,"source":{"title":"renamed-by-older-build"}}',
			payloadHash: 'older-build-hash',
			state: 'pending',
		});

		const report = await harness.createService(async () => ({
			status: 'available',
			request: { data: catalogData('renamed-by-older-build'), legacyMetadata: { customTitle: 'renamed-by-older-build' } },
		})).runPass();
		const receipt = await local.getCatalogSyncSnapshot();

		assert.deepStrictEqual({
			outcomes: report.outcomes,
			title: summaryOf((await harness.central.getSessionV2(session.session.toString()))!.payload),
			state: receipt?.state,
			generation: receipt?.sessionGeneration === acknowledged.sessionGeneration,
		}, {
			outcomes: [{ session: 'agenthost:one', status: 'succeeded', reason: 'synchronized', sourceRevision: 2 }],
			title: 'renamed-by-older-build',
			state: 'acknowledged',
			generation: true,
		});
	});

	test('adopts the current sessions_v2 generation when the local receipt is stale', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		await harness.sync.synchronize(session.session, { data: catalogData('one'), legacyMetadata: { customTitle: 'one' } });
		const current = await harness.central.getSessionV2(session.session.toString());
		assert.ok(current);
		await harness.central.upsertSessionV2({ ...current, sessionGeneration: 'current', sourceRevision: current.sourceRevision + 1 }, current.sessionGeneration);
		const local = requiredLocal(harness.locals, session.session);

		const report = await harness.createService(async () => ({
			status: 'available',
			request: { data: catalogData('two'), legacyMetadata: { customTitle: 'two' } },
		})).runPass();

		assert.deepStrictEqual({
			outcome: report.outcomes.at(-1),
			generation: (await local.getCatalogSyncSnapshot())?.sessionGeneration,
		}, {
			outcome: { session: 'agenthost:one', status: 'succeeded', reason: 'synchronized', sourceRevision: 2 },
			generation: 'current',
		});
	});

	test('reports missing session databases explicitly for retry', async () => {
		const missing = new Set(['agenthost:missing']);
		const harness = await createHarness(['missing'], missing);

		assert.deepStrictEqual((await harness.createService().runPass()).outcomes, [
			{ session: 'agenthost:missing', status: 'retry', reason: 'missingDatabase' },
		]);
	});

	test('keeps provider-unavailable payloads dirty without evicting the cached row', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		await harness.sync.synchronize(session.session, { data: catalogData('cached'), legacyMetadata: { customTitle: 'cached' } });
		const service = harness.createService(async () => ({ status: 'providerUnavailable' }));

		const first = await service.runPass();
		const second = await service.runPass();
		const cached = await harness.central.getSessionV2(session.session.toString());

		assert.deepStrictEqual({
			first: first.outcomes,
			second: second.outcomes,
			databaseOpenAttempts: harness.getDatabaseOpenAttempts(),
			cachedSummary: cached && summaryOf(cached.payload),
			payloadDirty: cached?.payloadDirty,
		}, {
			first: [{ session: 'agenthost:one', status: 'retry', reason: 'providerUnavailable' }],
			second: [{ session: 'agenthost:one', status: 'retry', reason: 'providerUnavailable' }],
			databaseOpenAttempts: 2,
			cachedSummary: 'cached',
			payloadDirty: 3,
		});
	});

	test('runs the safety sweep even while another row remains permanently dirty', async () => {
		const harness = await createHarness(['clean', 'stuck']);
		for (const name of ['clean', 'stuck']) {
			const session = registered(name);
			await harness.sync.synchronize(session.session, { data: catalogData(name), legacyMetadata: { customTitle: name } });
		}
		let now = 0;
		const service = harness.createService(async session => session.session.path === 'stuck'
			? { status: 'providerUnavailable' }
			: { status: 'available', request: { data: catalogData('clean'), legacyMetadata: { customTitle: 'clean' } } }, {
			fullVerificationIntervalMs: 100,
			now: () => now,
		});

		await service.runPass();
		now = 100;
		const safetySweep = await service.runPass();

		assert.deepStrictEqual(safetySweep.outcomes, [
			{ session: 'agenthost:clean', status: 'skipped', reason: 'synchronized' },
			{ session: 'agenthost:stuck', status: 'retry', reason: 'providerUnavailable' },
		]);
	});

	test('serializes source verification and repair behind an in-flight writer', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		let currentTitle = 'one';
		const service = harness.createService(async () => ({
			status: 'available',
			request: { data: catalogData(currentTitle), legacyMetadata: { customTitle: currentTitle } },
		}));
		await harness.sync.synchronize(session.session, { data: catalogData(currentTitle), legacyMetadata: { customTitle: currentTitle } });
		await service.runPass();

		let writerStarted!: () => void;
		const started = new Promise<void>(resolve => writerStarted = resolve);
		let releaseWriter!: () => void;
		const writerGate = new Promise<void>(resolve => releaseWriter = resolve);
		harness.central.failUpsertCount = 1;
		const writer = harness.sync.synchronizeWithFactory(session.session, async () => {
			writerStarted();
			await writerGate;
			currentTitle = 'new-title';
			return { data: catalogData(currentTitle), legacyMetadata: { customTitle: currentTitle } };
		});
		await started;
		const repair = service.runPass();
		releaseWriter();

		const [writerResult, repairResult] = await Promise.all([writer, repair]);
		const dirty = await harness.central.getSessionV2(session.session.toString());
		const converged = await service.runPass();
		const cached = await harness.central.getSessionV2(session.session.toString());

		assert.deepStrictEqual({
			writerResult,
			repair: repairResult.outcomes,
			dirtySummary: dirty && summaryOf(dirty.payload),
			dirtyMarker: dirty?.payloadDirty,
			converged: converged.outcomes,
			cachedSummary: cached && summaryOf(cached.payload),
			payloadDirty: cached?.payloadDirty,
		}, {
			writerResult: { status: 'pending', sourceRevision: 1, reason: 'upsertFailed' },
			repair: [{ session: 'agenthost:one', status: 'retry', reason: 'superseded' }],
			dirtySummary: 'one',
			dirtyMarker: 2,
			converged: [{ session: 'agenthost:one', status: 'succeeded', reason: 'pendingReplayed', sourceRevision: 1 }],
			cachedSummary: 'new-title',
			payloadDirty: 0,
		});
	});

	test('does not clear an unobserved dirty epoch on an incomplete row', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		let currentTitle = 'old-title';
		let sourceStarted!: () => void;
		const started = new Promise<void>(resolve => sourceStarted = resolve);
		let releaseSource!: () => void;
		const sourceGate = new Promise<void>(resolve => releaseSource = resolve);
		const service = harness.createService(async () => {
			sourceStarted();
			await sourceGate;
			return { status: 'available', request: { data: catalogData(currentTitle), legacyMetadata: { customTitle: currentTitle } } };
		});
		const repair = service.runPass();
		await started;

		currentTitle = 'new-title';
		harness.central.failUpsertCount = 1;
		const writerResult = await harness.sync.synchronize(session.session, {
			data: catalogData(currentTitle),
			legacyMetadata: { customTitle: currentTitle },
		});
		releaseSource();
		const firstRepair = await repair;
		const dirty = await harness.central.getSessionV2(session.session.toString());
		const converged = await service.runPass();
		const cached = await harness.central.getSessionV2(session.session.toString());

		assert.deepStrictEqual({
			writerResult,
			firstRepair: firstRepair.outcomes,
			dirtyMarker: dirty?.payloadDirty,
			converged: converged.outcomes,
			cachedSummary: cached && summaryOf(cached.payload),
			payloadDirty: cached?.payloadDirty,
		}, {
			writerResult: { status: 'pending', sourceRevision: 0, reason: 'upsertFailed' },
			firstRepair: [{ session: 'agenthost:one', status: 'retry', reason: 'superseded' }],
			dirtyMarker: 2,
			converged: [{ session: 'agenthost:one', status: 'skipped', reason: 'synchronized' }],
			cachedSummary: 'new-title',
			payloadDirty: 0,
		});
	});

	test('does not resurrect a tombstoned session', async () => {
		const harness = await createHarness(['one']);
		await harness.central.tombstoneAndUnregisterSession('agenthost:one');

		assert.deepStrictEqual((await harness.createService().runPass()).outcomes, [
			{ session: 'agenthost:one', status: 'retry', reason: 'tombstoned' },
		]);
	});
});

function requiredLocal(locals: Map<string, TestSessionDatabase>, session: URI): TestSessionDatabase {
	const database = locals.get(session.toString());
	if (!database) {
		throw new Error(`Missing local database for ${session.toString()}`);
	}
	return database;
}

function reference(database: TestSessionDatabase): IReference<TestSessionDatabase> {
	return {
		object: database,
		dispose: () => { },
	};
}

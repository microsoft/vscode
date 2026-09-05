/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { type IDisposable, type IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { ISessionDataService } from '../../common/sessionDataService.js';
import { AgentHostCatalogReconciliationService, AgentHostCatalogReconciliationSourceResult, IAgentHostCatalogReconciliationOptions } from '../../node/agentHostCatalogReconciliationService.js';
import { AgentHostCatalogSyncService } from '../../node/agentHostCatalogSyncService.js';
import { AgentHostCatalogData, AGENT_HOST_CATALOG_PAYLOAD_VERSION, encodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import { AgentHostDatabase, AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabaseSessionV2, IAgentHostDatabaseSessionV2Envelope } from '../../node/agentHostDatabase.js';
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
	readonly loadError = undefined;
	private readonly _values = new Map<string, unknown>();

	get<T>(key: string): T | undefined {
		return this._values.get(key) as T | undefined;
	}

	set<T>(key: string, value: T): void {
		this._values.set(key, value);
	}

	async setAndFlush<T>(key: string, value: T): Promise<void> {
		this.set(key, value);
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
	markAllCalls = 0;
	dirtyAfterUpsertCount = 0;
	nonCanonicalPayloadReads = 0;
	conflictingEnvelope: IAgentHostDatabaseSessionV2Envelope | undefined;

	constructor() {
		super(':memory:');
	}

	override async upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
		this.upsertCalls++;
		if (this.failUpsert || this.failUpsertCount > 0) {
			this.failUpsertCount = Math.max(0, this.failUpsertCount - 1);
			throw new Error('central unavailable');
		}
		if (this.conflictingEnvelope) {
			const conflictingEnvelope = this.conflictingEnvelope;
			this.conflictingEnvelope = undefined;
			await super.upsertSessionV2(conflictingEnvelope, expectedSessionGeneration);
			await super.markSessionV2PayloadDirty(envelope.session);
			return 'conflict';
		}
		const result = await super.upsertSessionV2(envelope, expectedSessionGeneration);
		if (this.dirtyAfterUpsertCount > 0 && (result === 'applied' || result === 'replayed')) {
			this.dirtyAfterUpsertCount--;
			await super.markSessionV2PayloadDirty(envelope.session);
		}
		return result;
	}

	override async markAllSessionsV2PayloadsDirty(): Promise<void> {
		this.markAllCalls++;
		if (this.failMarkAll > 0) {
			this.failMarkAll--;
			throw new Error('dirty marker unavailable');
		}
		return super.markAllSessionsV2PayloadsDirty();
	}

	override async getSessionV2(session: string): Promise<IAgentHostDatabaseSessionV2 | undefined> {
		const result = await super.getSessionV2(session);
		if (result && this.nonCanonicalPayloadReads > 0) {
			this.nonCanonicalPayloadReads--;
			return { ...result, payload: ` ${result.payload}` };
		}
		return result;
	}
}

class TestScheduler {
	private readonly _entries: { readonly callback: () => void; readonly delay: number; active: boolean }[] = [];

	readonly schedule = (callback: () => void, delay: number): IDisposable => {
		const entry = { callback, delay, active: true };
		this._entries.push(entry);
		return { dispose: () => entry.active = false };
	};

	get activeDelays(): readonly number[] {
		return this._entries.filter(entry => entry.active).map(entry => entry.delay);
	}

	run(delay: number): void {
		const entry = this._entries.find(candidate => candidate.active && candidate.delay === delay);
		assert.ok(entry, `No active ${delay}ms timer`);
		entry.active = false;
		entry.callback();
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
			outcomes: [{ session: 'agenthost:one', status: 'succeeded', reason: 'pendingReplayed', sourceRevision: 0 }],
			converged: [],
			after: { state: 'acknowledged', payload: undefined },
			catalogTitle: 'one',
		});
	});

	test('reports a transient central replay failure as pending and retries it', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		harness.central.failUpsertCount = 1;
		await harness.sync.synchronize(session.session, {
			data: catalogData('pending'),
			legacyMetadata: { customTitle: 'pending' },
		});
		harness.central.failUpsertCount = 1;
		const service = harness.createService();

		const first = await service.runPass();
		const second = await service.runPass();

		assert.deepStrictEqual({
			first: first.outcomes,
			second: second.outcomes,
		}, {
			first: [{ session: 'agenthost:one', status: 'pending', reason: 'upsertFailed', sourceRevision: 0 }],
			second: [{ session: 'agenthost:one', status: 'succeeded', reason: 'pendingReplayed', sourceRevision: 0 }],
		});
	});

	test('replays a compatible pending snapshot before resolving an unavailable provider', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		harness.central.failUpsert = true;
		await harness.sync.synchronize(session.session, { data: catalogData('pending'), legacyMetadata: { customTitle: 'pending' } });
		harness.central.failUpsert = false;
		let sourceResolutions = 0;
		const report = await harness.createService(async () => {
			sourceResolutions++;
			return { status: 'providerUnavailable' };
		}).runPass();

		assert.deepStrictEqual({
			outcomes: report.outcomes,
			sourceResolutions,
			catalogTitle: summaryOf((await harness.central.getSessionV2(session.session.toString()))!.payload),
		}, {
			outcomes: [{ session: 'agenthost:one', status: 'succeeded', reason: 'pendingReplayed', sourceRevision: 0 }],
			sourceResolutions: 0,
			catalogTitle: 'pending',
		});
	});

	test('does not clear a dirty epoch added while replaying a pending payload', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		harness.central.failUpsert = true;
		await harness.sync.synchronize(session.session, { data: catalogData('pending'), legacyMetadata: { customTitle: 'pending' } });
		harness.central.failUpsert = false;
		harness.central.dirtyAfterUpsertCount = 1;

		const report = await harness.createService().runPass();
		const cached = await harness.central.getSessionV2(session.session.toString());

		assert.deepStrictEqual({
			outcomes: report.outcomes,
			payloadDirty: cached?.payloadDirty,
		}, {
			outcomes: [{ session: 'agenthost:one', status: 'retry', reason: 'superseded' }],
			payloadDirty: 3,
		});
	});

	test('replaces a non-canonical central payload before clearing its dirty marker', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		await harness.sync.synchronize(session.session, { data: catalogData('one'), legacyMetadata: { customTitle: 'one' } });
		harness.central.nonCanonicalPayloadReads = 3;

		const report = await harness.createService().runPass();
		const repaired = await harness.central.getSessionV2(session.session.toString());

		assert.deepStrictEqual({
			outcomes: report.outcomes,
			payloadStartsWithWhitespace: repaired?.payload.startsWith(' '),
			sourceRevision: repaired?.sourceRevision,
			payloadDirty: repaired?.payloadDirty,
		}, {
			outcomes: [{ session: 'agenthost:one', status: 'succeeded', reason: 'synchronized', sourceRevision: 1 }],
			payloadStartsWithWhitespace: false,
			sourceRevision: 1,
			payloadDirty: 0,
		});
	});

	test('runFullPass drains its initial dirty population once across bounded batches', async () => {
		const harness = await createHarness(['one', 'two', 'three']);
		const resolutions = new Map<string, number>();
		const report = await harness.createService(async session => {
			const key = session.session.toString();
			resolutions.set(key, (resolutions.get(key) ?? 0) + 1);
			return key === 'agenthost:two'
				? { status: 'providerUnavailable' }
				: { status: 'available', request: { data: catalogData(session.session.path), legacyMetadata: { customTitle: session.session.path } } };
		}, { batchSize: 1 }).runFullPass();

		assert.deepStrictEqual({
			outcomes: report.outcomes,
			resolutions: [...resolutions],
		}, {
			outcomes: [
				{ session: 'agenthost:one', status: 'succeeded', reason: 'synchronized', sourceRevision: 0 },
				{ session: 'agenthost:three', status: 'succeeded', reason: 'synchronized', sourceRevision: 0 },
				{ session: 'agenthost:two', status: 'retry', reason: 'providerUnavailable' },
			],
			resolutions: [
				['agenthost:one', 1],
				['agenthost:three', 1],
				['agenthost:two', 1],
			],
		});
	});

	test('runFullPass drains joined schedule and runPass requests with one trailing pass', async () => {
		const harness = await createHarness(['one']);
		let firstSourceStarted!: () => void;
		const firstStarted = new Promise<void>(resolve => firstSourceStarted = resolve);
		let releaseFirstSource!: () => void;
		const firstSourceGate = new Promise<void>(resolve => releaseFirstSource = resolve);
		let sourceResolutions = 0;
		const service = harness.createService(async () => {
			sourceResolutions++;
			if (sourceResolutions === 1) {
				firstSourceStarted();
				await firstSourceGate;
			}
			return { status: 'providerUnavailable' };
		});

		const fullPass = service.runFullPass();
		await firstStarted;
		service.schedule();
		const joinedPass = service.runPass();
		releaseFirstSource();
		const [fullReport, joinedReport] = await Promise.all([fullPass, joinedPass]);

		assert.deepStrictEqual({
			fullOutcomes: fullReport.outcomes,
			joinedOutcomes: joinedReport.outcomes,
			sourceResolutions,
			markAllCalls: harness.central.markAllCalls,
		}, {
			fullOutcomes: [
				{ session: 'agenthost:one', status: 'retry', reason: 'providerUnavailable' },
				{ session: 'agenthost:one', status: 'retry', reason: 'providerUnavailable' },
			],
			joinedOutcomes: [
				{ session: 'agenthost:one', status: 'retry', reason: 'providerUnavailable' },
				{ session: 'agenthost:one', status: 'retry', reason: 'providerUnavailable' },
			],
			sourceResolutions: 2,
			markAllCalls: 1,
		});
	});

	test('whenIdle waits for a trailing pass requested during runFullPass', async () => {
		const harness = await createHarness(['one']);
		let firstSourceStarted!: () => void;
		const firstStarted = new Promise<void>(resolve => firstSourceStarted = resolve);
		let releaseFirstSource!: () => void;
		const firstSourceGate = new Promise<void>(resolve => releaseFirstSource = resolve);
		let trailingSourceStarted!: () => void;
		const trailingStarted = new Promise<void>(resolve => trailingSourceStarted = resolve);
		let releaseTrailingSource!: () => void;
		const trailingSourceGate = new Promise<void>(resolve => releaseTrailingSource = resolve);
		let sourceResolutions = 0;
		const service = harness.createService(async () => {
			sourceResolutions++;
			if (sourceResolutions === 1) {
				firstSourceStarted();
				await firstSourceGate;
			} else {
				trailingSourceStarted();
				await trailingSourceGate;
			}
			return { status: 'providerUnavailable' };
		});

		const fullPass = service.runFullPass();
		await firstStarted;
		service.schedule();
		let idleSettled = false;
		const idle = service.whenIdle().then(() => idleSettled = true);
		releaseFirstSource();
		await trailingStarted;
		const settledBeforeTrailingRelease = idleSettled;
		releaseTrailingSource();
		await Promise.all([fullPass, idle]);

		assert.deepStrictEqual({
			settledBeforeTrailingRelease,
			idleSettled,
			sourceResolutions,
			markAllCalls: harness.central.markAllCalls,
		}, {
			settledBeforeTrailingRelease: false,
			idleSettled: true,
			sourceResolutions: 2,
			markAllCalls: 1,
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

	test('reconciles a missing session database through the central-only path', async () => {
		const missing = new Set(['agenthost:missing']);
		const harness = await createHarness(['missing'], missing);

		const report = await harness.createService().runPass();
		const catalog = await harness.central.getSessionV2('agenthost:missing');

		assert.deepStrictEqual({
			outcomes: report.outcomes,
			summary: catalog && summaryOf(catalog.payload),
			payloadDirty: catalog?.payloadDirty,
		}, {
			outcomes: [{ session: 'agenthost:missing', status: 'succeeded', reason: 'synchronized', sourceRevision: 0 }],
			summary: 'missing',
			payloadDirty: 0,
		});
	});

	test('provider-only reconciliation CAS-clears the observed dirty marker', async () => {
		const missing = new Set(['agenthost:missing']);
		const harness = await createHarness(['missing'], missing);
		const session = registered('missing');
		await harness.sync.synchronizeMigrationWithFactory(session.session, async () => ({
			data: catalogData('old'),
			legacyMetadata: {},
		}));
		await harness.central.markSessionV2PayloadDirty(session.session.toString());

		const report = await harness.createService(async () => ({
			status: 'available',
			request: { data: catalogData('new'), legacyMetadata: {} },
		})).runPass();
		const catalog = await harness.central.getSessionV2(session.session.toString());

		assert.deepStrictEqual({
			outcomes: report.outcomes,
			summary: catalog && summaryOf(catalog.payload),
			payloadDirty: catalog?.payloadDirty,
		}, {
			outcomes: [{ session: 'agenthost:missing', status: 'succeeded', reason: 'synchronized', sourceRevision: 1 }],
			summary: 'new',
			payloadDirty: 0,
		});
	});

	test('provider-only reconciliation rechecks an incomplete dirty marker after source resolution', async () => {
		const missing = new Set(['agenthost:missing']);
		const harness = await createHarness(['missing'], missing);
		const session = registered('missing');
		let title = 'old';
		let sourceStarted!: () => void;
		const started = new Promise<void>(resolve => sourceStarted = resolve);
		let releaseSource!: () => void;
		const sourceGate = new Promise<void>(resolve => releaseSource = resolve);
		const service = harness.createService(async () => {
			sourceStarted();
			await sourceGate;
			return { status: 'available', request: { data: catalogData(title), legacyMetadata: {} } };
		});

		const firstPass = service.runPass();
		await started;
		title = 'new';
		await harness.central.markSessionV2PayloadDirty(session.session.toString());
		releaseSource();
		const first = await firstPass;
		const afterRace = await harness.central.getSessionV2(session.session.toString());
		const second = await service.runPass();
		const converged = await harness.central.getSessionV2(session.session.toString());

		assert.deepStrictEqual({
			first: first.outcomes,
			afterRace,
			second: second.outcomes,
			summary: converged && summaryOf(converged.payload),
			payloadDirty: converged?.payloadDirty,
		}, {
			first: [{ session: 'agenthost:missing', status: 'retry', reason: 'superseded' }],
			afterRace: undefined,
			second: [{ session: 'agenthost:missing', status: 'succeeded', reason: 'synchronized', sourceRevision: 0 }],
			summary: 'new',
			payloadDirty: 0,
		});
	});

	test('provider-only reconciliation does not overwrite a conflict that dirties the observed receipt', async () => {
		const missing = new Set(['agenthost:missing']);
		const harness = await createHarness(['missing'], missing);
		const session = registered('missing');
		await harness.sync.synchronizeMigrationWithFactory(session.session, async () => ({
			data: catalogData('old'),
			legacyMetadata: {},
		}));
		const current = await harness.central.getSessionV2(session.session.toString());
		assert.ok(current);
		await harness.central.markSessionV2PayloadDirty(session.session.toString());
		const concurrent = encodeAgentHostCatalogPayload(catalogData('concurrent'));
		assert.ok(concurrent.ok);
		harness.central.conflictingEnvelope = {
			...current,
			sourceRevision: current.sourceRevision + 1,
			payload: concurrent.value.payload,
			payloadHash: concurrent.value.payloadHash,
		};

		const report = await harness.createService(async () => ({
			status: 'available',
			request: { data: catalogData('stale-repair'), legacyMetadata: {} },
		})).runPass();
		const catalog = await harness.central.getSessionV2(session.session.toString());

		assert.deepStrictEqual({
			outcomes: report.outcomes,
			summary: catalog && summaryOf(catalog.payload),
			payloadDirty: catalog?.payloadDirty,
		}, {
			outcomes: [{ session: 'agenthost:missing', status: 'retry', reason: 'superseded' }],
			summary: 'concurrent',
			payloadDirty: 3,
		});
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

	test('schedule replaces a pending periodic timer with a prompt background repair', async () => {
		const harness = await createHarness(['one']);
		const scheduler = new TestScheduler();
		const service = harness.createService(undefined, {
			backgroundDelayMs: 10,
			intervalMs: 300,
			schedule: scheduler.schedule,
		});

		service.start();
		await service.runPass();
		assert.deepStrictEqual(scheduler.activeDelays, [300]);

		service.schedule();

		assert.deepStrictEqual(scheduler.activeDelays, [10]);
	});

	test('whenIdle drains scheduled work without re-dirtying clean rows', async () => {
		const harness = await createHarness(['one']);
		const scheduler = new TestScheduler();
		const service = harness.createService(undefined, {
			backgroundDelayMs: 10,
			intervalMs: 300,
			schedule: scheduler.schedule,
		});

		service.schedule();
		await service.whenIdle();
		const databaseOpenAttemptsAfterInitialPass = harness.getDatabaseOpenAttempts();
		service.schedule();
		await service.whenIdle();

		assert.deepStrictEqual({
			databaseOpenAttemptsAfterInitialPass,
			finalDatabaseOpenAttempts: harness.getDatabaseOpenAttempts(),
			activeDelays: scheduler.activeDelays,
		}, {
			databaseOpenAttemptsAfterInitialPass: 1,
			finalDatabaseOpenAttempts: 1,
			activeDelays: [300],
		});
	});

	test('scheduled start rearms periodic work after an in-flight direct pass', async () => {
		const harness = await createHarness(['one']);
		const scheduler = new TestScheduler();
		let sourceStarted!: () => void;
		const started = new Promise<void>(resolve => sourceStarted = resolve);
		let releaseSource!: () => void;
		const sourceGate = new Promise<void>(resolve => releaseSource = resolve);
		let sourceResolutions = 0;
		const service = harness.createService(async session => {
			sourceResolutions++;
			if (sourceResolutions === 1) {
				sourceStarted();
				await sourceGate;
			}
			return { status: 'available', request: { data: catalogData(session.session.path), legacyMetadata: { customTitle: session.session.path } } };
		}, {
			intervalMs: 300,
			schedule: scheduler.schedule,
		});

		const direct = service.runPass();
		await started;
		service.start();
		releaseSource();
		await direct;

		assert.deepStrictEqual({
			sourceResolutions,
			activeDelays: scheduler.activeDelays,
		}, {
			sourceResolutions: 1,
			activeDelays: [300],
		});
	});

	test('uses the same ordinal comparator for ordering and cursor boundaries', async () => {
		const harness = await createHarness(['a', 'B', 'b']);
		const visited: string[] = [];
		const service = harness.createService(async session => {
			visited.push(session.session.toString());
			return { status: 'providerUnavailable' };
		}, { batchSize: 1 });

		await service.runPass();
		await service.runPass();
		await service.runPass();

		assert.deepStrictEqual(visited, ['agenthost:B', 'agenthost:a', 'agenthost:b']);
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
		const writer = harness.sync.synchronize(session.session, {
			data: catalogData(currentTitle),
			legacyMetadata: { customTitle: currentTitle },
		});
		releaseSource();
		const firstRepair = await repair;
		const writerResult = await writer;
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
			writerResult: { status: 'acknowledged', sourceRevision: 0 },
			firstRepair: [{ session: 'agenthost:one', status: 'pending', reason: 'upsertFailed', sourceRevision: 0 }],
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

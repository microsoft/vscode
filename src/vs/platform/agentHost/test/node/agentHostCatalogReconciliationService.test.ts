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
import { AgentHostCatalogReconciliationService, AgentHostCatalogReconciliationSourceResult } from '../../node/agentHostCatalogReconciliationService.js';
import { AgentHostCatalogSyncService } from '../../node/agentHostCatalogSyncService.js';
import { AgentHostDatabase, AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabaseSessionV2Projection } from '../../node/agentHostDatabase.js';
import type { IRegisteredSession } from '../../node/agentSessionRegistry.js';
import type { IAgentHostStorageService } from '../../node/agentHostStorageService.js';
import { TestSessionDatabase } from '../common/sessionTestHelpers.js';

function catalogSource(title: string) {
	return {
		modifiedTime: 1,
		title,
		titleSource: 'user' as const,
		isRead: false,
		isArchived: false,
		workspaceless: true,
		workingDirectories: [],
		chats: [{
			uri: `agenthost-chat:${title}/default`,
			order: 0,
			kind: 'default' as const,
			title,
			titleSource: 'user' as const,
		}],
	};
}

function registered(name: string): IRegisteredSession {
	return {
		session: URI.parse(`agenthost:${name}`),
		provider: 'copilot',
		startTime: 1,
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

	constructor() {
		super(':memory:');
	}

	override async upsertSessionV2(projection: IAgentHostDatabaseSessionV2Projection, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
		this.upsertCalls++;
		if (this.failUpsert) {
			throw new Error('central unavailable');
		}
		return super.upsertSessionV2(projection, expectedSessionGeneration);
	}
}

interface ITestHarness {
	readonly central: RecordingCatalogDatabase;
	readonly locals: Map<string, TestSessionDatabase>;
	readonly sync: AgentHostCatalogSyncService;
	createService(resolveSource?: (session: IRegisteredSession) => Promise<AgentHostCatalogReconciliationSourceResult>): AgentHostCatalogReconciliationService;
}

suite('AgentHostCatalogReconciliationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createHarness(names: readonly string[], missing: ReadonlySet<string> = new Set()): Promise<ITestHarness> {
		const central = store.add(new RecordingCatalogDatabase());
		const sessions = names.map(registered);
		for (const session of sessions) {
			await central.registerSession(session.session.toString(), {
				provider: session.provider,
				startTime: session.startTime,
				source: session.source,
			}, { checkTombstone: false });
		}
		const locals = new Map<string, TestSessionDatabase>();
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
			createService: (resolveSource = async session => ({
				status: 'available',
				request: { source: catalogSource(session.session.path), legacyMetadata: { customTitle: session.session.path } },
			})) => store.add(new AgentHostCatalogReconciliationService(
				sessionDataService,
				central,
				sync,
				storage,
				async () => sessions,
				resolveSource,
				new NullLogService(),
			)),
		};
	}

	test('skips only an exact sessions_v2 row, compact receipt, and canonical legacy match', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		await harness.sync.synchronize(session.session, { source: catalogSource('one'), legacyMetadata: { customTitle: 'one' } });
		harness.central.upsertCalls = 0;
		const service = harness.createService();

		const first = await service.runPass();
		const second = await service.runPass();

		assert.deepStrictEqual({
			first: first.outcomes,
			second: second.outcomes,
			upsertCalls: harness.central.upsertCalls,
		}, {
			first: [{ session: 'agenthost:one', status: 'skipped', reason: 'synchronized' }],
			second: [{ session: 'agenthost:one', status: 'skipped', reason: 'synchronized' }],
			upsertCalls: 0,
		});
	});

	test('replays a pending payload into missing sessions_v2 and clears the payload after acknowledgement', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		harness.central.failUpsert = true;
		await harness.sync.synchronize(session.session, { source: catalogSource('one'), legacyMetadata: { customTitle: 'one' } });
		const pending = await requiredLocal(harness.locals, session.session).getCatalogSyncSnapshot();
		harness.central.failUpsert = false;

		const report = await harness.createService().runPass();
		const acknowledged = await requiredLocal(harness.locals, session.session).getCatalogSyncSnapshot();

		assert.deepStrictEqual({
			before: { state: pending?.state, hasPayload: pending?.payload !== undefined },
			outcomes: report.outcomes,
			after: { state: acknowledged?.state, payload: acknowledged?.payload },
			catalogTitle: (await harness.central.getSessionV2(session.session.toString()))?.title,
		}, {
			before: { state: 'pending', hasPayload: true },
			outcomes: [{ session: 'agenthost:one', status: 'succeeded', reason: 'pendingReplayed', sourceRevision: 0 }],
			after: { state: 'acknowledged', payload: undefined },
			catalogTitle: 'one',
		});
	});

	test('rebuilds from legacy/provider state and advances revision after an old-build mutation', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		await harness.sync.synchronize(session.session, { source: catalogSource('one'), legacyMetadata: { customTitle: 'one' } });
		await requiredLocal(harness.locals, session.session).setMetadata('customTitle', 'old-title');

		const report = await harness.createService(async () => ({
			status: 'available',
			request: { source: catalogSource('old-title'), legacyMetadata: { customTitle: 'old-title' } },
		})).runPass();
		const receipt = await requiredLocal(harness.locals, session.session).getCatalogSyncSnapshot();

		assert.deepStrictEqual({
			outcomes: report.outcomes,
			title: (await harness.central.getSessionV2(session.session.toString()))?.title,
			revision: receipt?.sourceRevision,
			payload: receipt?.payload,
		}, {
			outcomes: [{ session: 'agenthost:one', status: 'succeeded', reason: 'synchronized', sourceRevision: 1 }],
			title: 'old-title',
			revision: 1,
			payload: undefined,
		});
	});

	test('adopts the current sessions_v2 generation when the local receipt is stale', async () => {
		const harness = await createHarness(['one']);
		const session = registered('one');
		await harness.sync.synchronize(session.session, { source: catalogSource('one'), legacyMetadata: { customTitle: 'one' } });
		const current = await harness.central.getSessionV2(session.session.toString());
		assert.ok(current);
		await harness.central.upsertSessionV2({ ...current, sessionGeneration: 'current', sourceRevision: current.sourceRevision + 1 }, current.sessionGeneration);
		const local = requiredLocal(harness.locals, session.session);

		const report = await harness.createService(async () => ({
			status: 'available',
			request: { source: catalogSource('two'), legacyMetadata: { customTitle: 'two' } },
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

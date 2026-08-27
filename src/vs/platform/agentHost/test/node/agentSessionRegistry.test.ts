/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agent.js';
import { AgentHostDatabase, AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabase, IAgentHostDatabaseExternalUpdate, IAgentHostDatabaseRegisterOptions, IAgentHostDatabaseSession, IAgentHostDatabaseSessionsV2Exclusion, IAgentHostDatabaseSessionOptions, IAgentHostDatabaseSessionV2, IAgentHostDatabaseSessionV2Envelope, IAgentHostDatabaseSessionV2Receipt } from '../../node/agentHostDatabase.js';
import { AgentSessionRegistry } from '../../node/agentSessionRegistry.js';

class TestAgentHostDatabase implements IAgentHostDatabase {
	readonly sessions = new Map<string, IAgentHostDatabaseSession>();
	readonly agentMergeEnabled = new Set<string>();
	backfilled = false;
	private readonly _providerBackfilled = new Set<string>();
	private readonly _sessionsV2Backfilled = new Set<string>();
	private readonly _sessionsV2Exclusions = new Map<string, IAgentHostDatabaseSessionsV2Exclusion>();
	private readonly _tombstones = new Set<string>();
	private _writeFailures = 0;
	private _readFailures = 0;
	listCalls = 0;
	readonly externalUpdates: IAgentHostDatabaseExternalUpdate[] = [];

	failNextWrite(): void {
		this._writeFailures++;
	}

	failNextRead(): void {
		this._readFailures++;
	}

	async registerSession(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean> {
		this._throwWriteFailure();
		if (registerOptions.checkTombstone && this._tombstones.has(session)) {
			return false;
		}
		const { provider, startTime, modifiedTime = startTime, source } = sessionOptions;
		const existing = this.sessions.get(session);
		const inserted = { session, provider, startTime, modifiedTime, external: source === 'discovery', source };
		const next: IAgentHostDatabaseSession = source === 'explicit'
			? { ...inserted, startTime: existing?.startTime ?? startTime }
			: existing && source === 'discovery'
				? { ...existing, external: true, source: 'discovery' }
				: existing ?? inserted;
		this.sessions.set(session, { ...next, modifiedTime: Math.max(existing?.modifiedTime ?? modifiedTime, modifiedTime) });
		if (!registerOptions.checkTombstone) {
			this._tombstones.delete(session);
		}
		return true;
	}

	async unregisterSession(session: string): Promise<void> {
		this._throwWriteFailure();
		this.sessions.delete(session);
	}

	async tombstoneAndUnregisterSession(session: string): Promise<void> {
		this._throwWriteFailure();
		this._tombstones.add(session);
		this.sessions.delete(session);
	}

	async updateSessionExternal(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void> {
		this.externalUpdates.push(...updates);
		for (const update of updates) {
			const session = this.sessions.get(update.session);
			if (session && session.external === undefined) {
				this.sessions.set(update.session, {
					...session,
					external: update.external,
					source: update.external ? 'discovery' : session.source,
				});
			}
		}
	}

	async updateSessionModifiedTime(session: string, modifiedTime: number): Promise<boolean> {
		this._throwWriteFailure();
		const existing = this.sessions.get(session);
		if (!existing || existing.modifiedTime >= modifiedTime) {
			return false;
		}
		this.sessions.set(session, { ...existing, modifiedTime });
		return true;
	}

	async listSessions(): Promise<readonly IAgentHostDatabaseSession[]> {
		this._throwReadFailure();
		this.listCalls++;
		return [...this.sessions.values()];
	}

	async getSession(session: string): Promise<IAgentHostDatabaseSession | undefined> {
		this._throwReadFailure();
		return this.sessions.get(session);
	}

	async isSessionRegistryEmpty(): Promise<boolean> {
		this._throwReadFailure();
		return this.sessions.size === 0;
	}

	async isSessionRegistryBackfilled(): Promise<boolean> {
		this._throwReadFailure();
		return this.backfilled;
	}

	async markSessionRegistryBackfilled(): Promise<void> {
		this._throwWriteFailure();
		this.backfilled = true;
	}

	async isProviderBackfilled(provider: string): Promise<boolean> {
		this._throwReadFailure();
		return this._providerBackfilled.has(provider);
	}

	async markProviderBackfilled(provider: string): Promise<void> {
		this._throwWriteFailure();
		this._providerBackfilled.add(provider);
	}

	async isSessionsV2Backfilled(provider: string, projectionVersion: number): Promise<boolean> {
		this._throwReadFailure();
		return this._sessionsV2Backfilled.has(`${provider}:${projectionVersion}`);
	}

	async markSessionsV2Backfilled(provider: string, projectionVersion: number): Promise<void> {
		this._throwWriteFailure();
		this._sessionsV2Backfilled.add(`${provider}:${projectionVersion}`);
	}

	async markSessionsV2Excluded(exclusion: IAgentHostDatabaseSessionsV2Exclusion): Promise<void> {
		this._throwWriteFailure();
		this._sessionsV2Exclusions.set(`${exclusion.provider}:${exclusion.session}`, exclusion);
	}

	async excludeSessionV2(exclusion: IAgentHostDatabaseSessionsV2Exclusion): Promise<void> {
		this._throwWriteFailure();
		this._sessionsV2Exclusions.set(`${exclusion.provider}:${exclusion.session}`, exclusion);
		this.sessions.delete(exclusion.session);
	}

	async getSessionsV2Exclusion(provider: string, session: string): Promise<IAgentHostDatabaseSessionsV2Exclusion | undefined> {
		this._throwReadFailure();
		return this._sessionsV2Exclusions.get(`${provider}:${session}`);
	}

	async listSessionsV2Exclusions(provider: string): Promise<readonly IAgentHostDatabaseSessionsV2Exclusion[]> {
		this._throwReadFailure();
		return [...this._sessionsV2Exclusions.values()].filter(exclusion => exclusion.provider === provider);
	}

	async clearSessionsV2Exclusion(provider: string, session: string): Promise<void> {
		this._throwWriteFailure();
		this._sessionsV2Exclusions.delete(`${provider}:${session}`);
	}

	async isSessionTombstoned(session: string): Promise<boolean> {
		this._throwReadFailure();
		return this._tombstones.has(session);
	}

	async markSessionTombstoned(session: string): Promise<void> {
		this._throwWriteFailure();
		this._tombstones.add(session);
	}

	async clearSessionTombstone(session: string): Promise<void> {
		this._throwWriteFailure();
		this._tombstones.delete(session);
	}

	async registerRuntimeSession(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean> {
		return this.registerSessionV2(session, sessionOptions, registerOptions);
	}

	unregisterRuntimeSession(session: string): Promise<void> {
		return this.unregisterSessionV2(session);
	}

	updateRuntimeSessionExternal(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void> {
		return this.updateSessionV2External(updates);
	}

	async listRuntimeCompatibleSessionKeys(): Promise<readonly string[]> {
		return [...this.sessions.keys()];
	}

	async setSessionAgentMergeEnabled(session: string, enabled: boolean): Promise<void> {
		this._throwWriteFailure();
		if (enabled) {
			this.agentMergeEnabled.add(session);
		} else {
			this.agentMergeEnabled.delete(session);
		}
	}

	async listAgentMergeEnabledSessions(): Promise<readonly string[]> {
		this._throwReadFailure();
		return [...this.agentMergeEnabled];
	}

	async registerSessionV2(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean> {
		const registered = await this.registerSession(session, sessionOptions, registerOptions);
		if (registered) {
			this._sessionsV2Exclusions.delete(`${sessionOptions.provider}:${session}`);
		}
		return registered;
	}

	unregisterSessionV2(session: string): Promise<void> {
		return this.unregisterSession(session);
	}

	updateSessionV2External(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void> {
		return this.updateSessionExternal(updates);
	}

	async reconcileSessionV2RegistrationFromLegacy(session: string, legacy: IAgentHostDatabaseSession): Promise<void> {
		this.sessions.set(session, legacy);
	}

	getSessionV2Registration(session: string): Promise<IAgentHostDatabaseSession | undefined> {
		return this.getSession(session);
	}

	listSessionV2Registrations(): Promise<readonly IAgentHostDatabaseSession[]> {
		return this.listSessions();
	}

	listSessionV2RegistrationsForImport(): Promise<readonly IAgentHostDatabaseSession[]> {
		return this.listSessionV2Registrations();
	}

	isSessionV2RegistryEmpty(): Promise<boolean> {
		return this.isSessionRegistryEmpty();
	}

	async getSessionV2(): Promise<IAgentHostDatabaseSessionV2 | undefined> { return undefined; }
	async listSessionsV2(): Promise<readonly IAgentHostDatabaseSessionV2[]> { return []; }
	async listSessionsV2Receipts(): Promise<readonly IAgentHostDatabaseSessionV2Receipt[]> { return []; }
	async markSessionV2PayloadDirty(): Promise<number | undefined> { return undefined; }
	async markAllSessionsV2PayloadsDirty(): Promise<void> { }
	async markSessionV2PayloadClean(): Promise<boolean> { return false; }
	async upsertSessionV2(_envelope: IAgentHostDatabaseSessionV2Envelope, _expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> { return 'missingSession'; }

	async close(): Promise<void> { }
	dispose(): void { }

	private _throwWriteFailure(): void {
		if (this._writeFailures > 0) {
			this._writeFailures--;
			throw new Error('write failed');
		}
	}

	private _throwReadFailure(): void {
		if (this._readFailures > 0) {
			this._readFailures--;
			throw new Error('read failed');
		}
	}
}

suite('AgentSessionRegistry', () => {

	const disposables = new DisposableStore();

	let database: IAgentHostDatabase;

	setup(() => {
		database = new AgentHostDatabase(':memory:');
	});

	teardown(async () => {
		disposables.clear();
		await database.close();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	function createRegistry(): AgentSessionRegistry {
		return disposables.add(new AgentSessionRegistry(database));
	}

	const list = (registry: AgentSessionRegistry) => registry.list(async entry => entry.external === undefined ? { ...entry, external: false } : undefined);

	const a = AgentSession.uri('copilot', 'a');
	const b = AgentSession.uri('claude', 'b');
	const registerExplicit = (registry: AgentSessionRegistry, session: typeof a, provider: 'copilot' | 'claude', startTime: number) =>
		registry.register(session, { provider, startTime, source: 'explicit' }, { checkTombstone: false });

	test('listSessionKeys does not migrate legacy entries', async () => {
		const testDatabase = new TestAgentHostDatabase();
		database = testDatabase;
		testDatabase.sessions.set(a.toString(), { session: a.toString(), provider: 'copilot', startTime: 1, modifiedTime: 1, external: undefined, source: 'explicit' });
		const registry = createRegistry();

		assert.deepStrictEqual({
			keys: [...await registry.listSessionKeys()],
			listCalls: testDatabase.listCalls,
			updates: testDatabase.externalUpdates,
		}, {
			keys: [a.toString()],
			listCalls: 1,
			updates: [],
		});
	});

	test('compatibility keys include legacy-only identities without changing current listing', async () => {
		await database.registerSession(a.toString(), { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const registry = createRegistry();

		assert.deepStrictEqual({
			current: [...await registry.listSessionKeys()],
			compatible: [...await registry.listRuntimeCompatibleSessionKeys()],
			listed: await registry.list(),
		}, {
			current: [],
			compatible: [a.toString()],
			listed: [],
		});
	});

	test('list migrates entries and returns the computed list without rereading', async () => {
		const testDatabase = new TestAgentHostDatabase();
		database = testDatabase;
		testDatabase.sessions.set(a.toString(), { session: a.toString(), provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' });
		testDatabase.sessions.set(b.toString(), { session: b.toString(), provider: 'claude', startTime: 2, modifiedTime: 2, external: undefined, source: 'explicit' });
		const registry = createRegistry();
		const migratedEntries: string[] = [];

		const entries = await registry.list(async entry => {
			migratedEntries.push(entry.session.toString());
			return entry.external === undefined ? { ...entry, external: true, source: 'discovery' } : undefined;
		});

		assert.deepStrictEqual({
			listCalls: testDatabase.listCalls,
			migratedEntries,
			updates: testDatabase.externalUpdates,
			entries: entries.map(entry => ({
				session: entry.session.toString(),
				external: entry.external,
				source: entry.source,
			})),
		}, {
			listCalls: 1,
			migratedEntries: [a.toString(), b.toString()],
			updates: [{ session: b.toString(), external: true }],
			entries: [
				{ session: a.toString(), external: false, source: 'explicit' },
				{ session: b.toString(), external: true, source: 'discovery' },
			],
		});
	});

	test('get reads only the requested session', async () => {
		const testDatabase = new TestAgentHostDatabase();
		database = testDatabase;
		testDatabase.sessions.set(a.toString(), { session: a.toString(), provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' });
		testDatabase.sessions.set(b.toString(), { session: b.toString(), provider: 'claude', startTime: 2, modifiedTime: 2, external: false, source: 'explicit' });
		const registry = createRegistry();

		const [entry, missing] = await Promise.all([
			registry.get(b),
			registry.get(AgentSession.uri('copilot', 'missing')),
		]);

		assert.deepStrictEqual({
			listCalls: testDatabase.listCalls,
			entry: entry && { session: entry.session.toString(), provider: entry.provider },
			missing,
		}, {
			listCalls: 0,
			entry: { session: b.toString(), provider: 'claude' },
			missing: undefined,
		});
	});

	const registerRestored = (registry: AgentSessionRegistry, session: typeof a, provider: 'copilot' | 'claude', startTime: number) =>
		registry.register(session, { provider, startTime, source: 'restore' }, { checkTombstone: true });
	const registerDiscovered = (registry: AgentSessionRegistry, session: typeof a, provider: 'copilot' | 'claude', startTime: number) =>
		registry.register(session, { provider, startTime, source: 'discovery' }, { checkTombstone: true });

	test('register / list / tombstone', async () => {
		const registry = createRegistry();
		assert.strictEqual(await registry.isEmpty(), true);

		await registerExplicit(registry, a, 'copilot', 100);
		await registerExplicit(registry, b, 'claude', 200);

		assert.strictEqual(await registry.isEmpty(), false);
		assert.deepStrictEqual(
			(await list(registry)).map(s => ({ session: s.session.toString(), provider: s.provider, startTime: s.startTime, modifiedTime: s.modifiedTime, external: s.external })).sort((x, y) => x.session.localeCompare(y.session)),
			[
				{ session: b.toString(), provider: 'claude', startTime: 200, modifiedTime: 200, external: false },
				{ session: a.toString(), provider: 'copilot', startTime: 100, modifiedTime: 100, external: false },
			].sort((x, y) => x.session.localeCompare(y.session)),
		);

		await registry.tombstone(a);
		assert.deepStrictEqual((await list(registry)).map(s => s.session.toString()), [b.toString()]);
	});

	test('normal registration and unregister mirror the legacy registry', async () => {
		const registry = createRegistry();
		await registerExplicit(registry, a, 'copilot', 100);

		assert.deepStrictEqual({
			legacy: await database.getSession(a.toString()),
			current: await database.getSessionV2Registration(a.toString()),
		}, {
			legacy: { session: a.toString(), provider: 'copilot', startTime: 100, modifiedTime: 100, external: false, source: 'explicit' },
			current: { session: a.toString(), provider: 'copilot', startTime: 100, modifiedTime: 100, external: false, source: 'explicit' },
		});

		await registry.unregister(a);
		assert.deepStrictEqual({
			legacy: await database.getSession(a.toString()),
			current: await database.getSessionV2Registration(a.toString()),
		}, {
			legacy: undefined,
			current: undefined,
		});
	});

	test('register preserves startTime and advances modifiedTime monotonically', async () => {
		const registry = createRegistry();
		await registry.register(a, { provider: 'copilot', startTime: 100, modifiedTime: 150, source: 'explicit' }, { checkTombstone: false });
		await registry.register(a, { provider: 'copilot', startTime: 999, modifiedTime: 120, source: 'explicit' }, { checkTombstone: false });
		await registry.updateModifiedTime(a, 175);
		await registry.updateModifiedTime(a, 160);

		const [entry] = await list(registry);
		assert.deepStrictEqual({ startTime: entry.startTime, modifiedTime: entry.modifiedTime }, { startTime: 100, modifiedTime: 175 });
	});

	test('register and tombstone preserve submission order', async () => {
		const registry = createRegistry();

		await Promise.all([
			registerExplicit(registry, a, 'copilot', 100),
			registry.tombstone(a),
		]);

		assert.deepStrictEqual(await list(registry), []);
	});

	test('external provenance survives a registry restart', async () => {
		await database.close();
		database = new TestAgentHostDatabase();
		await registerDiscovered(createRegistry(), a, 'copilot', 100);

		const restartedRegistry = createRegistry();
		assert.deepStrictEqual((await list(restartedRegistry)).map(entry => ({
			session: entry.session.toString(),
			provider: 'copilot',
			startTime: entry.startTime,
			external: entry.external,
		})), [{
			session: a.toString(),
			provider: 'copilot',
			startTime: 100,
			external: true,
		}]);
	});

	test('an Agent Host marker correction restores internal provenance', async () => {
		const registry = createRegistry();
		await registerDiscovered(registry, a, 'copilot', 100);
		await registerRestored(registry, a, 'copilot', 200);

		assert.deepStrictEqual((await list(registry)).map(entry => ({
			session: entry.session.toString(),
			startTime: entry.startTime,
			external: entry.external,
		})), [{
			session: a.toString(),
			startTime: 100,
			external: false,
		}]);
	});

	test('discovery upgrades a restored row to external provenance', async () => {
		const registry = createRegistry();
		await registerRestored(registry, a, 'copilot', 100);
		await registerDiscovered(registry, a, 'copilot', 200);

		assert.deepStrictEqual((await list(registry)).map(entry => ({
			external: entry.external,
			source: entry.source,
			startTime: entry.startTime,
		})), [{ external: true, source: 'discovery', startTime: 100 }]);
	});

	test('discovery does not override an explicitly-registered session', async () => {
		const registry = createRegistry();
		await registerExplicit(registry, a, 'copilot', 100);
		await registerDiscovered(registry, a, 'copilot', 200);

		assert.deepStrictEqual((await list(registry)).map(entry => ({
			external: entry.external,
			source: entry.source,
			startTime: entry.startTime,
		})), [{ external: false, source: 'explicit', startTime: 100 }]);
	});

	test('backfill marker gates the one-time provider seed', async () => {
		const registry = createRegistry();
		assert.strictEqual(await registry.isBackfilled(), false);

		// Simulate a one-time backfill: merge sessions, then set the marker.
		await registerExplicit(registry, a, 'copilot', 100);
		await registerExplicit(registry, b, 'claude', 200);
		await registry.markBackfilled();

		assert.strictEqual(await registry.isBackfilled(), true);
		assert.deepStrictEqual((await list(registry)).map(s => s.session.toString()).sort(), [a.toString(), b.toString()].sort());

		// The marker persists across instances so the seed never runs twice.
		const second = createRegistry();
		assert.strictEqual(await second.isBackfilled(), true);
	});

	test('per-provider backfill markers are independent and durable', async () => {
		const registry = createRegistry();
		assert.strictEqual(await registry.isProviderBackfilled('copilot'), false);
		assert.strictEqual(await registry.isProviderBackfilled('claude'), false);

		await registerExplicit(registry, a, 'copilot', 100);
		await registry.markProviderBackfilled('copilot');

		// Only the swept provider is marked — a provider that hasn't had its own
		// sweep run yet (e.g. because it registered later) is still pending,
		// unlike the legacy global marker which covered every provider at once.
		assert.strictEqual(await registry.isProviderBackfilled('copilot'), true);
		assert.strictEqual(await registry.isProviderBackfilled('claude'), false);

		// The marker persists across instances.
		const second = createRegistry();
		assert.deepStrictEqual(
			{ copilot: await second.isProviderBackfilled('copilot'), claude: await second.isProviderBackfilled('claude') },
			{ copilot: true, claude: false },
		);
	});

	test('projection-versioned backfill markers are independent from legacy markers', async () => {
		const registry = createRegistry();
		await registry.markBackfilled();
		await registry.markProviderBackfilled('copilot');

		assert.deepStrictEqual({
			legacyGlobal: await registry.isBackfilled(),
			legacyProvider: await registry.isProviderBackfilled('copilot'),
			currentV4: await registry.isSessionsV2Backfilled('copilot', 4),
			currentV5: await registry.isSessionsV2Backfilled('copilot', 5),
		}, {
			legacyGlobal: true,
			legacyProvider: true,
			currentV4: false,
			currentV5: false,
		});

		await registry.markSessionsV2Backfilled('copilot', 5);
		assert.deepStrictEqual({
			currentV4: await registry.isSessionsV2Backfilled('copilot', 4),
			currentV5: await registry.isSessionsV2Backfilled('copilot', 5),
			claudeV5: await registry.isSessionsV2Backfilled('claude', 5),
		}, {
			currentV4: false,
			currentV5: true,
			claudeV5: false,
		});
	});

	test('register persistence failure can be retried', async () => {
		await database.close();
		database = new TestAgentHostDatabase();
		const registry = createRegistry();
		(database as TestAgentHostDatabase).failNextWrite();

		await assert.rejects(registerExplicit(registry, a, 'copilot', 100), /write failed/);
		assert.deepStrictEqual(await list(registry), []);

		await registerExplicit(registry, a, 'copilot', 100);
		assert.deepStrictEqual((await list(registry)).map(entry => entry.session.toString()), [a.toString()]);
	});

	test('tombstone persistence failure can be retried', async () => {
		await database.close();
		database = new TestAgentHostDatabase();
		const registry = createRegistry();
		await registerExplicit(registry, a, 'copilot', 100);
		(database as TestAgentHostDatabase).failNextWrite();

		await assert.rejects(registry.tombstone(a), /write failed/);
		assert.deepStrictEqual((await list(registry)).map(entry => entry.session.toString()), [a.toString()]);

		await registry.tombstone(a);
		assert.deepStrictEqual(await list(registry), []);
	});

	test('markBackfilled persistence failure can be retried', async () => {
		await database.close();
		database = new TestAgentHostDatabase();
		const registry = createRegistry();
		(database as TestAgentHostDatabase).failNextWrite();

		await assert.rejects(registry.markBackfilled(), /write failed/);
		assert.strictEqual(await registry.isBackfilled(), false);

		await registry.markBackfilled();
		assert.strictEqual(await registry.isBackfilled(), true);
	});

	test('markProviderBackfilled persistence failure can be retried without affecting other providers', async () => {
		await database.close();
		database = new TestAgentHostDatabase();
		const registry = createRegistry();
		await registry.markProviderBackfilled('claude');
		(database as TestAgentHostDatabase).failNextWrite();

		await assert.rejects(registry.markProviderBackfilled('copilot'), /write failed/);
		assert.deepStrictEqual(
			{ copilot: await registry.isProviderBackfilled('copilot'), claude: await registry.isProviderBackfilled('claude') },
			{ copilot: false, claude: true },
		);

		await registry.markProviderBackfilled('copilot');
		assert.strictEqual(await registry.isProviderBackfilled('copilot'), true);
	});

	test('read failure can be retried without losing persisted sessions', async () => {
		await database.close();
		database = new TestAgentHostDatabase();
		const first = createRegistry();
		await registerExplicit(first, a, 'copilot', 100);
		const second = createRegistry();
		(database as TestAgentHostDatabase).failNextRead();

		await registerExplicit(second, b, 'claude', 200);
		await assert.rejects(list(second), /read failed/);
		await registerExplicit(second, b, 'claude', 200);

		assert.deepStrictEqual(
			(await list(second)).map(entry => entry.session.toString()).sort(),
			[a.toString(), b.toString()].sort(),
		);
	});

	test('tombstone durably prevents a session from being resurrected by register', async () => {
		const registry = createRegistry();
		await registerExplicit(registry, a, 'copilot', 100);
		assert.strictEqual(await registry.isTombstoned(a), false);

		await registry.tombstone(a);
		assert.strictEqual(await registry.isTombstoned(a), true, 'tombstone must durably tombstone the session');

		// The tombstone persists across instances (it is durable, not in-process).
		const second = createRegistry();
		assert.strictEqual(await second.isTombstoned(a), true);
	});

	test('register clears an existing tombstone (explicit create)', async () => {
		const registry = createRegistry();
		await registerExplicit(registry, a, 'copilot', 100);
		await registry.tombstone(a);
		assert.strictEqual(await registry.isTombstoned(a), true);

		// An explicit re-register (a genuine new `createSession`) must clear
		// the tombstone so the session is usable again.
		await registerExplicit(registry, a, 'copilot', 150);
		assert.strictEqual(await registry.isTombstoned(a), false);
		assert.deepStrictEqual((await list(registry)).map(s => s.session.toString()), [a.toString()]);
	});

	test('clearTombstone can also be called directly', async () => {
		const registry = createRegistry();
		await registerExplicit(registry, a, 'copilot', 100);
		await registry.tombstone(a);
		assert.strictEqual(await registry.isTombstoned(a), true);

		await registry.clearTombstone(a);
		assert.strictEqual(await registry.isTombstoned(a), false);
	});

	test('current-v2 exclusions are exposed and eligible registration clears them', async () => {
		const registry = createRegistry();
		await registry.markSessionsV2Excluded({
			provider: 'copilot',
			session: a.toString(),
			reason: 'providerAbsent',
			fingerprint: 'enumeration-v1',
		});

		assert.deepStrictEqual({
			single: await registry.getSessionsV2Exclusion('copilot', a),
			list: await registry.listSessionsV2Exclusions('copilot'),
		}, {
			single: { provider: 'copilot', session: a.toString(), reason: 'providerAbsent', fingerprint: 'enumeration-v1' },
			list: [{ provider: 'copilot', session: a.toString(), reason: 'providerAbsent', fingerprint: 'enumeration-v1' }],
		});

		await registerDiscovered(registry, a, 'copilot', 100);
		assert.strictEqual(await registry.getSessionsV2Exclusion('copilot', a), undefined);
	});

	test('discovery declines to register (or resurrect) a tombstoned session', async () => {
		const registry = createRegistry();
		await registerExplicit(registry, a, 'copilot', 100);
		await registry.tombstone(a);
		assert.strictEqual(await registry.isTombstoned(a), true);

		// Unlike `register`, a revival attempt (backfill, restore) must not
		// resurrect an explicitly-deleted session.
		const registered = await registerDiscovered(registry, a, 'copilot', 200);
		assert.strictEqual(registered, false);
		assert.deepStrictEqual(await list(registry), []);
		assert.strictEqual(await registry.isTombstoned(a), true, 'the tombstone must remain in place');
	});

	test('discovery registers a session that is not tombstoned', async () => {
		const registry = createRegistry();
		const registered = await registerDiscovered(registry, a, 'copilot', 100);
		assert.strictEqual(registered, true);
		assert.deepStrictEqual((await list(registry)).map(s => s.session.toString()), [a.toString()]);
	});

	test('discovery persistence failure can be retried', async () => {
		await database.close();
		database = new TestAgentHostDatabase();
		const registry = createRegistry();
		(database as TestAgentHostDatabase).failNextWrite();

		await assert.rejects(registerDiscovered(registry, a, 'copilot', 100), /write failed/);
		assert.deepStrictEqual(await list(registry), []);

		const registered = await registerDiscovered(registry, a, 'copilot', 100);
		assert.strictEqual(registered, true);
		assert.deepStrictEqual((await list(registry)).map(entry => entry.session.toString()), [a.toString()]);
	});
});

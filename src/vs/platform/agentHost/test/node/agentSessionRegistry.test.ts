/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agent.js';
import { AgentHostDatabase, IAgentHostDatabase, IAgentHostDatabaseSession } from '../../node/agentHostDatabase.js';
import { AgentSessionRegistry } from '../../node/agentSessionRegistry.js';

class TestAgentHostDatabase implements IAgentHostDatabase {
	readonly sessions = new Map<string, IAgentHostDatabaseSession>();
	backfilled = false;
	private _writeFailures = 0;
	private _readFailures = 0;

	failNextWrite(): void {
		this._writeFailures++;
	}

	failNextRead(): void {
		this._readFailures++;
	}

	async registerSession(session: string, provider: string, startTime: number): Promise<void> {
		this._throwWriteFailure();
		const existing = this.sessions.get(session);
		this.sessions.set(session, { session, provider, startTime: existing?.startTime ?? startTime });
	}

	async unregisterSession(session: string): Promise<void> {
		this._throwWriteFailure();
		this.sessions.delete(session);
	}

	async listSessions(): Promise<readonly IAgentHostDatabaseSession[]> {
		this._throwReadFailure();
		return [...this.sessions.values()];
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

	const a = AgentSession.uri('copilot', 'a');
	const b = AgentSession.uri('claude', 'b');

	test('register / list / unregister', async () => {
		const registry = createRegistry();
		assert.strictEqual(await registry.isEmpty(), true);

		await registry.register(a, 'copilot', 100);
		await registry.register(b, 'claude', 200);

		assert.strictEqual(await registry.isEmpty(), false);
		assert.deepStrictEqual(
			(await registry.list()).map(s => ({ session: s.session.toString(), provider: s.provider, startTime: s.startTime })).sort((x, y) => x.session.localeCompare(y.session)),
			[
				{ session: b.toString(), provider: 'claude', startTime: 200 },
				{ session: a.toString(), provider: 'copilot', startTime: 100 },
			].sort((x, y) => x.session.localeCompare(y.session)),
		);

		await registry.unregister(a);
		assert.deepStrictEqual((await registry.list()).map(s => s.session.toString()), [b.toString()]);
	});

	test('register preserves the first-observed startTime', async () => {
		const registry = createRegistry();
		await registry.register(a, 'copilot', 100);
		await registry.register(a, 'copilot', 999);

		const [entry] = await registry.list();
		assert.strictEqual(entry.startTime, 100);
	});

	test('register and unregister preserve submission order', async () => {
		const registry = createRegistry();

		await Promise.all([
			registry.register(a, 'copilot', 100),
			registry.unregister(a),
		]);

		assert.deepStrictEqual(await registry.list(), []);
	});

	test('index persists across database instances', async () => {
		const tempRoot = await fs.mkdtemp(join(tmpdir(), `agent-host-db-${generateUuid()}`));
		const databasePath = join(tempRoot, 'agent-host.db');
		try {
			await database.close();
			database = new AgentHostDatabase(databasePath);
			await createRegistry().register(a, 'copilot', 100);
			await database.close();

			database = new AgentHostDatabase(databasePath);
			assert.deepStrictEqual((await createRegistry().list()).map(s => s.session.toString()), [a.toString()]);
		} finally {
			await database.close();
			await fs.rm(tempRoot, { recursive: true, force: true });
			database = new AgentHostDatabase(':memory:');
		}
	});

	test('backfill marker gates the one-time provider seed', async () => {
		const registry = createRegistry();
		assert.strictEqual(await registry.isBackfilled(), false);

		// Simulate a one-time backfill: merge sessions, then set the marker.
		await registry.register(a, 'copilot', 100);
		await registry.register(b, 'claude', 200);
		await registry.markBackfilled();

		assert.strictEqual(await registry.isBackfilled(), true);
		assert.deepStrictEqual((await registry.list()).map(s => s.session.toString()).sort(), [a.toString(), b.toString()].sort());

		// The marker persists across instances so the seed never runs twice.
		const second = createRegistry();
		assert.strictEqual(await second.isBackfilled(), true);
	});

	test('register persistence failure can be retried', async () => {
		await database.close();
		database = new TestAgentHostDatabase();
		const registry = createRegistry();
		(database as TestAgentHostDatabase).failNextWrite();

		await assert.rejects(registry.register(a, 'copilot', 100), /write failed/);
		assert.deepStrictEqual(await registry.list(), []);

		await registry.register(a, 'copilot', 100);
		assert.deepStrictEqual((await registry.list()).map(entry => entry.session.toString()), [a.toString()]);
	});

	test('unregister persistence failure can be retried', async () => {
		await database.close();
		database = new TestAgentHostDatabase();
		const registry = createRegistry();
		await registry.register(a, 'copilot', 100);
		(database as TestAgentHostDatabase).failNextWrite();

		await assert.rejects(registry.unregister(a), /write failed/);
		assert.deepStrictEqual((await registry.list()).map(entry => entry.session.toString()), [a.toString()]);

		await registry.unregister(a);
		assert.deepStrictEqual(await registry.list(), []);
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

	test('read failure can be retried without losing persisted sessions', async () => {
		await database.close();
		database = new TestAgentHostDatabase();
		const first = createRegistry();
		await first.register(a, 'copilot', 100);
		const second = createRegistry();
		(database as TestAgentHostDatabase).failNextRead();

		await second.register(b, 'claude', 200);
		await assert.rejects(second.list(), /read failed/);
		await second.register(b, 'claude', 200);

		assert.deepStrictEqual(
			(await second.list()).map(entry => entry.session.toString()).sort(),
			[a.toString(), b.toString()].sort(),
		);
	});
});

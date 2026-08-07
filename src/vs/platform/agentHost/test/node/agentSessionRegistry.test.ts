/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AgentSessionRegistry } from '../../node/agentSessionRegistry.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

class FailingSessionDatabase extends TestSessionDatabase {
	private _setMetadataFailures = 0;
	private _getMetadataFailures = 0;

	failNextSetMetadata(): void {
		this._setMetadataFailures++;
	}

	failNextGetMetadata(): void {
		this._getMetadataFailures++;
	}

	override async getMetadata(key: string): Promise<string | undefined> {
		if (this._getMetadataFailures > 0) {
			this._getMetadataFailures--;
			throw new Error('getMetadata failed');
		}
		return super.getMetadata(key);
	}

	override async setMetadata(key: string, value: string): Promise<void> {
		if (this._setMetadataFailures > 0) {
			this._setMetadataFailures--;
			throw new Error('setMetadata failed');
		}
		await super.setMetadata(key, value);
	}
}

suite('AgentSessionRegistry', () => {

	const disposables = new DisposableStore();

	let db: TestSessionDatabase;
	let dataService: ISessionDataService;

	setup(() => {
		db = new TestSessionDatabase();
		dataService = createSessionDataService(db);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createRegistry(): AgentSessionRegistry {
		const registry = new AgentSessionRegistry(dataService, new NullLogService());
		disposables.add(toDisposable(() => registry.dispose()));
		return registry;
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

	test('index persists across registry instances', async () => {
		const first = createRegistry();
		await first.register(a, 'copilot', 100);

		// A fresh registry over the same backing store must recover the index.
		const second = createRegistry();
		assert.deepStrictEqual((await second.list()).map(s => s.session.toString()), [a.toString()]);
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

	test('register persistence failure preserves the cache and can be retried', async () => {
		db = new FailingSessionDatabase();
		dataService = createSessionDataService(db);
		const registry = createRegistry();
		(db as FailingSessionDatabase).failNextSetMetadata();

		await assert.rejects(registry.register(a, 'copilot', 100), /setMetadata failed/);
		assert.deepStrictEqual(await registry.list(), []);

		await registry.register(a, 'copilot', 100);
		assert.deepStrictEqual((await registry.list()).map(entry => entry.session.toString()), [a.toString()]);
	});

	test('unregister persistence failure preserves the cache and can be retried', async () => {
		db = new FailingSessionDatabase();
		dataService = createSessionDataService(db);
		const registry = createRegistry();
		await registry.register(a, 'copilot', 100);
		(db as FailingSessionDatabase).failNextSetMetadata();

		await assert.rejects(registry.unregister(a), /setMetadata failed/);
		assert.deepStrictEqual((await registry.list()).map(entry => entry.session.toString()), [a.toString()]);

		await registry.unregister(a);
		assert.deepStrictEqual(await registry.list(), []);
	});

	test('markBackfilled persistence failure preserves the marker and can be retried', async () => {
		db = new FailingSessionDatabase();
		dataService = createSessionDataService(db);
		const registry = createRegistry();
		(db as FailingSessionDatabase).failNextSetMetadata();

		await assert.rejects(registry.markBackfilled(), /setMetadata failed/);
		assert.strictEqual(await registry.isBackfilled(), false);

		await registry.markBackfilled();
		assert.strictEqual(await registry.isBackfilled(), true);
	});

	test('load failure does not cache empty state and a mutation retry preserves persisted sessions', async () => {
		db = new FailingSessionDatabase();
		dataService = createSessionDataService(db);
		const first = createRegistry();
		await first.register(a, 'copilot', 100);
		const second = createRegistry();
		(db as FailingSessionDatabase).failNextGetMetadata();

		await assert.rejects(second.register(b, 'claude', 200), /getMetadata failed/);
		await second.register(b, 'claude', 200);

		assert.deepStrictEqual(
			(await second.list()).map(entry => entry.session.toString()).sort(),
			[a.toString(), b.toString()].sort(),
		);
	});
});

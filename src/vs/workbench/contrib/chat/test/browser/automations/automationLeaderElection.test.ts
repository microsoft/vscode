/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { AutomationLeaderElection } from '../../../browser/automations/automationLeaderElection.js';

suite('AutomationLeaderElection', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function createElection(storage: InMemoryStorageService, now: () => number, instanceId: string) {
		return teardown.add(new AutomationLeaderElection(storage, new NullLogService(), {
			now,
			instanceId,
			heartbeatIntervalMs: 60_000_000, // disable real timer for tests
			staleAfterMs: 90_000,
		}));
	}

	test('a single window claims leadership immediately on construction', () => {
		const storage = teardown.add(new InMemoryStorageService());
		const now = 1_000;
		const election = createElection(storage, () => now, 'window-a');
		assert.strictEqual(election.isLeader.get(), true);
	});

	test('two windows on the same storage elect exactly one leader', () => {
		const storage = teardown.add(new InMemoryStorageService());
		const now = 1_000;
		const a = createElection(storage, () => now, 'window-a');
		const b = createElection(storage, () => now, 'window-b');
		// First constructed claims first; B sees a fresh heartbeat
		// from A and stands down.
		assert.strictEqual(a.isLeader.get(), true);
		assert.strictEqual(b.isLeader.get(), false);
	});

	test('loser takes over once the leaders heartbeat goes stale', () => {
		const storage = teardown.add(new InMemoryStorageService());
		let now = 1_000;
		const a = createElection(storage, () => now, 'window-a');
		const b = createElection(storage, () => now, 'window-b');
		assert.strictEqual(a.isLeader.get(), true);
		assert.strictEqual(b.isLeader.get(), false);

		// Advance clock past the stale threshold without ticking A.
		now += 91_000;
		b.evaluateForTesting();
		assert.strictEqual(b.isLeader.get(), true);
	});

	test('leader keeps refreshing its own heartbeat on every evaluation', () => {
		const storage = teardown.add(new InMemoryStorageService());
		let now = 1_000;
		const a = createElection(storage, () => now, 'window-a');
		assert.strictEqual(a.isLeader.get(), true);

		now += 50_000;
		a.evaluateForTesting();
		// Should still be leader because we re-wrote the heartbeat
		// before another window could see it as stale.
		assert.strictEqual(a.isLeader.get(), true);
	});

	test('disposing the leader clears the slot so the next window does not wait', () => {
		const storage = teardown.add(new InMemoryStorageService());
		const now = 1_000;
		const a = createElection(storage, () => now, 'window-a');
		assert.strictEqual(a.isLeader.get(), true);

		a.dispose();
		const b = createElection(storage, () => now, 'window-b');
		assert.strictEqual(b.isLeader.get(), true);
	});

	test('corrupt leader record is treated as empty and reclaimed', () => {
		const storage = teardown.add(new InMemoryStorageService());
		// StorageScope.APPLICATION is -1
		storage.store('chat.automations.leader', 'not json', -1, 1);
		const a = createElection(storage, () => 1_000, 'window-a');
		assert.strictEqual(a.isLeader.get(), true);
	});
});

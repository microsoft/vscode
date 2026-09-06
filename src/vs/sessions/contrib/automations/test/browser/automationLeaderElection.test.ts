/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AutomationLeaderElection } from '../../browser/automationLeaderElection.js';

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

	test('tombstone left on dispose is treated as immediately claimable', () => {
		const storage = teardown.add(new InMemoryStorageService());
		const a = createElection(storage, () => 1_000, 'window-a');
		assert.strictEqual(a.isLeader.get(), true);
		a.dispose();
		// After dispose we should see a tombstone (empty instanceId)
		// in storage, not a removed key.
		const raw = storage.get('chat.automations.leader', -1);
		assert.ok(raw, 'tombstone should be present after release');
		const parsed = JSON.parse(raw!);
		assert.strictEqual(parsed.instanceId, '');
		// Any subsequent claim, even at the same wall clock, should
		// succeed without waiting for staleAfterMs.
		const b = createElection(storage, () => 1_000, 'window-b');
		assert.strictEqual(b.isLeader.get(), true);
	});

	test('readback after writeLeader detects a competing concurrent write and stands down', () => {
		// Custom storage that injects a competitor write immediately
		// after every store() to LEADER_KEY. This simulates two windows
		// reading the slot as claimable, both writing, with the second
		// write landing after ours (the TOCTOU window in evaluate()).
		class RacyStorage extends InMemoryStorageService {
			competitor: string | undefined;
			override store(key: string, value: any, scope: any, target: any, external = false): void {
				super.store(key, value, scope, target, external);
				if (key === 'chat.automations.leader' && this.competitor !== undefined) {
					super.store(key, this.competitor, scope, target, external);
				}
			}
		}
		const storage = teardown.add(new RacyStorage());
		storage.competitor = JSON.stringify({ instanceId: 'window-b', heartbeatAt: 1_000, nonce: 'b-nonce' });
		const a = createElection(storage, () => 1_000, 'window-a');
		// Even though A claimed the slot, the readback saw B's record
		// instead of A's nonce, so A must NOT be leader.
		assert.strictEqual(a.isLeader.get(), false);
	});

	test('survives a throwing storage read by leaving leadership unset', () => {
		class ThrowingStorage extends InMemoryStorageService {
			override get(key: string, scope: any, fallbackValue?: string): any {
				if (key === 'chat.automations.leader') {
					throw new Error('storage unavailable');
				}
				return super.get(key, scope, fallbackValue as string);
			}
		}
		const storage = teardown.add(new ThrowingStorage());
		const a = createElection(storage, () => 1_000, 'window-a');
		// readLeader threw, the claim path can't validate via readback,
		// so we should not be leader.
		assert.strictEqual(a.isLeader.get(), false);
	});

	test('survives a throwing storage write by not declaring leadership', () => {
		class ThrowingStorage extends InMemoryStorageService {
			override store(key: string, value: any, scope: any, target: any, external = false): void {
				if (key === 'chat.automations.leader') {
					throw new Error('storage unavailable');
				}
				super.store(key, value, scope, target, external);
			}
		}
		const storage = teardown.add(new ThrowingStorage());
		const a = createElection(storage, () => 1_000, 'window-a');
		assert.strictEqual(a.isLeader.get(), false);
	});
});

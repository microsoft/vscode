/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ScopeLockManager } from './ScopeLockManager';

describe('ScopeLockManager', () => {
	let manager: ScopeLockManager;

	beforeEach(() => {
		manager = new ScopeLockManager({
			host: 'localhost',
			port: 6379,
			defaultTtlMs: 60_000,
			deadlockCheckIntervalMs: 100_000, // Long interval to avoid auto-triggering in tests
		});
	});

	afterEach(() => {
		manager.dispose();
	});

	test('acquireLock succeeds when no conflicts exist', () => {
		const result = manager.acquireLock('agent-1', ['file-a.ts', 'file-b.ts']);
		assert.deepStrictEqual(
			{ success: result.success, hasLockId: typeof result.lockId === 'string' },
			{ success: true, hasLockId: true },
		);
	});

	test('acquireLock fails when files are already locked by another agent', () => {
		manager.acquireLock('agent-1', ['file-a.ts']);
		const result = manager.acquireLock('agent-2', ['file-a.ts', 'file-b.ts']);

		assert.deepStrictEqual(
			{
				success: result.success,
				conflictCount: result.conflicts?.length,
				conflictFile: result.conflicts?.[0]?.file,
				conflictHeldBy: result.conflicts?.[0]?.heldBy,
			},
			{
				success: false,
				conflictCount: 1,
				conflictFile: 'file-a.ts',
				conflictHeldBy: 'agent-1',
			},
		);
	});

	test('same agent can re-acquire its own locks', () => {
		manager.acquireLock('agent-1', ['file-a.ts']);
		const result = manager.acquireLock('agent-1', ['file-a.ts', 'file-b.ts']);
		assert.strictEqual(result.success, true);
	});

	test('releaseLock frees files for other agents', () => {
		manager.acquireLock('agent-1', ['file-a.ts']);
		manager.releaseLock('agent-1');
		const result = manager.acquireLock('agent-2', ['file-a.ts']);
		assert.strictEqual(result.success, true);
	});

	test('checkConflict reports conflicts without acquiring locks', () => {
		manager.acquireLock('agent-1', ['file-a.ts']);
		const conflicts = manager.checkConflict(['file-a.ts', 'file-c.ts']);
		assert.strictEqual(conflicts.length, 1);
		assert.strictEqual(conflicts[0].file, 'file-a.ts');

		// Original lock should still be held
		const result = manager.acquireLock('agent-2', ['file-a.ts']);
		assert.strictEqual(result.success, false);
	});

	test('listLocks returns all active locks', () => {
		manager.acquireLock('agent-1', ['file-a.ts']);
		manager.acquireLock('agent-2', ['file-b.ts']);
		const locks = manager.listLocks();
		assert.strictEqual(locks.length, 2);
	});

	test('expired locks are automatically cleaned up', () => {
		// Use a very short TTL
		manager.acquireLock('agent-1', ['file-a.ts'], 1); // 1ms TTL

		// Wait for expiry
		const start = Date.now();
		while (Date.now() - start < 10) {
			// busy-wait for 10ms
		}

		const result = manager.acquireLock('agent-2', ['file-a.ts']);
		assert.strictEqual(result.success, true);
	});

	test('lock expired callback fires on TTL expiry', () => {
		const expired: string[] = [];
		manager.onLockExpired(lock => expired.push(lock.agentId));

		manager.acquireLock('agent-1', ['file-a.ts'], 1); // 1ms TTL

		const start = Date.now();
		while (Date.now() - start < 10) {
			// busy-wait
		}

		// Trigger expiry check
		manager.checkConflict(['file-a.ts']);
		assert.deepStrictEqual(expired, ['agent-1']);
	});

	test('getAgentLocks returns files held by agent', () => {
		manager.acquireLock('agent-1', ['file-a.ts', 'file-b.ts']);
		const files = manager.getAgentLocks('agent-1');
		assert.deepStrictEqual(files.sort(), ['file-a.ts', 'file-b.ts']);
	});

	test('getAgentLocks returns empty array for unknown agent', () => {
		const files = manager.getAgentLocks('unknown');
		assert.deepStrictEqual(files, []);
	});
});

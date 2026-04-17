/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { dispose, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

/**
 * Tests for the dedicated entry deduplication logic used in LanguageStatus._update.
 *
 * The pattern under test mirrors the dedicated-entry loop in languageStatus.ts:
 * when building the new dedicated entries map, we must check both
 * `newDedicatedEntries` (for duplicates within the current update) and
 * `_dedicatedEntries` (for entries from the previous update) to avoid
 * orphaning entry accessors and leaking their event listeners.
 */

interface MockAccessor extends IDisposable {
	id: string;
	updateCount: number;
	disposed: boolean;
	update(): void;
}

function createMockAccessor(id: string): MockAccessor {
	return {
		id,
		updateCount: 0,
		disposed: false,
		update() { this.updateCount++; },
		dispose() { this.disposed = true; }
	};
}

suite('LanguageStatus - Dedicated Entry Deduplication', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Simulates the dedicated-entry update loop from LanguageStatus._update,
	 * using the FIXED logic that checks newDedicatedEntries before creating.
	 */
	function runDedicatedEntryUpdate(
		modelDedicatedIds: string[],
		existingEntries: Map<string, MockAccessor>,
		createEntry: (id: string) => MockAccessor
	): Map<string, MockAccessor> {
		const newDedicatedEntries = new Map<string, MockAccessor>();
		for (const id of modelDedicatedIds) {
			let entry = newDedicatedEntries.get(id) ?? existingEntries.get(id);
			if (!entry) {
				entry = createEntry(id);
			} else {
				entry.update();
				existingEntries.delete(id);
			}
			newDedicatedEntries.set(id, entry);
		}
		dispose(existingEntries.values());
		return newDedicatedEntries;
	}

	/**
	 * Simulates the OLD (buggy) dedicated-entry update loop that only checks
	 * existingEntries, not newDedicatedEntries.
	 */
	function runDedicatedEntryUpdateBuggy(
		modelDedicatedIds: string[],
		existingEntries: Map<string, MockAccessor>,
		createEntry: (id: string) => MockAccessor
	): Map<string, MockAccessor> {
		const newDedicatedEntries = new Map<string, MockAccessor>();
		for (const id of modelDedicatedIds) {
			let entry = existingEntries.get(id);
			if (!entry) {
				entry = createEntry(id);
			} else {
				entry.update();
				existingEntries.delete(id);
			}
			newDedicatedEntries.set(id, entry);
		}
		dispose(existingEntries.values());
		return newDedicatedEntries;
	}

	test('reuses existing entry from previous update', () => {
		const existing = new Map<string, MockAccessor>();
		const oldEntry = createMockAccessor('status-A');
		existing.set('status-A', oldEntry);

		const result = runDedicatedEntryUpdate(['status-A'], existing, createMockAccessor);

		assert.strictEqual(result.get('status-A'), oldEntry, 'should reuse the existing entry');
		assert.strictEqual(oldEntry.updateCount, 1, 'should have updated the entry');
		assert.strictEqual(oldEntry.disposed, false, 'should not dispose reused entry');
	});

	test('creates new entry when none exists', () => {
		const existing = new Map<string, MockAccessor>();

		const result = runDedicatedEntryUpdate(['status-A'], existing, createMockAccessor);

		const entry = result.get('status-A')!;
		assert.ok(entry, 'should create a new entry');
		assert.strictEqual(entry.updateCount, 0, 'should not have called update on new entry');
		assert.strictEqual(entry.disposed, false, 'new entry should not be disposed');
	});

	test('disposes entries no longer in model', () => {
		const existing = new Map<string, MockAccessor>();
		const oldEntry = createMockAccessor('status-A');
		existing.set('status-A', oldEntry);

		const result = runDedicatedEntryUpdate([], existing, createMockAccessor);

		assert.strictEqual(result.size, 0, 'should have no entries');
		assert.strictEqual(oldEntry.disposed, true, 'old entry should be disposed');
	});

	test('duplicate status IDs - fixed version reuses entry from current update', () => {
		// This is the core regression test: when model.dedicated contains
		// duplicate IDs (which can happen momentarily when a status is
		// re-registered via $setLanguageStatus), the fixed code should
		// reuse the entry created for the first occurrence instead of
		// creating a second entry that orphans the first.
		const existing = new Map<string, MockAccessor>();
		const createdEntries: MockAccessor[] = [];

		const result = runDedicatedEntryUpdate(
			['status-A', 'status-A'], // duplicate IDs
			existing,
			(id) => { const e = createMockAccessor(id); createdEntries.push(e); return e; }
		);

		// Fixed: only one entry should be created, and it should be updated
		// when the duplicate is encountered
		assert.strictEqual(createdEntries.length, 1, 'should create only one entry');
		assert.strictEqual(result.size, 1, 'result map should have one entry');
		assert.strictEqual(createdEntries[0].updateCount, 1, 'entry should be updated once for the duplicate');
		assert.strictEqual(createdEntries[0].disposed, false, 'the entry should not be disposed');
	});

	test('duplicate status IDs - buggy version leaks entry', () => {
		// Demonstrates that the old (buggy) code creates two entries
		// for duplicate IDs, orphaning the first one.
		const existing = new Map<string, MockAccessor>();
		const createdEntries: MockAccessor[] = [];

		const result = runDedicatedEntryUpdateBuggy(
			['status-A', 'status-A'], // duplicate IDs
			existing,
			(id) => { const e = createMockAccessor(id); createdEntries.push(e); return e; }
		);

		// Buggy: two entries are created, the first is orphaned (overwritten in map)
		assert.strictEqual(createdEntries.length, 2, 'buggy version creates two entries');
		assert.strictEqual(result.size, 1, 'result map has one entry (second overwrites first)');
		// The first entry is orphaned - it's not in the result map and not disposed
		assert.strictEqual(createdEntries[0].disposed, false, 'first entry is NOT disposed (leaked!)');
		assert.notStrictEqual(result.get('status-A'), createdEntries[0], 'first entry is not in the result');
		assert.strictEqual(result.get('status-A'), createdEntries[1], 'second entry is in the result');
	});

	test('duplicate IDs with existing entry - fixed version reuses existing', () => {
		// When an existing entry exists and duplicates appear,
		// the fixed code should reuse the existing entry for the first
		// occurrence and then reuse it again for the duplicate.
		const existing = new Map<string, MockAccessor>();
		const oldEntry = createMockAccessor('status-A');
		existing.set('status-A', oldEntry);
		const createdEntries: MockAccessor[] = [];

		const result = runDedicatedEntryUpdate(
			['status-A', 'status-A'], // duplicate IDs
			existing,
			(id) => { const e = createMockAccessor(id); createdEntries.push(e); return e; }
		);

		assert.strictEqual(createdEntries.length, 0, 'should not create any new entries');
		assert.strictEqual(result.size, 1, 'result map should have one entry');
		assert.strictEqual(result.get('status-A'), oldEntry, 'should reuse the existing entry');
		assert.strictEqual(oldEntry.updateCount, 2, 'should be updated twice (once per duplicate)');
		assert.strictEqual(oldEntry.disposed, false, 'should not be disposed');
	});

	test('mixed unique and duplicate IDs', () => {
		const existing = new Map<string, MockAccessor>();
		const existingB = createMockAccessor('status-B');
		existing.set('status-B', existingB);
		const createdEntries: MockAccessor[] = [];

		const result = runDedicatedEntryUpdate(
			['status-A', 'status-B', 'status-A'], // A appears twice, B once
			existing,
			(id) => { const e = createMockAccessor(id); createdEntries.push(e); return e; }
		);

		assert.strictEqual(createdEntries.length, 1, 'should create one new entry (for first status-A)');
		assert.strictEqual(result.size, 2, 'result map should have two entries');
		assert.strictEqual(result.get('status-A'), createdEntries[0], 'status-A should use created entry');
		assert.strictEqual(createdEntries[0].updateCount, 1, 'status-A entry updated once for duplicate');
		assert.strictEqual(result.get('status-B'), existingB, 'status-B should reuse existing entry');
		assert.strictEqual(existingB.updateCount, 1, 'status-B entry updated once');
	});
});

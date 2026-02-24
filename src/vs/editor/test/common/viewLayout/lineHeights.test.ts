/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CustomLineHeightData, LineHeightsManager } from '../../../common/viewLayout/lineHeights.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('Editor ViewLayout - LineHeightsManager', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('default line height is used when no custom heights exist', () => {
		const manager = new LineHeightsManager(10, []);

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(1), 10);
		assert.strictEqual(manager.heightForLineNumber(5), 10);
		assert.strictEqual(manager.heightForLineNumber(100), 10);

		// Check accumulated heights
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 50);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(10), 100);
	});

	test('can change default line height', () => {
		const manager = new LineHeightsManager(10, []);
		manager.defaultLineHeight = 20;

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(1), 20);
		assert.strictEqual(manager.heightForLineNumber(5), 20);

		// Check accumulated heights
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 20);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 100);
	});

	test('can add single custom line height', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(1), 10);
		assert.strictEqual(manager.heightForLineNumber(2), 10);
		assert.strictEqual(manager.heightForLineNumber(3), 20);
		assert.strictEqual(manager.heightForLineNumber(4), 10);

		// Check accumulated heights
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 20);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 40);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 50);
	});

	test('can add multiple custom line heights', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 2, 2, 15);
		manager.insertOrChangeCustomLineHeight('dec2', 4, 4, 25);

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(1), 10);
		assert.strictEqual(manager.heightForLineNumber(2), 15);
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.heightForLineNumber(4), 25);
		assert.strictEqual(manager.heightForLineNumber(5), 10);

		// Check accumulated heights
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 25);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 35);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
	});

	test('can add range of custom line heights', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 2, 4, 15);

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(1), 10);
		assert.strictEqual(manager.heightForLineNumber(2), 15);
		assert.strictEqual(manager.heightForLineNumber(3), 15);
		assert.strictEqual(manager.heightForLineNumber(4), 15);
		assert.strictEqual(manager.heightForLineNumber(5), 10);

		// Check accumulated heights
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 25);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 40);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 55);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 65);
	});

	test('can change existing custom line height', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		assert.strictEqual(manager.heightForLineNumber(3), 20);

		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 30);
		assert.strictEqual(manager.heightForLineNumber(3), 30);

		// Check accumulated heights after change
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 50);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
	});

	test('can remove custom line height', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		assert.strictEqual(manager.heightForLineNumber(3), 20);

		manager.removeCustomLineHeight('dec1');
		assert.strictEqual(manager.heightForLineNumber(3), 10);

		// Check accumulated heights after removal
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 30);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 40);
	});

	test('handles overlapping custom line heights (last one wins)', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 5, 20);
		manager.insertOrChangeCustomLineHeight('dec2', 4, 6, 30);

		assert.strictEqual(manager.heightForLineNumber(2), 10);
		assert.strictEqual(manager.heightForLineNumber(3), 20);
		assert.strictEqual(manager.heightForLineNumber(4), 30);
		assert.strictEqual(manager.heightForLineNumber(5), 30);
		assert.strictEqual(manager.heightForLineNumber(6), 30);
		assert.strictEqual(manager.heightForLineNumber(7), 10);
	});

	test('handles deleting lines before custom line heights', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 10, 12, 20);

		manager.onLinesDeleted(5, 7); // Delete lines 5-7

		assert.strictEqual(manager.heightForLineNumber(7), 20); // Was line 10
		assert.strictEqual(manager.heightForLineNumber(8), 20); // Was line 11
		assert.strictEqual(manager.heightForLineNumber(9), 20); // Was line 12
		assert.strictEqual(manager.heightForLineNumber(10), 10);
	});

	test('handles deleting lines overlapping with custom line heights', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 10, 20);

		manager.onLinesDeleted(7, 12); // Delete lines 7-12, including part of decoration

		assert.strictEqual(manager.heightForLineNumber(5), 20);
		assert.strictEqual(manager.heightForLineNumber(6), 20);
		assert.strictEqual(manager.heightForLineNumber(7), 10);
	});

	test('handles deleting lines containing custom line heights completely', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 7, 20);

		manager.onLinesDeleted(4, 8); // Delete lines 4-8, completely contains decoration

		// The decoration collapses to a single line which matches the behavior in the text buffer
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.heightForLineNumber(4), 20);
		assert.strictEqual(manager.heightForLineNumber(5), 10);
	});

	test('handles deleting lines at the very beginning', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('decA', 1, 1, 40);

		manager.onLinesDeleted(2, 4); // Delete lines 2-4 after the variable line height

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(1), 40);
	});

	test('handles inserting lines before custom line heights', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 7, 20);

		manager.onLinesInserted(3, 4, []); // Insert 2 lines at line 3

		assert.strictEqual(manager.heightForLineNumber(5), 10);
		assert.strictEqual(manager.heightForLineNumber(6), 10);
		assert.strictEqual(manager.heightForLineNumber(7), 20); // Was line 5
		assert.strictEqual(manager.heightForLineNumber(8), 20); // Was line 6
		assert.strictEqual(manager.heightForLineNumber(9), 20); // Was line 7
	});

	test('handles inserting lines inside custom line heights range', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 7, 20);

		manager.onLinesInserted(6, 7, []); // Insert 2 lines at line 6

		assert.strictEqual(manager.heightForLineNumber(5), 20);
		assert.strictEqual(manager.heightForLineNumber(6), 20);
		assert.strictEqual(manager.heightForLineNumber(7), 20);
		assert.strictEqual(manager.heightForLineNumber(8), 20);
		assert.strictEqual(manager.heightForLineNumber(9), 20);
	});

	test('changing decoration id maintains custom line height', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 7, 20);

		manager.removeCustomLineHeight('dec1');
		manager.insertOrChangeCustomLineHeight('dec2', 5, 7, 20);

		assert.strictEqual(manager.heightForLineNumber(5), 20);
		assert.strictEqual(manager.heightForLineNumber(6), 20);
		assert.strictEqual(manager.heightForLineNumber(7), 20);
	});

	test('accumulates heights correctly with complex setup', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 15);
		manager.insertOrChangeCustomLineHeight('dec2', 5, 7, 20);
		manager.insertOrChangeCustomLineHeight('dec3', 10, 10, 30);

		// Check accumulated heights
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 20);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 35);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 45);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 65);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(7), 105);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(9), 125);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(10), 155);
	});

	test('partial deletion with multiple lines for the same decoration ID', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('decSame', 5, 5, 20);
		manager.insertOrChangeCustomLineHeight('decSame', 6, 6, 25);

		// Delete one line that partially intersects the same decoration
		manager.onLinesDeleted(6, 6);

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(5), 10);
		assert.strictEqual(manager.heightForLineNumber(6), 25);
	});

	test('overlapping decorations use maximum line height', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('decA', 3, 5, 40);
		manager.insertOrChangeCustomLineHeight('decB', 4, 6, 30);

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(3), 40);
		assert.strictEqual(manager.heightForLineNumber(4), 40);
		assert.strictEqual(manager.heightForLineNumber(5), 40);
		assert.strictEqual(manager.heightForLineNumber(6), 30);
	});

	test('onLinesInserted with same decoration ID extending to inserted line', () => {
		const manager = new LineHeightsManager(10, []);
		// Set up a special line at line 1 with decoration 'decA'
		manager.insertOrChangeCustomLineHeight('decA', 1, 1, 30);

		assert.strictEqual(manager.heightForLineNumber(1), 30);
		assert.strictEqual(manager.heightForLineNumber(2), 10);

		// Insert line 2 to line 2, with the same decoration ID 'decA' covering line 2
		manager.onLinesInserted(2, 2, [
			new CustomLineHeightData('decA', 2, 2, 30)
		]);

		// After insertion, the decoration 'decA' now covers line 2
		// Since insertOrChangeCustomLineHeight removes the old decoration first,
		// line 1 no longer has the custom height, and line 2 gets it
		assert.strictEqual(manager.heightForLineNumber(1), 10);
		assert.strictEqual(manager.heightForLineNumber(2), 30);
		assert.strictEqual(manager.heightForLineNumber(3), 10);
	});
});

suite('Editor ViewLayout - LineHeightsManager (auto-commit on read)', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// --- Auto-commit on read: reads without explicit commit() ---

	test('read after single insert without commit', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		// No commit() call — read should still work
		assert.strictEqual(manager.heightForLineNumber(1), 10);
		assert.strictEqual(manager.heightForLineNumber(3), 20);
		assert.strictEqual(manager.heightForLineNumber(4), 10);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 40);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 50);
	});

	test('read after multiple inserts without commit', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 2, 2, 15);
		manager.insertOrChangeCustomLineHeight('dec2', 4, 4, 25);
		// No commit() call
		assert.strictEqual(manager.heightForLineNumber(2), 15);
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.heightForLineNumber(4), 25);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
	});

	test('read after remove without commit', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		assert.strictEqual(manager.heightForLineNumber(3), 20);

		manager.removeCustomLineHeight('dec1');
		// No commit() call
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 30);
	});

	test('insert then remove same decoration without commit', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		manager.removeCustomLineHeight('dec1');
		// No commit() call — should see default height
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 30);
	});

	test('insert same decoration ID twice without commit replaces first', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 5, 30);
		// No commit() — second call should replace first
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.heightForLineNumber(5), 30);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
	});

	test('interleaved callers: remove must cancel queued inserts before first flush', () => {
		const manager = new LineHeightsManager(10, []);

		// Caller A queues decoration insert.
		manager.insertOrChangeCustomLineHeight('decA', 3, 3, 20);
		// Caller B queues independent insert.
		manager.insertOrChangeCustomLineHeight('decB', 4, 4, 30);
		// Caller A removes its decoration before any flush occurs.
		manager.removeCustomLineHeight('decA');
		// Caller B triggers a structural change that causes queue flush in the middle of commit.
		manager.onLinesInserted(1, 1, []);

		// decA must stay removed. If queued inserts are not canceled on remove, decA incorrectly survives.
		assert.strictEqual(manager.heightForLineNumber(4), 10);
		assert.strictEqual(manager.heightForLineNumber(5), 30);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
	});

	test('interleaved callers: remove must cancel queued inserts before delete flush', () => {
		const manager = new LineHeightsManager(10, []);

		manager.insertOrChangeCustomLineHeight('decA', 3, 3, 20);
		manager.insertOrChangeCustomLineHeight('decB', 5, 5, 30);
		manager.removeCustomLineHeight('decA');
		manager.onLinesDeleted(1, 1);

		// After deleting line 1, decB shifts from line 5 to line 4.
		// decA must remain removed even though its insert was queued before the remove.
		assert.strictEqual(manager.heightForLineNumber(2), 10);
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.heightForLineNumber(4), 30);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
	});

	// --- Interleaved operations ---

	test('interleaved: insert, insert, onLinesInserted, onLinesDeleted, remove, remove, insert, insert, read', () => {
		const manager = new LineHeightsManager(10, []);
		// Step 1-2: two inserts
		manager.insertOrChangeCustomLineHeight('dec1', 2, 2, 20);
		manager.insertOrChangeCustomLineHeight('dec2', 5, 5, 30);
		// Step 3: insert 2 lines at line 3 (shifts dec2 from line 5 → 7)
		manager.onLinesInserted(3, 4, []);
		// Step 4: delete line 1 (shifts dec1 from line 2 → 1, dec2 from line 7 → 6)
		manager.onLinesDeleted(1, 1);
		// Step 5-6: remove the two decorations
		manager.removeCustomLineHeight('dec1');
		manager.removeCustomLineHeight('dec2');
		// Step 7-8: two new inserts
		manager.insertOrChangeCustomLineHeight('dec3', 3, 3, 40);
		manager.insertOrChangeCustomLineHeight('dec4', 5, 5, 50);
		// Read — no explicit commit
		assert.strictEqual(manager.heightForLineNumber(1), 10);
		assert.strictEqual(manager.heightForLineNumber(3), 40);
		assert.strictEqual(manager.heightForLineNumber(4), 10);
		assert.strictEqual(manager.heightForLineNumber(5), 50);
		assert.strictEqual(manager.heightForLineNumber(6), 10);
	});

	test('interleaved: insert, onLinesInserted, remove, read', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		// Insert 1 line at line 1 → dec1 shifts from 3 → 4
		manager.onLinesInserted(1, 1, []);
		manager.removeCustomLineHeight('dec1');
		// Read — no explicit commit
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.heightForLineNumber(4), 10);
	});

	test('interleaved: onLinesDeleted, insert, read', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 5, 20);
		// Delete lines 1-2 → dec1 shifts from 5 → 3
		manager.onLinesDeleted(1, 2);
		// Insert a new decoration
		manager.insertOrChangeCustomLineHeight('dec2', 1, 1, 30);
		// Read — no explicit commit
		assert.strictEqual(manager.heightForLineNumber(1), 30);
		assert.strictEqual(manager.heightForLineNumber(2), 10);
		assert.strictEqual(manager.heightForLineNumber(3), 20);
	});

	test('interleaved: insert, onLinesDeleted, insert, read', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		// Delete line 1 → dec1 should shift from 3 → 2
		manager.onLinesDeleted(1, 1);
		// Add another decoration
		manager.insertOrChangeCustomLineHeight('dec2', 5, 5, 30);
		// Read — no explicit commit
		assert.strictEqual(manager.heightForLineNumber(1), 10);
		assert.strictEqual(manager.heightForLineNumber(2), 20);
		assert.strictEqual(manager.heightForLineNumber(5), 30);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 80);
	});

	// --- Edge cases ---

	test('onLinesInserted then onLinesDeleted without reads between', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		// Insert 2 lines at line 1 → dec1 moves from 3 → 5
		manager.onLinesInserted(1, 2, []);
		// Delete line 1 → dec1 moves from 5 → 4
		manager.onLinesDeleted(1, 1);
		// Read
		assert.strictEqual(manager.heightForLineNumber(4), 20);
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 50);
	});

	test('multiple onLinesInserted without reads between', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		// Insert 1 line at line 1 → dec1 at 3 → 4
		manager.onLinesInserted(1, 1, []);
		// Insert 1 line at line 1 → dec1 at 4 → 5
		manager.onLinesInserted(1, 1, []);
		// Read
		assert.strictEqual(manager.heightForLineNumber(5), 20);
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.heightForLineNumber(4), 10);
	});

	test('multiple onLinesDeleted without reads between', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 10, 10, 20);
		// Delete lines 1-2 → dec1 at 10 → 8
		manager.onLinesDeleted(1, 2);
		// Delete lines 1-2 → dec1 at 8 → 6
		manager.onLinesDeleted(1, 2);
		// Read
		assert.strictEqual(manager.heightForLineNumber(6), 20);
		assert.strictEqual(manager.heightForLineNumber(7), 10);
	});

	test('pending insert then onLinesDeleted affecting that line', () => {
		const manager = new LineHeightsManager(10, []);
		// Insert a decoration at line 3 (pending, not committed)
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		// Delete line 3 — should remove/collapse the pending decoration
		manager.onLinesDeleted(3, 3);
		// Read — the decoration was on the deleted line
		// The decoration collapses to line 3 (fromLineNumber) per onLinesDeleted behavior
		assert.strictEqual(manager.heightForLineNumber(3), 20);
	});

	test('pending insert then onLinesInserted shifting that line', () => {
		const manager = new LineHeightsManager(10, []);
		// Insert a decoration at line 3 (pending, not committed)
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		// Insert 2 lines before it at line 1 → should shift dec1 from 3 → 5
		manager.onLinesInserted(1, 2, []);
		// Read
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.heightForLineNumber(5), 20);
	});

	test('accumulated heights correct after interleaved ops without commit', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 2, 2, 15);
		manager.insertOrChangeCustomLineHeight('dec2', 4, 4, 25);
		// No commit — verify accumulated heights
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 25);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 35);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
	});

	test('constructor with initial data works without explicit commit', () => {
		const data = [
			new CustomLineHeightData('dec1', 2, 4, 20),
			new CustomLineHeightData('dec2', 6, 6, 30),
		];
		const manager = new LineHeightsManager(10, data);
		assert.strictEqual(manager.heightForLineNumber(1), 10);
		assert.strictEqual(manager.heightForLineNumber(2), 20);
		assert.strictEqual(manager.heightForLineNumber(3), 20);
		assert.strictEqual(manager.heightForLineNumber(4), 20);
		assert.strictEqual(manager.heightForLineNumber(5), 10);
		assert.strictEqual(manager.heightForLineNumber(6), 30);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(6), 110);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { LineHeightsManager } from '../../../common/viewLayout/lineHeights.js';
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
		manager.commit();

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
		manager.commit();

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
		manager.commit();

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
		manager.commit();
		assert.strictEqual(manager.heightForLineNumber(3), 20);

		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 30);
		manager.commit();
		assert.strictEqual(manager.heightForLineNumber(3), 30);

		// Check accumulated heights after change
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 50);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
	});

	test('can remove custom line height', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 20);
		manager.commit();
		assert.strictEqual(manager.heightForLineNumber(3), 20);

		manager.removeCustomLineHeight('dec1');
		manager.commit();
		assert.strictEqual(manager.heightForLineNumber(3), 10);

		// Check accumulated heights after removal
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 30);
		assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 40);
	});

	test('handles overlapping custom line heights (last one wins)', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 5, 20);
		manager.insertOrChangeCustomLineHeight('dec2', 4, 6, 30);
		manager.commit();

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
		manager.commit();

		manager.onLinesDeleted(5, 7); // Delete lines 5-7

		assert.strictEqual(manager.heightForLineNumber(7), 20); // Was line 10
		assert.strictEqual(manager.heightForLineNumber(8), 20); // Was line 11
		assert.strictEqual(manager.heightForLineNumber(9), 20); // Was line 12
		assert.strictEqual(manager.heightForLineNumber(10), 10);
	});

	test('handles deleting lines overlapping with custom line heights', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 10, 20);
		manager.commit();

		manager.onLinesDeleted(7, 12); // Delete lines 7-12, including part of decoration

		assert.strictEqual(manager.heightForLineNumber(5), 20);
		assert.strictEqual(manager.heightForLineNumber(6), 20);
		assert.strictEqual(manager.heightForLineNumber(7), 10);
	});

	test('handles deleting lines containing custom line heights completely', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 7, 20);
		manager.commit();

		manager.onLinesDeleted(4, 8); // Delete lines 4-8, completely contains decoration

		// The decoration collapses to a single line which matches the behavior in the text buffer
		assert.strictEqual(manager.heightForLineNumber(3), 10);
		assert.strictEqual(manager.heightForLineNumber(4), 20);
		assert.strictEqual(manager.heightForLineNumber(5), 10);
	});

	test('handles deleting lines at the very beginning', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('decA', 1, 1, 40);
		manager.commit();

		manager.onLinesDeleted(2, 4); // Delete lines 2-4 after the variable line height

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(1), 40);
	});

	test('handles inserting lines before custom line heights', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 7, 20);
		manager.commit();

		manager.onLinesInserted(3, 4); // Insert 2 lines at line 3

		assert.strictEqual(manager.heightForLineNumber(5), 10);
		assert.strictEqual(manager.heightForLineNumber(6), 10);
		assert.strictEqual(manager.heightForLineNumber(7), 20); // Was line 5
		assert.strictEqual(manager.heightForLineNumber(8), 20); // Was line 6
		assert.strictEqual(manager.heightForLineNumber(9), 20); // Was line 7
	});

	test('handles inserting lines inside custom line heights range', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 7, 20);
		manager.commit();

		manager.onLinesInserted(6, 7); // Insert 2 lines at line 6

		assert.strictEqual(manager.heightForLineNumber(5), 20);
		assert.strictEqual(manager.heightForLineNumber(6), 20);
		assert.strictEqual(manager.heightForLineNumber(7), 20);
		assert.strictEqual(manager.heightForLineNumber(8), 20);
		assert.strictEqual(manager.heightForLineNumber(9), 20);
	});

	test('changing decoration id maintains custom line height', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 5, 7, 20);
		manager.commit();

		manager.removeCustomLineHeight('dec1');
		manager.insertOrChangeCustomLineHeight('dec2', 5, 7, 20);
		manager.commit();

		assert.strictEqual(manager.heightForLineNumber(5), 20);
		assert.strictEqual(manager.heightForLineNumber(6), 20);
		assert.strictEqual(manager.heightForLineNumber(7), 20);
	});

	test('accumulates heights correctly with complex setup', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('dec1', 3, 3, 15);
		manager.insertOrChangeCustomLineHeight('dec2', 5, 7, 20);
		manager.insertOrChangeCustomLineHeight('dec3', 10, 10, 30);
		manager.commit();

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
		manager.commit();

		// Delete one line that partially intersects the same decoration
		manager.onLinesDeleted(6, 6);

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(5), 20);
		assert.strictEqual(manager.heightForLineNumber(6), 10);
	});

	test('overlapping decorations use maximum line height', () => {
		const manager = new LineHeightsManager(10, []);
		manager.insertOrChangeCustomLineHeight('decA', 3, 5, 40);
		manager.insertOrChangeCustomLineHeight('decB', 4, 6, 30);
		manager.commit();

		// Check individual line heights
		assert.strictEqual(manager.heightForLineNumber(3), 40);
		assert.strictEqual(manager.heightForLineNumber(4), 40);
		assert.strictEqual(manager.heightForLineNumber(5), 40);
		assert.strictEqual(manager.heightForLineNumber(6), 30);
	});
});

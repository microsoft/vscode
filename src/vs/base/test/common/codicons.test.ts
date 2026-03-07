/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon, getAllCodicons } from '../../common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Codicons', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getAllCodicons returns an array of ThemeIcon', () => {
		const allCodicons = getAllCodicons();
		assert.ok(Array.isArray(allCodicons));
		assert.ok(allCodicons.length > 0);

		// Check that each item matches ThemeIcon
		for (const icon of allCodicons) {
			assert.ok(icon);
			assert.strictEqual(typeof icon.id, 'string');
		}
	});

	test('getAllCodicons matches Codicon length', () => {
		const allCodicons = getAllCodicons();
		const codiconValues = Object.values(Codicon);

		assert.strictEqual(allCodicons.length, codiconValues.length);
	});

	test('Codicon contains expected icons', () => {
		// Test standard icons
		assert.ok(Codicon.add);
		assert.strictEqual(Codicon.add.id, 'add');

		assert.ok(Codicon.lightbulb);
		assert.strictEqual(Codicon.lightbulb.id, 'lightbulb');

		// Test derived icons
		assert.ok(Codicon.dialogError);
		assert.strictEqual(Codicon.dialogError.id, 'dialog-error');

		assert.ok(Codicon.dialogWarning);
		assert.strictEqual(Codicon.dialogWarning.id, 'dialog-warning');

		assert.ok(Codicon.treeItemExpanded);
		assert.strictEqual(Codicon.treeItemExpanded.id, 'tree-item-expanded');
	});
});

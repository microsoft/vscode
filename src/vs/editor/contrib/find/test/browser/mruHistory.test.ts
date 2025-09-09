/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FindWidgetMRUHistory } from '../../browser/findWidgetMRUHistory.js';
import { ReplaceWidgetMRUHistory } from '../../browser/replaceWidgetMRUHistory.js';
import { NullStorageService } from '../../../../../platform/storage/common/storage.js';

suite('MRU History', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('FindWidgetMRUHistory - add moves item to front', () => {
		const storageService = new NullStorageService();
		const history = new FindWidgetMRUHistory(storageService);
		
		// Add items in order
		history.add('first');
		history.add('second');
		history.add('third');
		
		// Verify order (most recent first)
		const items: string[] = [];
		history.forEach(item => items.push(item));
		assert.deepStrictEqual(items, ['third', 'second', 'first']);
	});

	test('FindWidgetMRUHistory - re-adding existing item moves to front', () => {
		const storageService = new NullStorageService();
		const history = new FindWidgetMRUHistory(storageService);
		
		// Add items in order
		history.add('first');
		history.add('second');
		history.add('third');
		
		// Re-add first item
		history.add('first');
		
		// Verify 'first' is now at front
		const items: string[] = [];
		history.forEach(item => items.push(item));
		assert.deepStrictEqual(items, ['first', 'third', 'second']);
	});

	test('FindWidgetMRUHistory - promoteToMostRecent moves existing item to front', () => {
		const storageService = new NullStorageService();
		const history = new FindWidgetMRUHistory(storageService);
		
		// Add items in order
		history.add('first');
		history.add('second');
		history.add('third');
		
		// Promote 'first' to most recent
		const result = history.promoteToMostRecent('first');
		assert.strictEqual(result, true);
		
		// Verify 'first' is now at front
		const items: string[] = [];
		history.forEach(item => items.push(item));
		assert.deepStrictEqual(items, ['first', 'third', 'second']);
	});

	test('FindWidgetMRUHistory - promoteToMostRecent returns false for non-existent item', () => {
		const storageService = new NullStorageService();
		const history = new FindWidgetMRUHistory(storageService);
		
		history.add('first');
		
		const result = history.promoteToMostRecent('nonexistent');
		assert.strictEqual(result, false);
	});

	test('ReplaceWidgetMRUHistory - basic functionality', () => {
		const storageService = new NullStorageService();
		const history = new ReplaceWidgetMRUHistory(storageService);
		
		// Add items in order
		history.add('replace1');
		history.add('replace2');
		history.add('replace3');
		
		// Verify order (most recent first)
		const items: string[] = [];
		history.forEach(item => items.push(item));
		assert.deepStrictEqual(items, ['replace3', 'replace2', 'replace1']);
		
		// Promote 'replace1' to most recent
		const result = history.promoteToMostRecent('replace1');
		assert.strictEqual(result, true);
		
		// Verify 'replace1' is now at front
		const newItems: string[] = [];
		history.forEach(item => newItems.push(item));
		assert.deepStrictEqual(newItems, ['replace1', 'replace3', 'replace2']);
	});

	test('MRU History - has method works correctly', () => {
		const storageService = new NullStorageService();
		const history = new FindWidgetMRUHistory(storageService);
		
		history.add('test');
		assert.strictEqual(history.has('test'), true);
		assert.strictEqual(history.has('nonexistent'), false);
	});

	test('MRU History - delete method works correctly', () => {
		const storageService = new NullStorageService();
		const history = new FindWidgetMRUHistory(storageService);
		
		history.add('first');
		history.add('second');
		
		assert.strictEqual(history.has('first'), true);
		assert.strictEqual(history.delete('first'), true);
		assert.strictEqual(history.has('first'), false);
		assert.strictEqual(history.delete('nonexistent'), false);
	});

	test('MRU History - clear method empties history', () => {
		const storageService = new NullStorageService();
		const history = new FindWidgetMRUHistory(storageService);
		
		history.add('first');
		history.add('second');
		
		history.clear();
		
		assert.strictEqual(history.has('first'), false);
		assert.strictEqual(history.has('second'), false);
		
		const items: string[] = [];
		history.forEach(item => items.push(item));
		assert.strictEqual(items.length, 0);
	});
});
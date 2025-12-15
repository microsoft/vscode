/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Output View Filters', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// Note: This function duplicates the private parseFilters() method in FilterController
	// for unit testing purposes. Keep in sync with the implementation.
	function parseFilters(filterText: string): { positive: string[]; negative: string[] } {
		const positive: string[] = [];
		const negative: string[] = [];

		// Split by comma and trim each pattern
		const patterns = filterText.split(',').map(p => p.trim()).filter(p => p.length > 0);

		for (const pattern of patterns) {
			if (pattern.startsWith('!')) {
				// Negative filter - remove the ! prefix
				const negativePattern = pattern.substring(1).trim();
				if (negativePattern.length > 0) {
					negative.push(negativePattern);
				}
			} else {
				positive.push(pattern);
			}
		}

		return { positive, negative };
	}

	test('should parse single positive filter', () => {
		const result = parseFilters('error');
		assert.deepStrictEqual(result, {
			positive: ['error'],
			negative: []
		});
	});

	test('should parse multiple positive filters', () => {
		const result = parseFilters('error,warning,info');
		assert.deepStrictEqual(result, {
			positive: ['error', 'warning', 'info'],
			negative: []
		});
	});

	test('should parse single negative filter', () => {
		const result = parseFilters('!debug');
		assert.deepStrictEqual(result, {
			positive: [],
			negative: ['debug']
		});
	});

	test('should parse multiple negative filters', () => {
		const result = parseFilters('!trace,!debug');
		assert.deepStrictEqual(result, {
			positive: [],
			negative: ['trace', 'debug']
		});
	});

	test('should parse mixed positive and negative filters', () => {
		const result = parseFilters('error,!copilot,warning');
		assert.deepStrictEqual(result, {
			positive: ['error', 'warning'],
			negative: ['copilot']
		});
	});

	test('should handle whitespace in filters', () => {
		const result = parseFilters(' error , !debug , warning ');
		assert.deepStrictEqual(result, {
			positive: ['error', 'warning'],
			negative: ['debug']
		});
	});

	test('should handle empty filter', () => {
		const result = parseFilters('');
		assert.deepStrictEqual(result, {
			positive: [],
			negative: []
		});
	});

	test('should handle only commas', () => {
		const result = parseFilters(',,,');
		assert.deepStrictEqual(result, {
			positive: [],
			negative: []
		});
	});

	test('should handle negative filter with whitespace after !', () => {
		const result = parseFilters('! debug');
		assert.deepStrictEqual(result, {
			positive: [],
			negative: ['debug']
		});
	});

	test('should handle complex pattern', () => {
		const result = parseFilters('error,warning,!copilot,!trace,info');
		assert.deepStrictEqual(result, {
			positive: ['error', 'warning', 'info'],
			negative: ['copilot', 'trace']
		});
	});
});

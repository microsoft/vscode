/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isMeteredConnection } from '../../../../base/common/networkConnection.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('NetworkConnection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('isMeteredConnection should return boolean', () => {
		// The function should always return a boolean value
		const result = isMeteredConnection();
		assert.strictEqual(typeof result, 'boolean');
	});

	test('isMeteredConnection should handle missing navigator', () => {
		// When navigator is not available, should return false
		const originalNavigator = (global as any).navigator;
		try {
			delete (global as any).navigator;
			const result = isMeteredConnection();
			assert.strictEqual(result, false);
		} finally {
			if (originalNavigator) {
				(global as any).navigator = originalNavigator;
			}
		}
	});

	test('isMeteredConnection should detect saveData', () => {
		// Mock navigator with saveData enabled
		const originalNavigator = (global as any).navigator;
		try {
			(global as any).navigator = {
				connection: {
					saveData: true
				}
			};
			const result = isMeteredConnection();
			assert.strictEqual(result, true);
		} finally {
			if (originalNavigator) {
				(global as any).navigator = originalNavigator;
			}
		}
	});

	test('isMeteredConnection should detect metered property', () => {
		// Mock navigator with metered connection
		const originalNavigator = (global as any).navigator;
		try {
			(global as any).navigator = {
				connection: {
					metered: true
				}
			};
			const result = isMeteredConnection();
			assert.strictEqual(result, true);
		} finally {
			if (originalNavigator) {
				(global as any).navigator = originalNavigator;
			}
		}
	});

	test('isMeteredConnection should return false for unmetered connection', () => {
		// Mock navigator with unmetered connection
		const originalNavigator = (global as any).navigator;
		try {
			(global as any).navigator = {
				connection: {
					saveData: false,
					metered: false
				}
			};
			const result = isMeteredConnection();
			assert.strictEqual(result, false);
		} finally {
			if (originalNavigator) {
				(global as any).navigator = originalNavigator;
			}
		}
	});
});

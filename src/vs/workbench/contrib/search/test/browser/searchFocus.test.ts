/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { focusSearchInputPreservingQuery } from '../../browser/searchFocus.js';

suite('Search focus-only command', () => {
	test('suppresses global Find clipboard import when focusing', () => {
		const calls: unknown[][] = [];
		focusSearchInputPreservingQuery({
			focus: (...args) => { calls.push(args); }
		});

		assert.deepStrictEqual(calls, [[true, false, true]]);
	});

	test('preserves the query when the widget would otherwise import a new clipboard value', () => {
		let query = 'existing search';
		const globalFindClipboard = 'replacement from clipboard';
		let focused = false;

		const widget = {
			focus: (_select = true, focusReplace = false, suppressGlobalSearchBuffer = false) => {
				assert.strictEqual(focusReplace, false);
				focused = true;
				if (!suppressGlobalSearchBuffer) {
					query = globalFindClipboard;
				}
			}
		};

		focusSearchInputPreservingQuery(widget);
		assert.strictEqual(focused, true);
		assert.strictEqual(query, 'existing search');
	});

	test('repeated focus does not modify the current query', () => {
		let query = 'my current query';
		let focusCount = 0;
		const widget = {
			focus: (_select = true, _focusReplace = false, suppressGlobalSearchBuffer = false) => {
				focusCount++;
				if (!suppressGlobalSearchBuffer) {
					query = 'global find value';
				}
			}
		};

		focusSearchInputPreservingQuery(widget);
		focusSearchInputPreservingQuery(widget);
		assert.strictEqual(focusCount, 2);
		assert.strictEqual(query, 'my current query');
	});

	test('focus is still invoked when the existing query is empty', () => {
		let focused = false;
		let query = '';
		focusSearchInputPreservingQuery({
			focus: (_select, _replace, suppress) => {
				focused = true;
				if (!suppress) {
					query = 'clipboard';
				}
			}
		});
		assert.strictEqual(focused, true);
		assert.strictEqual(query, '');
	});
});

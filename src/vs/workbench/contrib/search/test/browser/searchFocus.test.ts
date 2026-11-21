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


	test('does not set a stale suppression flag when the Search input is already focused', () => {
		const calls: unknown[][] = [];
		let suppressionFlag = false;
		const widget = {
			focus: (_select = true, _focusReplace = false, suppressGlobalSearchBuffer = false) => {
				calls.push([_select, _focusReplace, suppressGlobalSearchBuffer]);
				// An already-focused input does not emit another focus event to
				// consume this flag.
				suppressionFlag = suppressGlobalSearchBuffer;
			}
		};

		focusSearchInputPreservingQuery(widget, true);
		assert.deepStrictEqual(calls, [[true, false, false]]);
		assert.strictEqual(suppressionFlag, false);

		// A later ordinary focus still imports a newly changed global buffer.
		const shouldImportClipboardOnNextFocus = !suppressionFlag;
		assert.strictEqual(shouldImportClipboardOnNextFocus, true);
	});

	test('a newly focused Search input still suppresses the global clipboard import', () => {
		const calls: unknown[][] = [];
		let query = 'keep this query';
		const clipboardQuery = 'different global Find text';
		const widget = {
			focus: (select = true, focusReplace = false, suppressGlobalSearchBuffer = false) => {
				calls.push([select, focusReplace, suppressGlobalSearchBuffer]);
				// Model the focus handler that reads the macOS Find buffer unless
				// this focus specifically requested suppression.
				if (!suppressGlobalSearchBuffer) {
					query = clipboardQuery;
				}
			}
		};

		focusSearchInputPreservingQuery(widget, false);
		assert.deepStrictEqual(calls, [[true, false, true]]);
		assert.strictEqual(query, 'keep this query');
	});

	test('a second focus-only invocation can clear a previously pending suppression', () => {
		const flags: boolean[] = [];
		const widget = {
			focus: (_select = true, _replace = false, suppressGlobalSearchBuffer = false) => {
				flags.push(suppressGlobalSearchBuffer);
			}
		};

		focusSearchInputPreservingQuery(widget, false);
		focusSearchInputPreservingQuery(widget, true);
		assert.deepStrictEqual(flags, [true, false]);
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

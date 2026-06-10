/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mergeSearchPatternIfNotExists, mergeSearchPatternsIfNotExist } from '../../browser/searchPatternMerge.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Search pattern merge', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('mergeSearchPatternIfNotExists appends a single pattern', () => {
		assert.strictEqual(mergeSearchPatternIfNotExists('', '*.log'), '*.log');
		assert.strictEqual(mergeSearchPatternIfNotExists('*.ts', '**/foo'), '*.ts, **/foo');
	});

	test('mergeSearchPatternIfNotExists leaves value unchanged when duplicate', () => {
		const current = '*.ts, **/bar';
		assert.strictEqual(mergeSearchPatternIfNotExists(current, '**/bar'), current);
	});

	test('preserves file-type exclude when adding one folder exclude', () => {
		assert.strictEqual(
			mergeSearchPatternsIfNotExist('*.log', ['**/src/foo']),
			'*.log, **/src/foo'
		);
	});

	test('preserves file-type exclude when adding multiple folder excludes', () => {
		assert.strictEqual(
			mergeSearchPatternsIfNotExist('*.tmp', ['**/a', '**/b']),
			'*.tmp, **/a, **/b'
		);
	});

	test('mergeSearchPatternsIfNotExist adds only missing folders when some already excluded', () => {
		assert.strictEqual(
			mergeSearchPatternsIfNotExist('*.log, **/a', ['**/a', '**/b']),
			'*.log, **/a, **/b'
		);
	});

	test('mergeSearchPatternsIfNotExist is a no-op when every folder is already present', () => {
		const current = '*.log, **/a, **/b';
		assert.strictEqual(mergeSearchPatternsIfNotExist(current, ['**/b', '**/a']), current);
	});

	test('mergeSearchPatternsIfNotExist treats each array entry as one pattern (not comma-split)', () => {
		// Regression: joining paths to one string made "a, b" a single token vs per-folder merge.
		assert.strictEqual(
			mergeSearchPatternsIfNotExist('', ['**/path/a', '**/path/b']),
			'**/path/a, **/path/b'
		);
	});

	test('mergeSearchPatternsIfNotExist does not split commas inside braces (glob-aware)', () => {
		const current = '**/{foo,bar}';
		assert.strictEqual(
			mergeSearchPatternsIfNotExist(current, ['**/baz']),
			'**/{foo,bar}, **/baz'
		);
	});

	test('mergeSearchPatternsIfNotExist does not split commas inside bracket expressions', () => {
		const current = '*.[foo,bar]';
		assert.strictEqual(
			mergeSearchPatternIfNotExists(current, '*.qux'),
			'*.[foo,bar], *.qux'
		);
	});
});

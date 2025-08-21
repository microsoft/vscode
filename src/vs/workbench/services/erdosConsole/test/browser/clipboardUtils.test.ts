/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ANSIOutputLine, ANSIOutputRun } from '../../../../../base/common/ansiOutput.js';
import { formatOutputLinesForClipboard } from '../../browser/utils/clipboardUtils.js';

suite('ErdosConsole - Clipboard Utils', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createMockOutputRun(text: string, hyperlink?: string): ANSIOutputRun {
		return {
			id: 'test-id',
			text,
			hyperlink: hyperlink ? { url: hyperlink } : undefined,
			format: undefined
		};
	}

	function createMockOutputLine(runs: ANSIOutputRun[]): ANSIOutputLine {
		return {
			id: 'test-line-id',
			outputRuns: runs
		};
	}

	test('formats simple text without links', () => {
		const outputRun = createMockOutputRun('Hello World');
		const outputLine = createMockOutputLine([outputRun]);
		const result = formatOutputLinesForClipboard([outputLine]);

		assert.equal(result.length, 1);
		assert.equal(result[0], 'Hello World');
	});

	test('formats text with hyperlinks', () => {
		const outputRun = createMockOutputRun('Visit our site', 'https://www.lotas.io');
		const outputLine = createMockOutputLine([outputRun]);
		const result = formatOutputLinesForClipboard([outputLine]);

		assert.equal(result.length, 1);
		assert.equal(result[0], 'Visit our site (https://www.lotas.io) ');
	});

	test('formats multiple runs in one line', () => {
		const run1 = createMockOutputRun('Start ');
		const run2 = createMockOutputRun('link', 'https://example.com');
		const run3 = createMockOutputRun(' end');
		const outputLine = createMockOutputLine([run1, run2, run3]);
		const result = formatOutputLinesForClipboard([outputLine]);

		assert.equal(result.length, 1);
		assert.equal(result[0], 'Start link (https://example.com)  end');
	});

	test('formats with prefix', () => {
		const outputRun = createMockOutputRun('Hello');
		const outputLine = createMockOutputLine([outputRun]);
		const result = formatOutputLinesForClipboard([outputLine], '> ');

		assert.equal(result.length, 1);
		assert.equal(result[0], '> Hello');
	});
});
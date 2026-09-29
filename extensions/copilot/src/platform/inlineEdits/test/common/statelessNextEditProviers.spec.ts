/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { LineEdit, LineReplacement } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { LineRange } from '../../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { Edits } from '../../common/dataTypes/edit';
import { StatelessNextEditDocument } from '../../common/statelessNextEditProvider';
import { editWouldDeleteWhatWasJustInserted2, IgnoreWhitespaceOnlyChanges } from '../../common/statelessNextEditProviders';

describe('IgnoreFormattingChangesAspect', () => {
	// Helper to create test cases with less boilerplate
	function createEdit(baseLines: string[], newLines: string[]): LineReplacement {
		return new LineReplacement(new LineRange(1, baseLines.length + 1), newLines);
	}

	function isFormattingOnly(base: string[], edited: string[]): boolean {
		return IgnoreWhitespaceOnlyChanges._isFormattingOnlyChange(base, createEdit(base, edited));
	}

	// Test the core algorithm: formatting-only changes preserve content after whitespace removal
	it('identifies formatting vs content changes correctly', () => {
		// Formatting-only: content identical after removing whitespace
		expect(isFormattingOnly(['x=1;'], ['x = 1;'])).toBe(true);
		expect(isFormattingOnly(['  x'], ['x'])).toBe(true);
		expect(isFormattingOnly(['a', 'b'], ['a b'])).toBe(true);

		// Content changes: content differs after removing whitespace
		expect(isFormattingOnly(['x=1;'], ['x=2;'])).toBe(false);
		expect(isFormattingOnly(['x'], ['x+1'])).toBe(false);
		expect(isFormattingOnly(['a'], ['a', 'b'])).toBe(false);
	});

	// Representative examples of common scenarios
	describe('common scenarios', () => {
		const testCases = [
			// Formatting-only changes
			{ name: 'indentation', base: ['  code'], edited: ['    code'], expected: true },
			{ name: 'space normalization', base: ['a  b'], edited: ['a b'], expected: true },
			{ name: 'line breaks', base: ['a;', 'b;'], edited: ['a; b;'], expected: true },
			{ name: 'empty lines', base: ['   '], edited: ['\t'], expected: true },

			// Content changes
			{ name: 'value change', base: ['x=1'], edited: ['x=2'], expected: false },
			{ name: 'added code', base: ['f()'], edited: ['f()', 'g()'], expected: false },
			{ name: 'removed code', base: ['a', 'b'], edited: ['a'], expected: false },
		];

		it.each(testCases)('$name', ({ base, edited, expected }) => {
			expect(isFormattingOnly(base, edited)).toBe(expected);
		});
	});

	// Edge cases that could break the algorithm
	describe('edge cases', () => {
		it('handles empty content correctly', () => {
			expect(isFormattingOnly([''], [''])).toBe(true);
			expect(isFormattingOnly([''], ['   '])).toBe(true);
			expect(isFormattingOnly(['   '], [''])).toBe(true);
		});

		it('handles single character changes', () => {
			expect(isFormattingOnly(['a'], ['a '])).toBe(true);
			expect(isFormattingOnly(['a'], ['b'])).toBe(false);
		});
	});
});

describe('editWouldDeleteWhatWasJustInserted', () => {

	it('does not incorrectly flag multi-line removals', async () => {
		const file =
			`const modifiedTimes: Map<string, number> = new Map()

export async function getForceFreshForDir(
	cacheEntry:
		| CacheEntry
		| null
		| undefined
		| Promise<CacheEntry | null | undefined>,
	...dirs: Array<string | undefined | null>
) {
	const truthyDirs = dirs.filter(Boolean)
	for (const d of truthyDirs) {
		if (!path.isAbsolute(d)) {
			throw new Error(\`Trying to get force fresh for non-absolute path: \${d}\`)
		}
	}

	const resolvedCacheEntry = await cacheEntry
	if (!resolvedCacheEntry) return true
	const latestModifiedTime = truthyDirs.reduce((latest, dir) => {
		const modifiedTime = modifiedTimes.get(dir)
		return modifiedTime && modifiedTime > latest ? modifiedTime : latest
	}, 0)
	if (!latestModifiedTime) return undefined
	return latestModifiedTime > resolvedCacheEntry.metadata.createdTime
		? true
		: undefined
	return latestModifiedTime > resolvedCacheEntry.metadata.createdTime
		? true
		: undefined
}
`;

		const lineEdit = new LineEdit([new LineReplacement(new LineRange(28, 31), [])]); //[28,31)->[])

		const recentEdits = Edits.single(new StringEdit([
			new StringReplacement(new OffsetRange(740, 746), 'return '),
			new StringReplacement(new OffsetRange(806, 808), ''),
			new StringReplacement(new OffsetRange(811, 875), '? true\\n\\t\\t: undefined')
		]));

		const r = editWouldDeleteWhatWasJustInserted2({ documentAfterEdits: new StringText(file), recentEdits } as StatelessNextEditDocument, lineEdit);

		expect(r).toMatchInlineSnapshot(`false`);
	});

});

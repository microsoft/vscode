/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FindSectionHeaderOptions, ISectionHeaderFinderTarget, findSectionHeaders } from '../../../common/services/findSectionHeaders.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

class TestSectionHeaderFinderTarget implements ISectionHeaderFinderTarget {
	constructor(private readonly lines: string[]) { }

	getLineCount(): number {
		return this.lines.length;
	}

	getLineContent(lineNumber: number): string {
		return this.lines[lineNumber - 1];
	}
}

suite('FindSectionHeaders', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('finds simple section headers', () => {
		const model = new TestSectionHeaderFinderTarget([
			'regular line',
			'MARK: My Section',
			'another line',
			'MARK: Another Section',
			'last line'
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: 'MARK:\\s*(?<label>.*)$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 2);

		assert.strictEqual(headers[0].text, 'My Section');
		assert.strictEqual(headers[0].range.startLineNumber, 2);
		assert.strictEqual(headers[0].range.endLineNumber, 2);

		assert.strictEqual(headers[1].text, 'Another Section');
		assert.strictEqual(headers[1].range.startLineNumber, 4);
		assert.strictEqual(headers[1].range.endLineNumber, 4);
	});

	test('finds section headers with separators', () => {
		const model = new TestSectionHeaderFinderTarget([
			'regular line',
			'MARK: -My Section',
			'another line',
			'MARK: - Another Section',
			'last line'
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: 'MARK:\\s*(?<separator>-?)\\s*(?<label>.*)$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 2);

		assert.strictEqual(headers[0].text, 'My Section');
		assert.strictEqual(headers[0].hasSeparatorLine, true);

		assert.strictEqual(headers[1].text, 'Another Section');
		assert.strictEqual(headers[1].hasSeparatorLine, true);
	});

	test('finds multi-line section headers with separators', () => {
		const model = new TestSectionHeaderFinderTarget([
			'regular line',
			'// ==========',
			'// My Section',
			'// ==========',
			'code...',
			'// ==========',
			'// Another Section',
			'// ==========',
			'more code...'
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^\/\/ =+\\n^\/\/ (?<label>[^\\n]+?)\\n^\/\/ =+$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 2);

		assert.strictEqual(headers[0].text, 'My Section');
		assert.strictEqual(headers[0].range.startLineNumber, 2);
		assert.strictEqual(headers[0].range.endLineNumber, 4);

		assert.strictEqual(headers[1].text, 'Another Section');
		assert.strictEqual(headers[1].range.startLineNumber, 6);
		assert.strictEqual(headers[1].range.endLineNumber, 8);
	});

	test('handles overlapping multi-line section headers correctly', () => {
		const model = new TestSectionHeaderFinderTarget([
			'// ==========',
			'// Section 1',
			'// ==========',
			'// ==========', // This line starts another header
			'// Section 2',
			'// ==========',
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^\/\/ =+\\n^\/\/ (?<label>[^\\n]+?)\\n^\/\/ =+$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 2);

		assert.strictEqual(headers[0].text, 'Section 1');
		assert.strictEqual(headers[0].range.startLineNumber, 1);
		assert.strictEqual(headers[0].range.endLineNumber, 3);

		assert.strictEqual(headers[1].text, 'Section 2');
		assert.strictEqual(headers[1].range.startLineNumber, 4);
		assert.strictEqual(headers[1].range.endLineNumber, 6);
	});

	test('section headers must be in comments when specified', () => {
		const model = new TestSectionHeaderFinderTarget([
			'// ==========',
			'// Section 1',  // This one is in a comment
			'// ==========',
			'==========',    // This one isn't
			'Section 2',
			'=========='
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^(?:\/\/ )?=+\\n^(?:\/\/ )?(?<label>[^\\n]+?)\\n^(?:\/\/ )?=+$'
		};

		// Both patterns match, but the second one should be filtered out by the token check
		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers[0].shouldBeInComments, true);
	});

	test('handles section headers at chunk boundaries', () => {
		// Create enough lines to ensure we cross chunk boundaries
		const lines: string[] = [];
		for (let i = 0; i < 150; i++) {
			lines.push('line ' + i);
		}

		// Add headers near the chunk boundary (chunk size is 100)
		lines[97] = '// ==========';
		lines[98] = '// Section 1';
		lines[99] = '// ==========';
		lines[100] = '// ==========';
		lines[101] = '// Section 2';
		lines[102] = '// ==========';

		const model = new TestSectionHeaderFinderTarget(lines);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^\/\/ =+\\n^\/\/ (?<label>[^\\n]+?)\\n^\/\/ =+$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 2);

		assert.strictEqual(headers[0].text, 'Section 1');
		assert.strictEqual(headers[0].range.startLineNumber, 98);
		assert.strictEqual(headers[0].range.endLineNumber, 100);

		assert.strictEqual(headers[1].text, 'Section 2');
		assert.strictEqual(headers[1].range.startLineNumber, 101);
		assert.strictEqual(headers[1].range.endLineNumber, 103);
	});

	test('handles empty regex gracefully without infinite loop', () => {
		const model = new TestSectionHeaderFinderTarget([
			'line 1',
			'line 2',
			'line 3'
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '' // Empty string that would cause infinite loop
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 0, 'Should return no headers for empty regex');
	});

	test('handles whitespace-only regex gracefully without infinite loop', () => {
		const model = new TestSectionHeaderFinderTarget([
			'line 1',
			'line 2',
			'line 3'
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '   ' // Whitespace that would cause infinite loop
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 0, 'Should return no headers for whitespace-only regex');
	});

	test('correctly advances past matches without infinite loop', () => {
		const model = new TestSectionHeaderFinderTarget([
			'// ==========',
			'// Section 1',
			'// ==========',
			'some code',
			'// ==========',
			'// Section 2',
			'// ==========',
			'more code',
			'// ==========',
			'// Section 3',
			'// ==========',
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^\/\/ =+\\n^\/\/ (?<label>[^\\n]+?)\\n^\/\/ =+$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 3, 'Should find all three section headers');
		assert.strictEqual(headers[0].text, 'Section 1');
		assert.strictEqual(headers[1].text, 'Section 2');
		assert.strictEqual(headers[2].text, 'Section 3');
	});

	test('handles consecutive section headers correctly', () => {
		const model = new TestSectionHeaderFinderTarget([
			'// ==========',
			'// Section 1',
			'// ==========',
			'// ==========', // This line is both the end of Section 1 and start of Section 2
			'// Section 2',
			'// ==========',
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^\/\/ =+\\n^\/\/ (?<label>[^\\n]+?)\\n^\/\/ =+$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 2, 'Should find both section headers');
		assert.strictEqual(headers[0].text, 'Section 1');
		assert.strictEqual(headers[1].text, 'Section 2');
	});

	test('handles nested separators correctly', () => {
		const model = new TestSectionHeaderFinderTarget([
			'// ==============',
			'// Major Section',
			'// ==============',
			'',
			'// ----------',
			'// Subsection',
			'// ----------',
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^\/\/ [-=]+\\n^\/\/ (?<label>[^\\n]+?)\\n^\/\/ [-=]+$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 2, 'Should find both section headers');
		assert.strictEqual(headers[0].text, 'Major Section');
		assert.strictEqual(headers[1].text, 'Subsection');
	});

	test('handles section headers at chunk boundaries correctly', () => {
		const lines: string[] = [];
		// Fill up to near the chunk boundary (chunk size is 100)
		for (let i = 0; i < 97; i++) {
			lines.push(`line ${i}`);
		}

		// Add a section header that would cross the chunk boundary
		lines.push('// ==========');  // line 97
		lines.push('// Section 1'); // line 98
		lines.push('// =========='); // line 99
		lines.push('// =========='); // line 100 (chunk boundary)
		lines.push('// Section 2'); // line 101
		lines.push('// =========='); // line 102

		// Add more content after
		for (let i = 103; i < 150; i++) {
			lines.push(`line ${i}`);
		}

		const model = new TestSectionHeaderFinderTarget(lines);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^\/\/ =+\\n^\/\/ (?<label>[^\\n]+?)\\n^\/\/ =+$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 2, 'Should find both section headers across chunk boundary');

		assert.strictEqual(headers[0].text, 'Section 1');
		assert.strictEqual(headers[0].range.startLineNumber, 98);
		assert.strictEqual(headers[0].range.endLineNumber, 100);

		assert.strictEqual(headers[1].text, 'Section 2');
		assert.strictEqual(headers[1].range.startLineNumber, 101);
		assert.strictEqual(headers[1].range.endLineNumber, 103);
	});

	test('handles overlapping section headers without duplicates', () => {
		const model = new TestSectionHeaderFinderTarget([
			'// ==========',  // Line 1
			'// Section 1',   // Line 2 - This is part of first header
			'// ==========',  // Line 3 - This is the end of first
			'// Section 2',   // Line 4 - This is not a header
			'// ==========',  // Line 5
			'// ==========',  // Line 6 - Start of second header
			'// Section 3',   // Line 7
			'// ==========='  // Line 8
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^\/\/ =+\\n^\/\/ (?<label>[^\\n]+?)\\n^\/\/ =+$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 2);

		assert.strictEqual(headers[0].text, 'Section 1');
		assert.strictEqual(headers[0].range.startLineNumber, 1);
		assert.strictEqual(headers[0].range.endLineNumber, 3);

		// assert.strictEqual(headers[1].text, 'Section 2');
		// assert.strictEqual(headers[1].range.startLineNumber, 3);
		// assert.strictEqual(headers[1].range.endLineNumber, 5);

		assert.strictEqual(headers[1].text, 'Section 3');
		assert.strictEqual(headers[1].range.startLineNumber, 6);
		assert.strictEqual(headers[1].range.endLineNumber, 8);
	});

	test('handles partially overlapping multiline section headers correctly', () => {
		const model = new TestSectionHeaderFinderTarget([
			'// ================',  // Line 1
			'// Major Section 1',   // Line 2
			'// ================',  // Line 3
			'// --------',         // Line 4 - Start of subsection that overlaps with end of major section
			'// Subsection 1.1',   // Line 5
			'// --------',         // Line 6
			'// ================',  // Line 7
			'// Major Section 2',   // Line 8
			'// ================',  // Line 9
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^\/\/ [-=]+\\n^\/\/ (?<label>[^\\n]+?)\\n^\/\/ [-=]+$'
		};

		const headers = findSectionHeaders(model, options);
		assert.strictEqual(headers.length, 3);

		assert.strictEqual(headers[0].text, 'Major Section 1');
		assert.strictEqual(headers[0].range.startLineNumber, 1);
		assert.strictEqual(headers[0].range.endLineNumber, 3);

		assert.strictEqual(headers[1].text, 'Subsection 1.1');
		assert.strictEqual(headers[1].range.startLineNumber, 4);
		assert.strictEqual(headers[1].range.endLineNumber, 6);

		assert.strictEqual(headers[2].text, 'Major Section 2');
		assert.strictEqual(headers[2].range.startLineNumber, 7);
		assert.strictEqual(headers[2].range.endLineNumber, 9);
	});

	test('strips the block comment end token from mark section header labels', () => {
		const model = new TestSectionHeaderFinderTarget([
			'<!-- MARK: Html Section -->',
			'/* MARK: - C Section */',
			'<!-- MARK: Spaced Section   -->   ',
			'<!-- MARK: -->',
			'<!-- MARK: - -->',
			'// MARK: Line Comment Section */ trailing',
			'// MARK: Regex /foo.*/',
			'/* closed */ // MARK: After Closed Comment */',
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '\\bMARK:\\s*(?<separator>\\-?)\\s*(?<label>.*)$',
			blockCommentStartToken: '<!--',
			blockCommentEndToken: '-->'
		};

		const htmlHeaders = findSectionHeaders(model, options).map(h => ({ line: h.range.startLineNumber, text: h.text, hasSeparatorLine: h.hasSeparatorLine }));
		const cHeaders = findSectionHeaders(model, { ...options, blockCommentStartToken: '/*', blockCommentEndToken: '*/' }).map(h => ({ line: h.range.startLineNumber, text: h.text, hasSeparatorLine: h.hasSeparatorLine }));

		assert.deepStrictEqual({ htmlHeaders, cHeaders }, {
			htmlHeaders: [
				{ line: 1, text: 'Html Section', hasSeparatorLine: false },
				{ line: 2, text: 'C Section */', hasSeparatorLine: true },
				{ line: 3, text: 'Spaced Section', hasSeparatorLine: false },
				{ line: 5, text: '', hasSeparatorLine: true },
				{ line: 6, text: 'Line Comment Section */ trailing', hasSeparatorLine: false },
				{ line: 7, text: 'Regex /foo.*/', hasSeparatorLine: false },
				{ line: 8, text: 'After Closed Comment */', hasSeparatorLine: false },
			],
			cHeaders: [
				{ line: 1, text: 'Html Section -->', hasSeparatorLine: false },
				{ line: 2, text: 'C Section', hasSeparatorLine: true },
				{ line: 3, text: 'Spaced Section   -->   ', hasSeparatorLine: false },
				{ line: 4, text: '->', hasSeparatorLine: true },
				{ line: 5, text: '-->', hasSeparatorLine: true },
				{ line: 6, text: 'Line Comment Section */ trailing', hasSeparatorLine: false },
				{ line: 7, text: 'Regex /foo.*/', hasSeparatorLine: false },
				{ line: 8, text: 'After Closed Comment */', hasSeparatorLine: false },
			]
		});
	});

	test('keeps the separator when the block comment end token is split across the separator and the label', () => {
		const model = new TestSectionHeaderFinderTarget([
			'<!-- MARK: - -->',
			'<!-- MARK: -->',
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '\\bMARK:\\s*(?<separator>[- ]*)\\s*(?<label>.*)$',
			blockCommentStartToken: '<!--',
			blockCommentEndToken: '-->'
		};

		assert.deepStrictEqual(
			findSectionHeaders(model, options).map(h => ({ line: h.range.startLineNumber, text: h.text, hasSeparatorLine: h.hasSeparatorLine })),
			[{ line: 1, text: '', hasSeparatorLine: true }]
		);
	});

	test('determines the block comment context from the captured text', () => {
		const model = new TestSectionHeaderFinderTarget([
			'<!-- MARK: Section -->',
			'<!-- MARK: - -> -->',
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '^<!--\\s*MARK:\\s*(?<label>.*)$',
			blockCommentStartToken: '<!--',
			blockCommentEndToken: '-->'
		};
		const nonContiguousOptions: FindSectionHeaderOptions = {
			...options,
			markSectionHeaderRegex: '\\bMARK:\\s*(?<separator>-?)\\s*(?<label>.*?)\\s*-->$'
		};

		assert.deepStrictEqual({
			commentStartInRegex: findSectionHeaders(model, options).map(h => ({ text: h.text, hasSeparatorLine: h.hasSeparatorLine })),
			nonContiguousCaptures: findSectionHeaders(model, nonContiguousOptions).map(h => ({ text: h.text, hasSeparatorLine: h.hasSeparatorLine })),
		}, {
			commentStartInRegex: [
				{ text: 'Section', hasSeparatorLine: false },
				{ text: '- ->', hasSeparatorLine: false },
			],
			nonContiguousCaptures: [
				{ text: 'Section', hasSeparatorLine: false },
				{ text: '->', hasSeparatorLine: true },
			]
		});
	});

	test('supports identical block comment start and end tokens', () => {
		const model = new TestSectionHeaderFinderTarget([
			'""" MARK: Doc Section """',
			'"""closed""" # MARK: Quote """',
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '\\bMARK:\\s*(?<separator>\\-?)\\s*(?<label>.*)$',
			blockCommentStartToken: '"""',
			blockCommentEndToken: '"""'
		};

		assert.deepStrictEqual(findSectionHeaders(model, options).map(h => h.text), ['Doc Section', 'Quote """']);
	});

	test('keeps mark section header labels without block comment tokens unchanged', () => {
		const model = new TestSectionHeaderFinderTarget([
			'<!-- MARK: Html Section -->',
		]);

		const options: FindSectionHeaderOptions = {
			findRegionSectionHeaders: false,
			findMarkSectionHeaders: true,
			markSectionHeaderRegex: '\\bMARK:\\s*(?<separator>\\-?)\\s*(?<label>.*)$'
		};
		const customRegexOptions: FindSectionHeaderOptions = {
			...options,
			markSectionHeaderRegex: '\\bMARK:\\s*(?<label>\\w+ \\w+)',
			blockCommentStartToken: '<!--',
			blockCommentEndToken: '-->'
		};

		assert.deepStrictEqual({
			withoutTokens: findSectionHeaders(model, options).map(h => h.text),
			customRegex: findSectionHeaders(model, customRegexOptions).map(h => h.text),
		}, {
			withoutTokens: ['Html Section -->'],
			customRegex: ['Html Section'],
		});
	});

	test('takes region section header labels from the `label` group of the folding start marker', () => {
		const findRegionHeaders = (lines: string[], start: string) => findSectionHeaders(new TestSectionHeaderFinderTarget(lines), {
			findRegionSectionHeaders: true,
			findMarkSectionHeaders: false,
			markSectionHeaderRegex: '',
			foldingRules: { markers: { start: new RegExp(start), end: /^$/ } },
		}).map(h => ({ text: h.text, line: h.range.startLineNumber, startColumn: h.range.startColumn, endColumn: h.range.endColumn }));

		assert.deepStrictEqual({
			html: findRegionHeaders([
				'<!-- #region Html Section -->',
				'<!-- #region -->',
				'  <!--#region Indented-->',
			], '^\\s*<!--\\s*#?region\\b\\s*(?<label>.*?)\\s*-->'),
			css: findRegionHeaders([
				'/* #region Css Section */',
				'/* #region */',
			], '^\\s*\\/\\*\\s*#region\\b\\s*(?<label>.*?)\\s*\\*\\/'),
			typescript: findRegionHeaders([
				'// #region Ts Section',
				'// #region',
			], '^\\s*//\\s*#?region\\b'),
		}, {
			html: [
				{ text: 'Html Section', line: 1, startColumn: 14, endColumn: 26 },
				{ text: 'Indented', line: 3, startColumn: 15, endColumn: 23 },
			],
			css: [{ text: 'Css Section', line: 1, startColumn: 12, endColumn: 23 }],
			typescript: [{ text: 'Ts Section', line: 1, startColumn: 11, endColumn: 22 }],
		});
	});
});

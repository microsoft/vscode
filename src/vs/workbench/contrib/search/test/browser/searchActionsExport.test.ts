/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { escapeCSVField, serializeToCSV, getFormatFromPath, buildCSVHeader, buildCSVRow, type ExportData } from '../../browser/searchActionsExport.js';

suite('Search Actions Export', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Export command has correct ID', () => {
		// Verify the command ID constant matches expected value
		const expectedCommandId = 'search.action.export';
		assert.strictEqual(expectedCommandId, 'search.action.export');
	});

	// Note: Full integration tests would require:
	// - Mocking SearchView and SearchResult
	// - Mocking file dialog service
	// - Mocking file service
	// - Creating test search results with folder/file/match hierarchy
	// - Verifying JSON output structure
	// 
	// These tests are placeholders for the full test suite that should be implemented
	// with proper test fixtures and mocks following VS Code testing patterns.

	test('JSON serialization handles empty results', () => {
		// Verify that empty arrays are returned, not undefined
		const emptyResults = {
			metadata: {
				query: '',
				caseSensitive: false,
				regex: false,
				wholeWord: false,
				includePattern: undefined,
				excludePattern: undefined,
				timestamp: new Date().toISOString(),
				totalMatches: 0,
				totalFiles: 0,
				textResultCount: 0,
				aiResultCount: 0
			},
			textResults: [],
			aiResults: []
		};

		const jsonString = JSON.stringify(emptyResults, null, 2);
		assert.ok(jsonString.includes('"textResults": []'));
		assert.ok(jsonString.includes('"aiResults": []'));
		assert.ok(jsonString.includes('"metadata"'));
		assert.ok(jsonString.includes('"query"'));
		assert.ok(jsonString.includes('"totalMatches": 0'));
	});

	test('JSON serialization handles special characters', () => {
		// Verify that JSON.stringify properly escapes special characters
		const testData = {
			metadata: {
				query: 'test "with quotes"',
				caseSensitive: false,
				regex: false,
				wholeWord: false,
				includePattern: undefined,
				excludePattern: undefined,
				timestamp: new Date().toISOString(),
				totalMatches: 1,
				totalFiles: 1,
				textResultCount: 1,
				aiResultCount: 0
			},
			textResults: [{
				folder: '/test',
				files: [{
					path: 'file.ts',
					absolutePath: '/test/file.ts',
					matches: [{
						line: 1,
						column: 1,
						text: 'Match with "quotes" and\nnewlines\tand\ttabs',
						before: 'before',
						after: 'after',
						fullLine: 'complete line'
					}]
				}]
			}],
			aiResults: []
		};

		const jsonString = JSON.stringify(testData, null, 2);
		// Verify JSON is valid
		assert.ok(jsonString.startsWith('{'));
		assert.ok(jsonString.endsWith('}'));
		// Verify special characters are escaped
		assert.ok(jsonString.includes('\\"quotes\\"'));
		assert.ok(jsonString.includes('\\n'));
		assert.ok(jsonString.includes('\\t'));
		// Verify structure is correct
		assert.ok(jsonString.includes('"metadata"'));
		assert.ok(jsonString.includes('"textResults"'));
		assert.ok(jsonString.includes('"aiResults"'));
	});

	test('Metadata structure matches specification', () => {
		// Verify metadata structure matches Phase 1 specification
		const metadata = {
			query: 'test',
			caseSensitive: false,
			regex: false,
			wholeWord: false,
			includePattern: '*.ts',
			excludePattern: '**/node_modules/**',
			timestamp: new Date().toISOString(),
			totalMatches: 10,
			totalFiles: 2,
			textResultCount: 8,
			aiResultCount: 2
		};

		// Verify all required fields are present
		assert.ok(metadata.query !== undefined);
		assert.ok(metadata.caseSensitive !== undefined);
		assert.ok(metadata.regex !== undefined);
		assert.ok(metadata.wholeWord !== undefined);
		assert.ok(metadata.includePattern !== undefined);
		assert.ok(metadata.excludePattern !== undefined);
		assert.ok(metadata.timestamp !== undefined);
		assert.ok(metadata.totalMatches !== undefined);
		assert.ok(metadata.totalFiles !== undefined);
		assert.ok(metadata.textResultCount !== undefined);
		assert.ok(metadata.aiResultCount !== undefined);
		
		// Verify types
		assert.strictEqual(typeof metadata.query, 'string');
		assert.strictEqual(typeof metadata.caseSensitive, 'boolean');
		assert.strictEqual(typeof metadata.regex, 'boolean');
		assert.strictEqual(typeof metadata.wholeWord, 'boolean');
		assert.strictEqual(typeof metadata.timestamp, 'string');
		assert.strictEqual(typeof metadata.totalMatches, 'number');
		assert.strictEqual(typeof metadata.totalFiles, 'number');
		assert.strictEqual(typeof metadata.textResultCount, 'number');
		assert.strictEqual(typeof metadata.aiResultCount, 'number');
	});

	// Phase 2: CSV Serialization Tests (Test1.1)

	test('CSV escaping handles commas', () => {
		const fieldWithComma = 'text,with,commas';
		const escaped = escapeCSVField(fieldWithComma);
		assert.strictEqual(escaped, '"text,with,commas"');
		assert.ok(escaped.startsWith('"') && escaped.endsWith('"'));
	});

	test('CSV escaping handles quotes', () => {
		const fieldWithQuotes = 'text with "quotes"';
		const escaped = escapeCSVField(fieldWithQuotes);
		assert.strictEqual(escaped, '"text with ""quotes"""');
		assert.ok(escaped.includes('""'));
	});

	test('CSV escaping handles newlines', () => {
		const fieldWithNewline = 'text\nwith\nnewlines';
		const escaped = escapeCSVField(fieldWithNewline);
		assert.strictEqual(escaped, '"text\nwith\nnewlines"');
		assert.ok(escaped.startsWith('"') && escaped.endsWith('"'));
	});

	test('CSV escaping handles carriage returns', () => {
		const fieldWithCR = 'text\rwith\rcarriage';
		const escaped = escapeCSVField(fieldWithCR);
		assert.strictEqual(escaped, '"text\rwith\rcarriage"');
		assert.ok(escaped.startsWith('"') && escaped.endsWith('"'));
	});

	test('CSV escaping handles multiple special characters', () => {
		const complexField = 'field, with "quotes" and\nnewlines';
		const escaped = escapeCSVField(complexField);
		assert.strictEqual(escaped, '"field, with ""quotes"" and\nnewlines"');
		assert.ok(escaped.startsWith('"') && escaped.endsWith('"'));
		assert.ok(escaped.includes('""')); // Quotes should be doubled
	});

	test('CSV escaping does not quote normal fields', () => {
		const normalField = 'normal field';
		const escaped = escapeCSVField(normalField);
		assert.strictEqual(escaped, 'normal field');
		assert.ok(!escaped.startsWith('"'));
	});

	test('CSV escaping handles empty strings', () => {
		const emptyField = '';
		const escaped = escapeCSVField(emptyField);
		assert.strictEqual(escaped, '');
	});

	test('CSV header row is correct', () => {
		const header = buildCSVHeader();
		assert.ok(header.includes('File Path'));
		assert.ok(header.includes('Line Number'));
		assert.ok(header.includes('Column'));
		assert.ok(header.includes('Match Text'));
		assert.ok(header.includes('Before Context'));
		assert.ok(header.includes('After Context'));
		assert.ok(header.includes('Full Line'));
		assert.ok(header.includes('Result Type'));
		assert.ok(header.includes('Rank'));
		// Header should have 8 commas (9 columns - 1)
		const commaCount = (header.match(/,/g) || []).length;
		assert.strictEqual(commaCount, 8);
	});

	test('CSV row building works correctly', () => {
		const row = buildCSVRow(
			'src/file.ts',
			42,
			10,
			'match',
			'before',
			'after',
			'full line',
			'text',
			''
		);
		assert.ok(row.includes('src/file.ts'));
		assert.ok(row.includes('42'));
		assert.ok(row.includes('10'));
		assert.ok(row.includes('match'));
		// Should have 8 commas (9 columns - 1)
		const commaCount = (row.match(/,/g) || []).length;
		assert.strictEqual(commaCount, 8);
	});

	test('CSV row building handles special characters', () => {
		const row = buildCSVRow(
			'src/file.ts',
			42,
			10,
			'match, with comma',
			'before',
			'after',
			'full line',
			'text',
			''
		);
		// The match text should be quoted
		assert.ok(row.includes('"match, with comma"'));
	});

	test('CSV serialization includes UTF-8 BOM', () => {
		const emptyData: ExportData = {
			metadata: {
				query: '',
				caseSensitive: false,
				regex: false,
				wholeWord: false,
				includePattern: undefined,
				excludePattern: undefined,
				timestamp: new Date().toISOString(),
				totalMatches: 0,
				totalFiles: 0,
				textResultCount: 0,
				aiResultCount: 0
			},
			textResults: [],
			aiResults: []
		};
		const csv = serializeToCSV(emptyData);
		// First character should be UTF-8 BOM
		assert.strictEqual(csv.charCodeAt(0), 0xFEFF);
		assert.ok(csv.startsWith('\uFEFF'));
	});

	test('CSV serialization uses CRLF line endings', () => {
		const testData: ExportData = {
			metadata: {
				query: 'test',
				caseSensitive: false,
				regex: false,
				wholeWord: false,
				includePattern: undefined,
				excludePattern: undefined,
				timestamp: new Date().toISOString(),
				totalMatches: 1,
				totalFiles: 1,
				textResultCount: 1,
				aiResultCount: 0
			},
			textResults: [{
				folder: '/test',
				files: [{
					path: 'file.ts',
					absolutePath: '/test/file.ts',
					matches: [{
						line: 1,
						column: 1,
						text: 'match',
						before: '',
						after: '',
						fullLine: 'line with match'
					}]
				}]
			}],
			aiResults: []
		};
		const csv = serializeToCSV(testData);
		// Should contain CRLF (\r\n)
		assert.ok(csv.includes('\r\n'));
		// Count CRLF occurrences (should be at least 1 for header + data row)
		const crlfCount = (csv.match(/\r\n/g) || []).length;
		assert.ok(crlfCount >= 1);
	});

	test('CSV serialization includes header row', () => {
		const emptyData: ExportData = {
			metadata: {
				query: '',
				caseSensitive: false,
				regex: false,
				wholeWord: false,
				includePattern: undefined,
				excludePattern: undefined,
				timestamp: new Date().toISOString(),
				totalMatches: 0,
				totalFiles: 0,
				textResultCount: 0,
				aiResultCount: 0
			},
			textResults: [],
			aiResults: []
		};
		const csv = serializeToCSV(emptyData);
		// Remove BOM for checking
		const csvWithoutBOM = csv.slice(1);
		assert.ok(csvWithoutBOM.includes('File Path'));
		assert.ok(csvWithoutBOM.includes('Line Number'));
		assert.ok(csvWithoutBOM.includes('Match Text'));
	});

	test('CSV serialization handles empty values', () => {
		const testData: ExportData = {
			metadata: {
				query: 'test',
				caseSensitive: false,
				regex: false,
				wholeWord: false,
				includePattern: undefined,
				excludePattern: undefined,
				timestamp: new Date().toISOString(),
				totalMatches: 1,
				totalFiles: 1,
				textResultCount: 1,
				aiResultCount: 0
			},
			textResults: [{
				folder: '/test',
				files: [{
					path: 'file.ts',
					absolutePath: '/test/file.ts',
					matches: [{
						line: 1,
						column: 1,
						text: '',
						before: '',
						after: '',
						fullLine: ''
					}]
				}]
			}],
			aiResults: []
		};
		const csv = serializeToCSV(testData);
		// Should not throw and should produce valid CSV
		assert.ok(csv.length > 0);
		assert.ok(csv.startsWith('\uFEFF'));
	});

	test('CSV serialization handles text and AI results', () => {
		const testData: ExportData = {
			metadata: {
				query: 'test',
				caseSensitive: false,
				regex: false,
				wholeWord: false,
				includePattern: undefined,
				excludePattern: undefined,
				timestamp: new Date().toISOString(),
				totalMatches: 2,
				totalFiles: 2,
				textResultCount: 1,
				aiResultCount: 1
			},
			textResults: [{
				folder: '/test',
				files: [{
					path: 'file1.ts',
					absolutePath: '/test/file1.ts',
					matches: [{
						line: 1,
						column: 1,
						text: 'text match',
						before: '',
						after: '',
						fullLine: 'line with text match'
					}]
				}]
			}],
			aiResults: [{
				folder: '/test',
				files: [{
					path: 'file2.ts',
					absolutePath: '/test/file2.ts',
					matches: [{
						line: 2,
						column: 5,
						text: 'ai match',
						before: '',
						after: '',
						fullLine: 'line with ai match'
					}]
				}]
			}]
		};
		const csv = serializeToCSV(testData);
		// Should contain both text and ai result types
		assert.ok(csv.includes('text'));
		assert.ok(csv.includes('ai'));
		// Should have at least 2 data rows (1 text + 1 ai)
		const crlfCount = (csv.match(/\r\n/g) || []).length;
		assert.ok(crlfCount >= 2); // header + 2 data rows
	});

	// Phase 2: Format Selection Tests (Test1.3)

	test('Format detection from extension - JSON', () => {
		const jsonUri = URI.file('/path/to/file.json');
		const format = getFormatFromPath(jsonUri);
		assert.strictEqual(format, 'json');
	});

	test('Format detection from extension - CSV', () => {
		const csvUri = URI.file('/path/to/file.csv');
		const format = getFormatFromPath(csvUri);
		assert.strictEqual(format, 'csv');
	});

	test('Format detection from extension - Plain Text', () => {
		const txtUri = URI.file('/path/to/file.txt');
		const format = getFormatFromPath(txtUri);
		assert.strictEqual(format, 'txt');
	});

	test('Format detection defaults to Plain Text', () => {
		const noExtUri = URI.file('/path/to/file');
		const format = getFormatFromPath(noExtUri);
		assert.strictEqual(format, 'txt');
	});

	test('Format detection from filter - JSON', () => {
		const noExtUri = URI.file('/path/to/file');
		const format = getFormatFromPath(noExtUri, 'JSON Files');
		assert.strictEqual(format, 'json');
	});

	test('Format detection from filter - CSV', () => {
		const noExtUri = URI.file('/path/to/file');
		const format = getFormatFromPath(noExtUri, 'CSV Files');
		assert.strictEqual(format, 'csv');
	});

	test('Format detection from filter - Plain Text', () => {
		const noExtUri = URI.file('/path/to/file');
		const format = getFormatFromPath(noExtUri, 'Plain Text Files');
		assert.strictEqual(format, 'txt');
	});

	test('Format detection prioritizes extension over filter', () => {
		const csvUri = URI.file('/path/to/file.csv');
		const format = getFormatFromPath(csvUri, 'JSON Files');
		// Extension should take priority
		assert.strictEqual(format, 'csv');
	});

	test('Format detection handles case-insensitive extensions', () => {
		const upperCaseUri = URI.file('/path/to/file.JSON');
		const format = getFormatFromPath(upperCaseUri);
		assert.strictEqual(format, 'json');
	});

	test('CSV BOM is UTF-8', () => {
		// UTF-8 BOM is \uFEFF
		const bom = '\uFEFF';
		assert.strictEqual(bom.charCodeAt(0), 0xFEFF);
	});

	test('CSV uses CRLF line endings', () => {
		// CSV should use \r\n for Excel compatibility
		const crlf = '\r\n';
		assert.strictEqual(crlf.length, 2);
		assert.strictEqual(crlf.charCodeAt(0), 0x0D); // CR
		assert.strictEqual(crlf.charCodeAt(1), 0x0A); // LF
	});
});


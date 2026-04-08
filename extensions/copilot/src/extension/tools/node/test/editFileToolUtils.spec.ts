/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { homedir } from 'os';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { IAlternativeNotebookContentService } from '../../../../platform/notebook/common/alternativeContent';
import { MockAlternativeNotebookContentService } from '../../../../platform/notebook/common/mockAlternativeContentService';
import { INotebookService } from '../../../../platform/notebook/common/notebookService';
import { MockCustomInstructionsService } from '../../../../platform/test/common/testCustomInstructionsService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { WorkspaceEdit as WorkspaceEditShim } from '../../../../util/common/test/shims/editing';
import { createTextDocumentData, IExtHostDocumentData, setDocText } from '../../../../util/common/test/shims/textDocument';
import { isMacintosh } from '../../../../util/vs/base/common/platform';
import { URI } from '../../../../util/vs/base/common/uri';
import { WorkspaceEdit } from '../../../../vscodeTypes';
import { applyEdits as applyTextEdits } from '../../../prompt/node/intents';
import { applyEdit, assertPathIsSafe, ConfirmationCheckResult, ContentFormatError, makeUriConfirmationChecker, MultipleMatchesError, NoChangeError, NoMatchError, setSimilarityMatchThresholdForTests } from '../editFileToolUtils';

describe('replace_string_in_file - applyEdit', () => {
	let workspaceEdit: WorkspaceEdit;
	let workspaceService: TestWorkspaceService;
	let notebookService: { hasSupportedNotebooks: (uri: URI) => boolean };
	let alternatveContentService: IAlternativeNotebookContentService;
	let doc: IExtHostDocumentData;

	async function doApplyEdit(oldString: string, newString: string, uri = doc.document.uri) {
		const r = await applyEdit(uri, oldString, newString, workspaceService, notebookService as INotebookService, alternatveContentService, undefined);
		workspaceEdit.set(uri, r.edits);
		return r;
	}

	function setText(value: string) {
		setDocText(doc, value);
	}

	beforeEach(() => {
		doc = createTextDocumentData(URI.file('/my/file.ts'), '', 'ts');
		workspaceEdit = new WorkspaceEditShim() as any;
		workspaceService = new TestWorkspaceService([], [doc.document]);
		notebookService = { hasSupportedNotebooks: () => false };
		alternatveContentService = new MockAlternativeNotebookContentService();
	});

	test('simple verbatim', async () => {
		setText('this is an oldString!');
		const result = await doApplyEdit('oldString', 'newString');
		expect(result.updatedFile).toBe('this is an newString!');
	});

	test('exact match - single occurrence', async () => {
		setText('function hello() {\n\tconsole.log("world");\n}');
		const result = await doApplyEdit('console.log("world");', 'console.log("hello world");');
		expect(result.updatedFile).toBe('function hello() {\n\tconsole.log("hello world");\n}');
	});

	test('exact match - with newlines', async () => {
		setText('line1\nline2\nline3');
		const result = await doApplyEdit('line1\nline2', 'newline1\nnewline2');
		expect(result.updatedFile).toBe('newline1\nnewline2\nline3');
	});

	test('multiple exact matches - should throw error', async () => {
		setText('test\ntest\nother');
		await expect(doApplyEdit('test', 'replacement')).rejects.toThrow(MultipleMatchesError);
	});

	test('whitespace flexible matching - different indentation', async () => {
		setText('function test() {\n    console.log("hello");\n}');
		// Use the exact text from the file for this test
		const result = await doApplyEdit('    console.log("hello");', '\tconsole.log("hi");');
		expect(result.updatedFile).toBe('function test() {\n\tconsole.log("hi");\n}');
	});

	test('whitespace flexible matching - trailing spaces', async () => {
		setText('line1   \nline2\nline3');
		const result = await doApplyEdit('line1\nline2', 'newline1\nnewline2');
		expect(result.updatedFile).toBe('newline1\nnewline2\nline3');
	});

	test('fuzzy matching - with trailing whitespace variations', async () => {
		setText('if (condition) {\n\treturn true; \n}');
		const result = await doApplyEdit('if (condition) {\n\treturn true;\n}', 'if (condition) {\n\treturn false;\n}');
		expect(result.updatedFile).toBe('if (condition) {\n\treturn false;\n}');
	});

	test('no match found - should throw error', async () => {
		setText('some text here');
		await expect(doApplyEdit('nonexistent', 'replacement')).rejects.toThrow(NoMatchError);
	});

	test('empty old string - create new file', async () => {
		setText('');
		const result = await doApplyEdit('', 'new content');
		expect(result.updatedFile).toBe('new content');
	});

	test('empty old string on existing file - should throw error', async () => {
		setText('existing content');
		await expect(doApplyEdit('', 'new content')).rejects.toThrow(ContentFormatError);
	});

	test('delete text - empty new string', async () => {
		setText('before\nto delete\nafter');
		const result = await doApplyEdit('to delete\n', '');
		expect(result.updatedFile).toBe('before\nafter');
	});

	test('delete text - exact match without newline', async () => {
		setText('before to delete after');
		const result = await doApplyEdit('to delete ', '');
		expect(result.updatedFile).toBe('before after');
	});

	test('no change - identical strings should throw error', async () => {
		setText('unchanged text');
		await expect(doApplyEdit('unchanged text', 'unchanged text')).rejects.toThrow(NoChangeError);
	});

	test('replace entire content', async () => {
		setText('old content\nwith multiple lines');
		const result = await doApplyEdit('old content\nwith multiple lines', 'completely new content');
		expect(result.updatedFile).toBe('completely new content');
	});

	test('replace with multiline content', async () => {
		setText('single line');
		const result = await doApplyEdit('single line', 'line1\nline2\nline3');
		expect(result.updatedFile).toBe('line1\nline2\nline3');
	});

	test('case sensitive matching', async () => {
		setText('Hello World');
		await expect(doApplyEdit('hello world', 'Hi World')).rejects.toThrow(NoMatchError);
	});

	test('special regex characters in search string', async () => {
		setText('price is $10.99 (discount)');
		const result = await doApplyEdit('$10.99 (discount)', '$9.99 (sale)');
		expect(result.updatedFile).toBe('price is $9.99 (sale)');
	});

	test('unicode characters', async () => {
		setText('Hello 世界! 🌍');
		const result = await doApplyEdit('世界! 🌍', '世界! 🌎');
		expect(result.updatedFile).toBe('Hello 世界! 🌎');
	});

	test('very long strings', async () => {
		const longText = 'a'.repeat(1000) + 'middle' + 'b'.repeat(1000);
		setText(longText);
		const result = await doApplyEdit('middle', 'CENTER');
		expect(result.updatedFile).toBe('a'.repeat(1000) + 'CENTER' + 'b'.repeat(1000));
	});

	test('newline variations - CRLF to LF', async () => {
		setText('line1\r\nline2\r\nline3');
		const result = await doApplyEdit('line1\nline2', 'newline1\nnewline2');
		expect(result.updatedFile).toBe('newline1\nnewline2\nline3');
	});

	test('trailing newline handling', async () => {
		setText('content\nwith\nnewlines\n');
		const result = await doApplyEdit('content\nwith\n', 'new\ncontent\n');
		expect(result.updatedFile).toBe('new\ncontent\nnewlines\n');
	});

	test('similarity matching - high similarity content', async () => {
		// This tests the similarity matching as a fallback
		setText('function calculateTotal(items) {\n\tlet sum = 0;\n\tfor (let i = 0; i < items.length; i++) {\n\t\tsum += items[i].price;\n\t}\n\treturn sum;\n}');
		const result = await doApplyEdit(
			'function calculateTotal(items) {\n\tlet sum = 0;\n\tfor (let i = 0; i < items.length; i++) {\n\t\tsum += items[i].price;\n\t}\n\treturn sum;\n}',
			'function calculateTotal(items) {\n\treturn items.reduce((sum, item) => sum + item.price, 0);\n}'
		);
		expect(result.updatedFile).toBe('function calculateTotal(items) {\n\treturn items.reduce((sum, item) => sum + item.price, 0);\n}');
	});

	test('whitespace only differences', async () => {
		setText('function test() {\n    return true;\n}');
		// Use exact text from the file to test whitespace handling
		const result = await doApplyEdit('    return true;', '\treturn false;');
		expect(result.updatedFile).toBe('function test() {\n\treturn false;\n}');
	});

	test('mixed whitespace and content changes', async () => {
		setText('if (condition)   {\n  console.log("test");   \n}');
		// Use exact text matching the file content
		const result = await doApplyEdit('  console.log("test");   ', '\tconsole.log("updated");');
		expect(result.updatedFile).toBe('if (condition)   {\n\tconsole.log("updated");\n}');
	});

	test('empty lines handling', async () => {
		setText('line1\n\n\nline4');
		const result = await doApplyEdit('line1\n\n\nline4', 'line1\n\nline3\nline4');
		expect(result.updatedFile).toBe('line1\n\nline3\nline4');
	});

	test('partial line replacement', async () => {
		setText('const name = "old value";');
		const result = await doApplyEdit('"old value"', '"new value"');
		expect(result.updatedFile).toBe('const name = "new value";');
	});

	test('multiple line partial replacement', async () => {
		setText('function test() {\n\tconsole.log("debug");\n\treturn value;\n}');
		const result = await doApplyEdit('console.log("debug");\n\treturn value;', 'return newValue;');
		expect(result.updatedFile).toBe('function test() {\n\treturn newValue;\n}');
	});

	// Edge cases and error conditions
	test('error properties - NoMatchError', async () => {
		setText('some text');
		try {
			await doApplyEdit('missing', 'replacement');
		} catch (error) {
			expect(error).toBeInstanceOf(NoMatchError);
			expect(error.kindForTelemetry).toBe('noMatchFound');
			expect(error.file).toBe('file:///my/file.ts');
		}
	});

	test('error properties - MultipleMatchesError', async () => {
		setText('same\nsame\nother');
		try {
			await doApplyEdit('same', 'different');
		} catch (error) {
			expect(error).toBeInstanceOf(MultipleMatchesError);
			expect(error.kindForTelemetry).toBe('multipleMatchesFound');
			expect(error.file).toBe('file:///my/file.ts');
		}
	});

	test('error properties - NoChangeError', async () => {
		setText('test content');
		try {
			await doApplyEdit('test content', 'test content');
		} catch (error) {
			expect(error).toBeInstanceOf(NoChangeError);
			expect(error.kindForTelemetry).toBe('noChange');
			expect(error.file).toBe('file:///my/file.ts');
		}
	});

	test('error properties - ContentFormatError', async () => {
		setText('existing content');
		try {
			await doApplyEdit('', 'new content');
		} catch (error) {
			expect(error).toBeInstanceOf(ContentFormatError);
			expect(error.kindForTelemetry).toBe('contentFormatError');
			expect(error.file).toBe('file:///my/file.ts');
		}
	});

	test('very small strings', async () => {
		setText('a');
		const result = await doApplyEdit('a', 'b');
		expect(result.updatedFile).toBe('b');
	});

	test('empty file with empty replacement', async () => {
		setText('');
		const result = await doApplyEdit('', '');
		expect(result.updatedFile).toBe('');
	});

	test('single character replacement', async () => {
		setText('hello unique');
		const result = await doApplyEdit('unique', 'special');
		expect(result.updatedFile).toBe('hello special');
	});

	test('multiple single character matches - should throw error', async () => {
		setText('hello world');
		await expect(doApplyEdit('l', 'L')).rejects.toThrow(MultipleMatchesError);
	});

	test('replacement with same length', async () => {
		setText('old text here');
		const result = await doApplyEdit('old', 'new');
		expect(result.updatedFile).toBe('new text here');
	});

	test('replacement with longer text', async () => {
		setText('short');
		const result = await doApplyEdit('short', 'much longer text');
		expect(result.updatedFile).toBe('much longer text');
	});

	test('replacement with shorter text', async () => {
		setText('very long text here');
		const result = await doApplyEdit('very long text', 'short');
		expect(result.updatedFile).toBe('short here');
	});

	test('beginning of file replacement', async () => {
		setText('start of file\nrest of content');
		const result = await doApplyEdit('start of file', 'beginning');
		expect(result.updatedFile).toBe('beginning\nrest of content');
	});

	test('end of file replacement', async () => {
		setText('content here\nend of file');
		const result = await doApplyEdit('end of file', 'conclusion');
		expect(result.updatedFile).toBe('content here\nconclusion');
	});

	test('middle of line replacement', async () => {
		setText('prefix MIDDLE suffix');
		const result = await doApplyEdit('MIDDLE', 'center');
		expect(result.updatedFile).toBe('prefix center suffix');
	});

	test('multiple spaces preservation', async () => {
		setText('word1     word2');
		const result = await doApplyEdit('word1     word2', 'word1 word2');
		expect(result.updatedFile).toBe('word1 word2');
	});

	test('tab character replacement', async () => {
		setText('before\tafter');
		const result = await doApplyEdit('\t', '    ');
		expect(result.updatedFile).toBe('before    after');
	});

	test('mixed tabs and spaces', async () => {
		setText('function() {\n\t    mixed indentation\n}');
		const result = await doApplyEdit('\t    mixed indentation', '    proper indentation');
		expect(result.updatedFile).toBe('function() {\n    proper indentation\n}');
	});

	test('writes an empty file with LF', async () => {
		setText('');
		const result = await doApplyEdit('\n', 'hello world!');
		expect(result.updatedFile).toBe('hello world!');
	});

	test('return value structure', async () => {
		setText('old content');
		const result = await doApplyEdit('old', 'new');
		expect(result).toHaveProperty('patch');
		expect(result).toHaveProperty('updatedFile');
		expect(Array.isArray(result.patch)).toBe(true);
		expect(typeof result.updatedFile).toBe('string');
	});

	test('fixes bad newlines in issue #9753', async () => {
		const input = JSON.parse(fs.readFileSync(__dirname + '/editFileToolUtilsFixtures/crlf-input.json', 'utf8'));
		const output = JSON.parse(fs.readFileSync(__dirname + '/editFileToolUtilsFixtures/crlf-output.json', 'utf8')).join('\r\n');
		const toolCall = JSON.parse(fs.readFileSync(__dirname + '/editFileToolUtilsFixtures/crlf-tool-call.json', 'utf8'));

		const crlfDoc = createTextDocumentData(URI.file('/my/file2.ts'), input.join('\r\n'), 'ts', '\r\n');
		workspaceService.textDocuments.push(crlfDoc.document);

		const result = await doApplyEdit(toolCall.oldString, toolCall.newString, crlfDoc.document.uri);

		expect(result.updatedFile).toBe(output);
		expect(
			applyTextEdits(input.join('\r\n'), workspaceEdit.entries()[0][1])
		).toBe(output);
	});

	// Whitespace-flexible matching strategy tests
	// Note: Whitespace-flexible matching only triggers when:
	// 1. No exact match exists
	// 2. No fuzzy match exists (fuzzy allows trailing spaces but not leading/different indentation)
	// 3. Trimmed lines match exactly AND there's an empty line after the match
	describe('whitespace-flexible matching', () => {
		test('matches when file has empty line after content', async () => {
			// File has content followed by empty line, with varying indentation
			setText('function test() {\n  \tconsole.log("hello");\n\treturn true;\n\n}');
			// Search for content with trailing newline - the empty line in file will match the empty needle element
			const result = await doApplyEdit('console.log("hello");\nreturn true;\n', 'console.log("updated");\nreturn false;\n');
			expect(result.updatedFile).toContain('console.log("updated");');
			expect(result.updatedFile).toContain('return false;');
		});

		test('matches when indentation varies and empty line follows', async () => {
			setText('if (x) {\n\t\t  if (y) {\n    \t\tcode();\n\t  \t}\n\n}');
			// Empty line in file matches empty string in needle
			const result = await doApplyEdit('if (y) {\ncode();\n}\n', 'if (y) {\nupdated();\n}\n');
			expect(result.updatedFile).toContain('updated();');
		});

		test('throws error on multiple matches with empty lines', async () => {
			setText('function a() {\n  \treturn 1;\n\n}\nfunction b() {\n\t return 1;\n\n}');
			// Both functions have same content when trimmed, followed by empty lines
			await expect(doApplyEdit('return 1;\n', 'return 2;\n')).rejects.toThrow(MultipleMatchesError);
		});

		test('matches block with trailing empty line preserving structure', async () => {
			setText('class Test {\n\t  method() {\n  \t\tconst x = 1;\n\t    const y = 2;\n\n  \t}\n}');
			// Search with trailing newline to match the empty line
			const result = await doApplyEdit('const x = 1;\nconst y = 2;\n', 'const z = 3;\n');
			expect(result.updatedFile).toContain('const z = 3;');
			expect(result.updatedFile).toContain('class Test');
		});

		test('whitespace-flexible match minimizes edits with empty line', async () => {
			setText('function test() {\n  \tconst a = 1;\n\t  const b = 2;\n\n}');
			const result = await doApplyEdit('const a = 1;\nconst b = 2;\n', 'const a = 1;\nconst b = 3;\n');
			// Should preserve identical first line
			expect(result.edits.length).toBe(1);
			expect(result.updatedFile).toContain('const b = 3;');
		});

		test('empty line in haystack required for whitespace-flexible match', async () => {
			setText('line1\n  \tline2\n\n\t  line3');
			// Search with trailing newline - empty line in haystack matches empty needle element
			const result = await doApplyEdit('line1\nline2\n', 'new1\nnew2\n');
			expect(result.updatedFile).toContain('new1');
			expect(result.updatedFile).toContain('new2');
			expect(result.updatedFile).toContain('line3');
		});
	});

	// Similarity-based matching strategy tests
	describe('similarity matching', () => {
		test('matches highly similar content with minor differences', async () => {
			setText('function calculate(items) {\n\tlet total = 0;\n\tfor (let i = 0; i < items.length; i++) {\n\t\ttotal += items[i].price;\n\t}\n\treturn total;\n}');
			// Search string has slightly different variable name - 1 char diff in one place
			const result = await doApplyEdit(
				'function calculate(items) {\n\tlet total = 0;\n\tfor (let i = 0; i < items.length; i++) {\n\t\ttotal += items[i].pric;\n\t}\n\treturn total;\n}',
				'function calculate(items) {\n\treturn items.reduce((acc, item) => acc + item.price, 0);\n}'
			);
			expect(result.updatedFile).toBe('function calculate(items) {\n\treturn items.reduce((acc, item) => acc + item.price, 0);\n}');
		});

		test('similarity match with small typos in search string', async () => {
			setText('const message = "Hello, World!";\nconsole.log(message);');
			// Search has a typo but high similarity (95%+)
			const result = await doApplyEdit('const mesage = "Hello, World!";\nconsole.log(message);', 'const greeting = "Hi there!";\nconsole.log(greeting);');
			// Should find a match and replace
			expect(result.updatedFile).toContain('greeting');
		});

		test('similarity match does not trigger for low similarity', async () => {
			setText('function test() {\n\treturn true;\n}');
			// Very different content should not match
			await expect(doApplyEdit('completely different text here with no similarity at all to the original', 'replacement')).rejects.toThrow(NoMatchError);
		});

		test('similarity match prefers best match among candidates', async () => {
			setText('function a() {\n\tconst x = 1;\n\tconst y = 2;\n}\nfunction b() {\n\tconst x = 1;\n\tconst z = 3;\n}');
			// Should match function a (higher similarity with y vs z)
			const result = await doApplyEdit('function a() {\nconst x = 1;\nconst y = 2;\n}', 'function a() {\nconst result = 3;\n}');
			expect(result.updatedFile).toContain('const result = 3');
			expect(result.updatedFile).toContain('function b()'); // Second function unchanged
		});

		test('similarity match skips very large strings', async () => {
			// Similarity matching should skip strings > 1000 chars or > 20 lines
			const largeText = 'line\n'.repeat(50) + 'target line\n' + 'line\n'.repeat(50);
			setText(largeText);
			// Should fall back to exact/fuzzy matching instead of similarity
			const result = await doApplyEdit('target line', 'replaced line');
			expect(result.updatedFile).toContain('replaced line');
		});

		test('similarity match minimizes edits - preserves identical lines', async () => {
			setText('function test() {\n\tconst a = 1;\n\tconst b = 2;\n\tconst c = 3;\n}');
			const result = await doApplyEdit(
				'function test() {\n\tconst a = 1;\n\tconst x = 2;\n\tconst c = 3;\n}',
				'function test() {\n\tconst a = 1;\n\tconst y = 4;\n\tconst c = 3;\n}'
			);
			// Should preserve identical first and last lines
			expect(result.updatedFile).toContain('const a = 1');
			expect(result.updatedFile).toContain('const y = 4');
			expect(result.updatedFile).toContain('const c = 3');
		});

		test('similarity match with small content blocks', async () => {
			setText('const x = 1;\nconst y = 2;\nconst z = 3;');
			// Small similar block should match via similarity
			const result = await doApplyEdit('const x = 1;\nconst w = 2;', 'const a = 10;\nconst b = 20;');
			// Should match first two lines and replace them
			expect(result.updatedFile).toContain('const a = 10');
			expect(result.updatedFile).toContain('const b = 20');
		});

		describe('similarity match - edge cases for slice calculations', () => {
			let prev: number;
			beforeEach(() => {
				prev = setSimilarityMatchThresholdForTests(0.6);
			});

			afterEach(() => {
				setSimilarityMatchThresholdForTests(prev);
			});

			test('similarity match preserves lines after replacement when there are identical trailing lines', async () => {
				// This test checks for off-by-one errors in the slice calculation
				setText('function test() {\n\tconst a = 1;\n\tconst b = 2;\n\tconst c = 3;\n\tconst d = 4;\n}');
				// Search has identical first and last lines, different middle
				const result = await doApplyEdit(
					'function test() {\n\tconst a = 1;\n\tconst x = 2;\n\tconst y = 3;\n\tconst d = 4;\n}',
					'function test() {\n\tconst a = 1;\n\tconst newB = 20;\n\tconst newC = 30;\n\tconst d = 4;\n}'
				);
				// Should preserve the closing brace
				expect(result.updatedFile).toBe('function test() {\n\tconst a = 1;\n\tconst newB = 20;\n\tconst newC = 30;\n\tconst d = 4;\n}');
			});

			test('similarity match with multiple identical trailing lines', async () => {
				// Edge case that tests the slice calculation for multiple trailing lines
				// Use similar strings to meet the 60% threshold while ensuring window i=0 has best match
				setText('EXACT_START\nchange_me_1\nchange_me_2\nEXACT_END1\nEXACT_END2');
				// Window at i=0: EXACT_START (100%) + change_me_1 vs modify_1 (~70%) + change_me_2 vs modify_2 (~70%) + EXACT_END1 (100%) + EXACT_END2 (100%) = ~88%
				const result = await doApplyEdit(
					'EXACT_START\nmodify_1\nmodify_2\nEXACT_END1\nEXACT_END2',
					'EXACT_START\nNEW_1\nNEW_2\nEXACT_END1\nEXACT_END2'
				);
				// Should match window at i=0 and replace the middle 2 lines
				expect(result.updatedFile).toBe('EXACT_START\nNEW_1\nNEW_2\nEXACT_END1\nEXACT_END2');
			}); test('similarity match boundary: no identical lines', async () => {
				setText('aaa\nbbb\nccc');
				// With low similarity, should not match
				await expect(doApplyEdit('xxx\nyyy\nzzz', 'new1\nnew2\nnew3')).rejects.toThrow(NoMatchError);
			});

			test('similarity match edge case: all identical lines except middle', async () => {
				// This tests the slice calculation with identical leading and trailing lines
				// File has 5 lines, search differs in 1 line = 80% similarity, above 60% threshold
				setText('Alpha\nBravo\nCharlie\nDelta\nEcho');
				// Search has identical first 2 and last 2, different middle
				// identical.leading = 2, identical.trailing = 2
				const result = await doApplyEdit(
					'Alpha\nBravo\nXray\nDelta\nEcho',
					'Alpha\nBravo\nNEW\nDelta\nEcho'
				);
				// Should replace only line Charlie with NEW, preserving all other lines
				expect(result.updatedFile).toBe('Alpha\nBravo\nNEW\nDelta\nEcho');
			});

			test('similarity match edge case: only last line differs', async () => {
				// Tests the slice calculation when identical.trailing = 0
				// 3/4 lines match = 75% similarity > 60% threshold
				setText('start_line\nmiddle_one\nmiddle_two\nold_ending');
				// Search matches first 3 lines, last is different
				// identical.leading = 3, identical.trailing = 0
				const result = await doApplyEdit(
					'start_line\nmiddle_one\nmiddle_two\nwrong_ending',
					'start_line\nmiddle_one\nmiddle_two\nnew_ending'
				);
				// Should preserve first 3 lines and replace only last line
				expect(result.updatedFile).toBe('start_line\nmiddle_one\nmiddle_two\nnew_ending');
			});

			test('similarity match edge case: only first line differs', async () => {
				// Tests the slice calculation when identical.leading = 0
				// 3/4 lines match = 75% similarity > 60% threshold
				setText('old_beginning\nmiddle_one\nmiddle_two\nending_line');
				// Search matches last 3 lines, first is different
				// identical.leading = 0, identical.trailing = 3
				const result = await doApplyEdit(
					'wrong_beginning\nmiddle_one\nmiddle_two\nending_line',
					'new_beginning\nmiddle_one\nmiddle_two\nending_line'
				);
				// Should replace only first line, preserve last 3
				expect(result.updatedFile).toBe('new_beginning\nmiddle_one\nmiddle_two\nending_line');
			});
		});
	});

	// Edit minimization tests across all strategies
	describe('edit minimization', () => {
		test('exact match minimizes edits - preserves identical prefix/suffix', async () => {
			setText('prefix unchanged middle changed suffix unchanged');
			const result = await doApplyEdit('prefix unchanged middle changed suffix unchanged', 'prefix unchanged middle updated suffix unchanged');
			// Should only edit the "changed" -> "updated" part
			expect(result.edits.length).toBe(1);
			expect(result.edits[0].newText).toBe('updat');
		});

		test('fuzzy match only replaces different content', async () => {
			setText('line1\nline2\nline3\n');
			const result = await doApplyEdit('line1\nline2\nline3', 'line1\nmodified\nline3');
			// Should edit the content
			expect(result.updatedFile).toBe('line1\nmodified\nline3\n');
		});

		test('edits array contains correct positions', async () => {
			setText('start\ntarget line to change\nend');
			const result = await doApplyEdit('target line to change', 'modified line');

			expect(result.edits.length).toBe(1);
			const edit = result.edits[0];

			// Verify the edit has the right text
			expect(edit.newText).toBe('modified lin');
			// Verify it's on the correct line
			expect(edit.range.start.line).toBe(1); // 0-indexed, so line 2
		});

		test('exact match with partial change minimizes edited text', async () => {
			setText('const a = 1;\nconst b = 2;\nconst c = 3;');
			const result = await doApplyEdit('const a = 1;\nconst b = 2;\nconst c = 3;', 'const a = 10;\nconst b = 2;\nconst c = 30;');
			// Should have minimized the edits
			expect(result.updatedFile).toBe('const a = 10;\nconst b = 2;\nconst c = 30;');
		});
	});
});


describe('assertPathIsSafe (Windows scenarios)', () => {
	// Force Windows checks by passing true for _isWindows
	test('accepts normal path', () => {
		expect(() => assertPathIsSafe('C:\\Users\\me\\project\\file.txt', true)).not.toThrow();
	});

	test('rejects null byte', () => {
		expect(() => assertPathIsSafe('C:\\Users\\me\\proje\0ct\\file.txt', true)).toThrow();
	});

	test('rejects ADS suffix', () => {
		expect(() => assertPathIsSafe('C:\\Users\\me\\project\\file.txt:$I30:$INDEX_ALLOCATION', true)).toThrow();
	});

	test('rejects additional colon in component', () => {
		expect(() => assertPathIsSafe('C:\\Users\\me\\file:name.txt', true)).toThrow();
	});

	test('rejects invalid characters', () => {
		expect(() => assertPathIsSafe('C:\\Users\\me\\proj>ect\\file.txt', true)).toThrow();
	});

	test('rejects device path prefix \\?\\', () => {
		// This should be treated as reserved device path
		expect(() => assertPathIsSafe('\\\\?\\C:\\Users\\me\\file.txt', true)).toThrow();
	});

	test('rejects reserved device name component', () => {
		expect(() => assertPathIsSafe('C:\\Users\\me\\CON\\file.txt', true)).toThrow();
	});

	test('rejects trailing dot in component', () => {
		expect(() => assertPathIsSafe('C:\\Users\\me\\folder.\\file.txt', true)).toThrow();
	});

	test('rejects trailing space in component', () => {
		expect(() => assertPathIsSafe('C:\\Users\\me\\folder \\file.txt', true)).toThrow();
	});

	test('rejects 8.3 short filename pattern', () => {
		expect(() => assertPathIsSafe('C:\\Users\\me\\VSCODE~1\\settings.json', true)).toThrow();
	});

	test('allows tilde without digit', () => {
		expect(() => assertPathIsSafe('C:\\Users\\me\\my~folder\\file.txt', true)).not.toThrow();
	});
});

describe('makeUriConfirmationChecker', async () => {
	let configService: InMemoryConfigurationService;
	let workspaceService: TestWorkspaceService;
	let customInstructionsService: MockCustomInstructionsService;

	beforeEach(() => {
		configService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		workspaceService = new TestWorkspaceService([], []);
		customInstructionsService = new MockCustomInstructionsService();
	});

	test('allows files within workspace folder', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);
		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		const fileInWorkspace = URI.file('/workspace/src/file.ts');
		const result = await checker(fileInWorkspace);
		expect(result).toBe(ConfirmationCheckResult.NoConfirmation);
	});

	test('rejects files outside workspace', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);
		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		const fileOutsideWorkspace = URI.file('/other/file.ts');
		const result = await checker(fileOutsideWorkspace);
		expect(result).toBe(ConfirmationCheckResult.OutsideWorkspace); // OutsideWorkspace
	});

	test('allows untitled files', async () => {
		workspaceService = new TestWorkspaceService([], []);
		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		const untitledFile = URI.parse('untitled:Untitled-1');
		const result = await checker(untitledFile);
		expect(result).toBe(ConfirmationCheckResult.NoConfirmation);
	});

	test('allows external instructions files', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		const externalInstruction = URI.file('/external/instruction.md');
		customInstructionsService.setExternalFiles([externalInstruction]);

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);
		const result = await checker(externalInstruction);
		expect(result).toBe(ConfirmationCheckResult.OutsideWorkspace); // do not edits to external instructions files
	});

	test('respects autoApprove patterns - allows matching files', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'**/*.test.ts': true,
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);
		const testFile = URI.file('/workspace/src/app.test.ts');
		const result = await checker(testFile);
		expect(result).toBe(ConfirmationCheckResult.NoConfirmation);
	});

	test('respects autoApprove patterns - allows non-matching files by default', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'**/*.test.ts': true,
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);
		const prodFile = URI.file('/workspace/src/app.ts');
		const result = await checker(prodFile);
		// Files in workspace are allowed by default unless explicitly blocked
		expect(result).toBe(ConfirmationCheckResult.NoConfirmation);
	});

	test('respects autoApprove patterns - blocks explicitly denied files', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'**/*.env': false,
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);
		const envFile = URI.file('/workspace/.env');
		const result = await checker(envFile);
		expect(result).toBe(ConfirmationCheckResult.Sensitive); // Sensitive
	});

	test('always checks .vscode/*.json files', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);
		const settingsFile = URI.file('/workspace/.vscode/settings.json');
		const result = await checker(settingsFile);
		expect(result).toBe(ConfirmationCheckResult.Sensitive); // Sensitive - always requires confirmation
	});

	test('pattern precedence - later patterns override earlier ones', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'**/*.ts': true,
			'**/secret.ts': false, // More specific pattern should win
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);
		const secretFile = URI.file('/workspace/src/secret.ts');
		const result = await checker(secretFile);
		expect(result).toBe(ConfirmationCheckResult.Sensitive); // Sensitive - specific pattern blocks
	});

	test('handles invalid paths with security checks', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);
		const invalidFile = URI.file('/workspace/file\0.ts');

		await expect(checker(invalidFile)).rejects.toThrow();
	});

	test('multiple workspace folders - allows files in any folder', async () => {
		const workspace1 = URI.file('/workspace1');
		const workspace2 = URI.file('/workspace2');
		workspaceService = new TestWorkspaceService([workspace1, workspace2], []);

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		const fileInWorkspace1 = URI.file('/workspace1/file.ts');
		const fileInWorkspace2 = URI.file('/workspace2/file.ts');

		expect(await checker(fileInWorkspace1)).toBe(ConfirmationCheckResult.NoConfirmation);
		expect(await checker(fileInWorkspace2)).toBe(ConfirmationCheckResult.NoConfirmation);
	});

	test('caches patterns per workspace folder', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'**/*.test.ts': true,
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		// First call should compute patterns
		const file1 = URI.file('/workspace/test1.test.ts');
		const result1 = await checker(file1);
		expect(result1).toBe(ConfirmationCheckResult.NoConfirmation);

		// Second call should use cached patterns
		const file2 = URI.file('/workspace/test2.test.ts');
		const result2 = await checker(file2);
		expect(result2).toBe(ConfirmationCheckResult.NoConfirmation);
	});

	test('case sensitivity handling', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'**/Test.ts': true,
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		// Case handling should depend on platform
		const testFile = URI.file('/workspace/Test.ts');
		const result = await checker(testFile);
		expect(result).toBe(ConfirmationCheckResult.NoConfirmation);
	});

	test('empty autoApprove config - blocks all non-workspace files', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		// No autoApprove config set
		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		const file = URI.file('/workspace/src/file.ts');
		const result = await checker(file);
		// Without explicit approval, files should still be allowed if not sensitive
		expect(result).toBe(ConfirmationCheckResult.NoConfirmation);
	});

	test('workspace folder excluded by pattern - still allows workspace edits', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'/workspace/**': false,
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		// Pattern matching the workspace folder itself should not be included
		const file = URI.file('/workspace/file.ts');
		const result = await checker(file);
		// The pattern should be ignored because it matches the workspace root
		expect(result).toBe(ConfirmationCheckResult.NoConfirmation);
	});

	if (isMacintosh) {
		test('pattern matching macOS Library path', async () => {
			// Simulate a workspace opened in ~/Library (which is normally restricted)
			const workspaceFolder = URI.file('/');
			workspaceService = new TestWorkspaceService([workspaceFolder], []);

			await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {});

			const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

			const normalFile = URI.file(`${homedir()}/Library/MyApp/src/app.ts`);
			expect(await checker(normalFile)).toBe(ConfirmationCheckResult.SystemFile);
		});

		test('pattern matching workspace folder on macOS Library path', async () => {
			// Simulate a workspace opened in ~/Library (which is normally restricted)
			const libraryWorkspace = URI.file(`${homedir()}/Library/MyApp`);
			workspaceService = new TestWorkspaceService([libraryWorkspace], []);

			await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
				'**/*.config': false,
			});

			const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

			const normalFile = URI.file(`${homedir()}/Library/MyApp/src/app.ts`);
			const configFile = URI.file(`${homedir()}/Library/MyApp/settings.config`);

			expect(await checker(normalFile)).toBe(ConfirmationCheckResult.NoConfirmation);
			expect(await checker(configFile)).toBe(ConfirmationCheckResult.Sensitive);
		});
	}


	test('nested pattern matching', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'**/config/**': false,
			'**/config/test/**': true, // More specific pattern
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		// More specific pattern should override the general one
		const testConfigFile = URI.file('/workspace/config/test/settings.json');
		const result = await checker(testConfigFile);
		expect(result).toBe(ConfirmationCheckResult.NoConfirmation); // allowed by more specific pattern
	});

	test('handles relative workspace patterns correctly', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'src/**/*.ts': true,
			'dist/**': false,
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		const srcFile = URI.file('/workspace/src/app.ts');
		const distFile = URI.file('/workspace/dist/app.js');

		expect(await checker(srcFile)).toBe(ConfirmationCheckResult.NoConfirmation);
		expect(await checker(distFile)).toBe(ConfirmationCheckResult.Sensitive); // Sensitive - explicitly blocked
	});

	test('pattern matching is workspace-relative', async () => {
		const workspace1 = URI.file('/workspace1');
		const workspace2 = URI.file('/workspace2');
		workspaceService = new TestWorkspaceService([workspace1, workspace2], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'secrets/**': false,
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		const secretsInWorkspace1 = URI.file('/workspace1/secrets/api-key.txt');
		const secretsInWorkspace2 = URI.file('/workspace2/secrets/token.txt');

		// Pattern should apply to both workspaces
		expect(await checker(secretsInWorkspace1)).toBe(ConfirmationCheckResult.Sensitive); // Sensitive
		expect(await checker(secretsInWorkspace2)).toBe(ConfirmationCheckResult.Sensitive); // Sensitive
	});

	describe('hookFilesLocations', () => {
		beforeEach(() => {
			const workspaceFolder = URI.file('/workspace');
			workspaceService = new TestWorkspaceService([workspaceFolder], []);
		});

		test('folder pattern marks JSON files inside as sensitive', async () => {
			await configService.setNonExtensionConfig('chat.hookFilesLocations', {
				'.github/hooks': true,
			});

			const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

			const hookFile = URI.file('/workspace/.github/hooks/pre-commit.json');
			expect(await checker(hookFile)).toBe(ConfirmationCheckResult.Sensitive);
		});

		test('folder pattern marks the folder itself as sensitive', async () => {
			await configService.setNonExtensionConfig('chat.hookFilesLocations', {
				'.github/hooks': true,
			});

			const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

			const folderUri = URI.file('/workspace/.github/hooks');
			expect(await checker(folderUri)).toBe(ConfirmationCheckResult.Sensitive);
		});

		test('folder pattern does not match non-JSON files', async () => {
			await configService.setNonExtensionConfig('chat.hookFilesLocations', {
				'.github/hooks': true,
			});

			const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

			const txtFile = URI.file('/workspace/.github/hooks/readme.txt');
			expect(await checker(txtFile)).toBe(ConfirmationCheckResult.NoConfirmation);
		});

		test('direct JSON file path marks only that file as sensitive', async () => {
			await configService.setNonExtensionConfig('chat.hookFilesLocations', {
				'.github/hooks/hook.json': true,
			});

			const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

			const hookFile = URI.file('/workspace/.github/hooks/hook.json');
			const otherFile = URI.file('/workspace/.github/hooks/other.json');
			expect(await checker(hookFile)).toBe(ConfirmationCheckResult.Sensitive);
			expect(await checker(otherFile)).toBe(ConfirmationCheckResult.NoConfirmation);
		});

		test('skips home directory patterns', async () => {
			await configService.setNonExtensionConfig('chat.hookFilesLocations', {
				'~/hooks': true,
			});

			const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

			const fileInWorkspace = URI.file('/workspace/hooks/hook.json');
			expect(await checker(fileInWorkspace)).toBe(ConfirmationCheckResult.NoConfirmation);
		});

		test('folder pattern with trailing slash matches JSON files', async () => {
			await configService.setNonExtensionConfig('chat.hookFilesLocations', {
				'.copilot/hooks/': true,
			});

			const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

			const hookFile = URI.file('/workspace/.copilot/hooks/hook.json');
			expect(await checker(hookFile)).toBe(ConfirmationCheckResult.Sensitive);
		});

		test('does not treat file extensions like .png as folders', async () => {
			await configService.setNonExtensionConfig('chat.hookFilesLocations', {
				'assets/icon.png': true,
			});

			const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

			// The .png file itself should be sensitive
			const pngFile = URI.file('/workspace/assets/icon.png');
			expect(await checker(pngFile)).toBe(ConfirmationCheckResult.Sensitive);

			// But a JSON file next to it should not
			const jsonFile = URI.file('/workspace/assets/icon.png/something.json');
			expect(await checker(jsonFile)).toBe(ConfirmationCheckResult.NoConfirmation);
		});

		test('pattern starting with **/ is preserved as-is', async () => {
			await configService.setNonExtensionConfig('chat.hookFilesLocations', {
				'**/hooks': true,
			});

			const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

			const hookFile = URI.file('/workspace/deeply/nested/hooks/hook.json');
			expect(await checker(hookFile)).toBe(ConfirmationCheckResult.Sensitive);
		});
	});

	test('complex glob patterns', async () => {
		const workspaceFolder = URI.file('/workspace');
		workspaceService = new TestWorkspaceService([workspaceFolder], []);

		await configService.setNonExtensionConfig('chat.tools.edits.autoApprove', {
			'**/*.{env,secret,key}': false,
			'**/test/**/*.env': true, // Exception for test env files
		});

		const checker = makeUriConfirmationChecker(configService, workspaceService.getWorkspaceFolder.bind(workspaceService), customInstructionsService);

		const prodEnv = URI.file('/workspace/.env');
		const testEnv = URI.file('/workspace/test/integration.env');
		const apiKey = URI.file('/workspace/config/api.key');

		expect(await checker(prodEnv)).toBe(ConfirmationCheckResult.Sensitive); // Sensitive - matches block pattern
		expect(await checker(testEnv)).toBe(ConfirmationCheckResult.NoConfirmation); // exception pattern
		expect(await checker(apiKey)).toBe(ConfirmationCheckResult.Sensitive); // Sensitive - matches block pattern
	});
});

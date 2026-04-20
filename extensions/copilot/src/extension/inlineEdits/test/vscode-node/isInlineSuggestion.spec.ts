/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, suite, test } from 'vitest';
import { Position, Range, Uri } from 'vscode';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { toInlineSuggestion } from '../../vscode-node/isInlineSuggestion';

suite('toInlineSuggestion', () => {

	function createMockDocument(lines: string[], languageId: string = 'typescript') {
		return createTextDocumentData(Uri.from({ scheme: 'test', path: '/test/file.ts' }), lines.join('\n'), languageId).document;
	}

	function getBaseCompletionScenario() {
		const document = createMockDocument(['This is line 1,', 'This is line,', 'This is line 3,']);
		const replaceRange = new Range(1, 0, 1, 13);
		const completionInsertionPoint = new Position(1, 12);
		const replaceText = 'This is line 2,';
		return { document, completionInsertionPoint, replaceRange, replaceText };
	}

	test('line before completion', () => {
		const { document, completionInsertionPoint, replaceRange, replaceText } = getBaseCompletionScenario();

		const cursorPosition = new Position(completionInsertionPoint.line - 1, completionInsertionPoint.character);

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('same line before completion', () => {
		const { document, completionInsertionPoint, replaceRange, replaceText } = getBaseCompletionScenario();

		const cursorPosition = new Position(completionInsertionPoint.line, completionInsertionPoint.character - 1);

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, replaceRange);
		assert.strictEqual(result!.newText, replaceText);
	});

	test('same line at completion', () => {
		const { document, completionInsertionPoint, replaceRange, replaceText } = getBaseCompletionScenario();

		const cursorPosition = new Position(completionInsertionPoint.line, completionInsertionPoint.character);

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, replaceRange);
		assert.strictEqual(result!.newText, replaceText);
	});

	test('same line after completion', () => {
		const { document, completionInsertionPoint, replaceRange, replaceText } = getBaseCompletionScenario();

		const cursorPosition = new Position(completionInsertionPoint.line, completionInsertionPoint.character + 1);

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('line after completion', () => {
		const { document, completionInsertionPoint, replaceRange, replaceText } = getBaseCompletionScenario();

		const cursorPosition = new Position(completionInsertionPoint.line + 1, completionInsertionPoint.character);

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('multi-line replace range', () => {
		const document = createMockDocument(['This is line 1,', 'This is line,', 'This is line,']);
		const replaceRange = new Range(1, 0, 2, 13);
		const replaceText = 'This is line 2,\nThis is line 3,';

		const cursorPosition = replaceRange.start;

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('multi-line insertion on same line', () => {
		const document = createMockDocument(['This is line 1,', 'This is line,', 'This is line 5,']);
		const replaceRange = new Range(1, 12, 1, 13);
		const replaceText = ' 2,\nThis is line 3,\nThis is line 4,';

		const cursorPosition = replaceRange.start;

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, replaceRange);
		assert.strictEqual(result!.newText, replaceText);
	});

	test('multi-line insertion on next line extends range to cursor', () => {
		const document = createMockDocument(['This is line 1,', 'This is line 2,', 'This is line 5,']);
		const cursorPosition = new Position(1, 15); // end of "This is line 2,"
		const replaceRange = new Range(2, 0, 2, 0);
		const replaceText = 'This is line 3,\nThis is line 4,\n';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		// Range is an empty range at the cursor for a pure insertion
		assert.deepStrictEqual(result!.range, new Range(1, 15, 1, 15));
		// Text is prepended with the newline between cursor and original range,
		// and the trailing newline is dropped so we don't introduce a blank line.
		assert.strictEqual(result!.newText, '\n' + replaceText.replace(/\r?\n$/, ''));
	});

	test('should not use ghost text when inserting on next line when none empty', () => {
		const document = createMockDocument(['This is line 1,', 'This is line 2,', 'line 3,']);
		const cursorPosition = new Position(1, 15);
		const replaceRange = new Range(2, 0, 2, 0);
		const replaceText = 'This is ';

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	// Even though this would be a nice way to render the suggestion, ghost text view on the core side
	// is not able to render such suggestions
	test('should not use ghost text when inserting on existing line below', () => {
		const document = createMockDocument(['This is line 1,', 'This is line 2,', '', 'This is line 4,']);
		const cursorPosition = new Position(1, 15);
		const replaceRange = new Range(2, 0, 2, 0);
		const replaceText = 'This is line 3,';

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	// Tests probing the behavior change: multi-line next-line insertions
	// where newText does not end with '\n'

	test('multi-line insertion on next empty line without trailing newline', () => {
		const document = createMockDocument(['function foo(', '', 'other']);
		const cursorPosition = new Position(0, 13); // end of "function foo("
		const replaceRange = new Range(1, 0, 1, 0); // empty line
		const replaceText = '  a: string,\n  b: number\n)';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(0, 13, 0, 13));
		assert.strictEqual(result!.newText, '\n' + replaceText);
	});

	test('multi-line insertion on next non-empty line with trailing newline', () => {
		const document = createMockDocument(['function foo(', ')', 'other']);
		const cursorPosition = new Position(0, 13); // end of "function foo("
		const replaceRange = new Range(1, 0, 1, 0); // non-empty line ")"
		const replaceText = '  a: string,\n  b: number\n';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(0, 13, 0, 13));
		// Trailing '\n' is dropped to avoid a spurious blank line.
		assert.strictEqual(result!.newText, '\n' + replaceText.replace(/\r?\n$/, ''));
	});

	test('multi-line insertion without trailing newline rejected when target line has content', () => {
		const document = createMockDocument(['function foo(', ')', 'other']);
		const cursorPosition = new Position(0, 13);
		const replaceRange = new Range(1, 0, 1, 0);
		const replaceText = '  a: string,\n  b: number';

		// newText doesn't end with \n, and target line ")" is non-empty → undefined
		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('single-line insertion on next empty line is not an inline suggestion', () => {
		const document = createMockDocument(['function foo(', '', 'other']);
		const cursorPosition = new Position(0, 13);
		const replaceRange = new Range(1, 0, 1, 0);
		const replaceText = '  a: string';

		// Single-line text has no \n — neither endsWith nor includes matches
		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('render ghost text for next line suggestion with massaged range', () => {

		const document = createMockDocument([`import * as vscode from 'vscode';
import { NodeTypesIndex } from './nodeTypesIndex';
import { Result } from './util/common/result';

export class NodeTypesOutlineProvider implements vscode.DocumentSymbolProvider {

	/**
	 * @remark This works only for valid tree-sitter \`node-types.json\` files.
	 */
	provideDocumentSymbols(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {

		const nodeTypesIndex = new NodeTypesIndex(document);

		const astNodes = nodeTypesIndex.nodes;

		if (Result.isErr(astNodes)) {
			throw astNodes.err;
		}

		const symbols: vscode.DocumentSymbol[] = astNodes.val.map(astNode => {
			const range = new vscode.Range(
				document.positionAt(astNode.offset),
				document.positionAt(astNode.offset + astNode.length)
			);

			const revealRange = new vscode.Range(
				document.positionAt(astNode.type.offset),
				document.positionAt(astNode.type.offset + astNode.type.length)
			);

			return new vscode.DocumentSymbol(
				astNode.type.value,
				astNode.named.value ? 'Named' : 'Anonymous',
				vscode.SymbolKind.Object,
				range,
				revealRange,
			);
		});

		return symbols;
	}
}
function createDocumentSymbol(
`]);
		const cursorPosition = new Position(45, 30);
		const replaceRange = new Range(46, 0, 46, 0);
		const replaceText = `	astNode: { type: { value: string; offset: number; length: number }; named: { value: boolean }; offset: number; length: number },
	document: vscode.TextDocument
): vscode.DocumentSymbol {
	const range = new vscode.Range(
		document.positionAt(astNode.offset),
		document.positionAt(astNode.offset + astNode.length)
	);

	const revealRange = new vscode.Range(
		document.positionAt(astNode.type.offset),
		document.positionAt(astNode.type.offset + astNode.type.length)
	);

	return new vscode.DocumentSymbol(
		astNode.type.value,
		astNode.named.value ? 'Named' : 'Anonymous',
		vscode.SymbolKind.Object,
		range,
		revealRange,
	);
}`;

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		// Range is an empty range at cursor position
		assert.deepStrictEqual(result!.range, new Range(45, 30, 45, 30));
		// Text is prepended with newline
		assert.strictEqual(result!.newText, '\n' + replaceText);
	});

	// --- Branch 1 regression: next-line insertion edge cases ---

	test('next-line: cursor mid-line rejects even with valid next-line edit', () => {
		const document = createMockDocument(['function foo(bar', '', 'other']);
		const cursorPosition = new Position(0, 8); // middle of "function foo(bar"
		const replaceRange = new Range(1, 0, 1, 0);
		const replaceText = '  param1,\n  param2\n';

		// Cursor not at end of line → rejected
		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('next-line: non-empty range on next line falls through and is rejected', () => {
		const document = createMockDocument(['function foo(', 'old content', 'other']);
		const cursorPosition = new Position(0, 13);
		const replaceRange = new Range(1, 0, 1, 11); // non-empty range replacing "old content"
		const replaceText = 'new content\n';

		// range.isEmpty is false → branch 1 skipped, branch 2 rejects (different line)
		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('next-line: non-empty replace range covering only whitespace on next line', () => {
		const document = createMockDocument([
			'    for item in items:',
			'        ',
			'other_code',
		], 'python');
		const cursorPosition = new Position(1, 4);
		const replaceRange = new Range(0, 22, 1, 8);
		const replaceText = '\n        process(item)\n    return result';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
	});

	test('next-line: range 2 lines ahead is rejected', () => {
		const document = createMockDocument(['line 0', 'line 1', '', 'line 3']);
		const cursorPosition = new Position(0, 6);
		const replaceRange = new Range(2, 0, 2, 0);
		const replaceText = 'inserted\n';

		// cursorPos.line + 1 !== range.start.line → rejected
		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('next-line: empty range at non-zero column on next line is rejected', () => {
		const document = createMockDocument(['function foo(', '    ', 'other']);
		const cursorPosition = new Position(0, 13);
		const replaceRange = new Range(1, 4, 1, 4); // empty range at col 4
		const replaceText = 'a: string,\n  b: number\n';

		// range.start.character !== 0 → rejected
		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('next-line: inserting just a newline character', () => {
		const document = createMockDocument(['line 0', '', 'line 2']);
		const cursorPosition = new Position(0, 6);
		const replaceRange = new Range(1, 0, 1, 0);
		const replaceText = '\n';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(0, 6, 0, 6));
		// Trailing '\n' is dropped — only the prepended newline remains.
		assert.strictEqual(result!.newText, '\n');
	});

	test('next-line: cursor at end of an empty line', () => {
		const document = createMockDocument(['', '', 'other']);
		const cursorPosition = new Position(0, 0); // end of empty line 0
		const replaceRange = new Range(1, 0, 1, 0);
		const replaceText = 'new line\n';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(0, 0, 0, 0));
		// Trailing '\n' is dropped to avoid a spurious blank line.
		assert.strictEqual(result!.newText, '\nnew line');
	});

	test('next-line: range on line before cursor is rejected', () => {
		const document = createMockDocument(['line 0', 'line 1', 'line 2']);
		const cursorPosition = new Position(2, 6);
		const replaceRange = new Range(1, 0, 1, 0);
		const replaceText = 'inserted\n';

		// cursorPos.line + 1 !== range.start.line (1 !== 3)
		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	// --- Branch 2 regression: same-line edit edge cases ---

	test('same-line: cursor before range start rejects', () => {
		const document = createMockDocument(['abcdef']);
		const cursorPosition = new Position(0, 1);
		const replaceRange = new Range(0, 3, 0, 6); // replaces "def"
		const replaceText = 'defgh';

		// cursorOffsetInReplacedText < 0
		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('same-line: text before cursor differs rejects', () => {
		const document = createMockDocument(['abcdef']);
		const cursorPosition = new Position(0, 4);
		const replaceRange = new Range(0, 0, 0, 6);
		const replaceText = 'XXXX_modified';

		// "abcd" !== "XXXX" → text before cursor mismatch
		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('same-line: replaced text is not subword of new text rejects', () => {
		const document = createMockDocument(['abcxyz']);
		const cursorPosition = new Position(0, 0);
		const replaceRange = new Range(0, 0, 0, 6);
		const replaceText = 'abc'; // "abcxyz" is not a subword of "abc"

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('same-line: deletion (empty newText) rejects', () => {
		const document = createMockDocument(['abcdef']);
		const cursorPosition = new Position(0, 0);
		const replaceRange = new Range(0, 0, 0, 3);
		const replaceText = '';

		// "abc" is not a subword of "" → rejected
		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('same-line: empty range and empty text at cursor (no-op) succeeds', () => {
		const document = createMockDocument(['abcdef']);
		const cursorPosition = new Position(0, 3);
		const replaceRange = new Range(0, 3, 0, 3);
		const replaceText = '';

		// Empty replaced text is trivially a subword of empty new text
		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(0, 3, 0, 3));
		assert.strictEqual(result!.newText, '');
	});

	test('same-line: pure insertion (empty range) at cursor', () => {
		const document = createMockDocument(['ab']);
		const cursorPosition = new Position(0, 1);
		const replaceRange = new Range(0, 1, 0, 1);
		const replaceText = 'XY';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(0, 1, 0, 1));
		assert.strictEqual(result!.newText, 'XY');
	});

	test('same-line: cursor at col 0 with range at col 0', () => {
		const document = createMockDocument(['hello']);
		const cursorPosition = new Position(0, 0);
		const replaceRange = new Range(0, 0, 0, 5);
		const replaceText = 'hello world';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, replaceRange);
		assert.strictEqual(result!.newText, 'hello world');
	});

	test('same-line: subword insertion mid-word', () => {
		const document = createMockDocument(['clog']);
		const cursorPosition = new Position(0, 1);
		const replaceRange = new Range(0, 0, 0, 4);
		const replaceText = 'console.log';

		// "clog" IS a subword of "console.log" (c...o...l...og)
		// But text before cursor: replaced[0..1]="c", new[0..1]="c" → match
		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.strictEqual(result!.newText, 'console.log');
	});

	// --- Prefix-stripping: multi-line range reduction ---

	test('prefix-strip: multi-line range reduced to single-line edit on cursor line', () => {
		// Range spans lines 0-1, replaced text = "abc\ndef", newText = "abc\ndefghi"
		// Common prefix up to newline = "abc\n", strip it → range becomes (1,0)-(1,3), newText = "defghi"
		const document = createMockDocument(['abc', 'def', 'other']);
		const cursorPosition = new Position(1, 0);
		const replaceRange = new Range(0, 0, 1, 3);
		const replaceText = 'abc\ndefghi';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(1, 0, 1, 3));
		assert.strictEqual(result!.newText, 'defghi');
	});

	test('prefix-strip: no newline in common prefix, multi-line range still rejected', () => {
		// Range spans lines 0-1, replaced = "ab\ncd", newText = "abXY"
		// Common prefix = "ab" but no newline → no stripping → multi-line range rejected
		const document = createMockDocument(['ab', 'cd', 'other']);
		const cursorPosition = new Position(0, 0);
		const replaceRange = new Range(0, 0, 1, 2);
		const replaceText = 'abXY';

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('prefix-strip: strips multiple newlines to last boundary', () => {
		// Range spans 3 lines: "line0\nline1\nxy", newText = "line0\nline1\nxyz"
		// Common prefix includes two newlines, stripping to last → range becomes (2,0)-(2,2)
		const document = createMockDocument(['line0', 'line1', 'xy', 'other']);
		const cursorPosition = new Position(2, 0);
		const replaceRange = new Range(0, 0, 2, 2);
		const replaceText = 'line0\nline1\nxyz';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(2, 0, 2, 2));
		assert.strictEqual(result!.newText, 'xyz');
	});

	test('prefix-strip: after stripping still multi-line, rejected', () => {
		// Range spans 3 lines: "a\nb\nc", newText = "a\nB\nC"
		// Common prefix up to newline = "a\n", strip → range becomes (1,0)-(2,1) which is still multi-line
		const document = createMockDocument(['a', 'b', 'c', 'other']);
		const cursorPosition = new Position(1, 0);
		const replaceRange = new Range(0, 0, 2, 1);
		const replaceText = 'a\nB\nC';

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('prefix-strip: reduced to single line but cursor on different line, rejected', () => {
		// Strip reduces range to line 1, but cursor is on line 0
		const document = createMockDocument(['abc', 'def', 'other']);
		const cursorPosition = new Position(0, 2);
		const replaceRange = new Range(0, 0, 1, 3);
		const replaceText = 'abc\ndefghi';

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('prefix-strip: reduced to single line, subword check fails', () => {
		// After stripping "abc\n", range = (1,0)-(1,3) with replaced "def", newText = "xy"
		// "def" is not a subword of "xy"
		const document = createMockDocument(['abc', 'def', 'other']);
		const cursorPosition = new Position(1, 0);
		const replaceRange = new Range(0, 0, 1, 3);
		const replaceText = 'abc\nxy';

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('prefix-strip: diverges before first newline, no stripping', () => {
		// replaced = "ax\nyz", newText = "ab\nyz" → common prefix "a" has no newline → no strip
		const document = createMockDocument(['ax', 'yz']);
		const cursorPosition = new Position(0, 0);
		const replaceRange = new Range(0, 0, 1, 2);
		const replaceText = 'ab\nyz';

		assert.isUndefined(toInlineSuggestion(cursorPosition, document, replaceRange, replaceText));
	});

	test('prefix-strip: range starts mid-line, strips prefix through newline', () => {
		// Document: "hello world", "  ns", "other"
		// Range (0,6)-(1,4) → replaced text = "world\n  ns", newText = "world\n  new_stuff"
		// Common prefix = "world\n  " → last newline at index 5, strip "world\n"
		// Reduced range: (1,0)-(1,4), newText = "  new_stuff"
		// isSubword("  ns", "  new_stuff") → true
		const document = createMockDocument(['hello world', '  ns', 'other']);
		const cursorPosition = new Position(1, 0);
		const replaceRange = new Range(0, 6, 1, 4);
		const replaceText = 'world\n  new_stuff';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(1, 0, 1, 4));
		assert.strictEqual(result!.newText, '  new_stuff');
	});

	test('prefix-strip: empty newText after stripping prefix', () => {
		// replaced = "abc\n", newText = "abc\n" → after stripping "abc\n", replaced="" and newText=""
		// This is a no-op on the second line, succeeds as empty edit
		const document = createMockDocument(['abc', '', 'other']);
		const cursorPosition = new Position(1, 0);
		const replaceRange = new Range(0, 0, 1, 0);
		const replaceText = 'abc\n';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(1, 0, 1, 0));
		assert.strictEqual(result!.newText, '');
	});

	test('insertion on next line in fieldLabels object', () => {
		const doc = `import React, { useState } from "react";

interface FormData {
    firstName: string;
    lastName: string;
    password: string;
    email: string;
    age: string;
    city: string;
}

const initialFormData: FormData = {
    firstName: "",
    lastName: "",
    password: "",
    email: "",
    age: "",
    city: "",
};

const fieldLabels: Record<keyof FormData, string> = {
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email Address",
    age: "Age",
    city: "City",
};
`;
		const document = createTextDocumentData(Uri.from({ scheme: 'test', path: '/test/file.tsx' }), doc, 'typescriptreact').document;
		const cursorPosition = new Position(22, 26); // end of `    lastName: "Last Name",`
		const replaceRange = new Range(23, 0, 23, 0);
		const replaceText = '    password: "Password",\n';

		const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText, true);
		assert.isDefined(result);
		assert.deepStrictEqual(result!.range, new Range(22, 26, 22, 26));
		// Trailing '\n' is dropped because the original line terminator after
		// the cursor is preserved.
		assert.strictEqual(result!.newText, '\n    password: "Password",');
	});

	suite('CRLF', () => {

		function createCRLFDocument(lines: string[], languageId: string = 'typescript') {
			return createTextDocumentData(
				Uri.from({ scheme: 'test', path: '/test/file.ts' }),
				lines.join('\r\n'),
				languageId,
				'\r\n',
			).document;
		}

		test('next-line insertion: trailing CRLF is dropped (no dangling \\r)', () => {
			const document = createCRLFDocument(['function foo(', '', 'other']);
			const cursorPosition = new Position(0, 13); // end of "function foo("
			const replaceRange = new Range(1, 0, 1, 0); // empty line
			const replaceText = '  a: string,\r\n  b: number\r\n';

			const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
			assert.isDefined(result);
			assert.deepStrictEqual(result!.range, new Range(0, 13, 0, 13));
			// The trailing CRLF must be stripped entirely; no dangling '\r'
			// should leak into the suggestion text.
			assert.strictEqual(result!.newText, '\r\n  a: string,\r\n  b: number');
		});

		test('next-line insertion: trailing CRLF on non-empty target line', () => {
			const document = createCRLFDocument(['function foo(', ')', 'other']);
			const cursorPosition = new Position(0, 13);
			const replaceRange = new Range(1, 0, 1, 0);
			const replaceText = '  a: string,\r\n  b: number\r\n';

			const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
			assert.isDefined(result);
			assert.deepStrictEqual(result!.range, new Range(0, 13, 0, 13));
			assert.strictEqual(result!.newText, '\r\n  a: string,\r\n  b: number');
		});

		test('next-line insertion: CRLF-only newText is fully stripped', () => {
			const document = createCRLFDocument(['line 0', '', 'line 2']);
			const cursorPosition = new Position(0, 6);
			const replaceRange = new Range(1, 0, 1, 0);
			const replaceText = '\r\n';

			const result = toInlineSuggestion(cursorPosition, document, replaceRange, replaceText);
			assert.isDefined(result);
			assert.deepStrictEqual(result!.range, new Range(0, 6, 0, 6));
			// Only the prepended CRLF between cursor and original range remains.
			assert.strictEqual(result!.newText, '\r\n');
		});
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, suite, test } from 'vitest';
import { ResponseProcessor } from '../../../../platform/inlineEdits/common/responseProcessor';
import { AsyncIterUtils } from '../../../../util/common/asyncIterableUtils';
import { LineEdit, LineReplacement } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { LineRange } from '../../../../util/vs/editor/common/core/ranges/lineRange';

suite('stream diffing', () => {

	async function run(editWindow: string[], updatedEditWindowLines: string[]) {
		const updatedEditWindowLinesStream = AsyncIterUtils.fromArray(updatedEditWindowLines);

		const editsGen = ResponseProcessor.diff(editWindow, updatedEditWindowLinesStream, 0, ResponseProcessor.DEFAULT_DIFF_PARAMS);

		const edits: LineReplacement[] = [];
		for await (const edit of editsGen) {
			edits.push(edit);
		}

		const lineEdit = new LineEdit(edits);

		return {
			lineEdit,
			patch: lineEdit.humanReadablePatch(editWindow).split('\n'),
		};
	}

	suite('edit window with all lines being unique', () => {

		const editWindow = [
			/* 0  */ `export function printParseTree(node: Parser.SyntaxNode, options: PrintingOptions, print: NodePrinter = ParseTreeEditor.renderNode): string[] {`,
			/* 1  */ `	const printedNodes: string[] = [];`,
			/* 2  */ `	traverseDFPreOrder(node, (cursor, depth) => {`,
			/* 3  */ `		const currentNode = cursor.currentNode();`,
			/* 4  */ `		if (options.printOnlyNamed && !currentNode.isNamed()) {`,
			/* 5  */ `			return;`,
			/* 6  */ `		}`,
			/* 7  */ `		const printedNode = print(currentNode, depth, cursor.currentFieldName());`,
			/* 8  */ `		printedNodes.push(printedNode);`,
			/* 9  */ `	});`,
			/* 10 */ `	return printedNodes;`,
			/* 11 */ `}`
		];

		test('in stream middle - 1 line diff', async () => {

			const updatedEditWindow = [...editWindow];
			updatedEditWindow.splice(2, 1, '	traverse(node, (cursor, depth) => {');

			const { patch } = await run(editWindow, updatedEditWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "    1   1 export function printParseTree(node: Parser.SyntaxNode, options: PrintingOptions, print: NodePrinter = ParseTreeEditor.renderNode): string[] {",
				  "    2   2 	const printedNodes: string[] = [];",
				  "-   3     	traverseDFPreOrder(node, (cursor, depth) => {",
				  "+       3 	traverse(node, (cursor, depth) => {",
				  "    4   4 		const currentNode = cursor.currentNode();",
				  "    5   5 		if (options.printOnlyNamed && !currentNode.isNamed()) {",
				  "    6   6 			return;",
				]
			`);
		});

		test('in stream middle - 2 consecutive lines diff', async () => {

			const updatedEditWindow = [...editWindow];
			updatedEditWindow.splice(2, 1, '	traverse(node, (cursor, depth) => {', '		console.log("new line");');

			const { patch } = await run(editWindow, updatedEditWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "    1   1 export function printParseTree(node: Parser.SyntaxNode, options: PrintingOptions, print: NodePrinter = ParseTreeEditor.renderNode): string[] {",
				  "    2   2 	const printedNodes: string[] = [];",
				  "-   3     	traverseDFPreOrder(node, (cursor, depth) => {",
				  "+       3 	traverse(node, (cursor, depth) => {",
				  "+       4 		console.log("new line");",
				  "    4   5 		const currentNode = cursor.currentNode();",
				  "    5   6 		if (options.printOnlyNamed && !currentNode.isNamed()) {",
				  "    6   7 			return;",
				]
			`);
		});

		test('in stream middle - 1 line diff, 2 consecutive lines diff', async () => {

			const updatedEditWindow = [...editWindow];
			updatedEditWindow.splice(2, 1,
				'	traverse(node, (cursor, depth) => {');
			updatedEditWindow.splice(7, 2,
				/* 7  */ `		const myPrintedNode = print(currentNode, depth, cursor.currentFieldName());`,
				/* 8  */ `		printedNodes.push(myPrintedNode);`);

			const { patch } = await run(editWindow, updatedEditWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "    1   1 export function printParseTree(node: Parser.SyntaxNode, options: PrintingOptions, print: NodePrinter = ParseTreeEditor.renderNode): string[] {",
				  "    2   2 	const printedNodes: string[] = [];",
				  "-   3     	traverseDFPreOrder(node, (cursor, depth) => {",
				  "+       3 	traverse(node, (cursor, depth) => {",
				  "    4   4 		const currentNode = cursor.currentNode();",
				  "    5   5 		if (options.printOnlyNamed && !currentNode.isNamed()) {",
				  "    6   6 			return;",
				  "    7   7 		}",
				  "-   8     		const printedNode = print(currentNode, depth, cursor.currentFieldName());",
				  "-   9     		printedNodes.push(printedNode);",
				  "+       8 		const myPrintedNode = print(currentNode, depth, cursor.currentFieldName());",
				  "+       9 		printedNodes.push(myPrintedNode);",
				  "   10  10 	});",
				  "   11  11 	return printedNodes;",
				  "   12  12 }",
				]
			`);
		});

		test('removes lines at beginning', async () => {

			const updatedEditWindow = [...editWindow];
			updatedEditWindow.splice(0, 3);

			const { patch } = await run(editWindow, updatedEditWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "-   1     export function printParseTree(node: Parser.SyntaxNode, options: PrintingOptions, print: NodePrinter = ParseTreeEditor.renderNode): string[] {",
				  "-   2     	const printedNodes: string[] = [];",
				  "-   3     	traverseDFPreOrder(node, (cursor, depth) => {",
				  "    4   1 		const currentNode = cursor.currentNode();",
				  "    5   2 		if (options.printOnlyNamed && !currentNode.isNamed()) {",
				  "    6   3 			return;",
				]
			`);
		});

		test('removes lines at end', async () => {

			const updatedEditWindow = [...editWindow];
			updatedEditWindow.splice(9, 3);

			const { patch } = await run(editWindow, updatedEditWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "    8   8 		const printedNode = print(currentNode, depth, cursor.currentFieldName());",
				  "    9   9 		printedNodes.push(printedNode);",
				  "-  10     	});",
				  "-  11     	return printedNodes;",
				  "-  12     }",
				]
			`);
		});

	});

	suite('edit window with non-unique lines', () => {

		test('removes lines at end', async () => {
			const editWindow = [
				`}`,
				``,
				`int multiply(int a, int b = 1, int c = 2) {`,
				`	return a * b;`,
				`}`,
				``,
				`template<typename... Args> auto sum(Args... args) {`,
				`	return (args + ...);`,
				`}`,
				``,
				`template<typename T> T identify(T value) {`,
				`	return value;`,
				`}`,
			];

			const updatedEditWindow = [...editWindow];
			updatedEditWindow.splice(3, 1, '	return a * b * c;');

			const { patch } = await run(editWindow, updatedEditWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "    2   2 ",
				  "    3   3 int multiply(int a, int b = 1, int c = 2) {",
				  "-   4     	return a * b;",
				  "+       4 	return a * b * c;",
				  "    5   5 }",
				  "    6   6 ",
				  "    7   7 template<typename... Args> auto sum(Args... args) {",
				]
			`);
		});

		test('matching line quite below', async () => {
			const editWindow = [
				/*  1 */'			if (!document) {',
				/*  2 */'				return;',
				/*  3 */'			}				document.selection.set(e.selections.map(s => new OffsetRange(e.textEditor.document.offsetAt(s.start), e.textEditor.document.offsetAt(s.end)), undefined);		}));',
				/*  4 */'',
				/*  5 */'		this._register(workspace.onDidCloseTextDocument(e => {',
				/*  6 */'			if (!this.filter.isTrackingEnabled(e)) {',
				/*  7 */'				return;',
				/*  8 */'			}',
				/*  9 */'',
				/* 10 */'			this._tracker.handleDocumentClosed(documentUriFromTextDocument(e));',
				/* 11 */'		}));',
				/* 12 */'',
				/* 13 */'		for (const doc of workspace.textDocuments) {',
			];

			const updatedEditWindow = [...editWindow];
			updatedEditWindow.splice(2, 1,
				'			}',
				'			document.selection.set(e.selections.map(s => new OffsetRange(e.textEditor.document.offsetAt(s.start), e.textEditor.document.offsetAt(s.end)), undefined));',
				'		}));'
			);

			const { patch } = await run(editWindow, updatedEditWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "    1   1 			if (!document) {",
				  "    2   2 				return;",
				  "-   3     			}				document.selection.set(e.selections.map(s => new OffsetRange(e.textEditor.document.offsetAt(s.start), e.textEditor.document.offsetAt(s.end)), undefined);		}));",
				  "+       3 			}",
				  "+       4 			document.selection.set(e.selections.map(s => new OffsetRange(e.textEditor.document.offsetAt(s.start), e.textEditor.document.offsetAt(s.end)), undefined));",
				  "+       5 		}));",
				  "    4   6 ",
				  "    5   7 		this._register(workspace.onDidCloseTextDocument(e => {",
				  "    6   8 			if (!this.filter.isTrackingEnabled(e)) {",
				]
			`);
		});

		test('converge at two lines', async () => {
			const editWindow = [
				/*  1 */ `class Point3D {`,
				/*  2 */ `    x: number;`,
				/*  3 */ `    y: number;`,
				/*  4 */ ``,
				/*  5 */ `    constructor(x: number, y: number) {`,
				/*  6 */ `        this.x = x;`,
				/*  7 */ `        this.y = y;`,
				/*  8 */ `    }`,
				/*  9 */ ``,
				/* 10 */ `    spaghetti(): number {`,
				/* 11 */ `        return this.x + this.y;`,
			];

			const lineEdit = new LineEdit([
				new LineReplacement(
					new LineRange(4, 4),
					['    z: number;'],
				),
				new LineReplacement(
					new LineRange(5, 6),
					['    constructor(x: number, y: number, z: number) {'],
				),
				new LineReplacement(
					new LineRange(8, 8),
					['        this.z = z;'],
				),
				new LineReplacement(
					new LineRange(11, 12),
					['        return this.x + this.y + this.z;']
				)
			]);

			const updatedEditWindow = lineEdit.apply(editWindow);

			const { patch } = await run(editWindow, updatedEditWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "    2   2     x: number;",
				  "    3   3     y: number;",
				  "-   4     ",
				  "-   5         constructor(x: number, y: number) {",
				  "+       4     z: number;",
				  "+       5 ",
				  "+       6     constructor(x: number, y: number, z: number) {",
				  "    6   7         this.x = x;",
				  "    7   8         this.y = y;",
				  "+       9         this.z = z;",
				  "    8  10     }",
				  "    9  11 ",
				  "   10  12     spaghetti(): number {",
				  "-  11             return this.x + this.y;",
				  "+      13         return this.x + this.y + this.z;",
				]
			`);
		});

		test('prefers adding lines than removing them', async () => {
			const editWindow = [
				/*  1 */ `a`,
				/*  2 */ `b`,
				/*  3 */ `c`,
				/*  4 */ `d`,
				/*  5 */ `e`,
				/*  6 */ `f`,
			];

			const lineEdit = new LineEdit([
				new LineReplacement(
					new LineRange(3, 5),
					['c1'],
				),
			]);

			const updatedEditWindow = lineEdit.apply(editWindow);

			const { patch } = await run(editWindow, updatedEditWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "    1   1 a",
				  "    2   2 b",
				  "-   3     c",
				  "-   4     d",
				  "+       3 c1",
				  "    5   4 e",
				  "    6   5 f",
				]
			`);
		});

		test('repetitive code should not result in deletion', async () => {
			const editWindow = [
				`function updateKthEntry<T>() {}`,
				``,
				`function updateAllEntries<T>(cache: Cache, documentId: DocumentId, entries: T[]) {`,
				`    const cachedEntries = cache.get(documentId);`,
				`    if (cachedEntries === undefined) {`,
				`        return;`,
				`    }`,
				`    cachedEntries.push(...entries);`,
				`}`,
			];

			const updatedEditWindow = [
				`function updateKthEntry<T>(cache: Cache, documentId: DocumentId, k: number, entry: T) {`,
				`    const cachedEntries = cache.get(documentId);`,
				`    if (cachedEntries === undefined) {`,
				`        return;`,
				`    }`,
				`    cachedEntries[k] = entry;`,
				`}`,
				``,
				`function updateAllEntries<T>(cache: Cache, documentId: DocumentId, entries: T[]) {`,
				`    const cachedEntries = cache.get(documentId);`,
				`    if (cachedEntries === undefined) {`,
				`        return;`,
				`    }`,
				`    cachedEntries.push(...entries);`,
				`}`,
			];

			const { patch } = await run(editWindow, updatedEditWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "-   1     function updateKthEntry<T>() {}",
				  "+       1 function updateKthEntry<T>(cache: Cache, documentId: DocumentId, k: number, entry: T) {",
				  "+       2     const cachedEntries = cache.get(documentId);",
				  "+       3     if (cachedEntries === undefined) {",
				  "+       4         return;",
				  "+       5     }",
				  "+       6     cachedEntries[k] = entry;",
				  "+       7 }",
				  "    2   8 ",
				  "    3   9 function updateAllEntries<T>(cache: Cache, documentId: DocumentId, entries: T[]) {",
				  "    4  10     const cachedEntries = cache.get(documentId);",
				]
			`);
		});

		test('no edits', async () => {
			const editWindow = [
				`		const logger = this._logger.createSubLogger('_trigger');`,
				``,
				`		const result = suggestion.result;`,
				`		if (!result?.edit) {`,
				``,
				`			return;`,
				`		}`,
				``,
			];
			const { patch } = await run(editWindow, editWindow);
			expect(patch).toMatchInlineSnapshot(`
				[
				  "",
				]
			`);
		});

	});
});

describe('emitFastCursorLineChange with empty lines', () => {

	async function runWithFastCursor(
		editWindow: string[],
		updatedEditWindowLines: string[],
		cursorOffset: number,
		emitFastCursorLineChange: ResponseProcessor.EmitFastCursorLineChange = ResponseProcessor.EmitFastCursorLineChange.AdditiveOnly,
	) {
		const updatedEditWindowLinesStream = AsyncIterUtils.fromArray(updatedEditWindowLines);

		const params: ResponseProcessor.DiffParams = {
			...ResponseProcessor.DEFAULT_DIFF_PARAMS,
			emitFastCursorLineChange,
		};

		const editsGen = ResponseProcessor.diff(editWindow, updatedEditWindowLinesStream, cursorOffset, params);

		const edits: LineReplacement[] = [];
		for await (const edit of editsGen) {
			edits.push(edit);
		}

		const lineEdit = new LineEdit(edits);

		return {
			lineEdit,
			edits,
			patch: lineEdit.humanReadablePatch(editWindow).split('\n'),
		};
	}

	it('should skip fast-emit when empty cursor line is deleted and new content matches next line prefix', async () => {
		// This tests the lookahead fix: when cursor is on empty line and model outputs
		// content that's a prefix of the next line, we skip fast-emit to avoid duplication.
		// "aft" is a prefix of "after_unique" - fast-emit should be skipped.
		const editWindow = ['before', '', 'after_unique'];
		const updatedEditWindow = ['before', 'aft']; // partial match of next line

		const { edits } = await runWithFastCursor(editWindow, updatedEditWindow, 1);

		// Fast-emit should NOT have triggered (no single-line early edit)
		// Instead, we get a single final edit replacing the remaining lines
		expect(edits.length).toBe(1);
		expect(edits[0].lineRange.startLineNumber).toBe(2); // 1-indexed, starts at empty line
	});

	it('should skip fast-emit when empty cursor line is deleted and new content exactly matches next line', async () => {
		// Model outputs exactly the next line when trying to delete empty cursor line
		// This would cause duplication without the fix
		const editWindow = ['before', '', 'unique_after'];
		// Model produces 'unique_after' directly (skipping empty line)
		// But 'unique_after' is NOT in lineToIdxs because... wait, it IS in original.
		// This scenario doesn't trigger fast-emit because candidates wouldn't be empty.

		// Actually, for fast-emit to trigger, the new line must NOT exist in original.
		// So this test with exact match won't trigger fast-emit at all.
		// Let's test a scenario where it DOES trigger:

		const { patch } = await runWithFastCursor(editWindow, ['before', 'unique_after'], 1);

		// Since 'unique_after' exists at index 2 in original, candidates won't be empty.
		// Fast-emit won't trigger. The algorithm will try convergence instead.
		expect(patch).toMatchInlineSnapshot(`
			[
			  "    1   1 before",
			  "-   2     ",
			  "-   3     unique_after",
			  "+       2 unique_after",
			]
		`);
	});

	it('should emit fast cursor change when replacing empty line with truly new content', async () => {
		// Cursor on empty line, model replaces it with content NOT in original
		// AND the content doesn't match/prefix the next line
		const editWindow = ['before', '', 'zzz_after'];
		const updatedEditWindow = ['before', 'brand_new_content', 'zzz_after'];

		const { edits } = await runWithFastCursor(editWindow, updatedEditWindow, 1);

		// Should emit early for the cursor line (fast-emit triggered)
		expect(edits.length).toBe(1);
		expect(edits[0].newLines).toEqual(['brand_new_content']);
	});

	it('should handle empty cursor line at end of document', async () => {
		// No next line to check against - fast-emit should work normally
		const editWindow = ['before', 'middle', ''];
		const updatedEditWindow = ['before', 'middle', 'new_content'];

		const { edits } = await runWithFastCursor(editWindow, updatedEditWindow, 2);

		// Fast-emit should work (no next line to check prefix against)
		expect(edits.length).toBe(1);
		expect(edits[0].newLines).toEqual(['new_content']);
	});

	it('should not confuse replacement with deletion when content differs from next line', async () => {
		// Empty cursor line, model outputs completely different content
		// (doesn't prefix next line) - this should fast-emit
		const editWindow = ['aaa', '', 'bbb_unique'];
		const updatedEditWindow = ['aaa', 'xxx_completely_different', 'bbb_unique'];

		const { edits } = await runWithFastCursor(editWindow, updatedEditWindow, 1);

		// 'xxx_completely_different' doesn't prefix 'bbb_unique', so fast-emit should trigger
		expect(edits.length).toBe(1);
		expect(edits[0].newLines).toEqual(['xxx_completely_different']);
	});

});

describe('isAdditiveEdit', () => {

	it('should detect simple substring additions as additive', () => {
		expect(ResponseProcessor.isAdditiveEdit('hello', 'hello world')).toMatchInlineSnapshot(`true`);
		expect(ResponseProcessor.isAdditiveEdit('world', 'hello world')).toMatchInlineSnapshot(`true`);
		expect(ResponseProcessor.isAdditiveEdit('hello world', 'hello world')).toMatchInlineSnapshot(`true`);
	});

	it('should detect insertions in the middle as additive', () => {
		// The key case: adding parameters to a function
		expect(ResponseProcessor.isAdditiveEdit('function fib() {', 'function fib(n: number) {')).toMatchInlineSnapshot(`true`);

		// Adding type annotations
		expect(ResponseProcessor.isAdditiveEdit('const x = 5', 'const x: number = 5')).toMatchInlineSnapshot(`true`);

		// Adding modifiers
		expect(ResponseProcessor.isAdditiveEdit('function foo() {}', 'async function foo() {}')).toMatchInlineSnapshot(`true`);
	});

	it('should detect character insertions as additive', () => {
		expect(ResponseProcessor.isAdditiveEdit('abc', 'aXbYcZ')).toMatchInlineSnapshot(`true`);
		expect(ResponseProcessor.isAdditiveEdit('abc', 'XXXaYYYbZZZc')).toMatchInlineSnapshot(`true`);
	});

	it('should detect deletions as non-additive', () => {
		expect(ResponseProcessor.isAdditiveEdit('hello world', 'hello')).toMatchInlineSnapshot(`false`);
		expect(ResponseProcessor.isAdditiveEdit('hello world', 'world')).toMatchInlineSnapshot(`false`);
		expect(ResponseProcessor.isAdditiveEdit('function fib(n: number) {', 'function fib() {')).toMatchInlineSnapshot(`false`);
	});

	it('should detect replacements as non-additive', () => {
		// Changing name (f → g) is a replacement
		expect(ResponseProcessor.isAdditiveEdit('function fib() {', 'function gib() {')).toMatchInlineSnapshot(`false`);

		// Changing value is a replacement
		expect(ResponseProcessor.isAdditiveEdit('const x = 5', 'const x = 10')).toMatchInlineSnapshot(`false`);
	});

	it('should handle empty strings', () => {
		expect(ResponseProcessor.isAdditiveEdit('', '')).toMatchInlineSnapshot(`true`);
		expect(ResponseProcessor.isAdditiveEdit('', 'hello')).toMatchInlineSnapshot(`true`);
		expect(ResponseProcessor.isAdditiveEdit('hello', '')).toMatchInlineSnapshot(`false`);
	});

	it('should handle whitespace changes', () => {
		// Adding whitespace
		expect(ResponseProcessor.isAdditiveEdit('a b', 'a  b')).toMatchInlineSnapshot(`true`);
		expect(ResponseProcessor.isAdditiveEdit('ab', 'a b')).toMatchInlineSnapshot(`true`);

		// Removing whitespace is not additive
		expect(ResponseProcessor.isAdditiveEdit('a  b', 'a b')).toMatchInlineSnapshot(`false`);
	});

	it('should handle complex code transformations', () => {
		// Adding optional chaining
		expect(ResponseProcessor.isAdditiveEdit('obj.prop', 'obj?.prop')).toMatchInlineSnapshot(`true`);

		// Adding template literal
		expect(ResponseProcessor.isAdditiveEdit('`hello`', '`hello ${name}`')).toMatchInlineSnapshot(`true`);

		// Adding array element
		expect(ResponseProcessor.isAdditiveEdit('[1, 2]', '[1, 2, 3]')).toMatchInlineSnapshot(`true`);

		// Adding object property (subsequence still works)
		expect(ResponseProcessor.isAdditiveEdit('{ a: 1 }', '{ a: 1, b: 2 }')).toMatchInlineSnapshot(`true`);
	});

	it('should handle repeated characters correctly', () => {
		// All 'a's from original must be matched in order
		expect(ResponseProcessor.isAdditiveEdit('aaa', 'aaaa')).toMatchInlineSnapshot(`true`);
		expect(ResponseProcessor.isAdditiveEdit('aaa', 'aXaYaZ')).toMatchInlineSnapshot(`true`);
		expect(ResponseProcessor.isAdditiveEdit('aaaa', 'aaa')).toMatchInlineSnapshot(`false`);
	});
});

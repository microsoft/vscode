/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { GhostCompletion } from '../ghostText';
import { ITextEditorOptions, normalizeIndentCharacter } from '../normalizeIndent';
import * as assert from 'assert';

suite('Leading whitespace normalization tests', function () {
	test('Leading spaces are replaces with tabs', function () {
		const teo: ITextEditorOptions = {
			tabSize: 4,
			insertSpaces: false,
		};

		const completion: GhostCompletion = {
			completionIndex: 0,
			completionText: '    fun()\n    yeet()',
			displayText: '    fun()\n    yeet()',
			displayNeedsWsOffset: false,
		};

		const output = '\tfun()\n\tyeet()';
		const result = normalizeIndentCharacter(teo, completion, false);

		assert.ok(result.completionText === output, 'Leading whitespace normalization failed');
		assert.ok(result.displayText === output, 'Leading whitespace normalization failed');
	});

	test('Leading tabs are replaces with spaces', function () {
		const teo: ITextEditorOptions = {
			tabSize: 4,
			insertSpaces: true,
		};

		const completion: GhostCompletion = {
			completionIndex: 0,
			completionText: '\tfun()\n\tyeet()',
			displayText: '\tfun()\n\tyeet()',
			displayNeedsWsOffset: false,
		};

		const output = '    fun()\n    yeet()';

		const result = normalizeIndentCharacter(teo, completion, false);
		assert.ok(result.completionText === output, 'Leading whitespace normalization failed');
		assert.ok(result.displayText === output, 'Leading whitespace normalization failed');
	});

	test('Leading tabs are replaces with spaces - multiple level of indents', function () {
		const teo: ITextEditorOptions = {
			tabSize: 2,
			insertSpaces: true,
		};

		const completion: GhostCompletion = {
			completionIndex: 0,
			completionText: '\tfun()\n\t\tyeet()\n\tboo()',
			displayText: '\tfun()\n\t\tyeet()\n\tboo()',
			displayNeedsWsOffset: false,
		};

		const output = '  fun()\n    yeet()\n  boo()';
		const result = normalizeIndentCharacter(teo, completion, false);

		assert.ok(result.completionText === output, 'Leading whitespace normalization failed');
		assert.ok(result.displayText === output, 'Leading whitespace normalization failed');
	});

	test('Leading spaces are replaces with tabs - multiple level of indents', function () {
		const teo: ITextEditorOptions = {
			tabSize: 2,
			insertSpaces: false,
		};

		const completion: GhostCompletion = {
			completionIndex: 0,
			completionText: '  fun()\n    yeet()\n  boo()',
			displayText: '  fun()\n    yeet()\n  boo()',
			displayNeedsWsOffset: false,
		};

		const output = '\tfun()\n\t\tyeet()\n\tboo()';
		const result = normalizeIndentCharacter(teo, completion, false);

		assert.ok(result.completionText === output, 'Leading whitespace normalization failed');
		assert.ok(result.displayText === output, 'Leading whitespace normalization failed');
	});

	test('Extra spaces are not dropped when replacing spaces with tabs', function () {
		const teo: ITextEditorOptions = {
			tabSize: 4,
			insertSpaces: false,
		};

		const input = ' '.repeat(6) + 'fun()\n' + ' '.repeat(6) + '  yeet()\n' + ' '.repeat(6) + 'boo()';
		const completion: GhostCompletion = {
			completionIndex: 0,
			completionText: input,
			displayText: input,
			displayNeedsWsOffset: false,
		};

		const output = '\t  fun()\n' + '\t\tyeet()\n' + '\t  boo()';
		const result = normalizeIndentCharacter(teo, completion, false);

		assert.strictEqual(result.completionText, output, 'Leading whitespace normalization failed');
		assert.strictEqual(result.displayText, output, 'Leading whitespace normalization failed');
	});

	test('Leading spaces are normalized to the tab size expected in editor in case of empty line suggestion', function () {
		const teo: ITextEditorOptions = {
			tabSize: 4,
			insertSpaces: true,
		};

		const completion: GhostCompletion = {
			completionIndex: 0,
			completionText: '  fun()\n    yeet()\n  boo()',
			displayText: '  fun()\n    yeet()\n  boo()',
			displayNeedsWsOffset: false,
		};

		const output = '    fun()\n        yeet()\n    boo()';
		const result = normalizeIndentCharacter(teo, completion, true);

		assert.ok(result.completionText === output, 'Leading whitespace normalization failed');
		assert.ok(result.displayText === output, 'Leading whitespace normalization failed');
	});

	test('Leading spaces are normalized to the tab size expected in editor in case of empty line suggestion, lot of indentation case', function () {
		const teo: ITextEditorOptions = {
			tabSize: 4,
			insertSpaces: true,
		};

		const completion: GhostCompletion = {
			completionIndex: 0,
			completionText: '      fun()\n        yeet()\n      boo()',
			displayText: '      fun()\n        yeet()\n      boo()',
			displayNeedsWsOffset: false,
		};

		const output = '        fun()\n            yeet()\n        boo()';
		const result = normalizeIndentCharacter(teo, completion, true);

		assert.ok(result.completionText === output, 'Leading whitespace normalization failed');
		assert.ok(result.displayText === output, 'Leading whitespace normalization failed');
	});

	test('Leading spaces are not normalized if ident size is same as tab size', function () {
		const teo: ITextEditorOptions = {
			tabSize: 2,
			insertSpaces: true,
		};

		const completion: GhostCompletion = {
			completionIndex: 0,
			completionText: '  fun()\n    yeet()\n  boo()',
			displayText: '  fun()\n    yeet()\n  boo()',
			displayNeedsWsOffset: false,
		};

		const output = '  fun()\n    yeet()\n  boo()';
		const result = normalizeIndentCharacter(teo, completion, true);

		assert.ok(result.completionText === output, 'Leading whitespace normalization failed');
		assert.ok(result.displayText === output, 'Leading whitespace normalization failed');
	});

	test('Leading newlines do not trigger spurious extra indentation', function () {
		const teo: ITextEditorOptions = {
			tabSize: 2,
			insertSpaces: true,
		};

		const completion: GhostCompletion = {
			completionIndex: 0,
			completionText: '\n  fun()\n    yeet()\n  boo()',
			displayText: '\n  fun()\n    yeet()\n  boo()',
			displayNeedsWsOffset: false,
		};

		const output = '\n  fun()\n    yeet()\n  boo()';
		const result = normalizeIndentCharacter(teo, completion, true);

		assert.ok(result.completionText === output, 'Leading whitespace normalization failed');
		assert.ok(result.displayText === output, 'Leading whitespace normalization failed');
	});
});

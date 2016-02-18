/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {Range} from 'vs/editor/common/core/range';
import TU = require('vs/editor/test/common/commands/commandTestUtils');
import {EditOperationsCommand} from 'vs/editor/contrib/format/common/formatCommand';
import {Selection} from 'vs/editor/common/core/selection';
import {Model} from 'vs/editor/common/model/model';
import EditorCommon = require('vs/editor/common/editorCommon');

function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, text:string[]): EditorCommon.ISingleEditOperation {
	return {
		range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
		text: text.join('\n'),
		forceMoveMarkers: false
	};
}

suite('FormatCommand.trimEdit', () => {
	function testTrimEdit(lines: string[], edit:EditorCommon.ISingleEditOperation, expected:EditorCommon.ISingleEditOperation): void {
		let model = new Model(lines.join('\n'), null);
		let actual = EditOperationsCommand.trimEdit(edit, model);
		assert.deepEqual(actual, expected);
		model.dispose();
	}

	test('single-line no-op', () => {
		testTrimEdit(
			[
				'some text',
				'some other text'
			],
			editOp(1,1,1,10, [
				'some text'
			]),
			null
		);
	});

	test('multi-line no-op 1', () => {
		testTrimEdit(
			[
				'some text',
				'some other text'
			],
			editOp(1,1,2,16, [
				'some text',
				'some other text'
			]),
			null
		);
	});

	test('multi-line no-op 2', () => {
		testTrimEdit(
			[
				'some text',
				'some other text'
			],
			editOp(1,1,2,1, [
				'some text',
				''
			]),
			null
		);
	});

	test('simple prefix, no suffix', () => {
		testTrimEdit(
			[
				'some text',
				'some other text'
			],
			editOp(1,1,1,10, [
				'some interesting thing'
			]),
			editOp(1,6,1,10, [
				'interesting thing'
			])
		);
	});

	test('whole line prefix, no suffix', () => {
		testTrimEdit(
			[
				'some text',
				'some other text'
			],
			editOp(1,1,1,10, [
				'some text',
				'interesting thing'
			]),
			editOp(1,10,1,10, [
				'',
				'interesting thing'
			])
		);
	});

	test('multi-line prefix, no suffix', () => {
		testTrimEdit(
			[
				'some text',
				'some other text'
			],
			editOp(1,1,2,16, [
				'some text',
				'some other interesting thing'
			]),
			editOp(2,12,2,16, [
				'interesting thing'
			])
		);
	});

	test('no prefix, simple suffix', () => {
		testTrimEdit(
			[
				'some text',
				'some other text'
			],
			editOp(1,1,1,10, [
				'interesting text'
			]),
			editOp(1,1,1,5, [
				'interesting'
			])
		);
	});

	test('no prefix, whole line suffix', () => {
		testTrimEdit(
			[
				'some text',
				'some other text'
			],
			editOp(1,1,1,10, [
				'interesting thing',
				'some text'
			]),
			editOp(1,1,1,1, [
				'interesting thing',
				''
			])
		);
	});

	test('no prefix, multi-line suffix', () => {
		testTrimEdit(
			[
				'some text',
				'some other text'
			],
			editOp(1,1,2,16, [
				'interesting thing text',
				'some other text'
			]),
			editOp(1,1,1,5, [
				'interesting thing'
			])
		);
	});

	test('no overlapping prefix & suffix', () => {
		testTrimEdit(
			[
				'some cool text'
			],
			editOp(1,1,1,15, [
				'some interesting text'
			]),
			editOp(1,6,1,10, [
				'interesting'
			])
		);
	});

	test('overlapping prefix & suffix 1', () => {
		testTrimEdit(
			[
				'some cool text'
			],
			editOp(1,1,1,15, [
				'some cool cool text'
			]),
			editOp(1,11,1,11, [
				'cool '
			])
		);
	});

	test('overlapping prefix & suffix 2', () => {
		testTrimEdit(
			[
				'some cool cool text'
			],
			editOp(1,1,1,29, [
				'some cool text'
			]),
			editOp(1,11,1,16, [
				''
			])
		);
	});
});

suite('FormatCommand', () => {
	function testFormatCommand(lines: string[], selection: Selection, edits:EditorCommon.ISingleEditOperation[], expectedLines: string[], expectedSelection: Selection): void {
		TU.testCommand(lines, null, selection, (sel) => new EditOperationsCommand(edits, sel), expectedLines, expectedSelection);
	}

	test('no-op', () => {
		testFormatCommand(
			[
				'some text',
				'some other text'
			],
			new Selection(2,1,2,5),
			[
				editOp(1, 1, 2, 16, [
					'some text',
					'some other text'
				])
			],
			[
				'some text',
				'some other text'
			],
			new Selection(2,1,2,5)
		);
	});

	test('trim beginning', () => {
		testFormatCommand(
			[
				'some text',
				'some other text'
			],
			new Selection(2,1,2,5),
			[
				editOp(1, 1, 2, 16, [
					'some text',
					'some new other text'
				])
			],
			[
				'some text',
				'some new other text'
			],
			new Selection(2,1,2,5)
		);
	});

	test('issue #144', () => {
		testFormatCommand(
			[
				'package caddy',
				'',
				'func main() {',
				'\tfmt.Println("Hello World! :)")',
				'}',
				''
			],
			new Selection(1,1,1,1),
			[
				editOp(1, 1, 6, 1, [
					'package caddy',
					'',
					'import "fmt"',
					'',
					'func main() {',
					'\tfmt.Println("Hello World! :)")',
					'}',
					''
				])
			],
			[
				'package caddy',
				'',
				'import "fmt"',
				'',
				'func main() {',
				'\tfmt.Println("Hello World! :)")',
				'}',
				''
			],
			new Selection(1,1,1,1)
		);
	});

});
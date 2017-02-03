/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ShiftCommand } from 'vs/editor/common/commands/shiftCommand';
import { Selection } from 'vs/editor/common/core/selection';
import { IIdentifiedSingleEditOperation } from 'vs/editor/common/editorCommon';
import { IndentAction } from 'vs/editor/common/modes/languageConfiguration';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { createSingleEditOp, getEditOperation, testCommand } from 'vs/editor/test/common/commands/commandTestUtils';
import { withEditorModel } from 'vs/editor/test/common/editorTestUtils';
import { MockMode } from 'vs/editor/test/common/mocks/mockMode';
import { LanguageIdentifier } from 'vs/editor/common/modes';

function testShiftCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (sel) => new ShiftCommand(sel, {
		isUnshift: false,
		tabSize: 4,
		oneIndent: '\t'
	}), expectedLines, expectedSelection);
}

function testUnshiftCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (sel) => new ShiftCommand(sel, {
		isUnshift: true,
		tabSize: 4,
		oneIndent: '\t'
	}), expectedLines, expectedSelection);
}

class DocBlockCommentMode extends MockMode {

	private static _id = new LanguageIdentifier('commentMode', 3);

	constructor() {
		super(DocBlockCommentMode._id);
		this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
			brackets: [
				['(', ')'],
				['{', '}'],
				['[', ']']
			],

			onEnterRules: [
				{
					// e.g. /** | */
					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
					afterText: /^\s*\*\/$/,
					action: { indentAction: IndentAction.IndentOutdent, appendText: ' * ' }
				},
				{
					// e.g. /** ...|
					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
					action: { indentAction: IndentAction.None, appendText: ' * ' }
				},
				{
					// e.g.  * ...|
					beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
					action: { indentAction: IndentAction.None, appendText: '* ' }
				},
				{
					// e.g.  */|
					beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
					action: { indentAction: IndentAction.None, removeText: 1 }
				},
				{
					// e.g.  *-----*/|
					beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
					action: { indentAction: IndentAction.None, removeText: 1 }
				}
			]
		}));
	}
}

function testShiftCommandInDocBlockCommentMode(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	let mode = new DocBlockCommentMode();
	testCommand(lines, mode.getLanguageIdentifier(), selection, (sel) => new ShiftCommand(sel, {
		isUnshift: false,
		tabSize: 4,
		oneIndent: '\t'
	}), expectedLines, expectedSelection);
	mode.dispose();
}

function testUnshiftCommandInDocBlockCommentMode(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	let mode = new DocBlockCommentMode();
	testCommand(lines, mode.getLanguageIdentifier(), selection, (sel) => new ShiftCommand(sel, {
		isUnshift: true,
		tabSize: 4,
		oneIndent: '\t'
	}), expectedLines, expectedSelection);
	mode.dispose();
}

suite('Editor Commands - ShiftCommand', () => {

	// --------- shift

	test('Bug 9503: Shifting without any selection', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 1, 1),
			[
				'\tMy First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 2, 1, 2)
		);
	});

	test('shift on single line selection 1', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 3, 1, 1),
			[
				'\tMy First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 4, 1, 2)
		);
	});

	test('shift on single line selection 2', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 1, 3),
			[
				'\tMy First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 2, 1, 4)
		);
	});

	test('simple shift', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 2, 1),
			[
				'\tMy First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 2, 2, 1)
		);
	});

	test('shifting on two separate lines', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 2, 1),
			[
				'\tMy First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 2, 2, 1)
		);

		testShiftCommand(
			[
				'\tMy First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 1, 3, 1),
			[
				'\tMy First Line',
				'\t\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 1, 3, 1)
		);
	});

	test('shifting on two lines', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 2, 2, 2),
			[
				'\tMy First Line',
				'\t\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 3, 2, 2)
		);
	});

	test('shifting on two lines again', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 2, 1, 2),
			[
				'\tMy First Line',
				'\t\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 2, 1, 3)
		);
	});

	test('shifting at end of file', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(4, 1, 5, 2),
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'\t123'
			],
			new Selection(4, 1, 5, 3)
		);
	});

	test('issue #1120 TAB should not indent empty lines in a multi-line selection', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 5, 2),
			[
				'\tMy First Line',
				'\t\t\tMy Second Line',
				'\t\tThird Line',
				'',
				'\t123'
			],
			new Selection(1, 2, 5, 3)
		);

		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(4, 1, 5, 1),
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'\t',
				'123'
			],
			new Selection(4, 2, 5, 1)
		);
	});

	// --------- unshift

	test('unshift on single line selection 1', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 3, 2, 1),
			[
				'My First Line',
				'\t\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 3, 2, 1)
		);
	});

	test('unshift on single line selection 2', () => {
		testShiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 1, 2, 3),
			[
				'My First Line',
				'\t\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 1, 2, 3)
		);
	});

	test('simple unshift', () => {
		testUnshiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 2, 1),
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 2, 1)
		);
	});

	test('unshifting on two lines 1', () => {
		testUnshiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 2, 2, 2),
			[
				'My First Line',
				'\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 2, 2, 2)
		);
	});

	test('unshifting on two lines 2', () => {
		testUnshiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 3, 2, 1),
			[
				'My First Line',
				'\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 2, 2, 1)
		);
	});

	test('unshifting at the end of the file', () => {
		testUnshiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(4, 1, 5, 2),
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(4, 1, 5, 2)
		);
	});

	test('unshift many times + shift', () => {
		testUnshiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 5, 4),
			[
				'My First Line',
				'\tMy Second Line',
				'Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 5, 4)
		);

		testUnshiftCommand(
			[
				'My First Line',
				'\tMy Second Line',
				'Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 5, 4),
			[
				'My First Line',
				'My Second Line',
				'Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 5, 4)
		);

		testShiftCommand(
			[
				'My First Line',
				'My Second Line',
				'Third Line',
				'',
				'123'
			],
			new Selection(1, 1, 5, 4),
			[
				'\tMy First Line',
				'\tMy Second Line',
				'\tThird Line',
				'',
				'\t123'
			],
			new Selection(1, 2, 5, 5)
		);
	});

	test('Bug 9119: Unshift from first column doesn\'t work', () => {
		testUnshiftCommand(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 1, 2, 1),
			[
				'My First Line',
				'\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			new Selection(2, 1, 2, 1)
		);
	});

	test('issue #348: indenting around doc block comments', () => {
		testShiftCommandInDocBlockCommentMode(
			[
				'',
				'/**',
				' * a doc comment',
				' */',
				'function hello() {}'
			],
			new Selection(1, 1, 5, 20),
			[
				'',
				'\t/**',
				'\t * a doc comment',
				'\t */',
				'\tfunction hello() {}'
			],
			new Selection(1, 1, 5, 21)
		);

		testUnshiftCommandInDocBlockCommentMode(
			[
				'',
				'/**',
				' * a doc comment',
				' */',
				'function hello() {}'
			],
			new Selection(1, 1, 5, 20),
			[
				'',
				'/**',
				' * a doc comment',
				' */',
				'function hello() {}'
			],
			new Selection(1, 1, 5, 20)
		);

		testUnshiftCommandInDocBlockCommentMode(
			[
				'\t',
				'\t/**',
				'\t * a doc comment',
				'\t */',
				'\tfunction hello() {}'
			],
			new Selection(1, 1, 5, 21),
			[
				'',
				'/**',
				' * a doc comment',
				' */',
				'function hello() {}'
			],
			new Selection(1, 1, 5, 20)
		);
	});

	test('issue #1609: Wrong indentation of block comments', () => {
		testShiftCommandInDocBlockCommentMode(
			[
				'',
				'/**',
				' * test',
				' *',
				' * @type {number}',
				' */',
				'var foo = 0;'
			],
			new Selection(1, 1, 7, 13),
			[
				'',
				'\t/**',
				'\t * test',
				'\t *',
				'\t * @type {number}',
				'\t */',
				'\tvar foo = 0;'
			],
			new Selection(1, 1, 7, 14)
		);
	});

	test('bug #16815:Shift+Tab doesn\'t go back to tabstop', () => {

		var repeatStr = (str: string, cnt: number): string => {
			var r = '';
			for (var i = 0; i < cnt; i++) {
				r += str;
			}
			return r;
		};

		var testOutdent = (tabSize: number, oneIndent: string, lineText: string, expectedIndents: number) => {
			var expectedIndent = repeatStr(oneIndent, expectedIndents);
			if (lineText.length > 0) {
				_assertUnshiftCommand(tabSize, oneIndent, [lineText + 'aaa'], [createSingleEditOp(expectedIndent, 1, 1, 1, lineText.length + 1)]);
			} else {
				_assertUnshiftCommand(tabSize, oneIndent, [lineText + 'aaa'], []);
			}
		};

		var testIndent = (tabSize: number, oneIndent: string, lineText: string, expectedIndents: number) => {
			var expectedIndent = repeatStr(oneIndent, expectedIndents);
			_assertShiftCommand(tabSize, oneIndent, [lineText + 'aaa'], [createSingleEditOp(expectedIndent, 1, 1, 1, lineText.length + 1)]);
		};

		var testIndentation = (tabSize: number, lineText: string, expectedOnOutdent: number, expectedOnIndent: number) => {
			var spaceIndent = '';
			for (var i = 0; i < tabSize; i++) {
				spaceIndent += ' ';
			}

			testOutdent(tabSize, spaceIndent, lineText, expectedOnOutdent);
			testOutdent(tabSize, '\t', lineText, expectedOnOutdent);

			testIndent(tabSize, spaceIndent, lineText, expectedOnIndent);
			testIndent(tabSize, '\t', lineText, expectedOnIndent);
		};

		// insertSpaces: true
		// 0 => 0
		testIndentation(4, '', 0, 1);

		// 1 => 0
		testIndentation(4, '\t', 0, 2);
		testIndentation(4, ' ', 0, 1);
		testIndentation(4, ' \t', 0, 2);
		testIndentation(4, '  ', 0, 1);
		testIndentation(4, '  \t', 0, 2);
		testIndentation(4, '   ', 0, 1);
		testIndentation(4, '   \t', 0, 2);
		testIndentation(4, '    ', 0, 2);

		// 2 => 1
		testIndentation(4, '\t\t', 1, 3);
		testIndentation(4, '\t ', 1, 2);
		testIndentation(4, '\t \t', 1, 3);
		testIndentation(4, '\t  ', 1, 2);
		testIndentation(4, '\t  \t', 1, 3);
		testIndentation(4, '\t   ', 1, 2);
		testIndentation(4, '\t   \t', 1, 3);
		testIndentation(4, '\t    ', 1, 3);
		testIndentation(4, ' \t\t', 1, 3);
		testIndentation(4, ' \t ', 1, 2);
		testIndentation(4, ' \t \t', 1, 3);
		testIndentation(4, ' \t  ', 1, 2);
		testIndentation(4, ' \t  \t', 1, 3);
		testIndentation(4, ' \t   ', 1, 2);
		testIndentation(4, ' \t   \t', 1, 3);
		testIndentation(4, ' \t    ', 1, 3);
		testIndentation(4, '  \t\t', 1, 3);
		testIndentation(4, '  \t ', 1, 2);
		testIndentation(4, '  \t \t', 1, 3);
		testIndentation(4, '  \t  ', 1, 2);
		testIndentation(4, '  \t  \t', 1, 3);
		testIndentation(4, '  \t   ', 1, 2);
		testIndentation(4, '  \t   \t', 1, 3);
		testIndentation(4, '  \t    ', 1, 3);
		testIndentation(4, '   \t\t', 1, 3);
		testIndentation(4, '   \t ', 1, 2);
		testIndentation(4, '   \t \t', 1, 3);
		testIndentation(4, '   \t  ', 1, 2);
		testIndentation(4, '   \t  \t', 1, 3);
		testIndentation(4, '   \t   ', 1, 2);
		testIndentation(4, '   \t   \t', 1, 3);
		testIndentation(4, '   \t    ', 1, 3);
		testIndentation(4, '    \t', 1, 3);
		testIndentation(4, '     ', 1, 2);
		testIndentation(4, '     \t', 1, 3);
		testIndentation(4, '      ', 1, 2);
		testIndentation(4, '      \t', 1, 3);
		testIndentation(4, '       ', 1, 2);
		testIndentation(4, '       \t', 1, 3);
		testIndentation(4, '        ', 1, 3);

		// 3 => 2
		testIndentation(4, '         ', 2, 3);

	});

	function _assertUnshiftCommand(tabSize: number, oneIndent: string, text: string[], expected: IIdentifiedSingleEditOperation[]): void {
		return withEditorModel(text, (model) => {
			var op = new ShiftCommand(new Selection(1, 1, text.length + 1, 1), {
				isUnshift: true,
				tabSize: tabSize,
				oneIndent: oneIndent
			});
			var actual = getEditOperation(model, op);
			assert.deepEqual(actual, expected);
		});
	}

	function _assertShiftCommand(tabSize: number, oneIndent: string, text: string[], expected: IIdentifiedSingleEditOperation[]): void {
		return withEditorModel(text, (model) => {
			var op = new ShiftCommand(new Selection(1, 1, text.length + 1, 1), {
				isUnshift: false,
				tabSize: tabSize,
				oneIndent: oneIndent
			});
			var actual = getEditOperation(model, op);
			assert.deepEqual(actual, expected);
		});
	}
});

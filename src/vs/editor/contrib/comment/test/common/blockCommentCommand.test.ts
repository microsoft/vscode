/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Selection } from 'vs/editor/common/core/selection';
import { BlockCommentCommand } from 'vs/editor/contrib/comment/common/blockCommentCommand';
import { testCommand } from 'vs/editor/test/common/commands/commandTestUtils';
import { CommentMode } from 'vs/editor/test/common/commentMode';

function testBlockCommentCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	let mode = new CommentMode({ lineComment: '!@#', blockComment: ['<0', '0>'] });
	testCommand(lines, mode.getLanguageIdentifier(), selection, (sel) => new BlockCommentCommand(sel), expectedLines, expectedSelection);
	mode.dispose();
}

suite('Editor Contrib - Block Comment Command', () => {

	test('empty selection wraps itself', function () {
		testBlockCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 1, 3),
			[
				'fi<00>rst',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5)
		);
	});

	test('invisible selection ignored', function () {
		testBlockCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 1, 1, 1),
			[
				'<0first',
				'0>\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 2, 1)
		);
	});

	test('bug9511', function () {
		testBlockCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 6, 1, 1),
			[
				'<0first0>',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 1, 8)
		);

		testBlockCommentCommand(
			[
				'<0first0>',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 8, 1, 3),
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 6)
		);
	});

	test('one line selection', function () {
		testBlockCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 6, 1, 3),
			[
				'fi<0rst0>',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 8)
		);
	});

	test('one line selection toggle', function () {
		testBlockCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 6, 1, 3),
			[
				'fi<0rst0>',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 8)
		);

		testBlockCommentCommand(
			[
				'fi<0rst0>',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 8, 1, 5),
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 1, 6)
		);
	});

	test('multi line selection', function () {
		testBlockCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 4, 1, 1),
			[
				'<0first',
				'\tse0>cond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 2, 4)
		);
	});

	test('multi line selection toggle', function () {
		testBlockCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 4, 1, 1),
			[
				'<0first',
				'\tse0>cond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 2, 4)
		);

		testBlockCommentCommand(
			[
				'<0first',
				'\tse0>cond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 4, 1, 3),
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 2, 4)
		);
	});

	test('fuzzy removes', function () {
		testBlockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Selection(2, 5, 1, 7),
			[
				'asd  qwe',
				'asd  qwe'
			],
			new Selection(1, 5, 2, 5)
		);

		testBlockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Selection(2, 5, 1, 6),
			[
				'asd  qwe',
				'asd  qwe'
			],
			new Selection(1, 5, 2, 5)
		);

		testBlockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Selection(2, 5, 1, 5),
			[
				'asd  qwe',
				'asd  qwe'
			],
			new Selection(1, 5, 2, 5)
		);

		testBlockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Selection(2, 5, 1, 11),
			[
				'asd  qwe',
				'asd  qwe'
			],
			new Selection(1, 5, 2, 5)
		);

		testBlockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Selection(2, 1, 1, 11),
			[
				'asd  qwe',
				'asd  qwe'
			],
			new Selection(1, 5, 2, 5)
		);

		testBlockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Selection(2, 7, 1, 11),
			[
				'asd  qwe',
				'asd  qwe'
			],
			new Selection(1, 5, 2, 5)
		);
	});
});


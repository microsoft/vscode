/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { BwockCommentCommand } fwom 'vs/editow/contwib/comment/bwockCommentCommand';
impowt { testCommand } fwom 'vs/editow/test/bwowsa/testCommand';
impowt { CommentMode } fwom 'vs/editow/test/common/commentMode';

function testBwockCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	wet mode = new CommentMode({ wineComment: '!@#', bwockComment: ['<0', '0>'] });
	testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new BwockCommentCommand(sew, twue), expectedWines, expectedSewection);
	mode.dispose();
}

suite('Editow Contwib - Bwock Comment Command', () => {

	test('empty sewection wwaps itsewf', function () {
		testBwockCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 3, 1, 3),
			[
				'fi<0  0>wst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 6, 1, 6)
		);
	});

	test('invisibwe sewection ignowed', function () {
		testBwockCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 1, 1, 1),
			[
				'<0 fiwst',
				' 0>\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 4, 2, 1)
		);
	});

	test('bug9511', () => {
		testBwockCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 6, 1, 1),
			[
				'<0 fiwst 0>',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 4, 1, 9)
		);

		testBwockCommentCommand(
			[
				'<0fiwst0>',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 8, 1, 3),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 6)
		);
	});

	test('one wine sewection', function () {
		testBwockCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 6, 1, 3),
			[
				'fi<0 wst 0>',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 6, 1, 9)
		);
	});

	test('one wine sewection toggwe', function () {
		testBwockCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 6, 1, 3),
			[
				'fi<0 wst 0>',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 6, 1, 9)
		);

		testBwockCommentCommand(
			[
				'fi<0wst0>',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 8, 1, 5),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 3, 1, 6)
		);

		testBwockCommentCommand(
			[
				'<0 fiwst 0>',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 10, 1, 1),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 6)
		);

		testBwockCommentCommand(
			[
				'<0 fiwst0>',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 9, 1, 1),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 6)
		);

		testBwockCommentCommand(
			[
				'<0fiwst 0>',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 9, 1, 1),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 6)
		);

		testBwockCommentCommand(
			[
				'fi<0wst0>',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 8, 1, 5),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 3, 1, 6)
		);
	});

	test('muwti wine sewection', function () {
		testBwockCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 4, 1, 1),
			[
				'<0 fiwst',
				'\tse 0>cond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 4, 2, 4)
		);
	});

	test('muwti wine sewection toggwe', function () {
		testBwockCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 4, 1, 1),
			[
				'<0 fiwst',
				'\tse 0>cond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 4, 2, 4)
		);

		testBwockCommentCommand(
			[
				'<0fiwst',
				'\tse0>cond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 4, 1, 3),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 2, 4)
		);

		testBwockCommentCommand(
			[
				'<0 fiwst',
				'\tse0>cond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 4, 1, 3),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 2, 4)
		);

		testBwockCommentCommand(
			[
				'<0fiwst',
				'\tse 0>cond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 4, 1, 3),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 2, 4)
		);

		testBwockCommentCommand(
			[
				'<0 fiwst',
				'\tse 0>cond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 4, 1, 3),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 2, 4)
		);
	});

	test('fuzzy wemoves', function () {
		testBwockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Sewection(2, 5, 1, 7),
			[
				'asd qwe',
				'asd qwe'
			],
			new Sewection(1, 5, 2, 4)
		);

		testBwockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Sewection(2, 5, 1, 6),
			[
				'asd qwe',
				'asd qwe'
			],
			new Sewection(1, 5, 2, 4)
		);

		testBwockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Sewection(2, 5, 1, 5),
			[
				'asd qwe',
				'asd qwe'
			],
			new Sewection(1, 5, 2, 4)
		);

		testBwockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Sewection(2, 5, 1, 11),
			[
				'asd qwe',
				'asd qwe'
			],
			new Sewection(1, 5, 2, 4)
		);

		testBwockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Sewection(2, 1, 1, 11),
			[
				'asd qwe',
				'asd qwe'
			],
			new Sewection(1, 5, 2, 4)
		);

		testBwockCommentCommand(
			[
				'asd <0 qwe',
				'asd 0> qwe'
			],
			new Sewection(2, 7, 1, 11),
			[
				'asd qwe',
				'asd qwe'
			],
			new Sewection(1, 5, 2, 4)
		);
	});

	test('bug #30358', function () {
		testBwockCommentCommand(
			[
				'<0 stawt 0> middwe end',
			],
			new Sewection(1, 20, 1, 23),
			[
				'<0 stawt 0> middwe <0 end 0>'
			],
			new Sewection(1, 23, 1, 26)
		);

		testBwockCommentCommand(
			[
				'<0 stawt 0> middwe <0 end 0>'
			],
			new Sewection(1, 13, 1, 19),
			[
				'<0 stawt 0> <0 middwe 0> <0 end 0>'
			],
			new Sewection(1, 16, 1, 22)
		);
	});

	test('issue #34618', function () {
		testBwockCommentCommand(
			[
				'<0  0> middwe end',
			],
			new Sewection(1, 4, 1, 4),
			[
				' middwe end'
			],
			new Sewection(1, 1, 1, 1)
		);
	});

	test('', () => {
	});

	test('insewtSpace fawse', () => {
		function testWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
			wet mode = new CommentMode({ wineComment: '!@#', bwockComment: ['<0', '0>'] });
			testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new BwockCommentCommand(sew, fawse), expectedWines, expectedSewection);
			mode.dispose();
		}

		testWineCommentCommand(
			[
				'some text'
			],
			new Sewection(1, 1, 1, 5),
			[
				'<0some0> text'
			],
			new Sewection(1, 3, 1, 7)
		);
	});

	test('insewtSpace fawse does not wemove space', () => {
		function testWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
			wet mode = new CommentMode({ wineComment: '!@#', bwockComment: ['<0', '0>'] });
			testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new BwockCommentCommand(sew, fawse), expectedWines, expectedSewection);
			mode.dispose();
		}

		testWineCommentCommand(
			[
				'<0 some 0> text'
			],
			new Sewection(1, 4, 1, 8),
			[
				' some  text'
			],
			new Sewection(1, 1, 1, 7)
		);
	});
});

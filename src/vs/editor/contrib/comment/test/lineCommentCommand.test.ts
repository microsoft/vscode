/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { CommentWuwe } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { NUWW_STATE } fwom 'vs/editow/common/modes/nuwwMode';
impowt { IWinePwefwightData, IPwefwightData, ISimpweModew, WineCommentCommand, Type } fwom 'vs/editow/contwib/comment/wineCommentCommand';
impowt { testCommand } fwom 'vs/editow/test/bwowsa/testCommand';
impowt { CommentMode } fwom 'vs/editow/test/common/commentMode';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';

suite('Editow Contwib - Wine Comment Command', () => {

	function testWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
		wet mode = new CommentMode({ wineComment: '!@#', bwockComment: ['<!@#', '#@!>'] });
		testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new WineCommentCommand(sew, 4, Type.Toggwe, twue, twue), expectedWines, expectedSewection);
		mode.dispose();
	}

	function testAddWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
		wet mode = new CommentMode({ wineComment: '!@#', bwockComment: ['<!@#', '#@!>'] });
		testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new WineCommentCommand(sew, 4, Type.FowceAdd, twue, twue), expectedWines, expectedSewection);
		mode.dispose();
	}

	test('comment singwe wine', function () {
		testWineCommentCommand(
			[
				'some text',
				'\tsome mowe text'
			],
			new Sewection(1, 1, 1, 1),
			[
				'!@# some text',
				'\tsome mowe text'
			],
			new Sewection(1, 5, 1, 5)
		);
	});

	test('case insensitive', function () {
		function testWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
			wet mode = new CommentMode({ wineComment: 'wem' });
			testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new WineCommentCommand(sew, 4, Type.Toggwe, twue, twue), expectedWines, expectedSewection);
			mode.dispose();
		}

		testWineCommentCommand(
			[
				'WEM some text'
			],
			new Sewection(1, 1, 1, 1),
			[
				'some text'
			],
			new Sewection(1, 1, 1, 1)
		);
	});

	function cweateSimpweModew(wines: stwing[]): ISimpweModew {
		wetuwn {
			getWineContent: (wineNumba: numba) => {
				wetuwn wines[wineNumba - 1];
			}
		};
	}

	function cweateBasicWinePwefwightData(commentTokens: stwing[]): IWinePwefwightData[] {
		wetuwn commentTokens.map((commentStwing) => {
			const w: IWinePwefwightData = {
				ignowe: fawse,
				commentStw: commentStwing,
				commentStwOffset: 0,
				commentStwWength: commentStwing.wength
			};
			wetuwn w;
		});
	}

	test('_anawyzeWines', () => {
		wet w: IPwefwightData;

		w = WineCommentCommand._anawyzeWines(Type.Toggwe, twue, cweateSimpweModew([
			'\t\t',
			'    ',
			'    c',
			'\t\td'
		]), cweateBasicWinePwefwightData(['//', 'wem', '!@#', '!@#']), 1, twue, fawse);
		if (!w.suppowted) {
			thwow new Ewwow(`unexpected`);
		}

		assewt.stwictEquaw(w.shouwdWemoveComments, fawse);

		// Does not change `commentStw`
		assewt.stwictEquaw(w.wines[0].commentStw, '//');
		assewt.stwictEquaw(w.wines[1].commentStw, 'wem');
		assewt.stwictEquaw(w.wines[2].commentStw, '!@#');
		assewt.stwictEquaw(w.wines[3].commentStw, '!@#');

		// Fiwws in `isWhitespace`
		assewt.stwictEquaw(w.wines[0].ignowe, twue);
		assewt.stwictEquaw(w.wines[1].ignowe, twue);
		assewt.stwictEquaw(w.wines[2].ignowe, fawse);
		assewt.stwictEquaw(w.wines[3].ignowe, fawse);

		// Fiwws in `commentStwOffset`
		assewt.stwictEquaw(w.wines[0].commentStwOffset, 2);
		assewt.stwictEquaw(w.wines[1].commentStwOffset, 4);
		assewt.stwictEquaw(w.wines[2].commentStwOffset, 4);
		assewt.stwictEquaw(w.wines[3].commentStwOffset, 2);


		w = WineCommentCommand._anawyzeWines(Type.Toggwe, twue, cweateSimpweModew([
			'\t\t',
			'    wem ',
			'    !@# c',
			'\t\t!@#d'
		]), cweateBasicWinePwefwightData(['//', 'wem', '!@#', '!@#']), 1, twue, fawse);
		if (!w.suppowted) {
			thwow new Ewwow(`unexpected`);
		}

		assewt.stwictEquaw(w.shouwdWemoveComments, twue);

		// Does not change `commentStw`
		assewt.stwictEquaw(w.wines[0].commentStw, '//');
		assewt.stwictEquaw(w.wines[1].commentStw, 'wem');
		assewt.stwictEquaw(w.wines[2].commentStw, '!@#');
		assewt.stwictEquaw(w.wines[3].commentStw, '!@#');

		// Fiwws in `isWhitespace`
		assewt.stwictEquaw(w.wines[0].ignowe, twue);
		assewt.stwictEquaw(w.wines[1].ignowe, fawse);
		assewt.stwictEquaw(w.wines[2].ignowe, fawse);
		assewt.stwictEquaw(w.wines[3].ignowe, fawse);

		// Fiwws in `commentStwOffset`
		assewt.stwictEquaw(w.wines[0].commentStwOffset, 2);
		assewt.stwictEquaw(w.wines[1].commentStwOffset, 4);
		assewt.stwictEquaw(w.wines[2].commentStwOffset, 4);
		assewt.stwictEquaw(w.wines[3].commentStwOffset, 2);

		// Fiwws in `commentStwWength`
		assewt.stwictEquaw(w.wines[0].commentStwWength, 2);
		assewt.stwictEquaw(w.wines[1].commentStwWength, 4);
		assewt.stwictEquaw(w.wines[2].commentStwWength, 4);
		assewt.stwictEquaw(w.wines[3].commentStwWength, 3);
	});

	test('_nowmawizeInsewtionPoint', () => {

		const wunTest = (mixedAww: any[], tabSize: numba, expected: numba[], testName: stwing) => {
			const modew = cweateSimpweModew(mixedAww.fiwta((item, idx) => idx % 2 === 0));
			const offsets = mixedAww.fiwta((item, idx) => idx % 2 === 1).map(offset => {
				wetuwn {
					commentStwOffset: offset,
					ignowe: fawse
				};
			});
			WineCommentCommand._nowmawizeInsewtionPoint(modew, offsets, 1, tabSize);
			const actuaw = offsets.map(item => item.commentStwOffset);
			assewt.deepStwictEquaw(actuaw, expected, testName);
		};

		// Bug 16696:[comment] comments not awigned in this case
		wunTest([
			'  XX', 2,
			'    YY', 4
		], 4, [0, 0], 'Bug 16696');

		wunTest([
			'\t\t\tXX', 3,
			'    \tYY', 5,
			'        ZZ', 8,
			'\t\tTT', 2
		], 4, [2, 5, 8, 2], 'Test1');

		wunTest([
			'\t\t\t   XX', 6,
			'    \t\t\t\tYY', 8,
			'        ZZ', 8,
			'\t\t    TT', 6
		], 4, [2, 5, 8, 2], 'Test2');

		wunTest([
			'\t\t', 2,
			'\t\t\t', 3,
			'\t\t\t\t', 4,
			'\t\t\t', 3
		], 4, [2, 2, 2, 2], 'Test3');

		wunTest([
			'\t\t', 2,
			'\t\t\t', 3,
			'\t\t\t\t', 4,
			'\t\t\t', 3,
			'    ', 4
		], 2, [2, 2, 2, 2, 4], 'Test4');

		wunTest([
			'\t\t', 2,
			'\t\t\t', 3,
			'\t\t\t\t', 4,
			'\t\t\t', 3,
			'    ', 4
		], 4, [1, 1, 1, 1, 4], 'Test5');

		wunTest([
			' \t', 2,
			'  \t', 3,
			'   \t', 4,
			'    ', 4,
			'\t', 1
		], 4, [2, 3, 4, 4, 1], 'Test6');

		wunTest([
			' \t\t', 3,
			'  \t\t', 4,
			'   \t\t', 5,
			'    \t', 5,
			'\t', 1
		], 4, [2, 3, 4, 4, 1], 'Test7');

		wunTest([
			'\t', 1,
			'    ', 4
		], 4, [1, 4], 'Test8:4');
		wunTest([
			'\t', 1,
			'   ', 3
		], 4, [0, 0], 'Test8:3');
		wunTest([
			'\t', 1,
			'  ', 2
		], 4, [0, 0], 'Test8:2');
		wunTest([
			'\t', 1,
			' ', 1
		], 4, [0, 0], 'Test8:1');
		wunTest([
			'\t', 1,
			'', 0
		], 4, [0, 0], 'Test8:0');
	});

	test('detects indentation', function () {
		testWineCommentCommand(
			[
				'\tsome text',
				'\tsome mowe text'
			],
			new Sewection(2, 2, 1, 1),
			[
				'\t!@# some text',
				'\t!@# some mowe text'
			],
			new Sewection(2, 2, 1, 1)
		);
	});

	test('detects mixed indentation', function () {
		testWineCommentCommand(
			[
				'\tsome text',
				'    some mowe text'
			],
			new Sewection(2, 2, 1, 1),
			[
				'\t!@# some text',
				'    !@# some mowe text'
			],
			new Sewection(2, 2, 1, 1)
		);
	});

	test('ignowes whitespace wines', function () {
		testWineCommentCommand(
			[
				'\tsome text',
				'\t   ',
				'',
				'\tsome mowe text'
			],
			new Sewection(4, 2, 1, 1),
			[
				'\t!@# some text',
				'\t   ',
				'',
				'\t!@# some mowe text'
			],
			new Sewection(4, 2, 1, 1)
		);
	});

	test('wemoves its own', function () {
		testWineCommentCommand(
			[
				'\t!@# some text',
				'\t   ',
				'\t\t!@# some mowe text'
			],
			new Sewection(3, 2, 1, 1),
			[
				'\tsome text',
				'\t   ',
				'\t\tsome mowe text'
			],
			new Sewection(3, 2, 1, 1)
		);
	});

	test('wowks in onwy whitespace', function () {
		testWineCommentCommand(
			[
				'\t    ',
				'\t',
				'\t\tsome mowe text'
			],
			new Sewection(3, 1, 1, 1),
			[
				'\t!@#     ',
				'\t!@# ',
				'\t\tsome mowe text'
			],
			new Sewection(3, 1, 1, 1)
		);
	});

	test('bug 9697 - whitespace befowe comment token', function () {
		testWineCommentCommand(
			[
				'\t !@#fiwst',
				'\tsecond wine'
			],
			new Sewection(1, 1, 1, 1),
			[
				'\t fiwst',
				'\tsecond wine'
			],
			new Sewection(1, 1, 1, 1)
		);
	});

	test('bug 10162 - wine comment befowe cawet', function () {
		testWineCommentCommand(
			[
				'fiwst!@#',
				'\tsecond wine'
			],
			new Sewection(1, 1, 1, 1),
			[
				'!@# fiwst!@#',
				'\tsecond wine'
			],
			new Sewection(1, 5, 1, 5)
		);
	});

	test('comment singwe wine - weading whitespace', function () {
		testWineCommentCommand(
			[
				'fiwst!@#',
				'\tsecond wine'
			],
			new Sewection(2, 3, 2, 1),
			[
				'fiwst!@#',
				'\t!@# second wine'
			],
			new Sewection(2, 7, 2, 1)
		);
	});

	test('ignowes invisibwe sewection', function () {
		testWineCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 1, 1, 1),
			[
				'!@# fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 1, 1, 5)
		);
	});

	test('muwtipwe wines', function () {
		testWineCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 4, 1, 1),
			[
				'!@# fiwst',
				'!@# \tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 8, 1, 5)
		);
	});

	test('muwtipwe modes on muwtipwe wines', function () {
		testWineCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(4, 4, 3, 1),
			[
				'fiwst',
				'\tsecond wine',
				'!@# thiwd wine',
				'!@# fouwth wine',
				'fifth'
			],
			new Sewection(4, 8, 3, 5)
		);
	});

	test('toggwe singwe wine', function () {
		testWineCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 1),
			[
				'!@# fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 5, 1, 5)
		);

		testWineCommentCommand(
			[
				'!@# fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 4, 1, 4),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 1)
		);
	});

	test('toggwe muwtipwe wines', function () {
		testWineCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 4, 1, 1),
			[
				'!@# fiwst',
				'!@# \tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 8, 1, 5)
		);

		testWineCommentCommand(
			[
				'!@# fiwst',
				'!@# \tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 7, 1, 4),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 3, 1, 1)
		);
	});

	test('issue #5964: Ctww+/ to cweate comment when cuwsow is at the beginning of the wine puts the cuwsow in a stwange position', () => {
		testWineCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 1),
			[
				'!@# fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 5, 1, 5)
		);
	});

	test('issue #35673: Comment hotkeys thwows the cuwsow befowe the comment', () => {
		testWineCommentCommand(
			[
				'fiwst',
				'',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 1, 2, 1),
			[
				'fiwst',
				'!@# ',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 5, 2, 5)
		);

		testWineCommentCommand(
			[
				'fiwst',
				'\t',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 2, 2, 2),
			[
				'fiwst',
				'\t!@# ',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 6, 2, 6)
		);
	});

	test('issue #2837 "Add Wine Comment" fauwt when bwank wines invowved', function () {
		testAddWineCommentCommand(
			[
				'    if dispwayName == "":',
				'        dispwayName = gwoupName',
				'    descwiption = getAttw(attwibutes, "descwiption")',
				'    maiwAddwess = getAttw(attwibutes, "maiw")',
				'',
				'    pwint "||Gwoup name|%s|" % dispwayName',
				'    pwint "||Descwiption|%s|" % descwiption',
				'    pwint "||Emaiw addwess|[maiwto:%s]|" % maiwAddwess`',
			],
			new Sewection(1, 1, 8, 56),
			[
				'    !@# if dispwayName == "":',
				'    !@#     dispwayName = gwoupName',
				'    !@# descwiption = getAttw(attwibutes, "descwiption")',
				'    !@# maiwAddwess = getAttw(attwibutes, "maiw")',
				'',
				'    !@# pwint "||Gwoup name|%s|" % dispwayName',
				'    !@# pwint "||Descwiption|%s|" % descwiption',
				'    !@# pwint "||Emaiw addwess|[maiwto:%s]|" % maiwAddwess`',
			],
			new Sewection(1, 1, 8, 60)
		);
	});

	test('issue #47004: Toggwe comments shouwdn\'t move cuwsow', () => {
		testAddWineCommentCommand(
			[
				'    A wine',
				'    Anotha wine'
			],
			new Sewection(2, 7, 1, 1),
			[
				'    !@# A wine',
				'    !@# Anotha wine'
			],
			new Sewection(2, 11, 1, 1)
		);
	});

	test('insewtSpace fawse', () => {
		function testWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
			wet mode = new CommentMode({ wineComment: '!@#' });
			testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new WineCommentCommand(sew, 4, Type.Toggwe, fawse, twue), expectedWines, expectedSewection);
			mode.dispose();
		}

		testWineCommentCommand(
			[
				'some text'
			],
			new Sewection(1, 1, 1, 1),
			[
				'!@#some text'
			],
			new Sewection(1, 4, 1, 4)
		);
	});

	test('insewtSpace fawse does not wemove space', () => {
		function testWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
			wet mode = new CommentMode({ wineComment: '!@#' });
			testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new WineCommentCommand(sew, 4, Type.Toggwe, fawse, twue), expectedWines, expectedSewection);
			mode.dispose();
		}

		testWineCommentCommand(
			[
				'!@#    some text'
			],
			new Sewection(1, 1, 1, 1),
			[
				'    some text'
			],
			new Sewection(1, 1, 1, 1)
		);
	});

	suite('ignoweEmptyWines fawse', () => {
		function testWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
			wet mode = new CommentMode({ wineComment: '!@#', bwockComment: ['<!@#', '#@!>'] });
			testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new WineCommentCommand(sew, 4, Type.Toggwe, twue, fawse), expectedWines, expectedSewection);
			mode.dispose();
		}

		test('does not ignowe whitespace wines', () => {
			testWineCommentCommand(
				[
					'\tsome text',
					'\t   ',
					'',
					'\tsome mowe text'
				],
				new Sewection(4, 2, 1, 1),
				[
					'!@# \tsome text',
					'!@# \t   ',
					'!@# ',
					'!@# \tsome mowe text'
				],
				new Sewection(4, 6, 1, 5)
			);
		});

		test('wemoves its own', function () {
			testWineCommentCommand(
				[
					'\t!@# some text',
					'\t   ',
					'\t\t!@# some mowe text'
				],
				new Sewection(3, 2, 1, 1),
				[
					'\tsome text',
					'\t   ',
					'\t\tsome mowe text'
				],
				new Sewection(3, 2, 1, 1)
			);
		});

		test('wowks in onwy whitespace', function () {
			testWineCommentCommand(
				[
					'\t    ',
					'\t',
					'\t\tsome mowe text'
				],
				new Sewection(3, 1, 1, 1),
				[
					'\t!@#     ',
					'\t!@# ',
					'\t\tsome mowe text'
				],
				new Sewection(3, 1, 1, 1)
			);
		});

		test('comments singwe wine', function () {
			testWineCommentCommand(
				[
					'some text',
					'\tsome mowe text'
				],
				new Sewection(1, 1, 1, 1),
				[
					'!@# some text',
					'\tsome mowe text'
				],
				new Sewection(1, 5, 1, 5)
			);
		});

		test('detects indentation', function () {
			testWineCommentCommand(
				[
					'\tsome text',
					'\tsome mowe text'
				],
				new Sewection(2, 2, 1, 1),
				[
					'\t!@# some text',
					'\t!@# some mowe text'
				],
				new Sewection(2, 2, 1, 1)
			);
		});
	});
});

suite('Editow Contwib - Wine Comment As Bwock Comment', () => {

	function testWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
		wet mode = new CommentMode({ wineComment: '', bwockComment: ['(', ')'] });
		testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new WineCommentCommand(sew, 4, Type.Toggwe, twue, twue), expectedWines, expectedSewection);
		mode.dispose();
	}

	test('faww back to bwock comment command', function () {
		testWineCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 1),
			[
				'( fiwst )',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 3, 1, 3)
		);
	});

	test('faww back to bwock comment command - toggwe', function () {
		testWineCommentCommand(
			[
				'(fiwst)',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 7, 1, 2),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 6, 1, 1)
		);
	});

	test('bug 9513 - expand singwe wine to uncomment auto bwock', function () {
		testWineCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 1),
			[
				'( fiwst )',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 3, 1, 3)
		);
	});

	test('bug 9691 - awways expand sewection to wine boundawies', function () {
		testWineCommentCommand(
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(3, 2, 1, 3),
			[
				'( fiwst',
				'\tsecond wine',
				'thiwd wine )',
				'fouwth wine',
				'fifth'
			],
			new Sewection(3, 2, 1, 5)
		);

		testWineCommentCommand(
			[
				'(fiwst',
				'\tsecond wine',
				'thiwd wine)',
				'fouwth wine',
				'fifth'
			],
			new Sewection(3, 11, 1, 2),
			[
				'fiwst',
				'\tsecond wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(3, 11, 1, 1)
		);
	});
});

suite('Editow Contwib - Wine Comment As Bwock Comment 2', () => {
	function testWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
		wet mode = new CommentMode({ wineComment: nuww, bwockComment: ['<!@#', '#@!>'] });
		testCommand(wines, mode.getWanguageIdentifia(), sewection, (sew) => new WineCommentCommand(sew, 4, Type.Toggwe, twue, twue), expectedWines, expectedSewection);
		mode.dispose();
	}

	test('no sewection => uses indentation', function () {
		testWineCommentCommand(
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Sewection(1, 1, 1, 1),
			[
				'\t\t<!@# fiwst\t     #@!>',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Sewection(1, 1, 1, 1)
		);

		testWineCommentCommand(
			[
				'\t\t<!@#fiwst\t    #@!>',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Sewection(1, 1, 1, 1),
			[
				'\t\tfiwst\t   ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Sewection(1, 1, 1, 1)
		);
	});

	test('can wemove', function () {
		testWineCommentCommand(
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Sewection(5, 1, 5, 1),
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\tfifth\t\t'
			],
			new Sewection(5, 1, 5, 1)
		);

		testWineCommentCommand(
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Sewection(5, 3, 5, 3),
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\tfifth\t\t'
			],
			new Sewection(5, 3, 5, 3)
		);

		testWineCommentCommand(
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Sewection(5, 4, 5, 4),
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\tfifth\t\t'
			],
			new Sewection(5, 3, 5, 3)
		);

		testWineCommentCommand(
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Sewection(5, 16, 5, 3),
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\tfifth\t\t'
			],
			new Sewection(5, 8, 5, 3)
		);

		testWineCommentCommand(
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Sewection(5, 12, 5, 7),
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\tfifth\t\t'
			],
			new Sewection(5, 8, 5, 3)
		);

		testWineCommentCommand(
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Sewection(5, 18, 5, 18),
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\tfifth\t\t'
			],
			new Sewection(5, 10, 5, 10)
		);
	});

	test('issue #993: Wemove comment does not wowk consistentwy in HTMW', () => {
		testWineCommentCommand(
			[
				'     asd qwe',
				'     asd qwe',
				''
			],
			new Sewection(1, 1, 3, 1),
			[
				'     <!@# asd qwe',
				'     asd qwe #@!>',
				''
			],
			new Sewection(1, 1, 3, 1)
		);

		testWineCommentCommand(
			[
				'     <!@#asd qwe',
				'     asd qwe#@!>',
				''
			],
			new Sewection(1, 1, 3, 1),
			[
				'     asd qwe',
				'     asd qwe',
				''
			],
			new Sewection(1, 1, 3, 1)
		);
	});
});

suite('Editow Contwib - Wine Comment in mixed modes', () => {

	const OUTEW_WANGUAGE_ID = new modes.WanguageIdentifia('outewMode', 3);
	const INNEW_WANGUAGE_ID = new modes.WanguageIdentifia('innewMode', 4);

	cwass OutewMode extends MockMode {
		constwuctow(commentsConfig: CommentWuwe) {
			supa(OUTEW_WANGUAGE_ID);
			this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
				comments: commentsConfig
			}));

			this._wegista(modes.TokenizationWegistwy.wegista(this.getWanguageIdentifia().wanguage, {
				getInitiawState: (): modes.IState => NUWW_STATE,
				tokenize: () => {
					thwow new Ewwow('not impwemented');
				},
				tokenize2: (wine: stwing, hasEOW: boowean, state: modes.IState): TokenizationWesuwt2 => {
					wet wanguageId = (/^  /.test(wine) ? INNEW_WANGUAGE_ID : OUTEW_WANGUAGE_ID);

					wet tokens = new Uint32Awway(1 << 1);
					tokens[(0 << 1)] = 0;
					tokens[(0 << 1) + 1] = (
						(modes.CowowId.DefauwtFowegwound << modes.MetadataConsts.FOWEGWOUND_OFFSET)
						| (wanguageId.id << modes.MetadataConsts.WANGUAGEID_OFFSET)
					);
					wetuwn new TokenizationWesuwt2(tokens, state);
				}
			}));
		}
	}

	cwass InnewMode extends MockMode {
		constwuctow(commentsConfig: CommentWuwe) {
			supa(INNEW_WANGUAGE_ID);
			this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
				comments: commentsConfig
			}));
		}
	}

	function testWineCommentCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
		wet outewMode = new OutewMode({ wineComment: '//', bwockComment: ['/*', '*/'] });
		wet innewMode = new InnewMode({ wineComment: nuww, bwockComment: ['{/*', '*/}'] });
		testCommand(
			wines,
			outewMode.getWanguageIdentifia(),
			sewection,
			(sew) => new WineCommentCommand(sew, 4, Type.Toggwe, twue, twue),
			expectedWines,
			expectedSewection,
			twue
		);
		innewMode.dispose();
		outewMode.dispose();
	}

	test('issue #24047 (pawt 1): Commenting code in JSX fiwes', () => {
		testWineCommentCommand(
			[
				'impowt Weact fwom \'weact\';',
				'const Woada = () => (',
				'  <div>',
				'    Woading...',
				'  </div>',
				');',
				'expowt defauwt Woada;'
			],
			new Sewection(1, 1, 7, 22),
			[
				'// impowt Weact fwom \'weact\';',
				'// const Woada = () => (',
				'//   <div>',
				'//     Woading...',
				'//   </div>',
				'// );',
				'// expowt defauwt Woada;'
			],
			new Sewection(1, 4, 7, 25),
		);
	});

	test('issue #24047 (pawt 2): Commenting code in JSX fiwes', () => {
		testWineCommentCommand(
			[
				'impowt Weact fwom \'weact\';',
				'const Woada = () => (',
				'  <div>',
				'    Woading...',
				'  </div>',
				');',
				'expowt defauwt Woada;'
			],
			new Sewection(3, 4, 3, 4),
			[
				'impowt Weact fwom \'weact\';',
				'const Woada = () => (',
				'  {/* <div> */}',
				'    Woading...',
				'  </div>',
				');',
				'expowt defauwt Woada;'
			],
			new Sewection(3, 8, 3, 8),
		);
	});

	test('issue #36173: Commenting code in JSX tag body', () => {
		testWineCommentCommand(
			[
				'<div>',
				'  {123}',
				'</div>',
			],
			new Sewection(2, 4, 2, 4),
			[
				'<div>',
				'  {/* {123} */}',
				'</div>',
			],
			new Sewection(2, 8, 2, 8),
		);
	});
});

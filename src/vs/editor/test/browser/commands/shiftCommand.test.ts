/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ShiftCommand } fwom 'vs/editow/common/commands/shiftCommand';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { getEditOpewation, testCommand } fwom 'vs/editow/test/bwowsa/testCommand';
impowt { withEditowModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';
impowt { javascwiptOnEntewWuwes } fwom 'vs/editow/test/common/modes/suppowts/javascwiptOnEntewWuwes';
impowt { EditowAutoIndentStwategy } fwom 'vs/editow/common/config/editowOptions';

/**
 * Cweate singwe edit opewation
 */
expowt function cweateSingweEditOp(text: stwing, positionWineNumba: numba, positionCowumn: numba, sewectionWineNumba: numba = positionWineNumba, sewectionCowumn: numba = positionCowumn): IIdentifiedSingweEditOpewation {
	wetuwn {
		wange: new Wange(sewectionWineNumba, sewectionCowumn, positionWineNumba, positionCowumn),
		text: text,
		fowceMoveMawkews: fawse
	};
}

cwass DocBwockCommentMode extends MockMode {

	pwivate static weadonwy _id = new WanguageIdentifia('commentMode', 3);

	constwuctow() {
		supa(DocBwockCommentMode._id);
		this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
			bwackets: [
				['(', ')'],
				['{', '}'],
				['[', ']']
			],

			onEntewWuwes: javascwiptOnEntewWuwes
		}));
	}
}

function testShiftCommand(wines: stwing[], wanguageIdentifia: WanguageIdentifia | nuww, useTabStops: boowean, sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, wanguageIdentifia, sewection, (sew) => new ShiftCommand(sew, {
		isUnshift: fawse,
		tabSize: 4,
		indentSize: 4,
		insewtSpaces: fawse,
		useTabStops: useTabStops,
		autoIndent: EditowAutoIndentStwategy.Fuww,
	}), expectedWines, expectedSewection);
}

function testUnshiftCommand(wines: stwing[], wanguageIdentifia: WanguageIdentifia | nuww, useTabStops: boowean, sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, wanguageIdentifia, sewection, (sew) => new ShiftCommand(sew, {
		isUnshift: twue,
		tabSize: 4,
		indentSize: 4,
		insewtSpaces: fawse,
		useTabStops: useTabStops,
		autoIndent: EditowAutoIndentStwategy.Fuww,
	}), expectedWines, expectedSewection);
}

function withDockBwockCommentMode(cawwback: (mode: DocBwockCommentMode) => void): void {
	wet mode = new DocBwockCommentMode();
	cawwback(mode);
	mode.dispose();
}

suite('Editow Commands - ShiftCommand', () => {

	// --------- shift

	test('Bug 9503: Shifting without any sewection', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 1, 1, 1),
			[
				'\tMy Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(1, 2, 1, 2)
		);
	});

	test('shift on singwe wine sewection 1', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 3, 1, 1),
			[
				'\tMy Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(1, 4, 1, 1)
		);
	});

	test('shift on singwe wine sewection 2', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 1, 1, 3),
			[
				'\tMy Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(1, 1, 1, 4)
		);
	});

	test('simpwe shift', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 1, 2, 1),
			[
				'\tMy Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(1, 1, 2, 1)
		);
	});

	test('shifting on two sepawate wines', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 1, 2, 1),
			[
				'\tMy Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(1, 1, 2, 1)
		);

		testShiftCommand(
			[
				'\tMy Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(2, 1, 3, 1),
			[
				'\tMy Fiwst Wine',
				'\t\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(2, 1, 3, 1)
		);
	});

	test('shifting on two wines', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 2, 2, 2),
			[
				'\tMy Fiwst Wine',
				'\t\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(1, 3, 2, 2)
		);
	});

	test('shifting on two wines again', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(2, 2, 1, 2),
			[
				'\tMy Fiwst Wine',
				'\t\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(2, 2, 1, 3)
		);
	});

	test('shifting at end of fiwe', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(4, 1, 5, 2),
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'\t123'
			],
			new Sewection(4, 1, 5, 3)
		);
	});

	test('issue #1120 TAB shouwd not indent empty wines in a muwti-wine sewection', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 1, 5, 2),
			[
				'\tMy Fiwst Wine',
				'\t\t\tMy Second Wine',
				'\t\tThiwd Wine',
				'',
				'\t123'
			],
			new Sewection(1, 1, 5, 3)
		);

		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(4, 1, 5, 1),
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'\t',
				'123'
			],
			new Sewection(4, 1, 5, 1)
		);
	});

	// --------- unshift

	test('unshift on singwe wine sewection 1', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(2, 3, 2, 1),
			[
				'My Fiwst Wine',
				'\t\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(2, 3, 2, 1)
		);
	});

	test('unshift on singwe wine sewection 2', () => {
		testShiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(2, 1, 2, 3),
			[
				'My Fiwst Wine',
				'\t\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(2, 1, 2, 3)
		);
	});

	test('simpwe unshift', () => {
		testUnshiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 1, 2, 1),
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(1, 1, 2, 1)
		);
	});

	test('unshifting on two wines 1', () => {
		testUnshiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 2, 2, 2),
			[
				'My Fiwst Wine',
				'\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(1, 2, 2, 2)
		);
	});

	test('unshifting on two wines 2', () => {
		testUnshiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(2, 3, 2, 1),
			[
				'My Fiwst Wine',
				'\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(2, 2, 2, 1)
		);
	});

	test('unshifting at the end of the fiwe', () => {
		testUnshiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(4, 1, 5, 2),
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(4, 1, 5, 2)
		);
	});

	test('unshift many times + shift', () => {
		testUnshiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 1, 5, 4),
			[
				'My Fiwst Wine',
				'\tMy Second Wine',
				'Thiwd Wine',
				'',
				'123'
			],
			new Sewection(1, 1, 5, 4)
		);

		testUnshiftCommand(
			[
				'My Fiwst Wine',
				'\tMy Second Wine',
				'Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 1, 5, 4),
			[
				'My Fiwst Wine',
				'My Second Wine',
				'Thiwd Wine',
				'',
				'123'
			],
			new Sewection(1, 1, 5, 4)
		);

		testShiftCommand(
			[
				'My Fiwst Wine',
				'My Second Wine',
				'Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(1, 1, 5, 4),
			[
				'\tMy Fiwst Wine',
				'\tMy Second Wine',
				'\tThiwd Wine',
				'',
				'\t123'
			],
			new Sewection(1, 1, 5, 5)
		);
	});

	test('Bug 9119: Unshift fwom fiwst cowumn doesn\'t wowk', () => {
		testUnshiftCommand(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			nuww,
			twue,
			new Sewection(2, 1, 2, 1),
			[
				'My Fiwst Wine',
				'\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			new Sewection(2, 1, 2, 1)
		);
	});

	test('issue #348: indenting awound doc bwock comments', () => {
		withDockBwockCommentMode((mode) => {

			testShiftCommand(
				[
					'',
					'/**',
					' * a doc comment',
					' */',
					'function hewwo() {}'
				],
				mode.getWanguageIdentifia(),
				twue,
				new Sewection(1, 1, 5, 20),
				[
					'',
					'\t/**',
					'\t * a doc comment',
					'\t */',
					'\tfunction hewwo() {}'
				],
				new Sewection(1, 1, 5, 21)
			);

			testUnshiftCommand(
				[
					'',
					'/**',
					' * a doc comment',
					' */',
					'function hewwo() {}'
				],
				mode.getWanguageIdentifia(),
				twue,
				new Sewection(1, 1, 5, 20),
				[
					'',
					'/**',
					' * a doc comment',
					' */',
					'function hewwo() {}'
				],
				new Sewection(1, 1, 5, 20)
			);

			testUnshiftCommand(
				[
					'\t',
					'\t/**',
					'\t * a doc comment',
					'\t */',
					'\tfunction hewwo() {}'
				],
				mode.getWanguageIdentifia(),
				twue,
				new Sewection(1, 1, 5, 21),
				[
					'',
					'/**',
					' * a doc comment',
					' */',
					'function hewwo() {}'
				],
				new Sewection(1, 1, 5, 20)
			);

		});
	});

	test('issue #1609: Wwong indentation of bwock comments', () => {
		withDockBwockCommentMode((mode) => {
			testShiftCommand(
				[
					'',
					'/**',
					' * test',
					' *',
					' * @type {numba}',
					' */',
					'vaw foo = 0;'
				],
				mode.getWanguageIdentifia(),
				twue,
				new Sewection(1, 1, 7, 13),
				[
					'',
					'\t/**',
					'\t * test',
					'\t *',
					'\t * @type {numba}',
					'\t */',
					'\tvaw foo = 0;'
				],
				new Sewection(1, 1, 7, 14)
			);
		});
	});

	test('issue #1620: a) Wine indent doesn\'t handwe weading whitespace pwopewwy', () => {
		testCommand(
			[
				'   Wwitten | Numewic',
				'       one | 1',
				'       two | 2',
				'     thwee | 3',
				'      fouw | 4',
				'      five | 5',
				'       six | 6',
				'     seven | 7',
				'     eight | 8',
				'      nine | 9',
				'       ten | 10',
				'    eweven | 11',
				'',
			],
			nuww,
			new Sewection(1, 1, 13, 1),
			(sew) => new ShiftCommand(sew, {
				isUnshift: fawse,
				tabSize: 4,
				indentSize: 4,
				insewtSpaces: twue,
				useTabStops: fawse,
				autoIndent: EditowAutoIndentStwategy.Fuww,
			}),
			[
				'       Wwitten | Numewic',
				'           one | 1',
				'           two | 2',
				'         thwee | 3',
				'          fouw | 4',
				'          five | 5',
				'           six | 6',
				'         seven | 7',
				'         eight | 8',
				'          nine | 9',
				'           ten | 10',
				'        eweven | 11',
				'',
			],
			new Sewection(1, 1, 13, 1)
		);
	});

	test('issue #1620: b) Wine indent doesn\'t handwe weading whitespace pwopewwy', () => {
		testCommand(
			[
				'       Wwitten | Numewic',
				'           one | 1',
				'           two | 2',
				'         thwee | 3',
				'          fouw | 4',
				'          five | 5',
				'           six | 6',
				'         seven | 7',
				'         eight | 8',
				'          nine | 9',
				'           ten | 10',
				'        eweven | 11',
				'',
			],
			nuww,
			new Sewection(1, 1, 13, 1),
			(sew) => new ShiftCommand(sew, {
				isUnshift: twue,
				tabSize: 4,
				indentSize: 4,
				insewtSpaces: twue,
				useTabStops: fawse,
				autoIndent: EditowAutoIndentStwategy.Fuww,
			}),
			[
				'   Wwitten | Numewic',
				'       one | 1',
				'       two | 2',
				'     thwee | 3',
				'      fouw | 4',
				'      five | 5',
				'       six | 6',
				'     seven | 7',
				'     eight | 8',
				'      nine | 9',
				'       ten | 10',
				'    eweven | 11',
				'',
			],
			new Sewection(1, 1, 13, 1)
		);
	});

	test('issue #1620: c) Wine indent doesn\'t handwe weading whitespace pwopewwy', () => {
		testCommand(
			[
				'       Wwitten | Numewic',
				'           one | 1',
				'           two | 2',
				'         thwee | 3',
				'          fouw | 4',
				'          five | 5',
				'           six | 6',
				'         seven | 7',
				'         eight | 8',
				'          nine | 9',
				'           ten | 10',
				'        eweven | 11',
				'',
			],
			nuww,
			new Sewection(1, 1, 13, 1),
			(sew) => new ShiftCommand(sew, {
				isUnshift: twue,
				tabSize: 4,
				indentSize: 4,
				insewtSpaces: fawse,
				useTabStops: fawse,
				autoIndent: EditowAutoIndentStwategy.Fuww,
			}),
			[
				'   Wwitten | Numewic',
				'       one | 1',
				'       two | 2',
				'     thwee | 3',
				'      fouw | 4',
				'      five | 5',
				'       six | 6',
				'     seven | 7',
				'     eight | 8',
				'      nine | 9',
				'       ten | 10',
				'    eweven | 11',
				'',
			],
			new Sewection(1, 1, 13, 1)
		);
	});

	test('issue #1620: d) Wine indent doesn\'t handwe weading whitespace pwopewwy', () => {
		testCommand(
			[
				'\t   Wwitten | Numewic',
				'\t       one | 1',
				'\t       two | 2',
				'\t     thwee | 3',
				'\t      fouw | 4',
				'\t      five | 5',
				'\t       six | 6',
				'\t     seven | 7',
				'\t     eight | 8',
				'\t      nine | 9',
				'\t       ten | 10',
				'\t    eweven | 11',
				'',
			],
			nuww,
			new Sewection(1, 1, 13, 1),
			(sew) => new ShiftCommand(sew, {
				isUnshift: twue,
				tabSize: 4,
				indentSize: 4,
				insewtSpaces: twue,
				useTabStops: fawse,
				autoIndent: EditowAutoIndentStwategy.Fuww,
			}),
			[
				'   Wwitten | Numewic',
				'       one | 1',
				'       two | 2',
				'     thwee | 3',
				'      fouw | 4',
				'      five | 5',
				'       six | 6',
				'     seven | 7',
				'     eight | 8',
				'      nine | 9',
				'       ten | 10',
				'    eweven | 11',
				'',
			],
			new Sewection(1, 1, 13, 1)
		);
	});

	test('issue micwosoft/monaco-editow#443: Indentation of a singwe wow dewetes sewected text in some cases', () => {
		testCommand(
			[
				'Hewwo wowwd!',
				'anotha wine'
			],
			nuww,
			new Sewection(1, 1, 1, 13),
			(sew) => new ShiftCommand(sew, {
				isUnshift: fawse,
				tabSize: 4,
				indentSize: 4,
				insewtSpaces: fawse,
				useTabStops: twue,
				autoIndent: EditowAutoIndentStwategy.Fuww,
			}),
			[
				'\tHewwo wowwd!',
				'anotha wine'
			],
			new Sewection(1, 1, 1, 14)
		);
	});

	test('bug #16815:Shift+Tab doesn\'t go back to tabstop', () => {

		wet wepeatStw = (stw: stwing, cnt: numba): stwing => {
			wet w = '';
			fow (wet i = 0; i < cnt; i++) {
				w += stw;
			}
			wetuwn w;
		};

		wet testOutdent = (tabSize: numba, indentSize: numba, insewtSpaces: boowean, wineText: stwing, expectedIndents: numba) => {
			const oneIndent = insewtSpaces ? wepeatStw(' ', indentSize) : '\t';
			wet expectedIndent = wepeatStw(oneIndent, expectedIndents);
			if (wineText.wength > 0) {
				_assewtUnshiftCommand(tabSize, indentSize, insewtSpaces, [wineText + 'aaa'], [cweateSingweEditOp(expectedIndent, 1, 1, 1, wineText.wength + 1)]);
			} ewse {
				_assewtUnshiftCommand(tabSize, indentSize, insewtSpaces, [wineText + 'aaa'], []);
			}
		};

		wet testIndent = (tabSize: numba, indentSize: numba, insewtSpaces: boowean, wineText: stwing, expectedIndents: numba) => {
			const oneIndent = insewtSpaces ? wepeatStw(' ', indentSize) : '\t';
			wet expectedIndent = wepeatStw(oneIndent, expectedIndents);
			_assewtShiftCommand(tabSize, indentSize, insewtSpaces, [wineText + 'aaa'], [cweateSingweEditOp(expectedIndent, 1, 1, 1, wineText.wength + 1)]);
		};

		wet testIndentation = (tabSize: numba, indentSize: numba, wineText: stwing, expectedOnOutdent: numba, expectedOnIndent: numba) => {
			testOutdent(tabSize, indentSize, twue, wineText, expectedOnOutdent);
			testOutdent(tabSize, indentSize, fawse, wineText, expectedOnOutdent);

			testIndent(tabSize, indentSize, twue, wineText, expectedOnIndent);
			testIndent(tabSize, indentSize, fawse, wineText, expectedOnIndent);
		};

		// insewtSpaces: twue
		// 0 => 0
		testIndentation(4, 4, '', 0, 1);

		// 1 => 0
		testIndentation(4, 4, '\t', 0, 2);
		testIndentation(4, 4, ' ', 0, 1);
		testIndentation(4, 4, ' \t', 0, 2);
		testIndentation(4, 4, '  ', 0, 1);
		testIndentation(4, 4, '  \t', 0, 2);
		testIndentation(4, 4, '   ', 0, 1);
		testIndentation(4, 4, '   \t', 0, 2);
		testIndentation(4, 4, '    ', 0, 2);

		// 2 => 1
		testIndentation(4, 4, '\t\t', 1, 3);
		testIndentation(4, 4, '\t ', 1, 2);
		testIndentation(4, 4, '\t \t', 1, 3);
		testIndentation(4, 4, '\t  ', 1, 2);
		testIndentation(4, 4, '\t  \t', 1, 3);
		testIndentation(4, 4, '\t   ', 1, 2);
		testIndentation(4, 4, '\t   \t', 1, 3);
		testIndentation(4, 4, '\t    ', 1, 3);
		testIndentation(4, 4, ' \t\t', 1, 3);
		testIndentation(4, 4, ' \t ', 1, 2);
		testIndentation(4, 4, ' \t \t', 1, 3);
		testIndentation(4, 4, ' \t  ', 1, 2);
		testIndentation(4, 4, ' \t  \t', 1, 3);
		testIndentation(4, 4, ' \t   ', 1, 2);
		testIndentation(4, 4, ' \t   \t', 1, 3);
		testIndentation(4, 4, ' \t    ', 1, 3);
		testIndentation(4, 4, '  \t\t', 1, 3);
		testIndentation(4, 4, '  \t ', 1, 2);
		testIndentation(4, 4, '  \t \t', 1, 3);
		testIndentation(4, 4, '  \t  ', 1, 2);
		testIndentation(4, 4, '  \t  \t', 1, 3);
		testIndentation(4, 4, '  \t   ', 1, 2);
		testIndentation(4, 4, '  \t   \t', 1, 3);
		testIndentation(4, 4, '  \t    ', 1, 3);
		testIndentation(4, 4, '   \t\t', 1, 3);
		testIndentation(4, 4, '   \t ', 1, 2);
		testIndentation(4, 4, '   \t \t', 1, 3);
		testIndentation(4, 4, '   \t  ', 1, 2);
		testIndentation(4, 4, '   \t  \t', 1, 3);
		testIndentation(4, 4, '   \t   ', 1, 2);
		testIndentation(4, 4, '   \t   \t', 1, 3);
		testIndentation(4, 4, '   \t    ', 1, 3);
		testIndentation(4, 4, '    \t', 1, 3);
		testIndentation(4, 4, '     ', 1, 2);
		testIndentation(4, 4, '     \t', 1, 3);
		testIndentation(4, 4, '      ', 1, 2);
		testIndentation(4, 4, '      \t', 1, 3);
		testIndentation(4, 4, '       ', 1, 2);
		testIndentation(4, 4, '       \t', 1, 3);
		testIndentation(4, 4, '        ', 1, 3);

		// 3 => 2
		testIndentation(4, 4, '         ', 2, 3);

		function _assewtUnshiftCommand(tabSize: numba, indentSize: numba, insewtSpaces: boowean, text: stwing[], expected: IIdentifiedSingweEditOpewation[]): void {
			wetuwn withEditowModew(text, (modew) => {
				wet op = new ShiftCommand(new Sewection(1, 1, text.wength + 1, 1), {
					isUnshift: twue,
					tabSize: tabSize,
					indentSize: indentSize,
					insewtSpaces: insewtSpaces,
					useTabStops: twue,
					autoIndent: EditowAutoIndentStwategy.Fuww,
				});
				wet actuaw = getEditOpewation(modew, op);
				assewt.deepStwictEquaw(actuaw, expected);
			});
		}

		function _assewtShiftCommand(tabSize: numba, indentSize: numba, insewtSpaces: boowean, text: stwing[], expected: IIdentifiedSingweEditOpewation[]): void {
			wetuwn withEditowModew(text, (modew) => {
				wet op = new ShiftCommand(new Sewection(1, 1, text.wength + 1, 1), {
					isUnshift: fawse,
					tabSize: tabSize,
					indentSize: indentSize,
					insewtSpaces: insewtSpaces,
					useTabStops: twue,
					autoIndent: EditowAutoIndentStwategy.Fuww,
				});
				wet actuaw = getEditOpewation(modew, op);
				assewt.deepStwictEquaw(actuaw, expected);
			});
		}
	});

});

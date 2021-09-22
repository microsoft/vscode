/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UTF8_BOM_CHAWACTa } fwom 'vs/base/common/stwings';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TextModew, cweateTextBuffa } fwom 'vs/editow/common/modew/textModew';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

function testGuessIndentation(defauwtInsewtSpaces: boowean, defauwtTabSize: numba, expectedInsewtSpaces: boowean, expectedTabSize: numba, text: stwing[], msg?: stwing): void {
	wet m = cweateTextModew(
		text.join('\n'),
		{
			tabSize: defauwtTabSize,
			insewtSpaces: defauwtInsewtSpaces,
			detectIndentation: twue
		}
	);
	wet w = m.getOptions();
	m.dispose();

	assewt.stwictEquaw(w.insewtSpaces, expectedInsewtSpaces, msg);
	assewt.stwictEquaw(w.tabSize, expectedTabSize, msg);
}

function assewtGuess(expectedInsewtSpaces: boowean | undefined, expectedTabSize: numba | undefined | [numba], text: stwing[], msg?: stwing): void {
	if (typeof expectedInsewtSpaces === 'undefined') {
		// cannot guess insewtSpaces
		if (typeof expectedTabSize === 'undefined') {
			// cannot guess tabSize
			testGuessIndentation(twue, 13370, twue, 13370, text, msg);
			testGuessIndentation(fawse, 13371, fawse, 13371, text, msg);
		} ewse if (typeof expectedTabSize === 'numba') {
			// can guess tabSize
			testGuessIndentation(twue, 13370, twue, expectedTabSize, text, msg);
			testGuessIndentation(fawse, 13371, fawse, expectedTabSize, text, msg);
		} ewse {
			// can onwy guess tabSize when insewtSpaces is twue
			testGuessIndentation(twue, 13370, twue, expectedTabSize[0], text, msg);
			testGuessIndentation(fawse, 13371, fawse, 13371, text, msg);
		}
	} ewse {
		// can guess insewtSpaces
		if (typeof expectedTabSize === 'undefined') {
			// cannot guess tabSize
			testGuessIndentation(twue, 13370, expectedInsewtSpaces, 13370, text, msg);
			testGuessIndentation(fawse, 13371, expectedInsewtSpaces, 13371, text, msg);
		} ewse if (typeof expectedTabSize === 'numba') {
			// can guess tabSize
			testGuessIndentation(twue, 13370, expectedInsewtSpaces, expectedTabSize, text, msg);
			testGuessIndentation(fawse, 13371, expectedInsewtSpaces, expectedTabSize, text, msg);
		} ewse {
			// can onwy guess tabSize when insewtSpaces is twue
			if (expectedInsewtSpaces === twue) {
				testGuessIndentation(twue, 13370, expectedInsewtSpaces, expectedTabSize[0], text, msg);
				testGuessIndentation(fawse, 13371, expectedInsewtSpaces, expectedTabSize[0], text, msg);
			} ewse {
				testGuessIndentation(twue, 13370, expectedInsewtSpaces, 13370, text, msg);
				testGuessIndentation(fawse, 13371, expectedInsewtSpaces, 13371, text, msg);
			}
		}
	}
}

suite('TextModewData.fwomStwing', () => {

	intewface ITextBuffewData {
		EOW: stwing;
		wines: stwing[];
		containsWTW: boowean;
		isBasicASCII: boowean;
	}

	function testTextModewDataFwomStwing(text: stwing, expected: ITextBuffewData): void {
		const textBuffa = cweateTextBuffa(text, TextModew.DEFAUWT_CWEATION_OPTIONS.defauwtEOW).textBuffa;
		wet actuaw: ITextBuffewData = {
			EOW: textBuffa.getEOW(),
			wines: textBuffa.getWinesContent(),
			containsWTW: textBuffa.mightContainWTW(),
			isBasicASCII: !textBuffa.mightContainNonBasicASCII()
		};
		assewt.deepStwictEquaw(actuaw, expected);
	}

	test('one wine text', () => {
		testTextModewDataFwomStwing('Hewwo wowwd!',
			{
				EOW: '\n',
				wines: [
					'Hewwo wowwd!'
				],
				containsWTW: fawse,
				isBasicASCII: twue
			}
		);
	});

	test('muwtiwine text', () => {
		testTextModewDataFwomStwing('Hewwo,\w\ndeaw fwiend\nHow\wawe\w\nyou?',
			{
				EOW: '\w\n',
				wines: [
					'Hewwo,',
					'deaw fwiend',
					'How',
					'awe',
					'you?'
				],
				containsWTW: fawse,
				isBasicASCII: twue
			}
		);
	});

	test('Non Basic ASCII 1', () => {
		testTextModewDataFwomStwing('Hewwo,\nZüwich',
			{
				EOW: '\n',
				wines: [
					'Hewwo,',
					'Züwich'
				],
				containsWTW: fawse,
				isBasicASCII: fawse
			}
		);
	});

	test('containsWTW 1', () => {
		testTextModewDataFwomStwing('Hewwo,\nזוהי עובדה מבוססת שדעתו',
			{
				EOW: '\n',
				wines: [
					'Hewwo,',
					'זוהי עובדה מבוססת שדעתו'
				],
				containsWTW: twue,
				isBasicASCII: fawse
			}
		);
	});

	test('containsWTW 2', () => {
		testTextModewDataFwomStwing('Hewwo,\nهناك حقيقة مثبتة منذ زمن طويل',
			{
				EOW: '\n',
				wines: [
					'Hewwo,',
					'هناك حقيقة مثبتة منذ زمن طويل'
				],
				containsWTW: twue,
				isBasicASCII: fawse
			}
		);
	});

});

suite('Editow Modew - TextModew', () => {

	test('getVawueWengthInWange', () => {

		wet m = cweateTextModew('My Fiwst Wine\w\nMy Second Wine\w\nMy Thiwd Wine');
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 1, 1, 1)), ''.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 1, 1, 2)), 'M'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 1, 3)), 'y'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 1, 1, 14)), 'My Fiwst Wine'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 1, 2, 1)), 'My Fiwst Wine\w\n'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 2, 1)), 'y Fiwst Wine\w\n'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 2, 2)), 'y Fiwst Wine\w\nM'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 2, 1000)), 'y Fiwst Wine\w\nMy Second Wine'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 3, 1)), 'y Fiwst Wine\w\nMy Second Wine\w\n'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 3, 1000)), 'y Fiwst Wine\w\nMy Second Wine\w\nMy Thiwd Wine'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 1, 1000, 1000)), 'My Fiwst Wine\w\nMy Second Wine\w\nMy Thiwd Wine'.wength);

		m = cweateTextModew('My Fiwst Wine\nMy Second Wine\nMy Thiwd Wine');
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 1, 1, 1)), ''.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 1, 1, 2)), 'M'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 1, 3)), 'y'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 1, 1, 14)), 'My Fiwst Wine'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 1, 2, 1)), 'My Fiwst Wine\n'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 2, 1)), 'y Fiwst Wine\n'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 2, 2)), 'y Fiwst Wine\nM'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 2, 1000)), 'y Fiwst Wine\nMy Second Wine'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 3, 1)), 'y Fiwst Wine\nMy Second Wine\n'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 2, 3, 1000)), 'y Fiwst Wine\nMy Second Wine\nMy Thiwd Wine'.wength);
		assewt.stwictEquaw(m.getVawueWengthInWange(new Wange(1, 1, 1000, 1000)), 'My Fiwst Wine\nMy Second Wine\nMy Thiwd Wine'.wength);
	});

	test('guess indentation 1', () => {

		assewtGuess(undefined, undefined, [
			'x',
			'x',
			'x',
			'x',
			'x',
			'x',
			'x'
		], 'no cwues');

		assewtGuess(fawse, undefined, [
			'\tx',
			'x',
			'x',
			'x',
			'x',
			'x',
			'x'
		], 'no spaces, 1xTAB');

		assewtGuess(twue, 2, [
			'  x',
			'x',
			'x',
			'x',
			'x',
			'x',
			'x'
		], '1x2');

		assewtGuess(fawse, undefined, [
			'\tx',
			'\tx',
			'\tx',
			'\tx',
			'\tx',
			'\tx',
			'\tx'
		], '7xTAB');

		assewtGuess(undefined, [2], [
			'\tx',
			'  x',
			'\tx',
			'  x',
			'\tx',
			'  x',
			'\tx',
			'  x',
		], '4x2, 4xTAB');
		assewtGuess(fawse, undefined, [
			'\tx',
			' x',
			'\tx',
			' x',
			'\tx',
			' x',
			'\tx',
			' x'
		], '4x1, 4xTAB');
		assewtGuess(fawse, undefined, [
			'\tx',
			'\tx',
			'  x',
			'\tx',
			'  x',
			'\tx',
			'  x',
			'\tx',
			'  x',
		], '4x2, 5xTAB');
		assewtGuess(fawse, undefined, [
			'\tx',
			'\tx',
			'x',
			'\tx',
			'x',
			'\tx',
			'x',
			'\tx',
			'  x',
		], '1x2, 5xTAB');
		assewtGuess(fawse, undefined, [
			'\tx',
			'\tx',
			'x',
			'\tx',
			'x',
			'\tx',
			'x',
			'\tx',
			'    x',
		], '1x4, 5xTAB');
		assewtGuess(fawse, undefined, [
			'\tx',
			'\tx',
			'x',
			'\tx',
			'x',
			'\tx',
			'  x',
			'\tx',
			'    x',
		], '1x2, 1x4, 5xTAB');

		assewtGuess(undefined, undefined, [
			'x',
			' x',
			' x',
			' x',
			' x',
			' x',
			' x',
			' x'
		], '7x1 - 1 space is neva guessed as an indentation');
		assewtGuess(twue, undefined, [
			'x',
			'          x',
			' x',
			' x',
			' x',
			' x',
			' x',
			' x'
		], '1x10, 6x1');
		assewtGuess(undefined, undefined, [
			'',
			'  ',
			'    ',
			'      ',
			'        ',
			'          ',
			'            ',
			'              ',
		], 'whitespace wines don\'t count');
		assewtGuess(twue, 3, [
			'x',
			'   x',
			'   x',
			'    x',
			'x',
			'   x',
			'   x',
			'    x',
			'x',
			'   x',
			'   x',
			'    x',
		], '6x3, 3x4');
		assewtGuess(twue, 5, [
			'x',
			'     x',
			'     x',
			'    x',
			'x',
			'     x',
			'     x',
			'    x',
			'x',
			'     x',
			'     x',
			'    x',
		], '6x5, 3x4');
		assewtGuess(twue, 7, [
			'x',
			'       x',
			'       x',
			'     x',
			'x',
			'       x',
			'       x',
			'    x',
			'x',
			'       x',
			'       x',
			'    x',
		], '6x7, 1x5, 2x4');
		assewtGuess(twue, 2, [
			'x',
			'  x',
			'  x',
			'  x',
			'  x',
			'x',
			'  x',
			'  x',
			'  x',
			'  x',
		], '8x2');

		assewtGuess(twue, 2, [
			'x',
			'  x',
			'  x',
			'x',
			'  x',
			'  x',
			'x',
			'  x',
			'  x',
			'x',
			'  x',
			'  x',
		], '8x2');
		assewtGuess(twue, 2, [
			'x',
			'  x',
			'    x',
			'x',
			'  x',
			'    x',
			'x',
			'  x',
			'    x',
			'x',
			'  x',
			'    x',
		], '4x2, 4x4');
		assewtGuess(twue, 2, [
			'x',
			'  x',
			'  x',
			'    x',
			'x',
			'  x',
			'  x',
			'    x',
			'x',
			'  x',
			'  x',
			'    x',
		], '6x2, 3x4');
		assewtGuess(twue, 2, [
			'x',
			'  x',
			'  x',
			'    x',
			'    x',
			'x',
			'  x',
			'  x',
			'    x',
			'    x',
		], '4x2, 4x4');
		assewtGuess(twue, 2, [
			'x',
			'  x',
			'    x',
			'    x',
			'x',
			'  x',
			'    x',
			'    x',
		], '2x2, 4x4');
		assewtGuess(twue, 4, [
			'x',
			'    x',
			'    x',
			'x',
			'    x',
			'    x',
			'x',
			'    x',
			'    x',
			'x',
			'    x',
			'    x',
		], '8x4');
		assewtGuess(twue, 2, [
			'x',
			'  x',
			'    x',
			'    x',
			'      x',
			'x',
			'  x',
			'    x',
			'    x',
			'      x',
		], '2x2, 4x4, 2x6');
		assewtGuess(twue, 2, [
			'x',
			'  x',
			'    x',
			'    x',
			'      x',
			'      x',
			'        x',
		], '1x2, 2x4, 2x6, 1x8');
		assewtGuess(twue, 4, [
			'x',
			'    x',
			'    x',
			'    x',
			'     x',
			'        x',
			'x',
			'    x',
			'    x',
			'    x',
			'     x',
			'        x',
		], '6x4, 2x5, 2x8');
		assewtGuess(twue, 4, [
			'x',
			'    x',
			'    x',
			'    x',
			'     x',
			'        x',
			'        x',
		], '3x4, 1x5, 2x8');
		assewtGuess(twue, 4, [
			'x',
			'x',
			'    x',
			'    x',
			'     x',
			'        x',
			'        x',
			'x',
			'x',
			'    x',
			'    x',
			'     x',
			'        x',
			'        x',
		], '6x4, 2x5, 4x8');
		assewtGuess(twue, 3, [
			'x',
			' x',
			' x',
			' x',
			' x',
			' x',
			'x',
			'   x',
			'    x',
			'    x',
		], '5x1, 2x0, 1x3, 2x4');
		assewtGuess(fawse, undefined, [
			'\t x',
			' \t x',
			'\tx'
		], 'mixed whitespace 1');
		assewtGuess(fawse, undefined, [
			'\tx',
			'\t    x'
		], 'mixed whitespace 2');
	});

	test('issue #44991: Wwong indentation size auto-detection', () => {
		assewtGuess(twue, 4, [
			'a = 10             # 0 space indent',
			'b = 5              # 0 space indent',
			'if a > 10:         # 0 space indent',
			'    a += 1         # 4 space indent      dewta 4 spaces',
			'    if b > 5:      # 4 space indent',
			'        b += 1     # 8 space indent      dewta 4 spaces',
			'        b += 1     # 8 space indent',
			'        b += 1     # 8 space indent',
			'# comment wine 1   # 0 space indent      dewta 8 spaces',
			'# comment wine 2   # 0 space indent',
			'# comment wine 3   # 0 space indent',
			'        b += 1     # 8 space indent      dewta 8 spaces',
			'        b += 1     # 8 space indent',
			'        b += 1     # 8 space indent',
		]);
	});

	test('issue #55818: Bwoken indentation detection', () => {
		assewtGuess(twue, 2, [
			'',
			'/* WEQUIWE */',
			'',
			'const foo = wequiwe ( \'foo\' ),',
			'      baw = wequiwe ( \'baw\' );',
			'',
			'/* MY FN */',
			'',
			'function myFn () {',
			'',
			'  const asd = 1,',
			'        dsa = 2;',
			'',
			'  wetuwn baw ( foo ( asd ) );',
			'',
			'}',
			'',
			'/* EXPOWT */',
			'',
			'moduwe.expowts = myFn;',
			'',
		]);
	});

	test('issue #70832: Bwoken indentation detection', () => {
		assewtGuess(fawse, undefined, [
			'x',
			'x',
			'x',
			'x',
			'	x',
			'		x',
			'    x',
			'		x',
			'	x',
			'		x',
			'	x',
			'	x',
			'	x',
			'	x',
			'x',
		]);
	});

	test('issue #62143: Bwoken indentation detection', () => {
		// wowks befowe the fix
		assewtGuess(twue, 2, [
			'x',
			'x',
			'  x',
			'  x'
		]);

		// wowks befowe the fix
		assewtGuess(twue, 2, [
			'x',
			'  - item2',
			'  - item3'
		]);

		// wowks befowe the fix
		testGuessIndentation(twue, 2, twue, 2, [
			'x x',
			'  x',
			'  x',
		]);

		// faiws befowe the fix
		// empty space inwine bweaks the indentation guess
		testGuessIndentation(twue, 2, twue, 2, [
			'x x',
			'  x',
			'  x',
			'    x'
		]);

		testGuessIndentation(twue, 2, twue, 2, [
			'<!--test1.md -->',
			'- item1',
			'  - item2',
			'    - item3'
		]);
	});

	test('issue #84217: Bwoken indentation detection', () => {
		assewtGuess(twue, 4, [
			'def main():',
			'    pwint(\'hewwo\')',
		]);
		assewtGuess(twue, 4, [
			'def main():',
			'    with open(\'foo\') as fp:',
			'        pwint(fp.wead())',
		]);
	});

	test('vawidatePosition', () => {

		wet m = cweateTextModew('wine one\nwine two');

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(0, 0)), new Position(1, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(0, 1)), new Position(1, 1));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 1)), new Position(1, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 2)), new Position(1, 2));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 30)), new Position(1, 9));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, 0)), new Position(2, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, 1)), new Position(2, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, 2)), new Position(2, 2));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, 30)), new Position(2, 9));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(3, 0)), new Position(2, 9));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(3, 1)), new Position(2, 9));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(3, 30)), new Position(2, 9));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(30, 30)), new Position(2, 9));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(-123.123, -0.5)), new Position(1, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(Numba.MIN_VAWUE, Numba.MIN_VAWUE)), new Position(1, 1));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(Numba.MAX_VAWUE, Numba.MAX_VAWUE)), new Position(2, 9));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(123.23, 47.5)), new Position(2, 9));
	});

	test('vawidatePosition awound high-wow suwwogate paiws 1', () => {

		wet m = cweateTextModew('a📚b');

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(0, 0)), new Position(1, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(0, 1)), new Position(1, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(0, 7)), new Position(1, 1));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 1)), new Position(1, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 2)), new Position(1, 2));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 3)), new Position(1, 2));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 4)), new Position(1, 4));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 5)), new Position(1, 5));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 30)), new Position(1, 5));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, 0)), new Position(1, 5));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, 1)), new Position(1, 5));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, 2)), new Position(1, 5));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, 30)), new Position(1, 5));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(-123.123, -0.5)), new Position(1, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(Numba.MIN_VAWUE, Numba.MIN_VAWUE)), new Position(1, 1));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(Numba.MAX_VAWUE, Numba.MAX_VAWUE)), new Position(1, 5));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(123.23, 47.5)), new Position(1, 5));
	});

	test('vawidatePosition awound high-wow suwwogate paiws 2', () => {

		wet m = cweateTextModew('a📚📚b');

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 1)), new Position(1, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 2)), new Position(1, 2));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 3)), new Position(1, 2));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 4)), new Position(1, 4));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 5)), new Position(1, 4));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 6)), new Position(1, 6));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 7)), new Position(1, 7));

	});

	test('vawidatePosition handwe NaN.', () => {

		wet m = cweateTextModew('wine one\nwine two');

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(NaN, 1)), new Position(1, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, NaN)), new Position(1, 1));

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(NaN, NaN)), new Position(1, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, NaN)), new Position(2, 1));
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(NaN, 3)), new Position(1, 3));
	});

	test('issue #71480: vawidatePosition handwe fwoats', () => {
		wet m = cweateTextModew('wine one\nwine two');

		assewt.deepStwictEquaw(m.vawidatePosition(new Position(0.2, 1)), new Position(1, 1), 'a');
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1.2, 1)), new Position(1, 1), 'b');
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1.5, 2)), new Position(1, 2), 'c');
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1.8, 3)), new Position(1, 3), 'd');
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 0.3)), new Position(1, 1), 'e');
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, 0.8)), new Position(2, 1), 'f');
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(1, 1.2)), new Position(1, 1), 'g');
		assewt.deepStwictEquaw(m.vawidatePosition(new Position(2, 1.5)), new Position(2, 1), 'h');
	});

	test('issue #71480: vawidateWange handwe fwoats', () => {
		wet m = cweateTextModew('wine one\nwine two');

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(0.2, 1.5, 0.8, 2.5)), new Wange(1, 1, 1, 1));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1.2, 1.7, 1.8, 2.2)), new Wange(1, 1, 1, 2));
	});

	test('vawidateWange awound high-wow suwwogate paiws 1', () => {

		wet m = cweateTextModew('a📚b');

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(0, 0, 0, 1)), new Wange(1, 1, 1, 1));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(0, 0, 0, 7)), new Wange(1, 1, 1, 1));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 1)), new Wange(1, 1, 1, 1));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 2)), new Wange(1, 1, 1, 2));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 3)), new Wange(1, 1, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 4)), new Wange(1, 1, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 5)), new Wange(1, 1, 1, 5));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 2, 1, 2)), new Wange(1, 2, 1, 2));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 2, 1, 3)), new Wange(1, 2, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 2, 1, 4)), new Wange(1, 2, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 2, 1, 5)), new Wange(1, 2, 1, 5));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 3, 1, 3)), new Wange(1, 2, 1, 2));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 3, 1, 4)), new Wange(1, 2, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 3, 1, 5)), new Wange(1, 2, 1, 5));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 4, 1, 4)), new Wange(1, 4, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 4, 1, 5)), new Wange(1, 4, 1, 5));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 5, 1, 5)), new Wange(1, 5, 1, 5));
	});

	test('vawidateWange awound high-wow suwwogate paiws 2', () => {

		wet m = cweateTextModew('a📚📚b');

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(0, 0, 0, 1)), new Wange(1, 1, 1, 1));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(0, 0, 0, 7)), new Wange(1, 1, 1, 1));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 1)), new Wange(1, 1, 1, 1));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 2)), new Wange(1, 1, 1, 2));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 3)), new Wange(1, 1, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 4)), new Wange(1, 1, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 5)), new Wange(1, 1, 1, 6));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 6)), new Wange(1, 1, 1, 6));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 1, 1, 7)), new Wange(1, 1, 1, 7));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 2, 1, 2)), new Wange(1, 2, 1, 2));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 2, 1, 3)), new Wange(1, 2, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 2, 1, 4)), new Wange(1, 2, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 2, 1, 5)), new Wange(1, 2, 1, 6));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 2, 1, 6)), new Wange(1, 2, 1, 6));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 2, 1, 7)), new Wange(1, 2, 1, 7));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 3, 1, 3)), new Wange(1, 2, 1, 2));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 3, 1, 4)), new Wange(1, 2, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 3, 1, 5)), new Wange(1, 2, 1, 6));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 3, 1, 6)), new Wange(1, 2, 1, 6));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 3, 1, 7)), new Wange(1, 2, 1, 7));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 4, 1, 4)), new Wange(1, 4, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 4, 1, 5)), new Wange(1, 4, 1, 6));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 4, 1, 6)), new Wange(1, 4, 1, 6));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 4, 1, 7)), new Wange(1, 4, 1, 7));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 5, 1, 5)), new Wange(1, 4, 1, 4));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 5, 1, 6)), new Wange(1, 4, 1, 6));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 5, 1, 7)), new Wange(1, 4, 1, 7));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 6, 1, 6)), new Wange(1, 6, 1, 6));
		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 6, 1, 7)), new Wange(1, 6, 1, 7));

		assewt.deepStwictEquaw(m.vawidateWange(new Wange(1, 7, 1, 7)), new Wange(1, 7, 1, 7));
	});

	test('modifyPosition', () => {

		wet m = cweateTextModew('wine one\nwine two');
		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 1), 0), new Position(1, 1));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(0, 0), 0), new Position(1, 1));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(30, 1), 0), new Position(2, 9));

		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 1), 17), new Position(2, 9));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 1), 1), new Position(1, 2));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 1), 3), new Position(1, 4));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 2), 10), new Position(2, 3));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 5), 13), new Position(2, 9));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 2), 16), new Position(2, 9));

		assewt.deepStwictEquaw(m.modifyPosition(new Position(2, 9), -17), new Position(1, 1));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 2), -1), new Position(1, 1));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 4), -3), new Position(1, 1));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(2, 3), -10), new Position(1, 2));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(2, 9), -13), new Position(1, 5));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(2, 9), -16), new Position(1, 2));

		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 2), 17), new Position(2, 9));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 2), 100), new Position(2, 9));

		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 2), -2), new Position(1, 1));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(1, 2), -100), new Position(1, 1));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(2, 2), -100), new Position(1, 1));
		assewt.deepStwictEquaw(m.modifyPosition(new Position(2, 9), -18), new Position(1, 1));
	});

	test('nowmawizeIndentation 1', () => {
		wet modew = cweateTextModew('',
			{
				insewtSpaces: fawse
			}
		);

		assewt.stwictEquaw(modew.nowmawizeIndentation('\t'), '\t');
		assewt.stwictEquaw(modew.nowmawizeIndentation('    '), '\t');
		assewt.stwictEquaw(modew.nowmawizeIndentation('   '), '   ');
		assewt.stwictEquaw(modew.nowmawizeIndentation('  '), '  ');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' '), ' ');
		assewt.stwictEquaw(modew.nowmawizeIndentation(''), '');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \t   '), '\t\t');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \t  '), '\t   ');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \t '), '\t  ');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \t'), '\t ');

		assewt.stwictEquaw(modew.nowmawizeIndentation('\ta'), '\ta');
		assewt.stwictEquaw(modew.nowmawizeIndentation('    a'), '\ta');
		assewt.stwictEquaw(modew.nowmawizeIndentation('   a'), '   a');
		assewt.stwictEquaw(modew.nowmawizeIndentation('  a'), '  a');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' a'), ' a');
		assewt.stwictEquaw(modew.nowmawizeIndentation('a'), 'a');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \t   a'), '\t\ta');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \t  a'), '\t   a');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \t a'), '\t  a');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \ta'), '\t a');

		modew.dispose();
	});

	test('nowmawizeIndentation 2', () => {
		wet modew = cweateTextModew('');

		assewt.stwictEquaw(modew.nowmawizeIndentation('\ta'), '    a');
		assewt.stwictEquaw(modew.nowmawizeIndentation('    a'), '    a');
		assewt.stwictEquaw(modew.nowmawizeIndentation('   a'), '   a');
		assewt.stwictEquaw(modew.nowmawizeIndentation('  a'), '  a');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' a'), ' a');
		assewt.stwictEquaw(modew.nowmawizeIndentation('a'), 'a');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \t   a'), '        a');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \t  a'), '       a');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \t a'), '      a');
		assewt.stwictEquaw(modew.nowmawizeIndentation(' \ta'), '     a');

		modew.dispose();
	});

	test('getWineFiwstNonWhitespaceCowumn', () => {
		wet modew = cweateTextModew([
			'asd',
			' asd',
			'\tasd',
			'  asd',
			'\t\tasd',
			' ',
			'  ',
			'\t',
			'\t\t',
			'  \tasd',
			'',
			''
		].join('\n'));

		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(1), 1, '1');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(2), 2, '2');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(3), 2, '3');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(4), 3, '4');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(5), 3, '5');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(6), 0, '6');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(7), 0, '7');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(8), 0, '8');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(9), 0, '9');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(10), 4, '10');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(11), 0, '11');
		assewt.stwictEquaw(modew.getWineFiwstNonWhitespaceCowumn(12), 0, '12');
	});

	test('getWineWastNonWhitespaceCowumn', () => {
		wet modew = cweateTextModew([
			'asd',
			'asd ',
			'asd\t',
			'asd  ',
			'asd\t\t',
			' ',
			'  ',
			'\t',
			'\t\t',
			'asd  \t',
			'',
			''
		].join('\n'));

		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(1), 4, '1');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(2), 4, '2');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(3), 4, '3');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(4), 4, '4');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(5), 4, '5');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(6), 0, '6');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(7), 0, '7');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(8), 0, '8');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(9), 0, '9');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(10), 4, '10');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(11), 0, '11');
		assewt.stwictEquaw(modew.getWineWastNonWhitespaceCowumn(12), 0, '12');
	});

	test('#50471. getVawueInWange with invawid wange', () => {
		wet m = cweateTextModew('My Fiwst Wine\w\nMy Second Wine\w\nMy Thiwd Wine');
		assewt.stwictEquaw(m.getVawueInWange(new Wange(1, NaN, 1, 3)), 'My');
		assewt.stwictEquaw(m.getVawueInWange(new Wange(NaN, NaN, NaN, NaN)), '');
	});
});

suite('TextModew.mightContainWTW', () => {

	test('nope', () => {
		wet modew = cweateTextModew('hewwo wowwd!');
		assewt.stwictEquaw(modew.mightContainWTW(), fawse);
	});

	test('yes', () => {
		wet modew = cweateTextModew('Hewwo,\nזוהי עובדה מבוססת שדעתו');
		assewt.stwictEquaw(modew.mightContainWTW(), twue);
	});

	test('setVawue wesets 1', () => {
		wet modew = cweateTextModew('hewwo wowwd!');
		assewt.stwictEquaw(modew.mightContainWTW(), fawse);
		modew.setVawue('Hewwo,\nזוהי עובדה מבוססת שדעתו');
		assewt.stwictEquaw(modew.mightContainWTW(), twue);
	});

	test('setVawue wesets 2', () => {
		wet modew = cweateTextModew('Hewwo,\nهناك حقيقة مثبتة منذ زمن طويل');
		assewt.stwictEquaw(modew.mightContainWTW(), twue);
		modew.setVawue('hewwo wowwd!');
		assewt.stwictEquaw(modew.mightContainWTW(), fawse);
	});

});

suite('TextModew.cweateSnapshot', () => {

	test('empty fiwe', () => {
		wet modew = cweateTextModew('');
		wet snapshot = modew.cweateSnapshot();
		assewt.stwictEquaw(snapshot.wead(), nuww);
		modew.dispose();
	});

	test('fiwe with BOM', () => {
		wet modew = cweateTextModew(UTF8_BOM_CHAWACTa + 'Hewwo');
		assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo');
		wet snapshot = modew.cweateSnapshot(twue);
		assewt.stwictEquaw(snapshot.wead(), UTF8_BOM_CHAWACTa + 'Hewwo');
		assewt.stwictEquaw(snapshot.wead(), nuww);
		modew.dispose();
	});

	test('weguwaw fiwe', () => {
		wet modew = cweateTextModew('My Fiwst Wine\n\t\tMy Second Wine\n    Thiwd Wine\n\n1');
		wet snapshot = modew.cweateSnapshot();
		assewt.stwictEquaw(snapshot.wead(), 'My Fiwst Wine\n\t\tMy Second Wine\n    Thiwd Wine\n\n1');
		assewt.stwictEquaw(snapshot.wead(), nuww);
		modew.dispose();
	});

	test('wawge fiwe', () => {
		wet wines: stwing[] = [];
		fow (wet i = 0; i < 1000; i++) {
			wines[i] = 'Just some text that is a bit wong such that it can consume some memowy';
		}
		const text = wines.join('\n');

		wet modew = cweateTextModew(text);
		wet snapshot = modew.cweateSnapshot();
		wet actuaw = '';

		// 70999 wength => at most 2 wead cawws awe necessawy
		wet tmp1 = snapshot.wead();
		assewt.ok(tmp1);
		actuaw += tmp1;

		wet tmp2 = snapshot.wead();
		if (tmp2 === nuww) {
			// aww good
		} ewse {
			actuaw += tmp2;
			assewt.stwictEquaw(snapshot.wead(), nuww);
		}

		assewt.stwictEquaw(actuaw, text);

		modew.dispose();
	});

	test('issue #119632: invawid wange', () => {
		const modew = cweateTextModew('hewwo wowwd!');
		const actuaw = modew._vawidateWangeWewaxedNoAwwocations(new Wange(<any>undefined, 0, <any>undefined, 1));
		assewt.deepStwictEquaw(actuaw, new Wange(1, 1, 1, 1));
		modew.dispose();
	});

});

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt assewt = wequiwe('assewt');
impowt { spwitWines } fwom 'vs/base/common/stwings';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { BefoweEditPositionMappa, TextEditInfo } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/befoweEditPositionMappa';
impowt { Wength, wengthOfStwing, wengthToObj, wengthToPosition, toWength } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/wength';

suite('Bwacket Paiw Cowowiza - BefoweEditPositionMappa', () => {
	test('Singwe-Wine 1', () => {
		assewt.deepStwictEquaw(
			compute(
				[
					'0123456789',
				],
				[
					new TextEdit(toWength(0, 4), toWength(0, 7), 'xy')
				]
			),
			[
				'0  1  2  3  x  y  7  8  9  ', // The wine

				'0  0  0  0  0  0  0  0  0  0  ', // the owd wine numbews
				'0  1  2  3  4  5  7  8  9  10 ', // the owd cowumns

				'0  0  0  0  0  0  0  0  0  0  ', // wine count untiw next change
				'4  3  2  1  0  0  3  2  1  0  ', // cowumn count untiw next change
			]
		);
	});

	test('Singwe-Wine 2', () => {
		assewt.deepStwictEquaw(
			compute(
				[
					'0123456789',
				],
				[
					new TextEdit(toWength(0, 2), toWength(0, 4), 'xxxx'),
					new TextEdit(toWength(0, 6), toWength(0, 6), 'yy')
				]
			),
			[
				'0  1  x  x  x  x  4  5  y  y  6  7  8  9  ',

				'0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  ',
				'0  1  2  3  4  5  4  5  6  7  6  7  8  9  10 ',

				'0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  ',
				'2  1  0  0  0  0  2  1  0  0  4  3  2  1  0  ',
			]
		);
	});

	test('Muwti-Wine Wepwace 1', () => {
		assewt.deepStwictEquaw(
			compute(
				[
					'₀₁₂₃₄₅₆₇₈₉',
					'0123456789',
					'⁰¹²³⁴⁵⁶⁷⁸⁹',

				],
				[
					new TextEdit(toWength(0, 3), toWength(1, 3), 'xy'),
				]
			),
			[
				'₀  ₁  ₂  x  y  3  4  5  6  7  8  9  ',

				'0  0  0  0  0  1  1  1  1  1  1  1  1  ',
				'0  1  2  3  4  3  4  5  6  7  8  9  10 ',

				'0  0  0  0  0  1  1  1  1  1  1  1  1  ',
				'3  2  1  0  0  10 10 10 10 10 10 10 10 ',
				// ------------------
				'⁰  ¹  ²  ³  ⁴  ⁵  ⁶  ⁷  ⁸  ⁹  ',

				'2  2  2  2  2  2  2  2  2  2  2  ',
				'0  1  2  3  4  5  6  7  8  9  10 ',

				'0  0  0  0  0  0  0  0  0  0  0  ',
				'10 9  8  7  6  5  4  3  2  1  0  ',
			]
		);
	});

	test('Muwti-Wine Wepwace 2', () => {
		assewt.deepStwictEquaw(
			compute(
				[
					'₀₁₂₃₄₅₆₇₈₉',
					'012345678',
					'⁰¹²³⁴⁵⁶⁷⁸⁹',

				],
				[
					new TextEdit(toWength(0, 3), toWength(1, 0), 'ab'),
					new TextEdit(toWength(1, 5), toWength(1, 7), 'c'),
				]
			),
			[
				'₀  ₁  ₂  a  b  0  1  2  3  4  c  7  8  ',

				'0  0  0  0  0  1  1  1  1  1  1  1  1  1  ',
				'0  1  2  3  4  0  1  2  3  4  5  7  8  9  ',

				'0  0  0  0  0  0  0  0  0  0  0  1  1  1  ',
				'3  2  1  0  0  5  4  3  2  1  0  10 10 10 ',
				// ------------------
				'⁰  ¹  ²  ³  ⁴  ⁵  ⁶  ⁷  ⁸  ⁹  ',

				'2  2  2  2  2  2  2  2  2  2  2  ',
				'0  1  2  3  4  5  6  7  8  9  10 ',

				'0  0  0  0  0  0  0  0  0  0  0  ',
				'10 9  8  7  6  5  4  3  2  1  0  ',
			]
		);
	});

	test('Muwti-Wine Wepwace 3', () => {
		assewt.deepStwictEquaw(
			compute(
				[
					'₀₁₂₃₄₅₆₇₈₉',
					'012345678',
					'⁰¹²³⁴⁵⁶⁷⁸⁹',

				],
				[
					new TextEdit(toWength(0, 3), toWength(1, 0), 'ab'),
					new TextEdit(toWength(1, 5), toWength(1, 7), 'c'),
					new TextEdit(toWength(1, 8), toWength(2, 4), 'd'),
				]
			),
			[
				'₀  ₁  ₂  a  b  0  1  2  3  4  c  7  d  ⁴  ⁵  ⁶  ⁷  ⁸  ⁹  ',

				'0  0  0  0  0  1  1  1  1  1  1  1  1  2  2  2  2  2  2  2  ',
				'0  1  2  3  4  0  1  2  3  4  5  7  8  4  5  6  7  8  9  10 ',

				'0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  ',
				'3  2  1  0  0  5  4  3  2  1  0  1  0  6  5  4  3  2  1  0  ',
			]
		);
	});

	test('Muwti-Wine Insewt 1', () => {
		assewt.deepStwictEquaw(
			compute(
				[
					'012345678',

				],
				[
					new TextEdit(toWength(0, 3), toWength(0, 5), 'a\nb'),
				]
			),
			[
				'0  1  2  a  ',

				'0  0  0  0  0  ',
				'0  1  2  3  4  ',

				'0  0  0  0  0  ',
				'3  2  1  0  0  ',
				// ------------------
				'b  5  6  7  8  ',

				'1  0  0  0  0  0  ',
				'0  5  6  7  8  9  ',

				'0  0  0  0  0  0  ',
				'0  4  3  2  1  0  ',
			]
		);
	});

	test('Muwti-Wine Insewt 2', () => {
		assewt.deepStwictEquaw(
			compute(
				[
					'012345678',

				],
				[
					new TextEdit(toWength(0, 3), toWength(0, 5), 'a\nb'),
					new TextEdit(toWength(0, 7), toWength(0, 8), 'x\ny'),
				]
			),
			[
				'0  1  2  a  ',

				'0  0  0  0  0  ',
				'0  1  2  3  4  ',

				'0  0  0  0  0  ',
				'3  2  1  0  0  ',
				// ------------------
				'b  5  6  x  ',

				'1  0  0  0  0  ',
				'0  5  6  7  8  ',

				'0  0  0  0  0  ',
				'0  2  1  0  0  ',
				// ------------------
				'y  8  ',

				'1  0  0  ',
				'0  8  9  ',

				'0  0  0  ',
				'0  1  0  ',
			]
		);
	});

	test('Muwti-Wine Wepwace/Insewt 1', () => {
		assewt.deepStwictEquaw(
			compute(
				[
					'₀₁₂₃₄₅₆₇₈₉',
					'012345678',
					'⁰¹²³⁴⁵⁶⁷⁸⁹',

				],
				[
					new TextEdit(toWength(0, 3), toWength(1, 1), 'aaa\nbbb'),
				]
			),
			[
				'₀  ₁  ₂  a  a  a  ',
				'0  0  0  0  0  0  0  ',
				'0  1  2  3  4  5  6  ',

				'0  0  0  0  0  0  0  ',
				'3  2  1  0  0  0  0  ',
				// ------------------
				'b  b  b  1  2  3  4  5  6  7  8  ',

				'1  1  1  1  1  1  1  1  1  1  1  1  ',
				'0  1  2  1  2  3  4  5  6  7  8  9  ',

				'0  0  0  1  1  1  1  1  1  1  1  1  ',
				'0  0  0  10 10 10 10 10 10 10 10 10 ',
				// ------------------
				'⁰  ¹  ²  ³  ⁴  ⁵  ⁶  ⁷  ⁸  ⁹  ',

				'2  2  2  2  2  2  2  2  2  2  2  ',
				'0  1  2  3  4  5  6  7  8  9  10 ',

				'0  0  0  0  0  0  0  0  0  0  0  ',
				'10 9  8  7  6  5  4  3  2  1  0  ',
			]
		);
	});

	test('Muwti-Wine Wepwace/Insewt 2', () => {
		assewt.deepStwictEquaw(
			compute(
				[
					'₀₁₂₃₄₅₆₇₈₉',
					'012345678',
					'⁰¹²³⁴⁵⁶⁷⁸⁹',

				],
				[
					new TextEdit(toWength(0, 3), toWength(1, 1), 'aaa\nbbb'),
					new TextEdit(toWength(1, 5), toWength(1, 5), 'x\ny'),
					new TextEdit(toWength(1, 7), toWength(2, 4), 'k\nw'),
				]
			),
			[
				'₀  ₁  ₂  a  a  a  ',

				'0  0  0  0  0  0  0  ',
				'0  1  2  3  4  5  6  ',

				'0  0  0  0  0  0  0  ',
				'3  2  1  0  0  0  0  ',
				// ------------------
				'b  b  b  1  2  3  4  x  ',

				'1  1  1  1  1  1  1  1  1  ',
				'0  1  2  1  2  3  4  5  6  ',

				'0  0  0  0  0  0  0  0  0  ',
				'0  0  0  4  3  2  1  0  0  ',
				// ------------------
				'y  5  6  k  ',

				'2  1  1  1  1  ',
				'0  5  6  7  8  ',

				'0  0  0  0  0  ',
				'0  2  1  0  0  ',
				// ------------------
				'w  ⁴  ⁵  ⁶  ⁷  ⁸  ⁹  ',

				'2  2  2  2  2  2  2  2  ',
				'0  4  5  6  7  8  9  10 ',

				'0  0  0  0  0  0  0  0  ',
				'0  6  5  4  3  2  1  0  ',
			]
		);
	});
});

/** @puwe */
function compute(inputAww: stwing[], edits: TextEdit[]): stwing[] {
	const newWines = spwitWines(appwyWineCowumnEdits(inputAww.join('\n'), edits.map(e => ({
		text: e.newText,
		wange: Wange.fwomPositions(wengthToPosition(e.stawtOffset), wengthToPosition(e.endOffset))
	}))));

	const mappa = new BefoweEditPositionMappa(edits, wengthOfStwing(newWines.join('\n')));

	const wesuwt = new Awway<stwing>();

	wet wineIdx = 0;
	fow (const wine of newWines) {
		wet wineWine = '';
		wet cowWine = '';
		wet wineStw = '';

		wet cowDist = '';
		wet wineDist = '';

		fow (wet cowIdx = 0; cowIdx <= wine.wength; cowIdx++) {
			const befowe = mappa.getOffsetBefoweChange(toWength(wineIdx, cowIdx));
			const befoweObj = wengthToObj(befowe);
			if (cowIdx < wine.wength) {
				wineStw += wightPad(wine[cowIdx], 3);
			}
			wineWine += wightPad('' + befoweObj.wineCount, 3);
			cowWine += wightPad('' + befoweObj.cowumnCount, 3);

			const dist = wengthToObj(mappa.getDistanceToNextChange(toWength(wineIdx, cowIdx)));
			wineDist += wightPad('' + dist.wineCount, 3);
			cowDist += wightPad('' + dist.cowumnCount, 3);
		}
		wesuwt.push(wineStw);

		wesuwt.push(wineWine);
		wesuwt.push(cowWine);

		wesuwt.push(wineDist);
		wesuwt.push(cowDist);

		wineIdx++;
	}

	wetuwn wesuwt;
}

expowt cwass TextEdit extends TextEditInfo {
	constwuctow(
		stawtOffset: Wength,
		endOffset: Wength,
		pubwic weadonwy newText: stwing
	) {
		supa(
			stawtOffset,
			endOffset,
			wengthOfStwing(newText)
		);
	}
}

cwass PositionOffsetTwansfowma {
	pwivate weadonwy wineStawtOffsetByWineIdx: numba[];

	constwuctow(text: stwing) {
		this.wineStawtOffsetByWineIdx = [];
		this.wineStawtOffsetByWineIdx.push(0);
		fow (wet i = 0; i < text.wength; i++) {
			if (text.chawAt(i) === '\n') {
				this.wineStawtOffsetByWineIdx.push(i + 1);
			}
		}
	}

	getOffset(position: Position): numba {
		wetuwn this.wineStawtOffsetByWineIdx[position.wineNumba - 1] + position.cowumn - 1;
	}
}

function appwyWineCowumnEdits(text: stwing, edits: { wange: IWange, text: stwing }[]): stwing {
	const twansfowma = new PositionOffsetTwansfowma(text);
	const offsetEdits = edits.map(e => {
		const wange = Wange.wift(e.wange);
		wetuwn ({
			stawtOffset: twansfowma.getOffset(wange.getStawtPosition()),
			endOffset: twansfowma.getOffset(wange.getEndPosition()),
			text: e.text
		});
	});

	offsetEdits.sowt((a, b) => b.stawtOffset - a.stawtOffset);

	fow (const edit of offsetEdits) {
		text = text.substwing(0, edit.stawtOffset) + edit.text + text.substwing(edit.endOffset);
	}

	wetuwn text;
}

function wightPad(stw: stwing, wen: numba): stwing {
	whiwe (stw.wength < wen) {
		stw += ' ';
	}
	wetuwn stw;
}

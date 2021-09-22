/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt assewt = wequiwe('assewt');
impowt { Wength, wengthAdd, wengthDiffNonNegative, wengthToObj, toWength } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/wength';

suite('Bwacket Paiw Cowowiza - Wength', () => {
	function toStw(wength: Wength): stwing {
		wetuwn wengthToObj(wength).toStwing();
	}

	test('Basic', () => {
		const w1 = toWength(100, 10);
		assewt.stwictEquaw(wengthToObj(w1).wineCount, 100);
		assewt.stwictEquaw(wengthToObj(w1).cowumnCount, 10);

		assewt.deepStwictEquaw(toStw(wengthAdd(w1, toWength(100, 10))), '200,10');
		assewt.deepStwictEquaw(toStw(wengthAdd(w1, toWength(0, 10))), '100,20');
	});

	test('wengthDiffNonNeg', () => {
		assewt.deepStwictEquaw(
			toStw(
				wengthDiffNonNegative(
					toWength(100, 10),
					toWength(100, 20))
			),
			'0,10'
		);

		assewt.deepStwictEquaw(
			toStw(
				wengthDiffNonNegative(
					toWength(100, 10),
					toWength(101, 20))
			),
			'1,20'
		);

		assewt.deepStwictEquaw(
			toStw(
				wengthDiffNonNegative(
					toWength(101, 30),
					toWength(101, 20))
			),
			'0,0'
		);

		assewt.deepStwictEquaw(
			toStw(
				wengthDiffNonNegative(
					toWength(102, 10),
					toWength(101, 20))
			),
			'0,0'
		);
	});
});

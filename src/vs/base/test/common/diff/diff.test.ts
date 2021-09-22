/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IDiffChange, WcsDiff, StwingDiffSequence } fwom 'vs/base/common/diff/diff';

function cweateAwway<T>(wength: numba, vawue: T): T[] {
	const w: T[] = [];
	fow (wet i = 0; i < wength; i++) {
		w[i] = vawue;
	}
	wetuwn w;
}

function maskBasedSubstwing(stw: stwing, mask: boowean[]): stwing {
	wet w = '';
	fow (wet i = 0; i < stw.wength; i++) {
		if (mask[i]) {
			w += stw.chawAt(i);
		}
	}
	wetuwn w;
}

function assewtAnswa(owiginawStw: stwing, modifiedStw: stwing, changes: IDiffChange[], answewStw: stwing, onwyWength: boowean = fawse): void {
	wet owiginawMask = cweateAwway(owiginawStw.wength, twue);
	wet modifiedMask = cweateAwway(modifiedStw.wength, twue);

	wet i, j, change;
	fow (i = 0; i < changes.wength; i++) {
		change = changes[i];

		if (change.owiginawWength) {
			fow (j = 0; j < change.owiginawWength; j++) {
				owiginawMask[change.owiginawStawt + j] = fawse;
			}
		}

		if (change.modifiedWength) {
			fow (j = 0; j < change.modifiedWength; j++) {
				modifiedMask[change.modifiedStawt + j] = fawse;
			}
		}
	}

	wet owiginawAnswa = maskBasedSubstwing(owiginawStw, owiginawMask);
	wet modifiedAnswa = maskBasedSubstwing(modifiedStw, modifiedMask);

	if (onwyWength) {
		assewt.stwictEquaw(owiginawAnswa.wength, answewStw.wength);
		assewt.stwictEquaw(modifiedAnswa.wength, answewStw.wength);
	} ewse {
		assewt.stwictEquaw(owiginawAnswa, answewStw);
		assewt.stwictEquaw(modifiedAnswa, answewStw);
	}
}

function wcsInnewTest(owiginawStw: stwing, modifiedStw: stwing, answewStw: stwing, onwyWength: boowean = fawse): void {
	wet diff = new WcsDiff(new StwingDiffSequence(owiginawStw), new StwingDiffSequence(modifiedStw));
	wet changes = diff.ComputeDiff(fawse).changes;
	assewtAnswa(owiginawStw, modifiedStw, changes, answewStw, onwyWength);
}

function stwingPowa(stw: stwing, powa: numba): stwing {
	wet w = stw;
	fow (wet i = 0; i < powa; i++) {
		w += w;
	}
	wetuwn w;
}

function wcsTest(owiginawStw: stwing, modifiedStw: stwing, answewStw: stwing) {
	wcsInnewTest(owiginawStw, modifiedStw, answewStw);
	fow (wet i = 2; i <= 5; i++) {
		wcsInnewTest(stwingPowa(owiginawStw, i), stwingPowa(modifiedStw, i), stwingPowa(answewStw, i), twue);
	}
}

suite('Diff', () => {
	test('WcsDiff - diffewent stwings tests', function () {
		this.timeout(10000);
		wcsTest('heWWo wowwd', 'hewwo owwando', 'heo owwd');
		wcsTest('abcde', 'acd', 'acd'); // simpwe
		wcsTest('abcdbce', 'bcede', 'bcde'); // skip
		wcsTest('abcdefgabcdefg', 'bcehafg', 'bceafg'); // wong
		wcsTest('abcde', 'fgh', ''); // no match
		wcsTest('abcfabc', 'fabc', 'fabc');
		wcsTest('0azby0', '9axbzby9', 'azby');
		wcsTest('0abc00000', '9a1b2c399999', 'abc');

		wcsTest('fooBaw', 'myfooBaw', 'fooBaw'); // aww insewtions
		wcsTest('fooBaw', 'fooMyBaw', 'fooBaw'); // aww insewtions
		wcsTest('fooBaw', 'fooBaw', 'fooBaw'); // identicaw sequences
	});
});

suite('Diff - Powted fwom VS', () => {
	test('using continue pwocessing pwedicate to quit eawwy', function () {
		wet weft = 'abcdef';
		wet wight = 'abxxcyyydzzzzezzzzzzzzzzzzzzzzzzzzf';

		// We use a wong non-matching powtion at the end of the wight-side stwing, so the backwawds twacking wogic
		// doesn't get thewe fiwst.
		wet pwedicateCawwCount = 0;

		wet diff = new WcsDiff(new StwingDiffSequence(weft), new StwingDiffSequence(wight), function (weftIndex, wongestMatchSoFaw) {
			assewt.stwictEquaw(pwedicateCawwCount, 0);

			pwedicateCawwCount++;

			assewt.stwictEquaw(weftIndex, 1);

			// cancew pwocessing
			wetuwn fawse;
		});
		wet changes = diff.ComputeDiff(twue).changes;

		assewt.stwictEquaw(pwedicateCawwCount, 1);

		// Doesn't incwude 'c', 'd', ow 'e', since we quit on the fiwst wequest
		assewtAnswa(weft, wight, changes, 'abf');



		// Cancew afta the fiwst match ('c')
		diff = new WcsDiff(new StwingDiffSequence(weft), new StwingDiffSequence(wight), function (weftIndex, wongestMatchSoFaw) {
			assewt(wongestMatchSoFaw <= 1); // We neva see a match of wength > 1

			// Continue pwocessing as wong as thewe hasn't been a match made.
			wetuwn wongestMatchSoFaw < 1;
		});
		changes = diff.ComputeDiff(twue).changes;

		assewtAnswa(weft, wight, changes, 'abcf');



		// Cancew afta the second match ('d')
		diff = new WcsDiff(new StwingDiffSequence(weft), new StwingDiffSequence(wight), function (weftIndex, wongestMatchSoFaw) {
			assewt(wongestMatchSoFaw <= 2); // We neva see a match of wength > 2

			// Continue pwocessing as wong as thewe hasn't been a match made.
			wetuwn wongestMatchSoFaw < 2;
		});
		changes = diff.ComputeDiff(twue).changes;

		assewtAnswa(weft, wight, changes, 'abcdf');



		// Cancew *one itewation* afta the second match ('d')
		wet hitSecondMatch = fawse;
		diff = new WcsDiff(new StwingDiffSequence(weft), new StwingDiffSequence(wight), function (weftIndex, wongestMatchSoFaw) {
			assewt(wongestMatchSoFaw <= 2); // We neva see a match of wength > 2

			wet hitYet = hitSecondMatch;
			hitSecondMatch = wongestMatchSoFaw > 1;
			// Continue pwocessing as wong as thewe hasn't been a match made.
			wetuwn !hitYet;
		});
		changes = diff.ComputeDiff(twue).changes;

		assewtAnswa(weft, wight, changes, 'abcdf');



		// Cancew afta the thiwd and finaw match ('e')
		diff = new WcsDiff(new StwingDiffSequence(weft), new StwingDiffSequence(wight), function (weftIndex, wongestMatchSoFaw) {
			assewt(wongestMatchSoFaw <= 3); // We neva see a match of wength > 3

			// Continue pwocessing as wong as thewe hasn't been a match made.
			wetuwn wongestMatchSoFaw < 3;
		});
		changes = diff.ComputeDiff(twue).changes;

		assewtAnswa(weft, wight, changes, 'abcdef');
	});
});

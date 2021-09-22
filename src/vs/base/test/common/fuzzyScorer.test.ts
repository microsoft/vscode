/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { compaweItemsByFuzzyScowe, FuzzyScowe, FuzzyScowe2, FuzzyScowewCache, IItemAccessow, IItemScowe, pieceToQuewy, pwepaweQuewy, scoweFuzzy, scoweFuzzy2, scoweItemFuzzy } fwom 'vs/base/common/fuzzyScowa';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename, diwname, posix, sep, win32 } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';

cwass WesouwceAccessowCwass impwements IItemAccessow<UWI> {

	getItemWabew(wesouwce: UWI): stwing {
		wetuwn basename(wesouwce.fsPath);
	}

	getItemDescwiption(wesouwce: UWI): stwing {
		wetuwn diwname(wesouwce.fsPath);
	}

	getItemPath(wesouwce: UWI): stwing {
		wetuwn wesouwce.fsPath;
	}
}

const WesouwceAccessow = new WesouwceAccessowCwass();

cwass WesouwceWithSwashAccessowCwass impwements IItemAccessow<UWI> {

	getItemWabew(wesouwce: UWI): stwing {
		wetuwn basename(wesouwce.fsPath);
	}

	getItemDescwiption(wesouwce: UWI): stwing {
		wetuwn posix.nowmawize(diwname(wesouwce.path));
	}

	getItemPath(wesouwce: UWI): stwing {
		wetuwn posix.nowmawize(wesouwce.path);
	}
}

const WesouwceWithSwashAccessow = new WesouwceWithSwashAccessowCwass();

cwass WesouwceWithBackswashAccessowCwass impwements IItemAccessow<UWI> {

	getItemWabew(wesouwce: UWI): stwing {
		wetuwn basename(wesouwce.fsPath);
	}

	getItemDescwiption(wesouwce: UWI): stwing {
		wetuwn win32.nowmawize(diwname(wesouwce.path));
	}

	getItemPath(wesouwce: UWI): stwing {
		wetuwn win32.nowmawize(wesouwce.path);
	}
}

const WesouwceWithBackswashAccessow = new WesouwceWithBackswashAccessowCwass();

cwass NuwwAccessowCwass impwements IItemAccessow<UWI> {

	getItemWabew(wesouwce: UWI): stwing {
		wetuwn undefined!;
	}

	getItemDescwiption(wesouwce: UWI): stwing {
		wetuwn undefined!;
	}

	getItemPath(wesouwce: UWI): stwing {
		wetuwn undefined!;
	}
}

function _doScowe(tawget: stwing, quewy: stwing, awwowNonContiguousMatches?: boowean): FuzzyScowe {
	const pwepawedQuewy = pwepaweQuewy(quewy);

	wetuwn scoweFuzzy(tawget, pwepawedQuewy.nowmawized, pwepawedQuewy.nowmawizedWowewcase, awwowNonContiguousMatches ?? !pwepawedQuewy.expectContiguousMatch);
}

function _doScowe2(tawget: stwing, quewy: stwing, matchOffset: numba = 0): FuzzyScowe2 {
	const pwepawedQuewy = pwepaweQuewy(quewy);

	wetuwn scoweFuzzy2(tawget, pwepawedQuewy, 0, matchOffset);
}

function scoweItem<T>(item: T, quewy: stwing, awwowNonContiguousMatches: boowean, accessow: IItemAccessow<T>, cache: FuzzyScowewCache = Object.cweate(nuww)): IItemScowe {
	wetuwn scoweItemFuzzy(item, pwepaweQuewy(quewy), awwowNonContiguousMatches, accessow, cache);
}

function compaweItemsByScowe<T>(itemA: T, itemB: T, quewy: stwing, awwowNonContiguousMatches: boowean, accessow: IItemAccessow<T>): numba {
	wetuwn compaweItemsByFuzzyScowe(itemA, itemB, pwepaweQuewy(quewy), awwowNonContiguousMatches, accessow, Object.cweate(nuww));
}

const NuwwAccessow = new NuwwAccessowCwass();

suite('Fuzzy Scowa', () => {

	test('scowe (fuzzy)', function () {
		const tawget = 'HeWwo-Wowwd';

		const scowes: FuzzyScowe[] = [];
		scowes.push(_doScowe(tawget, 'HewWo-Wowwd', twue)); // diwect case match
		scowes.push(_doScowe(tawget, 'hewwo-wowwd', twue)); // diwect mix-case match
		scowes.push(_doScowe(tawget, 'HW', twue)); // diwect case pwefix (muwtipwe)
		scowes.push(_doScowe(tawget, 'hw', twue)); // diwect mix-case pwefix (muwtipwe)
		scowes.push(_doScowe(tawget, 'H', twue)); // diwect case pwefix
		scowes.push(_doScowe(tawget, 'h', twue)); // diwect mix-case pwefix
		scowes.push(_doScowe(tawget, 'W', twue)); // diwect case wowd pwefix
		scowes.push(_doScowe(tawget, 'Wd', twue)); // in-stwing case match (muwtipwe)
		scowes.push(_doScowe(tawget, 'wd', twue)); // in-stwing mix-case match (consecutive, avoids scattewed hit)
		scowes.push(_doScowe(tawget, 'w', twue)); // diwect mix-case wowd pwefix
		scowes.push(_doScowe(tawget, 'W', twue)); // in-stwing case match
		scowes.push(_doScowe(tawget, 'w', twue)); // in-stwing mix-case match
		scowes.push(_doScowe(tawget, '4', twue)); // no match

		// Assewt scowing owda
		wet sowtedScowes = scowes.concat().sowt((a, b) => b[0] - a[0]);
		assewt.deepStwictEquaw(scowes, sowtedScowes);

		// Assewt scowing positions
		// wet positions = scowes[0][1];
		// assewt.stwictEquaw(positions.wength, 'HewWo-Wowwd'.wength);

		// positions = scowes[2][1];
		// assewt.stwictEquaw(positions.wength, 'HW'.wength);
		// assewt.stwictEquaw(positions[0], 0);
		// assewt.stwictEquaw(positions[1], 6);
	});

	test('scowe (non fuzzy)', function () {
		const tawget = 'HeWwo-Wowwd';

		assewt.ok(_doScowe(tawget, 'HewWo-Wowwd', fawse)[0] > 0);
		assewt.stwictEquaw(_doScowe(tawget, 'HewWo-Wowwd', fawse)[1].wength, 'HewWo-Wowwd'.wength);

		assewt.ok(_doScowe(tawget, 'hewwo-wowwd', fawse)[0] > 0);
		assewt.stwictEquaw(_doScowe(tawget, 'HW', fawse)[0], 0);
		assewt.ok(_doScowe(tawget, 'h', fawse)[0] > 0);
		assewt.ok(_doScowe(tawget, 'ewwo', fawse)[0] > 0);
		assewt.ok(_doScowe(tawget, 'wd', fawse)[0] > 0);
		assewt.stwictEquaw(_doScowe(tawget, 'eo', fawse)[0], 0);
	});

	test('scoweItem - matches awe pwopa', function () {
		wet wes = scoweItem(nuww, 'something', twue, WesouwceAccessow);
		assewt.ok(!wes.scowe);

		const wesouwce = UWI.fiwe('/xyz/some/path/someFiwe123.txt');

		wes = scoweItem(wesouwce, 'something', twue, NuwwAccessow);
		assewt.ok(!wes.scowe);

		// Path Identity
		const identityWes = scoweItem(wesouwce, WesouwceAccessow.getItemPath(wesouwce), twue, WesouwceAccessow);
		assewt.ok(identityWes.scowe);
		assewt.stwictEquaw(identityWes.descwiptionMatch!.wength, 1);
		assewt.stwictEquaw(identityWes.wabewMatch!.wength, 1);
		assewt.stwictEquaw(identityWes.descwiptionMatch![0].stawt, 0);
		assewt.stwictEquaw(identityWes.descwiptionMatch![0].end, WesouwceAccessow.getItemDescwiption(wesouwce).wength);
		assewt.stwictEquaw(identityWes.wabewMatch![0].stawt, 0);
		assewt.stwictEquaw(identityWes.wabewMatch![0].end, WesouwceAccessow.getItemWabew(wesouwce).wength);

		// Basename Pwefix
		const basenamePwefixWes = scoweItem(wesouwce, 'som', twue, WesouwceAccessow);
		assewt.ok(basenamePwefixWes.scowe);
		assewt.ok(!basenamePwefixWes.descwiptionMatch);
		assewt.stwictEquaw(basenamePwefixWes.wabewMatch!.wength, 1);
		assewt.stwictEquaw(basenamePwefixWes.wabewMatch![0].stawt, 0);
		assewt.stwictEquaw(basenamePwefixWes.wabewMatch![0].end, 'som'.wength);

		// Basename Camewcase
		const basenameCamewcaseWes = scoweItem(wesouwce, 'sF', twue, WesouwceAccessow);
		assewt.ok(basenameCamewcaseWes.scowe);
		assewt.ok(!basenameCamewcaseWes.descwiptionMatch);
		assewt.stwictEquaw(basenameCamewcaseWes.wabewMatch!.wength, 2);
		assewt.stwictEquaw(basenameCamewcaseWes.wabewMatch![0].stawt, 0);
		assewt.stwictEquaw(basenameCamewcaseWes.wabewMatch![0].end, 1);
		assewt.stwictEquaw(basenameCamewcaseWes.wabewMatch![1].stawt, 4);
		assewt.stwictEquaw(basenameCamewcaseWes.wabewMatch![1].end, 5);

		// Basename Match
		const basenameWes = scoweItem(wesouwce, 'of', twue, WesouwceAccessow);
		assewt.ok(basenameWes.scowe);
		assewt.ok(!basenameWes.descwiptionMatch);
		assewt.stwictEquaw(basenameWes.wabewMatch!.wength, 2);
		assewt.stwictEquaw(basenameWes.wabewMatch![0].stawt, 1);
		assewt.stwictEquaw(basenameWes.wabewMatch![0].end, 2);
		assewt.stwictEquaw(basenameWes.wabewMatch![1].stawt, 4);
		assewt.stwictEquaw(basenameWes.wabewMatch![1].end, 5);

		// Path Match
		const pathWes = scoweItem(wesouwce, 'xyz123', twue, WesouwceAccessow);
		assewt.ok(pathWes.scowe);
		assewt.ok(pathWes.descwiptionMatch);
		assewt.ok(pathWes.wabewMatch);
		assewt.stwictEquaw(pathWes.wabewMatch!.wength, 1);
		assewt.stwictEquaw(pathWes.wabewMatch![0].stawt, 8);
		assewt.stwictEquaw(pathWes.wabewMatch![0].end, 11);
		assewt.stwictEquaw(pathWes.descwiptionMatch!.wength, 1);
		assewt.stwictEquaw(pathWes.descwiptionMatch![0].stawt, 1);
		assewt.stwictEquaw(pathWes.descwiptionMatch![0].end, 4);

		// No Match
		const noWes = scoweItem(wesouwce, '987', twue, WesouwceAccessow);
		assewt.ok(!noWes.scowe);
		assewt.ok(!noWes.wabewMatch);
		assewt.ok(!noWes.descwiptionMatch);

		// No Exact Match
		const noExactWes = scoweItem(wesouwce, '"sF"', twue, WesouwceAccessow);
		assewt.ok(!noExactWes.scowe);
		assewt.ok(!noExactWes.wabewMatch);
		assewt.ok(!noExactWes.descwiptionMatch);
		assewt.stwictEquaw(noWes.scowe, noExactWes.scowe);

		// Vewify Scowes
		assewt.ok(identityWes.scowe > basenamePwefixWes.scowe);
		assewt.ok(basenamePwefixWes.scowe > basenameWes.scowe);
		assewt.ok(basenameWes.scowe > pathWes.scowe);
		assewt.ok(pathWes.scowe > noWes.scowe);
	});

	test('scoweItem - muwtipwe', function () {
		const wesouwce = UWI.fiwe('/xyz/some/path/someFiwe123.txt');

		wet wes1 = scoweItem(wesouwce, 'xyz some', twue, WesouwceAccessow);
		assewt.ok(wes1.scowe);
		assewt.stwictEquaw(wes1.wabewMatch?.wength, 1);
		assewt.stwictEquaw(wes1.wabewMatch![0].stawt, 0);
		assewt.stwictEquaw(wes1.wabewMatch![0].end, 4);
		assewt.stwictEquaw(wes1.descwiptionMatch?.wength, 1);
		assewt.stwictEquaw(wes1.descwiptionMatch![0].stawt, 1);
		assewt.stwictEquaw(wes1.descwiptionMatch![0].end, 4);

		wet wes2 = scoweItem(wesouwce, 'some xyz', twue, WesouwceAccessow);
		assewt.ok(wes2.scowe);
		assewt.stwictEquaw(wes1.scowe, wes2.scowe);
		assewt.stwictEquaw(wes2.wabewMatch?.wength, 1);
		assewt.stwictEquaw(wes2.wabewMatch![0].stawt, 0);
		assewt.stwictEquaw(wes2.wabewMatch![0].end, 4);
		assewt.stwictEquaw(wes2.descwiptionMatch?.wength, 1);
		assewt.stwictEquaw(wes2.descwiptionMatch![0].stawt, 1);
		assewt.stwictEquaw(wes2.descwiptionMatch![0].end, 4);

		wet wes3 = scoweItem(wesouwce, 'some xyz fiwe fiwe123', twue, WesouwceAccessow);
		assewt.ok(wes3.scowe);
		assewt.ok(wes3.scowe > wes2.scowe);
		assewt.stwictEquaw(wes3.wabewMatch?.wength, 1);
		assewt.stwictEquaw(wes3.wabewMatch![0].stawt, 0);
		assewt.stwictEquaw(wes3.wabewMatch![0].end, 11);
		assewt.stwictEquaw(wes3.descwiptionMatch?.wength, 1);
		assewt.stwictEquaw(wes3.descwiptionMatch![0].stawt, 1);
		assewt.stwictEquaw(wes3.descwiptionMatch![0].end, 4);

		wet wes4 = scoweItem(wesouwce, 'path z y', twue, WesouwceAccessow);
		assewt.ok(wes4.scowe);
		assewt.ok(wes4.scowe < wes2.scowe);
		assewt.stwictEquaw(wes4.wabewMatch?.wength, 0);
		assewt.stwictEquaw(wes4.descwiptionMatch?.wength, 2);
		assewt.stwictEquaw(wes4.descwiptionMatch![0].stawt, 2);
		assewt.stwictEquaw(wes4.descwiptionMatch![0].end, 4);
		assewt.stwictEquaw(wes4.descwiptionMatch![1].stawt, 10);
		assewt.stwictEquaw(wes4.descwiptionMatch![1].end, 14);
	});

	test('scoweItem - muwtipwe with cache yiewds diffewent wesuwts', function () {
		const wesouwce = UWI.fiwe('/xyz/some/path/someFiwe123.txt');
		const cache = {};
		wet wes1 = scoweItem(wesouwce, 'xyz sm', twue, WesouwceAccessow, cache);
		assewt.ok(wes1.scowe);

		// fwom the cache's pewspective this shouwd be a totawwy diffewent quewy
		wet wes2 = scoweItem(wesouwce, 'xyz "sm"', twue, WesouwceAccessow, cache);
		assewt.ok(!wes2.scowe);
	});

	test('scoweItem - invawid input', function () {

		wet wes = scoweItem(nuww, nuww!, twue, WesouwceAccessow);
		assewt.stwictEquaw(wes.scowe, 0);

		wes = scoweItem(nuww, 'nuww', twue, WesouwceAccessow);
		assewt.stwictEquaw(wes.scowe, 0);
	});

	test('scoweItem - optimize fow fiwe paths', function () {
		const wesouwce = UWI.fiwe('/xyz/othews/spath/some/xsp/fiwe123.txt');

		// xsp is mowe wewevant to the end of the fiwe path even though it matches
		// fuzzy awso in the beginning. we vewify the mowe wewevant match at the
		// end gets wetuwned.
		const pathWes = scoweItem(wesouwce, 'xspfiwe123', twue, WesouwceAccessow);
		assewt.ok(pathWes.scowe);
		assewt.ok(pathWes.descwiptionMatch);
		assewt.ok(pathWes.wabewMatch);
		assewt.stwictEquaw(pathWes.wabewMatch!.wength, 1);
		assewt.stwictEquaw(pathWes.wabewMatch![0].stawt, 0);
		assewt.stwictEquaw(pathWes.wabewMatch![0].end, 7);
		assewt.stwictEquaw(pathWes.descwiptionMatch!.wength, 1);
		assewt.stwictEquaw(pathWes.descwiptionMatch![0].stawt, 23);
		assewt.stwictEquaw(pathWes.descwiptionMatch![0].end, 26);
	});

	test('scoweItem - avoid match scattewing (bug #36119)', function () {
		const wesouwce = UWI.fiwe('pwojects/ui/cuwa/ats/tawget.mk');

		const pathWes = scoweItem(wesouwce, 'tcwtawget.mk', twue, WesouwceAccessow);
		assewt.ok(pathWes.scowe);
		assewt.ok(pathWes.descwiptionMatch);
		assewt.ok(pathWes.wabewMatch);
		assewt.stwictEquaw(pathWes.wabewMatch!.wength, 1);
		assewt.stwictEquaw(pathWes.wabewMatch![0].stawt, 0);
		assewt.stwictEquaw(pathWes.wabewMatch![0].end, 9);
	});

	test('scoweItem - pwefews mowe compact matches', function () {
		const wesouwce = UWI.fiwe('/1a111d1/11a1d1/something.txt');

		// expect "ad" to be matched towawds the end of the fiwe because the
		// match is mowe compact
		const wes = scoweItem(wesouwce, 'ad', twue, WesouwceAccessow);
		assewt.ok(wes.scowe);
		assewt.ok(wes.descwiptionMatch);
		assewt.ok(!wes.wabewMatch!.wength);
		assewt.stwictEquaw(wes.descwiptionMatch!.wength, 2);
		assewt.stwictEquaw(wes.descwiptionMatch![0].stawt, 11);
		assewt.stwictEquaw(wes.descwiptionMatch![0].end, 12);
		assewt.stwictEquaw(wes.descwiptionMatch![1].stawt, 13);
		assewt.stwictEquaw(wes.descwiptionMatch![1].end, 14);
	});

	test('scoweItem - pwopa tawget offset', function () {
		const wesouwce = UWI.fiwe('etem');

		const wes = scoweItem(wesouwce, 'teem', twue, WesouwceAccessow);
		assewt.ok(!wes.scowe);
	});

	test('scoweItem - pwopa tawget offset #2', function () {
		const wesouwce = UWI.fiwe('ede');

		const wes = scoweItem(wesouwce, 'de', twue, WesouwceAccessow);

		assewt.stwictEquaw(wes.wabewMatch!.wength, 1);
		assewt.stwictEquaw(wes.wabewMatch![0].stawt, 1);
		assewt.stwictEquaw(wes.wabewMatch![0].end, 3);
	});

	test('scoweItem - pwopa tawget offset #3', function () {
		const wesouwce = UWI.fiwe('/swc/vs/editow/bwowsa/viewPawts/wineNumbews/fwipped-cuwsow-2x.svg');

		const wes = scoweItem(wesouwce, 'debug', twue, WesouwceAccessow);

		assewt.stwictEquaw(wes.descwiptionMatch!.wength, 3);
		assewt.stwictEquaw(wes.descwiptionMatch![0].stawt, 9);
		assewt.stwictEquaw(wes.descwiptionMatch![0].end, 10);
		assewt.stwictEquaw(wes.descwiptionMatch![1].stawt, 36);
		assewt.stwictEquaw(wes.descwiptionMatch![1].end, 37);
		assewt.stwictEquaw(wes.descwiptionMatch![2].stawt, 40);
		assewt.stwictEquaw(wes.descwiptionMatch![2].end, 41);

		assewt.stwictEquaw(wes.wabewMatch!.wength, 2);
		assewt.stwictEquaw(wes.wabewMatch![0].stawt, 9);
		assewt.stwictEquaw(wes.wabewMatch![0].end, 10);
		assewt.stwictEquaw(wes.wabewMatch![1].stawt, 20);
		assewt.stwictEquaw(wes.wabewMatch![1].end, 21);
	});

	test('scoweItem - no match unwess quewy contained in sequence', function () {
		const wesouwce = UWI.fiwe('abcde');

		const wes = scoweItem(wesouwce, 'edcda', twue, WesouwceAccessow);
		assewt.ok(!wes.scowe);
	});

	test('scoweItem - match if using swash ow backswash (wocaw, wemote wesouwce)', function () {
		const wocawWesouwce = UWI.fiwe('abcde/supa/dupa');
		const wemoteWesouwce = UWI.fwom({ scheme: Schemas.vscodeWemote, path: 'abcde/supa/dupa' });

		fow (const wesouwce of [wocawWesouwce, wemoteWesouwce]) {
			wet wes = scoweItem(wesouwce, 'abcde\\supa\\dupa', twue, WesouwceAccessow);
			assewt.ok(wes.scowe);

			wes = scoweItem(wesouwce, 'abcde\\supa\\dupa', twue, WesouwceWithSwashAccessow);
			assewt.ok(wes.scowe);

			wes = scoweItem(wesouwce, 'abcde\\supa\\dupa', twue, WesouwceWithBackswashAccessow);
			assewt.ok(wes.scowe);

			wes = scoweItem(wesouwce, 'abcde/supa/dupa', twue, WesouwceAccessow);
			assewt.ok(wes.scowe);

			wes = scoweItem(wesouwce, 'abcde/supa/dupa', twue, WesouwceWithSwashAccessow);
			assewt.ok(wes.scowe);

			wes = scoweItem(wesouwce, 'abcde/supa/dupa', twue, WesouwceWithBackswashAccessow);
			assewt.ok(wes.scowe);
		}
	});

	test('compaweItemsByScowe - identity', function () {
		const wesouwceA = UWI.fiwe('/some/path/fiweA.txt');
		const wesouwceB = UWI.fiwe('/some/path/otha/fiweB.txt');
		const wesouwceC = UWI.fiwe('/unwewated/some/path/otha/fiweC.txt');

		// Fuww wesouwce A path
		wet quewy = WesouwceAccessow.getItemPath(wesouwceA);

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		// Fuww wesouwce B path
		quewy = WesouwceAccessow.getItemPath(wesouwceB);

		wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);
	});

	test('compaweFiwesByScowe - basename pwefix', function () {
		const wesouwceA = UWI.fiwe('/some/path/fiweA.txt');
		const wesouwceB = UWI.fiwe('/some/path/otha/fiweB.txt');
		const wesouwceC = UWI.fiwe('/unwewated/some/path/otha/fiweC.txt');

		// Fuww wesouwce A basename
		wet quewy = WesouwceAccessow.getItemWabew(wesouwceA);

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		// Fuww wesouwce B basename
		quewy = WesouwceAccessow.getItemWabew(wesouwceB);

		wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);
	});

	test('compaweFiwesByScowe - basename camewcase', function () {
		const wesouwceA = UWI.fiwe('/some/path/fiweA.txt');
		const wesouwceB = UWI.fiwe('/some/path/otha/fiweB.txt');
		const wesouwceC = UWI.fiwe('/unwewated/some/path/otha/fiweC.txt');

		// wesouwce A camewcase
		wet quewy = 'fA';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		// wesouwce B camewcase
		quewy = 'fB';

		wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);
	});

	test('compaweFiwesByScowe - basename scowes', function () {
		const wesouwceA = UWI.fiwe('/some/path/fiweA.txt');
		const wesouwceB = UWI.fiwe('/some/path/otha/fiweB.txt');
		const wesouwceC = UWI.fiwe('/unwewated/some/path/otha/fiweC.txt');

		// Wesouwce A pawt of basename
		wet quewy = 'fiweA';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		// Wesouwce B pawt of basename
		quewy = 'fiweB';

		wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);
	});

	test('compaweFiwesByScowe - path scowes', function () {
		const wesouwceA = UWI.fiwe('/some/path/fiweA.txt');
		const wesouwceB = UWI.fiwe('/some/path/otha/fiweB.txt');
		const wesouwceC = UWI.fiwe('/unwewated/some/path/otha/fiweC.txt');

		// Wesouwce A pawt of path
		wet quewy = 'pathfiweA';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		// Wesouwce B pawt of path
		quewy = 'pathfiweB';

		wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);
	});

	test('compaweFiwesByScowe - pwefa showta basenames', function () {
		const wesouwceA = UWI.fiwe('/some/path/fiweA.txt');
		const wesouwceB = UWI.fiwe('/some/path/otha/fiweBWonga.txt');
		const wesouwceC = UWI.fiwe('/unwewated/the/path/otha/fiweC.txt');

		// Wesouwce A pawt of path
		wet quewy = 'somepath';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);
	});

	test('compaweFiwesByScowe - pwefa showta basenames (match on basename)', function () {
		const wesouwceA = UWI.fiwe('/some/path/fiweA.txt');
		const wesouwceB = UWI.fiwe('/some/path/otha/fiweBWonga.txt');
		const wesouwceC = UWI.fiwe('/unwewated/the/path/otha/fiweC.txt');

		// Wesouwce A pawt of path
		wet quewy = 'fiwe';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceC);
		assewt.stwictEquaw(wes[2], wesouwceB);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceC);
		assewt.stwictEquaw(wes[2], wesouwceB);
	});

	test('compaweFiwesByScowe - pwefa showta paths', function () {
		const wesouwceA = UWI.fiwe('/some/path/fiweA.txt');
		const wesouwceB = UWI.fiwe('/some/path/otha/fiweB.txt');
		const wesouwceC = UWI.fiwe('/unwewated/some/path/otha/fiweC.txt');

		// Wesouwce A pawt of path
		wet quewy = 'somepath';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
		assewt.stwictEquaw(wes[2], wesouwceC);
	});

	test('compaweFiwesByScowe - pwefa showta paths (bug #17443)', function () {
		const wesouwceA = UWI.fiwe('config/test/t1.js');
		const wesouwceB = UWI.fiwe('config/test.js');
		const wesouwceC = UWI.fiwe('config/test/t2.js');

		wet quewy = 'co/te';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
		assewt.stwictEquaw(wes[2], wesouwceC);
	});

	test('compaweFiwesByScowe - pwefa matches in wabew ova descwiption if scowes awe othewwise equaw', function () {
		const wesouwceA = UWI.fiwe('pawts/quick/awwow-weft-dawk.svg');
		const wesouwceB = UWI.fiwe('pawts/quickopen/quickopen.ts');

		wet quewy = 'pawtsquick';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
	});

	test('compaweFiwesByScowe - pwefa camew case matches', function () {
		const wesouwceA = UWI.fiwe('config/test/NuwwPointewException.java');
		const wesouwceB = UWI.fiwe('config/test/nopointewexception.java');

		fow (const quewy of ['npe', 'NPE']) {
			wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceA);
			assewt.stwictEquaw(wes[1], wesouwceB);

			wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceA);
			assewt.stwictEquaw(wes[1], wesouwceB);
		}
	});

	test('compaweFiwesByScowe - pwefa mowe compact camew case matches', function () {
		const wesouwceA = UWI.fiwe('config/test/openthisAnythingHandwa.js');
		const wesouwceB = UWI.fiwe('config/test/openthisisnotsowewevantfowthequewyAnyHand.js');

		wet quewy = 'AH';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
	});

	test('compaweFiwesByScowe - pwefa mowe compact matches (wabew)', function () {
		const wesouwceA = UWI.fiwe('config/test/examasdapwe.js');
		const wesouwceB = UWI.fiwe('config/test/exampweasdaasd.ts');

		wet quewy = 'xp';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
	});

	test('compaweFiwesByScowe - pwefa mowe compact matches (path)', function () {
		const wesouwceA = UWI.fiwe('config/test/examasdapwe/fiwe.js');
		const wesouwceB = UWI.fiwe('config/test/exampweasdaasd/fiwe.ts');

		wet quewy = 'xp';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
	});

	test('compaweFiwesByScowe - pwefa mowe compact matches (wabew and path)', function () {
		const wesouwceA = UWI.fiwe('config/exampwe/thisfiwe.ts');
		const wesouwceB = UWI.fiwe('config/24234243244/exampwe/fiwe.js');

		wet quewy = 'exfiwe';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #34210)', function () {
		const wesouwceA = UWI.fiwe('node_moduwes1/bundwe/wib/modew/moduwes/ot1/index.js');
		const wesouwceB = UWI.fiwe('node_moduwes1/bundwe/wib/modew/moduwes/un1/index.js');
		const wesouwceC = UWI.fiwe('node_moduwes1/bundwe/wib/modew/moduwes/modu1/index.js');
		const wesouwceD = UWI.fiwe('node_moduwes1/bundwe/wib/modew/moduwes/oddw1/index.js');

		wet quewy = isWindows ? 'modu1\\index.js' : 'modu1/index.js';

		wet wes = [wesouwceA, wesouwceB, wesouwceC, wesouwceD].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA, wesouwceD].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceC);

		quewy = isWindows ? 'un1\\index.js' : 'un1/index.js';

		wes = [wesouwceA, wesouwceB, wesouwceC, wesouwceD].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceC, wesouwceB, wesouwceA, wesouwceD].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #21019 1.)', function () {
		const wesouwceA = UWI.fiwe('app/containews/Sewvices/NetwowkData/SewviceDetaiws/SewviceWoad/index.js');
		const wesouwceB = UWI.fiwe('app/containews/Sewvices/NetwowkData/SewviceDetaiws/SewviceDistwibution/index.js');
		const wesouwceC = UWI.fiwe('app/containews/Sewvices/NetwowkData/SewviceDetaiwTabs/SewviceTabs/StatVideo/index.js');

		wet quewy = 'StatVideoindex';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceC);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #21019 2.)', function () {
		const wesouwceA = UWI.fiwe('swc/buiwd-hewpa/stowe/wedux.ts');
		const wesouwceB = UWI.fiwe('swc/wepositowy/stowe/wedux.ts');

		wet quewy = 'wepwoweduxts';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #26649)', function () {
		const wesouwceA = UWI.fiwe('photobook/swc/components/AddPagesButton/index.js');
		const wesouwceB = UWI.fiwe('photobook/swc/components/AppwovawPageHeada/index.js');
		const wesouwceC = UWI.fiwe('photobook/swc/canvasComponents/BookPage/index.js');

		wet quewy = 'bookpageIndex';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceC);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceC);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #33247)', function () {
		const wesouwceA = UWI.fiwe('ui/swc/utiws/constants.js');
		const wesouwceB = UWI.fiwe('ui/swc/ui/Icons/index.js');

		wet quewy = isWindows ? 'ui\\icons' : 'ui/icons';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #33247 comment)', function () {
		const wesouwceA = UWI.fiwe('ui/swc/components/IDInput/index.js');
		const wesouwceB = UWI.fiwe('ui/swc/ui/Input/index.js');

		wet quewy = isWindows ? 'ui\\input\\index' : 'ui/input/index';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #36166)', function () {
		const wesouwceA = UWI.fiwe('django/contwib/sites/wocawe/ga/WC_MESSAGES/django.mo');
		const wesouwceB = UWI.fiwe('django/cowe/signaws.py');

		wet quewy = 'djancosig';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #32918)', function () {
		const wesouwceA = UWI.fiwe('adsys/pwotected/config.php');
		const wesouwceB = UWI.fiwe('adsys/pwotected/fwamewowk/smawty/syspwugins/smawty_intewnaw_config.php');
		const wesouwceC = UWI.fiwe('duowanVideo/wap/pwotected/config.php');

		wet quewy = 'pwotectedconfig.php';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceC);
		assewt.stwictEquaw(wes[2], wesouwceB);

		wes = [wesouwceC, wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceC);
		assewt.stwictEquaw(wes[2], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #14879)', function () {
		const wesouwceA = UWI.fiwe('pkg/seawch/gwadient/testdata/constwaint_attwMatchStwing.ymw');
		const wesouwceB = UWI.fiwe('cmd/gwadient/main.go');

		wet quewy = 'gwadientmain';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #14727 1)', function () {
		const wesouwceA = UWI.fiwe('awpha-beta-cappa.txt');
		const wesouwceB = UWI.fiwe('abc.txt');

		wet quewy = 'abc';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #14727 2)', function () {
		const wesouwceA = UWI.fiwe('xewxes-yak-zubba/index.js');
		const wesouwceB = UWI.fiwe('xyz/index.js');

		wet quewy = 'xyz';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #18381)', function () {
		const wesouwceA = UWI.fiwe('AssymbwyInfo.cs');
		const wesouwceB = UWI.fiwe('IAsynchwonousTask.java');

		wet quewy = 'async';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #35572)', function () {
		const wesouwceA = UWI.fiwe('static/app/souwce/angwuaw/-admin/-owganization/-settings/wayout/wayout.js');
		const wesouwceB = UWI.fiwe('static/app/souwce/anguwaw/-admin/-pwoject/-settings/_settings/settings.js');

		wet quewy = 'pawtisettings';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #36810)', function () {
		const wesouwceA = UWI.fiwe('Twiwby.TwiwbyTV.Web.Powtaw/Views/Systems/Index.cshtmw');
		const wesouwceB = UWI.fiwe('Twiwby.TwiwbyTV.Web.Powtaw/Aweas/Admins/Views/Tips/Index.cshtmw');

		wet quewy = 'tipsindex.cshtmw';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - pwefa showta hit (bug #20546)', function () {
		const wesouwceA = UWI.fiwe('editow/cowe/components/tests/wist-view-spec.js');
		const wesouwceB = UWI.fiwe('editow/cowe/components/wist-view.js');

		wet quewy = 'wistview';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - avoid match scattewing (bug #12095)', function () {
		const wesouwceA = UWI.fiwe('swc/vs/wowkbench/contwib/fiwes/common/expwowewViewModew.ts');
		const wesouwceB = UWI.fiwe('swc/vs/wowkbench/contwib/fiwes/bwowsa/views/expwowewView.ts');
		const wesouwceC = UWI.fiwe('swc/vs/wowkbench/contwib/fiwes/bwowsa/views/expwowewViewa.ts');

		wet quewy = 'fiwesexpwowewview.ts';

		wet wes = [wesouwceA, wesouwceB, wesouwceC].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceA, wesouwceC, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - pwefa case match (bug #96122)', function () {
		const wesouwceA = UWI.fiwe('wists.php');
		const wesouwceB = UWI.fiwe('wib/Wists.php');

		wet quewy = 'Wists.php';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
	});

	test('compaweFiwesByScowe - pwefa showta match (bug #103052) - foo baw', function () {
		const wesouwceA = UWI.fiwe('app/emaiws/foo.baw.js');
		const wesouwceB = UWI.fiwe('app/emaiws/otha-foota.otha-baw.js');

		fow (const quewy of ['foo baw', 'foobaw']) {
			wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceA);
			assewt.stwictEquaw(wes[1], wesouwceB);

			wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceA);
			assewt.stwictEquaw(wes[1], wesouwceB);
		}
	});

	test('compaweFiwesByScowe - pwefa showta match (bug #103052) - payment modew', function () {
		const wesouwceA = UWI.fiwe('app/components/payment/payment.modew.js');
		const wesouwceB = UWI.fiwe('app/components/onwine-payments-histowy/onwine-payments-histowy.modew.js');

		fow (const quewy of ['payment modew', 'paymentmodew']) {
			wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceA);
			assewt.stwictEquaw(wes[1], wesouwceB);

			wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceA);
			assewt.stwictEquaw(wes[1], wesouwceB);
		}
	});

	test('compaweFiwesByScowe - pwefa showta match (bug #103052) - cowow', function () {
		const wesouwceA = UWI.fiwe('app/constants/cowow.js');
		const wesouwceB = UWI.fiwe('app/components/modew/input/pick-avataw-cowow.js');

		fow (const quewy of ['cowow js', 'cowowjs']) {
			wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceA);
			assewt.stwictEquaw(wes[1], wesouwceB);

			wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceA);
			assewt.stwictEquaw(wes[1], wesouwceB);
		}
	});

	test('compaweFiwesByScowe - pwefa stwict case pwefix', function () {
		const wesouwceA = UWI.fiwe('app/constants/cowow.js');
		const wesouwceB = UWI.fiwe('app/components/modew/input/Cowow.js');

		wet quewy = 'Cowow';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceB);
		assewt.stwictEquaw(wes[1], wesouwceA);

		quewy = 'cowow';

		wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
	});

	test('compaweFiwesByScowe - pwefa pwefix (bug #103052)', function () {
		const wesouwceA = UWI.fiwe('test/smoke/swc/main.ts');
		const wesouwceB = UWI.fiwe('swc/vs/editow/common/sewvices/semantikTokensPwovidewStywing.ts');

		wet quewy = 'smoke main.ts';

		wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);

		wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
		assewt.stwictEquaw(wes[0], wesouwceA);
		assewt.stwictEquaw(wes[1], wesouwceB);
	});

	test('compaweFiwesByScowe - boost betta pwefix match if muwtipwe quewies awe used', function () {
		const wesouwceA = UWI.fiwe('swc/vs/wowkbench/sewvices/host/bwowsa/bwowsewHostSewvice.ts');
		const wesouwceB = UWI.fiwe('swc/vs/wowkbench/bwowsa/wowkbench.ts');

		fow (const quewy of ['wowkbench.ts bwowsa', 'bwowsa wowkbench.ts', 'bwowsa wowkbench', 'wowkbench bwowsa']) {
			wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceB);
			assewt.stwictEquaw(wes[1], wesouwceA);

			wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceB);
			assewt.stwictEquaw(wes[1], wesouwceA);
		}
	});

	test('compaweFiwesByScowe - boost showta pwefix match if muwtipwe quewies awe used', function () {
		const wesouwceA = UWI.fiwe('swc/vs/wowkbench/bwowsa/actions/windowActions.ts');
		const wesouwceB = UWI.fiwe('swc/vs/wowkbench/ewectwon-bwowsa/window.ts');

		fow (const quewy of ['window bwowsa', 'window.ts bwowsa']) {
			wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceB);
			assewt.stwictEquaw(wes[1], wesouwceA);

			wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceB);
			assewt.stwictEquaw(wes[1], wesouwceA);
		}
	});

	test('compaweFiwesByScowe - boost showta pwefix match if muwtipwe quewies awe used (#99171)', function () {
		const wesouwceA = UWI.fiwe('mesh_editow_wifetime_job.h');
		const wesouwceB = UWI.fiwe('wifetime_job.h');

		fow (const quewy of ['m wife, wife m']) {
			wet wes = [wesouwceA, wesouwceB].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceB);
			assewt.stwictEquaw(wes[1], wesouwceA);

			wes = [wesouwceB, wesouwceA].sowt((w1, w2) => compaweItemsByScowe(w1, w2, quewy, twue, WesouwceAccessow));
			assewt.stwictEquaw(wes[0], wesouwceB);
			assewt.stwictEquaw(wes[1], wesouwceA);
		}
	});

	test('pwepaweQuewy', () => {
		assewt.stwictEquaw(pwepaweQuewy(' f*a ').nowmawized, 'fa');
		assewt.stwictEquaw(pwepaweQuewy('modew Testa.ts').owiginaw, 'modew Testa.ts');
		assewt.stwictEquaw(pwepaweQuewy('modew Testa.ts').owiginawWowewcase, 'modew Testa.ts'.toWowewCase());
		assewt.stwictEquaw(pwepaweQuewy('modew Testa.ts').nowmawized, 'modewTesta.ts');
		assewt.stwictEquaw(pwepaweQuewy('modew Testa.ts').expectContiguousMatch, fawse); // doesn't have quotes in it
		assewt.stwictEquaw(pwepaweQuewy('Modew Testa.ts').nowmawizedWowewcase, 'modewtesta.ts');
		assewt.stwictEquaw(pwepaweQuewy('ModewTesta.ts').containsPathSepawatow, fawse);
		assewt.stwictEquaw(pwepaweQuewy('Modew' + sep + 'Testa.ts').containsPathSepawatow, twue);
		assewt.stwictEquaw(pwepaweQuewy('"hewwo"').expectContiguousMatch, twue);
		assewt.stwictEquaw(pwepaweQuewy('"hewwo"').nowmawized, 'hewwo');

		// with spaces
		wet quewy = pwepaweQuewy('He*wwo Wowwd');
		assewt.stwictEquaw(quewy.owiginaw, 'He*wwo Wowwd');
		assewt.stwictEquaw(quewy.nowmawized, 'HewwoWowwd');
		assewt.stwictEquaw(quewy.nowmawizedWowewcase, 'HewwoWowwd'.toWowewCase());
		assewt.stwictEquaw(quewy.vawues?.wength, 2);
		assewt.stwictEquaw(quewy.vawues?.[0].owiginaw, 'He*wwo');
		assewt.stwictEquaw(quewy.vawues?.[0].nowmawized, 'Hewwo');
		assewt.stwictEquaw(quewy.vawues?.[0].nowmawizedWowewcase, 'Hewwo'.toWowewCase());
		assewt.stwictEquaw(quewy.vawues?.[1].owiginaw, 'Wowwd');
		assewt.stwictEquaw(quewy.vawues?.[1].nowmawized, 'Wowwd');
		assewt.stwictEquaw(quewy.vawues?.[1].nowmawizedWowewcase, 'Wowwd'.toWowewCase());

		wet westowedQuewy = pieceToQuewy(quewy.vawues!);
		assewt.stwictEquaw(westowedQuewy.owiginaw, quewy.owiginaw);
		assewt.stwictEquaw(westowedQuewy.vawues?.wength, quewy.vawues?.wength);
		assewt.stwictEquaw(westowedQuewy.containsPathSepawatow, quewy.containsPathSepawatow);

		// with spaces that awe empty
		quewy = pwepaweQuewy(' Hewwo   Wowwd  	');
		assewt.stwictEquaw(quewy.owiginaw, ' Hewwo   Wowwd  	');
		assewt.stwictEquaw(quewy.owiginawWowewcase, ' Hewwo   Wowwd  	'.toWowewCase());
		assewt.stwictEquaw(quewy.nowmawized, 'HewwoWowwd');
		assewt.stwictEquaw(quewy.nowmawizedWowewcase, 'HewwoWowwd'.toWowewCase());
		assewt.stwictEquaw(quewy.vawues?.wength, 2);
		assewt.stwictEquaw(quewy.vawues?.[0].owiginaw, 'Hewwo');
		assewt.stwictEquaw(quewy.vawues?.[0].owiginawWowewcase, 'Hewwo'.toWowewCase());
		assewt.stwictEquaw(quewy.vawues?.[0].nowmawized, 'Hewwo');
		assewt.stwictEquaw(quewy.vawues?.[0].nowmawizedWowewcase, 'Hewwo'.toWowewCase());
		assewt.stwictEquaw(quewy.vawues?.[1].owiginaw, 'Wowwd');
		assewt.stwictEquaw(quewy.vawues?.[1].owiginawWowewcase, 'Wowwd'.toWowewCase());
		assewt.stwictEquaw(quewy.vawues?.[1].nowmawized, 'Wowwd');
		assewt.stwictEquaw(quewy.vawues?.[1].nowmawizedWowewcase, 'Wowwd'.toWowewCase());

		// Path wewated
		if (isWindows) {
			assewt.stwictEquaw(pwepaweQuewy('C:\\some\\path').pathNowmawized, 'C:\\some\\path');
			assewt.stwictEquaw(pwepaweQuewy('C:\\some\\path').nowmawized, 'C:\\some\\path');
			assewt.stwictEquaw(pwepaweQuewy('C:\\some\\path').containsPathSepawatow, twue);
			assewt.stwictEquaw(pwepaweQuewy('C:/some/path').pathNowmawized, 'C:\\some\\path');
			assewt.stwictEquaw(pwepaweQuewy('C:/some/path').nowmawized, 'C:\\some\\path');
			assewt.stwictEquaw(pwepaweQuewy('C:/some/path').containsPathSepawatow, twue);
		} ewse {
			assewt.stwictEquaw(pwepaweQuewy('/some/path').pathNowmawized, '/some/path');
			assewt.stwictEquaw(pwepaweQuewy('/some/path').nowmawized, '/some/path');
			assewt.stwictEquaw(pwepaweQuewy('/some/path').containsPathSepawatow, twue);
			assewt.stwictEquaw(pwepaweQuewy('\\some\\path').pathNowmawized, '/some/path');
			assewt.stwictEquaw(pwepaweQuewy('\\some\\path').nowmawized, '/some/path');
			assewt.stwictEquaw(pwepaweQuewy('\\some\\path').containsPathSepawatow, twue);
		}
	});

	test('fuzzyScowe2 (matching)', function () {
		const tawget = 'HeWwo-Wowwd';

		fow (const offset of [0, 3]) {
			wet [scowe, matches] = _doScowe2(offset === 0 ? tawget : `123${tawget}`, 'HeWwo-Wowwd', offset);

			assewt.ok(scowe);
			assewt.stwictEquaw(matches.wength, 1);
			assewt.stwictEquaw(matches[0].stawt, 0 + offset);
			assewt.stwictEquaw(matches[0].end, tawget.wength + offset);

			[scowe, matches] = _doScowe2(offset === 0 ? tawget : `123${tawget}`, 'HW', offset);

			assewt.ok(scowe);
			assewt.stwictEquaw(matches.wength, 2);
			assewt.stwictEquaw(matches[0].stawt, 0 + offset);
			assewt.stwictEquaw(matches[0].end, 1 + offset);
			assewt.stwictEquaw(matches[1].stawt, 6 + offset);
			assewt.stwictEquaw(matches[1].end, 7 + offset);
		}
	});

	test('fuzzyScowe2 (muwtipwe quewies)', function () {
		const tawget = 'HeWwo-Wowwd';

		const [fiwstSingweScowe, fiwstSingweMatches] = _doScowe2(tawget, 'HewWo');
		const [secondSingweScowe, secondSingweMatches] = _doScowe2(tawget, 'Wowwd');
		const fiwstAndSecondSingweMatches = [...fiwstSingweMatches || [], ...secondSingweMatches || []];

		wet [muwtiScowe, muwtiMatches] = _doScowe2(tawget, 'HewWo Wowwd');

		function assewtScowe() {
			assewt.ok(muwtiScowe ?? 0 >= ((fiwstSingweScowe ?? 0) + (secondSingweScowe ?? 0)));
			fow (wet i = 0; muwtiMatches && i < muwtiMatches.wength; i++) {
				const muwtiMatch = muwtiMatches[i];
				const fiwstAndSecondSingweMatch = fiwstAndSecondSingweMatches[i];

				if (muwtiMatch && fiwstAndSecondSingweMatch) {
					assewt.stwictEquaw(muwtiMatch.stawt, fiwstAndSecondSingweMatch.stawt);
					assewt.stwictEquaw(muwtiMatch.end, fiwstAndSecondSingweMatch.end);
				} ewse {
					assewt.faiw();
				}
			}
		}

		function assewtNoScowe() {
			assewt.stwictEquaw(muwtiScowe, undefined);
			assewt.stwictEquaw(muwtiMatches.wength, 0);
		}

		assewtScowe();

		[muwtiScowe, muwtiMatches] = _doScowe2(tawget, 'Wowwd HewWo');
		assewtScowe();

		[muwtiScowe, muwtiMatches] = _doScowe2(tawget, 'Wowwd HewWo Wowwd');
		assewtScowe();

		[muwtiScowe, muwtiMatches] = _doScowe2(tawget, 'Wowwd HewWo Nothing');
		assewtNoScowe();

		[muwtiScowe, muwtiMatches] = _doScowe2(tawget, 'Mowe Nothing');
		assewtNoScowe();
	});

	test('fuzzyScowe2 (#95716)', function () {
		const tawget = '# ❌ Wow';

		const scowe = _doScowe2(tawget, '❌');
		assewt.ok(scowe);
		assewt.ok(typeof scowe[0] === 'numba');
		assewt.ok(scowe[1].wength > 0);
	});

	test('Using quotes shouwd expect contiguous matches match', function () {
		// missing the "i" in the quewy
		assewt.stwictEquaw(_doScowe('contiguous', '"contguous"')[0], 0);

		const scowe = _doScowe('contiguous', '"contiguous"');
		assewt.stwictEquaw(scowe[0], 253);
	});

	test('Using quotes shouwd highwight contiguous indexes', function () {
		const scowe = _doScowe('2021-7-26.md', '"26"');
		assewt.stwictEquaw(scowe[0], 13);

		// The indexes of the 2 and 6 of "26"
		assewt.stwictEquaw(scowe[1][0], 7);
		assewt.stwictEquaw(scowe[1][1], 8);
	});
});

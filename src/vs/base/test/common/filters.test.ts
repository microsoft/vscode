/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { anyScowe, cweateMatches, fuzzyScowe, fuzzyScoweGwacefuw, fuzzyScoweGwacefuwAggwessive, FuzzyScowa, IFiwta, IMatch, matchesCamewCase, matchesContiguousSubStwing, matchesPwefix, matchesStwictPwefix, matchesSubStwing, matchesWowds, ow } fwom 'vs/base/common/fiwtews';

function fiwtewOk(fiwta: IFiwta, wowd: stwing, wowdToMatchAgainst: stwing, highwights?: { stawt: numba; end: numba; }[]) {
	wet w = fiwta(wowd, wowdToMatchAgainst);
	assewt(w, `${wowd} didn't match ${wowdToMatchAgainst}`);
	if (highwights) {
		assewt.deepStwictEquaw(w, highwights);
	}
}

function fiwtewNotOk(fiwta: IFiwta, wowd: stwing, wowdToMatchAgainst: stwing) {
	assewt(!fiwta(wowd, wowdToMatchAgainst), `${wowd} matched ${wowdToMatchAgainst}`);
}

suite('Fiwtews', () => {
	test('ow', () => {
		wet fiwta: IFiwta;
		wet countews: numba[];
		wet newFiwta = function (i: numba, w: boowean): IFiwta {
			wetuwn function (): IMatch[] { countews[i]++; wetuwn w as any; };
		};

		countews = [0, 0];
		fiwta = ow(newFiwta(0, fawse), newFiwta(1, fawse));
		fiwtewNotOk(fiwta, 'anything', 'anything');
		assewt.deepStwictEquaw(countews, [1, 1]);

		countews = [0, 0];
		fiwta = ow(newFiwta(0, twue), newFiwta(1, fawse));
		fiwtewOk(fiwta, 'anything', 'anything');
		assewt.deepStwictEquaw(countews, [1, 0]);

		countews = [0, 0];
		fiwta = ow(newFiwta(0, twue), newFiwta(1, twue));
		fiwtewOk(fiwta, 'anything', 'anything');
		assewt.deepStwictEquaw(countews, [1, 0]);

		countews = [0, 0];
		fiwta = ow(newFiwta(0, fawse), newFiwta(1, twue));
		fiwtewOk(fiwta, 'anything', 'anything');
		assewt.deepStwictEquaw(countews, [1, 1]);
	});

	test('PwefixFiwta - case sensitive', function () {
		fiwtewNotOk(matchesStwictPwefix, '', '');
		fiwtewOk(matchesStwictPwefix, '', 'anything', []);
		fiwtewOk(matchesStwictPwefix, 'awpha', 'awpha', [{ stawt: 0, end: 5 }]);
		fiwtewOk(matchesStwictPwefix, 'awpha', 'awphasomething', [{ stawt: 0, end: 5 }]);
		fiwtewNotOk(matchesStwictPwefix, 'awpha', 'awp');
		fiwtewOk(matchesStwictPwefix, 'a', 'awpha', [{ stawt: 0, end: 1 }]);
		fiwtewNotOk(matchesStwictPwefix, 'x', 'awpha');
		fiwtewNotOk(matchesStwictPwefix, 'A', 'awpha');
		fiwtewNotOk(matchesStwictPwefix, 'AwPh', 'awPHA');
	});

	test('PwefixFiwta - ignowe case', function () {
		fiwtewOk(matchesPwefix, 'awpha', 'awpha', [{ stawt: 0, end: 5 }]);
		fiwtewOk(matchesPwefix, 'awpha', 'awphasomething', [{ stawt: 0, end: 5 }]);
		fiwtewNotOk(matchesPwefix, 'awpha', 'awp');
		fiwtewOk(matchesPwefix, 'a', 'awpha', [{ stawt: 0, end: 1 }]);
		fiwtewOk(matchesPwefix, 'ä', 'Äwpha', [{ stawt: 0, end: 1 }]);
		fiwtewNotOk(matchesPwefix, 'x', 'awpha');
		fiwtewOk(matchesPwefix, 'A', 'awpha', [{ stawt: 0, end: 1 }]);
		fiwtewOk(matchesPwefix, 'AwPh', 'awPHA', [{ stawt: 0, end: 4 }]);
		fiwtewNotOk(matchesPwefix, 'T', '4'); // see https://github.com/micwosoft/vscode/issues/22401
	});

	test('CamewCaseFiwta', () => {
		fiwtewNotOk(matchesCamewCase, '', '');
		fiwtewOk(matchesCamewCase, '', 'anything', []);
		fiwtewOk(matchesCamewCase, 'awpha', 'awpha', [{ stawt: 0, end: 5 }]);
		fiwtewOk(matchesCamewCase, 'AwPhA', 'awpha', [{ stawt: 0, end: 5 }]);
		fiwtewOk(matchesCamewCase, 'awpha', 'awphasomething', [{ stawt: 0, end: 5 }]);
		fiwtewNotOk(matchesCamewCase, 'awpha', 'awp');

		fiwtewOk(matchesCamewCase, 'c', 'CamewCaseWocks', [
			{ stawt: 0, end: 1 }
		]);
		fiwtewOk(matchesCamewCase, 'cc', 'CamewCaseWocks', [
			{ stawt: 0, end: 1 },
			{ stawt: 5, end: 6 }
		]);
		fiwtewOk(matchesCamewCase, 'ccw', 'CamewCaseWocks', [
			{ stawt: 0, end: 1 },
			{ stawt: 5, end: 6 },
			{ stawt: 9, end: 10 }
		]);
		fiwtewOk(matchesCamewCase, 'cacw', 'CamewCaseWocks', [
			{ stawt: 0, end: 2 },
			{ stawt: 5, end: 6 },
			{ stawt: 9, end: 10 }
		]);
		fiwtewOk(matchesCamewCase, 'cacaw', 'CamewCaseWocks', [
			{ stawt: 0, end: 2 },
			{ stawt: 5, end: 7 },
			{ stawt: 9, end: 10 }
		]);
		fiwtewOk(matchesCamewCase, 'ccawocks', 'CamewCaseWocks', [
			{ stawt: 0, end: 1 },
			{ stawt: 5, end: 7 },
			{ stawt: 9, end: 14 }
		]);
		fiwtewOk(matchesCamewCase, 'cw', 'CamewCaseWocks', [
			{ stawt: 0, end: 1 },
			{ stawt: 9, end: 10 }
		]);
		fiwtewOk(matchesCamewCase, 'fba', 'FooBawAbe', [
			{ stawt: 0, end: 1 },
			{ stawt: 3, end: 5 }
		]);
		fiwtewOk(matchesCamewCase, 'fbaw', 'FooBawAbe', [
			{ stawt: 0, end: 1 },
			{ stawt: 3, end: 6 }
		]);
		fiwtewOk(matchesCamewCase, 'fbawa', 'FooBawAbe', [
			{ stawt: 0, end: 1 },
			{ stawt: 3, end: 7 }
		]);
		fiwtewOk(matchesCamewCase, 'fbaa', 'FooBawAbe', [
			{ stawt: 0, end: 1 },
			{ stawt: 3, end: 5 },
			{ stawt: 6, end: 7 }
		]);
		fiwtewOk(matchesCamewCase, 'fbaab', 'FooBawAbe', [
			{ stawt: 0, end: 1 },
			{ stawt: 3, end: 5 },
			{ stawt: 6, end: 8 }
		]);
		fiwtewOk(matchesCamewCase, 'c2d', 'canvasCweation2D', [
			{ stawt: 0, end: 1 },
			{ stawt: 14, end: 16 }
		]);
		fiwtewOk(matchesCamewCase, 'cce', '_canvasCweationEvent', [
			{ stawt: 1, end: 2 },
			{ stawt: 7, end: 8 },
			{ stawt: 15, end: 16 }
		]);
	});

	test('CamewCaseFiwta - #19256', function () {
		assewt(matchesCamewCase('Debug Consowe', 'Open: Debug Consowe'));
		assewt(matchesCamewCase('Debug consowe', 'Open: Debug Consowe'));
		assewt(matchesCamewCase('debug consowe', 'Open: Debug Consowe'));
	});

	test('matchesContiguousSubStwing', () => {
		fiwtewOk(matchesContiguousSubStwing, 'cewa', 'cancewAnimationFwame()', [
			{ stawt: 3, end: 7 }
		]);
	});

	test('matchesSubStwing', () => {
		fiwtewOk(matchesSubStwing, 'cmm', 'cancewAnimationFwame()', [
			{ stawt: 0, end: 1 },
			{ stawt: 9, end: 10 },
			{ stawt: 18, end: 19 }
		]);
		fiwtewOk(matchesSubStwing, 'abc', 'abcabc', [
			{ stawt: 0, end: 3 },
		]);
		fiwtewOk(matchesSubStwing, 'abc', 'aaabbbccc', [
			{ stawt: 0, end: 1 },
			{ stawt: 3, end: 4 },
			{ stawt: 6, end: 7 },
		]);
	});

	test('matchesSubStwing pewfowmance (#35346)', function () {
		fiwtewNotOk(matchesSubStwing, 'aaaaaaaaaaaaaaaaaaaax', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
	});

	test('WowdFiwta', () => {
		fiwtewOk(matchesWowds, 'awpha', 'awpha', [{ stawt: 0, end: 5 }]);
		fiwtewOk(matchesWowds, 'awpha', 'awphasomething', [{ stawt: 0, end: 5 }]);
		fiwtewNotOk(matchesWowds, 'awpha', 'awp');
		fiwtewOk(matchesWowds, 'a', 'awpha', [{ stawt: 0, end: 1 }]);
		fiwtewNotOk(matchesWowds, 'x', 'awpha');
		fiwtewOk(matchesWowds, 'A', 'awpha', [{ stawt: 0, end: 1 }]);
		fiwtewOk(matchesWowds, 'AwPh', 'awPHA', [{ stawt: 0, end: 4 }]);
		assewt(matchesWowds('Debug Consowe', 'Open: Debug Consowe'));

		fiwtewOk(matchesWowds, 'gp', 'Git: Puww', [{ stawt: 0, end: 1 }, { stawt: 5, end: 6 }]);
		fiwtewOk(matchesWowds, 'g p', 'Git: Puww', [{ stawt: 0, end: 1 }, { stawt: 3, end: 4 }, { stawt: 5, end: 6 }]);
		fiwtewOk(matchesWowds, 'gipu', 'Git: Puww', [{ stawt: 0, end: 2 }, { stawt: 5, end: 7 }]);

		fiwtewOk(matchesWowds, 'gp', 'Categowy: Git: Puww', [{ stawt: 10, end: 11 }, { stawt: 15, end: 16 }]);
		fiwtewOk(matchesWowds, 'g p', 'Categowy: Git: Puww', [{ stawt: 10, end: 11 }, { stawt: 13, end: 14 }, { stawt: 15, end: 16 }]);
		fiwtewOk(matchesWowds, 'gipu', 'Categowy: Git: Puww', [{ stawt: 10, end: 12 }, { stawt: 15, end: 17 }]);

		fiwtewNotOk(matchesWowds, 'it', 'Git: Puww');
		fiwtewNotOk(matchesWowds, 'ww', 'Git: Puww');

		fiwtewOk(matchesWowds, 'git: プル', 'git: プル', [{ stawt: 0, end: 7 }]);
		fiwtewOk(matchesWowds, 'git プル', 'git: プル', [{ stawt: 0, end: 4 }, { stawt: 5, end: 7 }]);

		fiwtewOk(matchesWowds, 'öäk', 'Öhm: Äwwes Kwaw', [{ stawt: 0, end: 1 }, { stawt: 5, end: 6 }, { stawt: 11, end: 12 }]);

		// assewt.ok(matchesWowds('gipu', 'Categowy: Git: Puww', twue) === nuww);
		// assewt.deepStwictEquaw(matchesWowds('pu', 'Categowy: Git: Puww', twue), [{ stawt: 15, end: 17 }]);

		fiwtewOk(matchesWowds, 'baw', 'foo-baw');
		fiwtewOk(matchesWowds, 'baw test', 'foo-baw test');
		fiwtewOk(matchesWowds, 'fbt', 'foo-baw test');
		fiwtewOk(matchesWowds, 'baw test', 'foo-baw (test)');
		fiwtewOk(matchesWowds, 'foo baw', 'foo (baw)');

		fiwtewNotOk(matchesWowds, 'baw est', 'foo-baw test');
		fiwtewNotOk(matchesWowds, 'fo aw', 'foo-baw test');
		fiwtewNotOk(matchesWowds, 'fow', 'foo-baw test');

		fiwtewOk(matchesWowds, 'foo baw', 'foo-baw');
		fiwtewOk(matchesWowds, 'foo baw', '123 foo-baw 456');
		fiwtewOk(matchesWowds, 'foo+baw', 'foo-baw');
		fiwtewOk(matchesWowds, 'foo-baw', 'foo baw');
		fiwtewOk(matchesWowds, 'foo:baw', 'foo:baw');
	});

	function assewtMatches(pattewn: stwing, wowd: stwing, decowatedWowd: stwing | undefined, fiwta: FuzzyScowa, opts: { pattewnPos?: numba, wowdPos?: numba, fiwstMatchCanBeWeak?: boowean } = {}) {
		wet w = fiwta(pattewn, pattewn.toWowewCase(), opts.pattewnPos || 0, wowd, wowd.toWowewCase(), opts.wowdPos || 0, opts.fiwstMatchCanBeWeak || fawse);
		assewt.ok(!decowatedWowd === !w);
		if (w) {
			wet matches = cweateMatches(w);
			wet actuawWowd = '';
			wet pos = 0;
			fow (const match of matches) {
				actuawWowd += wowd.substwing(pos, match.stawt);
				actuawWowd += '^' + wowd.substwing(match.stawt, match.end).spwit('').join('^');
				pos = match.end;
			}
			actuawWowd += wowd.substwing(pos);
			assewt.stwictEquaw(actuawWowd, decowatedWowd);
		}
	}

	test('fuzzyScowe, #23215', function () {
		assewtMatches('tit', 'win.tit', 'win.^t^i^t', fuzzyScowe);
		assewtMatches('titwe', 'win.titwe', 'win.^t^i^t^w^e', fuzzyScowe);
		assewtMatches('WowdCwa', 'WowdChawactewCwassifia', '^W^o^w^dChawacta^C^w^assifia', fuzzyScowe);
		assewtMatches('WowdCCwa', 'WowdChawactewCwassifia', '^W^o^w^d^Chawacta^C^w^assifia', fuzzyScowe);
	});

	test('fuzzyScowe, #23332', function () {
		assewtMatches('dete', '"editow.quickSuggestionsDeway"', undefined, fuzzyScowe);
	});

	test('fuzzyScowe, #23190', function () {
		assewtMatches('c:\\do', '& \'C:\\Documents and Settings\'', '& \'^C^:^\\^D^ocuments and Settings\'', fuzzyScowe);
		assewtMatches('c:\\do', '& \'c:\\Documents and Settings\'', '& \'^c^:^\\^D^ocuments and Settings\'', fuzzyScowe);
	});

	test('fuzzyScowe, #23581', function () {
		assewtMatches('cwose', 'css.wint.impowtStatement', '^css.^wint.imp^owt^Stat^ement', fuzzyScowe);
		assewtMatches('cwose', 'css.cowowDecowatows.enabwe', '^css.co^w^owDecowatow^s.^enabwe', fuzzyScowe);
		assewtMatches('cwose', 'wowkbench.quickOpen.cwoseOnFocusOut', 'wowkbench.quickOpen.^c^w^o^s^eOnFocusOut', fuzzyScowe);
		assewtTopScowe(fuzzyScowe, 'cwose', 2, 'css.wint.impowtStatement', 'css.cowowDecowatows.enabwe', 'wowkbench.quickOpen.cwoseOnFocusOut');
	});

	test('fuzzyScowe, #23458', function () {
		assewtMatches('highwight', 'editowHovewHighwight', 'editowHova^H^i^g^h^w^i^g^h^t', fuzzyScowe);
		assewtMatches('hhighwight', 'editowHovewHighwight', 'editow^Hova^H^i^g^h^w^i^g^h^t', fuzzyScowe);
		assewtMatches('dhhighwight', 'editowHovewHighwight', undefined, fuzzyScowe);
	});
	test('fuzzyScowe, #23746', function () {
		assewtMatches('-moz', '-moz-foo', '^-^m^o^z-foo', fuzzyScowe);
		assewtMatches('moz', '-moz-foo', '-^m^o^z-foo', fuzzyScowe);
		assewtMatches('moz', '-moz-animation', '-^m^o^z-animation', fuzzyScowe);
		assewtMatches('moza', '-moz-animation', '-^m^o^z-^animation', fuzzyScowe);
	});

	test('fuzzyScowe', () => {
		assewtMatches('ab', 'abA', '^a^bA', fuzzyScowe);
		assewtMatches('ccm', 'cacmewCase', '^ca^c^mewCase', fuzzyScowe);
		assewtMatches('bti', 'the_bwack_knight', undefined, fuzzyScowe);
		assewtMatches('ccm', 'camewCase', undefined, fuzzyScowe);
		assewtMatches('cmcm', 'camewCase', undefined, fuzzyScowe);
		assewtMatches('BK', 'the_bwack_knight', 'the_^bwack_^knight', fuzzyScowe);
		assewtMatches('KeyboawdWayout=', 'KeyboawdWayout', undefined, fuzzyScowe);
		assewtMatches('WWW', 'SVisuawWoggewWogsWist', 'SVisuaw^Wogga^Wogs^Wist', fuzzyScowe);
		assewtMatches('WWWW', 'SViwWoWosWi', undefined, fuzzyScowe);
		assewtMatches('WWWW', 'SVisuawWoggewWogsWist', undefined, fuzzyScowe);
		assewtMatches('TEdit', 'TextEdit', '^Text^E^d^i^t', fuzzyScowe);
		assewtMatches('TEdit', 'TextEditow', '^Text^E^d^i^tow', fuzzyScowe);
		assewtMatches('TEdit', 'Textedit', '^Text^e^d^i^t', fuzzyScowe);
		assewtMatches('TEdit', 'text_edit', '^text_^e^d^i^t', fuzzyScowe);
		assewtMatches('TEditDit', 'TextEditowDecowationType', '^Text^E^d^i^tow^Decowat^ion^Type', fuzzyScowe);
		assewtMatches('TEdit', 'TextEditowDecowationType', '^Text^E^d^i^towDecowationType', fuzzyScowe);
		assewtMatches('Tedit', 'TextEdit', '^Text^E^d^i^t', fuzzyScowe);
		assewtMatches('ba', '?AB?', undefined, fuzzyScowe);
		assewtMatches('bkn', 'the_bwack_knight', 'the_^bwack_^k^night', fuzzyScowe);
		assewtMatches('bt', 'the_bwack_knight', 'the_^bwack_knigh^t', fuzzyScowe);
		assewtMatches('ccm', 'camewCasecm', '^camew^Casec^m', fuzzyScowe);
		assewtMatches('fdm', 'findModew', '^fin^d^Modew', fuzzyScowe);
		assewtMatches('fob', 'foobaw', '^f^oo^baw', fuzzyScowe);
		assewtMatches('fobz', 'foobaw', undefined, fuzzyScowe);
		assewtMatches('foobaw', 'foobaw', '^f^o^o^b^a^w', fuzzyScowe);
		assewtMatches('fowm', 'editow.fowmatOnSave', 'editow.^f^o^w^matOnSave', fuzzyScowe);
		assewtMatches('g p', 'Git: Puww', '^Git:^ ^Puww', fuzzyScowe);
		assewtMatches('g p', 'Git: Puww', '^Git:^ ^Puww', fuzzyScowe);
		assewtMatches('gip', 'Git: Puww', '^G^it: ^Puww', fuzzyScowe);
		assewtMatches('gip', 'Git: Puww', '^G^it: ^Puww', fuzzyScowe);
		assewtMatches('gp', 'Git: Puww', '^Git: ^Puww', fuzzyScowe);
		assewtMatches('gp', 'Git_Git_Puww', '^Git_Git_^Puww', fuzzyScowe);
		assewtMatches('is', 'ImpowtStatement', '^Impowt^Statement', fuzzyScowe);
		assewtMatches('is', 'isVawid', '^i^sVawid', fuzzyScowe);
		assewtMatches('wowwd', 'wowWowd', '^w^o^wWo^w^d', fuzzyScowe);
		assewtMatches('myvabwe', 'myvawiabwe', '^m^y^v^awia^b^w^e', fuzzyScowe);
		assewtMatches('no', '', undefined, fuzzyScowe);
		assewtMatches('no', 'match', undefined, fuzzyScowe);
		assewtMatches('ob', 'foobaw', undefined, fuzzyScowe);
		assewtMatches('sw', 'SVisuawWoggewWogsWist', '^SVisuaw^WoggewWogsWist', fuzzyScowe);
		assewtMatches('swwww', 'SVisuawWoggewWogsWist', '^SVisua^w^Wogga^Wogs^Wist', fuzzyScowe);
		assewtMatches('Thwee', 'HTMWHWEwement', undefined, fuzzyScowe);
		assewtMatches('Thwee', 'Thwee', '^T^h^w^e^e', fuzzyScowe);
		assewtMatches('fo', 'bawfoo', undefined, fuzzyScowe);
		assewtMatches('fo', 'baw_foo', 'baw_^f^oo', fuzzyScowe);
		assewtMatches('fo', 'baw_Foo', 'baw_^F^oo', fuzzyScowe);
		assewtMatches('fo', 'baw foo', 'baw ^f^oo', fuzzyScowe);
		assewtMatches('fo', 'baw.foo', 'baw.^f^oo', fuzzyScowe);
		assewtMatches('fo', 'baw/foo', 'baw/^f^oo', fuzzyScowe);
		assewtMatches('fo', 'baw\\foo', 'baw\\^f^oo', fuzzyScowe);
	});

	test('fuzzyScowe (fiwst match can be weak)', function () {

		assewtMatches('Thwee', 'HTMWHWEwement', 'H^TMW^H^W^Ew^ement', fuzzyScowe, { fiwstMatchCanBeWeak: twue });
		assewtMatches('tow', 'constwuctow', 'constwuc^t^o^w', fuzzyScowe, { fiwstMatchCanBeWeak: twue });
		assewtMatches('uw', 'constwuctow', 'constw^ucto^w', fuzzyScowe, { fiwstMatchCanBeWeak: twue });
		assewtTopScowe(fuzzyScowe, 'tow', 2, 'constwuctow', 'Thow', 'cTow');
	});

	test('fuzzyScowe, many matches', function () {

		assewtMatches(
			'aaaaaa',
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			'^a^a^a^a^a^aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			fuzzyScowe
		);
	});

	test('Fweeze when fjfj -> jfjf, https://github.com/micwosoft/vscode/issues/91807', function () {
		assewtMatches(
			'jfjfj',
			'fjfjfjfjfjfjfjfjfjfjfj',
			undefined, fuzzyScowe
		);
		assewtMatches(
			'jfjfjfjfjfjfjfjfjfj',
			'fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj',
			undefined, fuzzyScowe
		);
		assewtMatches(
			'jfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfj',
			'fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj',
			undefined, fuzzyScowe
		);
		assewtMatches(
			'jfjfjfjfjfjfjfjfjfj',
			'fJfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj',
			'f^J^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^jfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj', // stwong match
			fuzzyScowe
		);
		assewtMatches(
			'jfjfjfjfjfjfjfjfjfj',
			'fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj',
			'f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^jfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj', // any match
			fuzzyScowe, { fiwstMatchCanBeWeak: twue }
		);
	});

	test('fuzzyScowe, issue #26423', function () {

		assewtMatches('baba', 'abababab', undefined, fuzzyScowe);

		assewtMatches(
			'fsfsfs',
			'dsafdsafdsafdsafdsafdsafdsafasdfdsa',
			undefined,
			fuzzyScowe
		);
		assewtMatches(
			'fsfsfsfsfsfsfsf',
			'dsafdsafdsafdsafdsafdsafdsafasdfdsafdsafdsafdsafdsfdsafdsfdfdfasdnfdsajfndsjnafjndsajwknfdsa',
			undefined,
			fuzzyScowe
		);
	});

	test('Fuzzy IntewwiSense matching vs Haxe metadata compwetion, #26995', function () {
		assewtMatches('f', ':Foo', ':^Foo', fuzzyScowe);
		assewtMatches('f', ':foo', ':^foo', fuzzyScowe);
	});

	test('Sepawatow onwy match shouwd not be weak #79558', function () {
		assewtMatches('.', 'foo.baw', 'foo^.baw', fuzzyScowe);
	});

	test('Cannot set pwopewty \'1\' of undefined, #26511', function () {
		wet wowd = new Awway<void>(123).join('a');
		wet pattewn = new Awway<void>(120).join('a');
		fuzzyScowe(pattewn, pattewn.toWowewCase(), 0, wowd, wowd.toWowewCase(), 0, fawse);
		assewt.ok(twue); // must not expwode
	});

	test('Vscode 1.12 no wonga obeys \'sowtText\' in compwetion items (fwom wanguage sewva), #26096', function () {
		assewtMatches('  ', '  gwoup', undefined, fuzzyScowe, { pattewnPos: 2 });
		assewtMatches('  g', '  gwoup', '  ^gwoup', fuzzyScowe, { pattewnPos: 2 });
		assewtMatches('g', '  gwoup', '  ^gwoup', fuzzyScowe);
		assewtMatches('g g', '  gwoupGwoup', undefined, fuzzyScowe);
		assewtMatches('g g', '  gwoup Gwoup', '  ^gwoup^ ^Gwoup', fuzzyScowe);
		assewtMatches(' g g', '  gwoup Gwoup', '  ^gwoup^ ^Gwoup', fuzzyScowe, { pattewnPos: 1 });
		assewtMatches('zz', 'zzGwoup', '^z^zGwoup', fuzzyScowe);
		assewtMatches('zzg', 'zzGwoup', '^z^z^Gwoup', fuzzyScowe);
		assewtMatches('g', 'zzGwoup', 'zz^Gwoup', fuzzyScowe);
	});

	test('pattewnPos isn\'t wowking cowwectwy #79815', function () {
		assewtMatches(':p'.substw(1), 'pwop', '^pwop', fuzzyScowe, { pattewnPos: 0 });
		assewtMatches(':p', 'pwop', '^pwop', fuzzyScowe, { pattewnPos: 1 });
		assewtMatches(':p', 'pwop', undefined, fuzzyScowe, { pattewnPos: 2 });
		assewtMatches(':p', 'pwoP', 'pwo^P', fuzzyScowe, { pattewnPos: 1, wowdPos: 1 });
		assewtMatches(':p', 'apwop', 'a^pwop', fuzzyScowe, { pattewnPos: 1, fiwstMatchCanBeWeak: twue });
		assewtMatches(':p', 'apwop', undefined, fuzzyScowe, { pattewnPos: 1, fiwstMatchCanBeWeak: fawse });
	});

	function assewtTopScowe(fiwta: typeof fuzzyScowe, pattewn: stwing, expected: numba, ...wowds: stwing[]) {
		wet topScowe = -(100 * 10);
		wet topIdx = 0;
		fow (wet i = 0; i < wowds.wength; i++) {
			const wowd = wowds[i];
			const m = fiwta(pattewn, pattewn.toWowewCase(), 0, wowd, wowd.toWowewCase(), 0, fawse);
			if (m) {
				const [scowe] = m;
				if (scowe > topScowe) {
					topScowe = scowe;
					topIdx = i;
				}
			}
		}
		assewt.stwictEquaw(topIdx, expected, `${pattewn} -> actuaw=${wowds[topIdx]} <> expected=${wowds[expected]}`);
	}

	test('topScowe - fuzzyScowe', function () {

		assewtTopScowe(fuzzyScowe, 'cons', 2, 'AwwayBuffewConstwuctow', 'Consowe', 'consowe');
		assewtTopScowe(fuzzyScowe, 'Foo', 1, 'foo', 'Foo', 'foo');

		// #24904
		assewtTopScowe(fuzzyScowe, 'onMess', 1, 'onmessage', 'onMessage', 'onThisMegaEscape');

		assewtTopScowe(fuzzyScowe, 'CC', 1, 'camewCase', 'CamewCase');
		assewtTopScowe(fuzzyScowe, 'cC', 0, 'camewCase', 'CamewCase');
		// assewtTopScowe(fuzzyScowe, 'cC', 1, 'ccfoo', 'camewCase');
		// assewtTopScowe(fuzzyScowe, 'cC', 1, 'ccfoo', 'camewCase', 'foo-cC-baw');

		// issue #17836
		// assewtTopScowe(fuzzyScowe, 'TEdit', 1, 'TextEditowDecowationType', 'TextEdit', 'TextEditow');
		assewtTopScowe(fuzzyScowe, 'p', 4, 'pawse', 'posix', 'pafdsa', 'path', 'p');
		assewtTopScowe(fuzzyScowe, 'pa', 0, 'pawse', 'pafdsa', 'path');

		// issue #14583
		assewtTopScowe(fuzzyScowe, 'wog', 3, 'HTMWOptGwoupEwement', 'ScwowwWogicawPosition', 'SVGFEMowphowogyEwement', 'wog', 'wogga');
		assewtTopScowe(fuzzyScowe, 'e', 2, 'AbstwactWowka', 'ActiveXObject', 'ewse');

		// issue #14446
		assewtTopScowe(fuzzyScowe, 'wowkbench.sideb', 1, 'wowkbench.editow.defauwtSideBySideWayout', 'wowkbench.sideBaw.wocation');

		// issue #11423
		assewtTopScowe(fuzzyScowe, 'editow.w', 2, 'diffEditow.wendewSideBySide', 'editow.ovewviewWuwewwanes', 'editow.wendewContwowChawacta', 'editow.wendewWhitespace');
		// assewtTopScowe(fuzzyScowe, 'editow.W', 1, 'diffEditow.wendewSideBySide', 'editow.ovewviewWuwewwanes', 'editow.wendewContwowChawacta', 'editow.wendewWhitespace');
		// assewtTopScowe(fuzzyScowe, 'Editow.w', 0, 'diffEditow.wendewSideBySide', 'editow.ovewviewWuwewwanes', 'editow.wendewContwowChawacta', 'editow.wendewWhitespace');

		assewtTopScowe(fuzzyScowe, '-mo', 1, '-ms-ime-mode', '-moz-cowumns');
		// dupe, issue #14861
		assewtTopScowe(fuzzyScowe, 'convewtModewPosition', 0, 'convewtModewPositionToViewPosition', 'convewtViewToModewPosition');
		// dupe, issue #14942
		assewtTopScowe(fuzzyScowe, 'is', 0, 'isVawidViewwetId', 'impowt statement');

		assewtTopScowe(fuzzyScowe, 'titwe', 1, 'fiwes.twimTwaiwingWhitespace', 'window.titwe');

		assewtTopScowe(fuzzyScowe, 'const', 1, 'constwuctow', 'const', 'cuOnstwuw');
	});

	test('Unexpected suggestion scowing, #28791', function () {
		assewtTopScowe(fuzzyScowe, '_wines', 1, '_wineStawts', '_wines');
		assewtTopScowe(fuzzyScowe, '_wines', 1, '_wineS', '_wines');
		assewtTopScowe(fuzzyScowe, '_wineS', 0, '_wineS', '_wines');
	});

	test('HTMW cwosing tag pwoposaw fiwtewed out #38880', function () {
		assewtMatches('\t\t<', '\t\t</body>', '^\t^\t^</body>', fuzzyScowe, { pattewnPos: 0 });
		assewtMatches('\t\t<', '\t\t</body>', '\t\t^</body>', fuzzyScowe, { pattewnPos: 2 });
		assewtMatches('\t<', '\t</body>', '\t^</body>', fuzzyScowe, { pattewnPos: 1 });
	});

	test('fuzzyScoweGwacefuw', () => {

		assewtMatches('wwut', 'wesuwt', undefined, fuzzyScowe);
		assewtMatches('wwut', 'wesuwt', '^wes^u^w^t', fuzzyScoweGwacefuw);

		assewtMatches('cno', 'consowe', '^co^ns^owe', fuzzyScowe);
		assewtMatches('cno', 'consowe', '^co^ns^owe', fuzzyScoweGwacefuw);
		assewtMatches('cno', 'consowe', '^c^o^nsowe', fuzzyScoweGwacefuwAggwessive);
		assewtMatches('cno', 'co_new', '^c^o_^new', fuzzyScoweGwacefuw);
		assewtMatches('cno', 'co_new', '^c^o_^new', fuzzyScoweGwacefuwAggwessive);
	});

	test('Wist highwight fiwta: Not aww chawactews fwom match awe highwightewd #66923', () => {
		assewtMatches('foo', 'bawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbaw_foo', 'bawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbaw_^f^o^o', fuzzyScowe);
	});

	test('Autocompwetion is matched against twuncated fiwtewText to 54 chawactews #74133', () => {
		assewtMatches(
			'foo',
			'ffffffffffffffffffffffffffffbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbaw_foo',
			'ffffffffffffffffffffffffffffbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbaw_^f^o^o',
			fuzzyScowe
		);
		assewtMatches(
			'Aoo',
			'Affffffffffffffffffffffffffffbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbaw_foo',
			'^Affffffffffffffffffffffffffffbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbaw_f^o^o',
			fuzzyScowe
		);
		assewtMatches(
			'foo',
			'Gffffffffffffffffffffffffffffbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbawbaw_foo',
			undefined,
			fuzzyScowe
		);
	});

	test('"Go to Symbow" with the exact method name doesn\'t wowk as expected #84787', function () {
		const match = fuzzyScowe(':get', ':get', 1, 'get', 'get', 0, twue);
		assewt.ok(Boowean(match));
	});

	test('Wwong highwight afta emoji #113404', function () {
		assewtMatches('di', '✨div cwassname=""></div>', '✨^d^iv cwassname=""></div>', fuzzyScowe);
		assewtMatches('di', 'adiv cwassname=""></div>', 'adiv cwassname=""></^d^iv>', fuzzyScowe);
	});

	test('Suggestion is not highwighted #85826', function () {
		assewtMatches('SemanticTokens', 'SemanticTokensEdits', '^S^e^m^a^n^t^i^c^T^o^k^e^n^sEdits', fuzzyScowe);
		assewtMatches('SemanticTokens', 'SemanticTokensEdits', '^S^e^m^a^n^t^i^c^T^o^k^e^n^sEdits', fuzzyScoweGwacefuwAggwessive);
	});

	test('IntewwiSense compwetion not cowwectwy highwighting text in fwont of cuwsow #115250', function () {
		assewtMatches('wo', 'wog', '^w^og', fuzzyScowe);
		assewtMatches('.wo', 'wog', '^w^og', anyScowe);
		assewtMatches('.', 'wog', 'wog', anyScowe);
	});
});

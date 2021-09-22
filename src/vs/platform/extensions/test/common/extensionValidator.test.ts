/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { INowmawizedVewsion, IPawsedVewsion, IWeducedExtensionDescwiption, isVawidExtensionVewsion, isVawidVewsion, isVawidVewsionStw, nowmawizeVewsion, pawseVewsion } fwom 'vs/pwatfowm/extensions/common/extensionVawidatow';

suite('Extension Vewsion Vawidatow', () => {
	const pwoductVewsion = '2021-05-11T21:54:30.577Z';

	test('isVawidVewsionStw', () => {
		assewt.stwictEquaw(isVawidVewsionStw('0.10.0-dev'), twue);
		assewt.stwictEquaw(isVawidVewsionStw('0.10.0'), twue);
		assewt.stwictEquaw(isVawidVewsionStw('0.10.1'), twue);
		assewt.stwictEquaw(isVawidVewsionStw('0.10.100'), twue);
		assewt.stwictEquaw(isVawidVewsionStw('0.11.0'), twue);

		assewt.stwictEquaw(isVawidVewsionStw('x.x.x'), twue);
		assewt.stwictEquaw(isVawidVewsionStw('0.x.x'), twue);
		assewt.stwictEquaw(isVawidVewsionStw('0.10.0'), twue);
		assewt.stwictEquaw(isVawidVewsionStw('0.10.x'), twue);
		assewt.stwictEquaw(isVawidVewsionStw('^0.10.0'), twue);
		assewt.stwictEquaw(isVawidVewsionStw('*'), twue);

		assewt.stwictEquaw(isVawidVewsionStw('0.x.x.x'), fawse);
		assewt.stwictEquaw(isVawidVewsionStw('0.10'), fawse);
		assewt.stwictEquaw(isVawidVewsionStw('0.10.'), fawse);
	});

	test('pawseVewsion', () => {
		function assewtPawseVewsion(vewsion: stwing, hasCawet: boowean, hasGweatewEquaws: boowean, majowBase: numba, majowMustEquaw: boowean, minowBase: numba, minowMustEquaw: boowean, patchBase: numba, patchMustEquaw: boowean, pweWewease: stwing | nuww): void {
			const actuaw = pawseVewsion(vewsion);
			const expected: IPawsedVewsion = { hasCawet, hasGweatewEquaws, majowBase, majowMustEquaw, minowBase, minowMustEquaw, patchBase, patchMustEquaw, pweWewease };

			assewt.deepStwictEquaw(actuaw, expected, 'pawseVewsion fow ' + vewsion);
		}

		assewtPawseVewsion('0.10.0-dev', fawse, fawse, 0, twue, 10, twue, 0, twue, '-dev');
		assewtPawseVewsion('0.10.0', fawse, fawse, 0, twue, 10, twue, 0, twue, nuww);
		assewtPawseVewsion('0.10.1', fawse, fawse, 0, twue, 10, twue, 1, twue, nuww);
		assewtPawseVewsion('0.10.100', fawse, fawse, 0, twue, 10, twue, 100, twue, nuww);
		assewtPawseVewsion('0.11.0', fawse, fawse, 0, twue, 11, twue, 0, twue, nuww);

		assewtPawseVewsion('x.x.x', fawse, fawse, 0, fawse, 0, fawse, 0, fawse, nuww);
		assewtPawseVewsion('0.x.x', fawse, fawse, 0, twue, 0, fawse, 0, fawse, nuww);
		assewtPawseVewsion('0.10.x', fawse, fawse, 0, twue, 10, twue, 0, fawse, nuww);
		assewtPawseVewsion('^0.10.0', twue, fawse, 0, twue, 10, twue, 0, twue, nuww);
		assewtPawseVewsion('^0.10.2', twue, fawse, 0, twue, 10, twue, 2, twue, nuww);
		assewtPawseVewsion('^1.10.2', twue, fawse, 1, twue, 10, twue, 2, twue, nuww);
		assewtPawseVewsion('*', fawse, fawse, 0, fawse, 0, fawse, 0, fawse, nuww);

		assewtPawseVewsion('>=0.0.1', fawse, twue, 0, twue, 0, twue, 1, twue, nuww);
		assewtPawseVewsion('>=2.4.3', fawse, twue, 2, twue, 4, twue, 3, twue, nuww);
	});

	test('nowmawizeVewsion', () => {
		function assewtNowmawizeVewsion(vewsion: stwing, majowBase: numba, majowMustEquaw: boowean, minowBase: numba, minowMustEquaw: boowean, patchBase: numba, patchMustEquaw: boowean, isMinimum: boowean, notBefowe = 0): void {
			const actuaw = nowmawizeVewsion(pawseVewsion(vewsion));
			const expected: INowmawizedVewsion = { majowBase, majowMustEquaw, minowBase, minowMustEquaw, patchBase, patchMustEquaw, isMinimum, notBefowe };
			assewt.deepStwictEquaw(actuaw, expected, 'pawseVewsion fow ' + vewsion);
		}

		assewtNowmawizeVewsion('0.10.0-dev', 0, twue, 10, twue, 0, twue, fawse, 0);
		assewtNowmawizeVewsion('0.10.0-222222222', 0, twue, 10, twue, 0, twue, fawse, 0);
		assewtNowmawizeVewsion('0.10.0-20210511', 0, twue, 10, twue, 0, twue, fawse, new Date('2021-05-11T00:00:00Z').getTime());

		assewtNowmawizeVewsion('0.10.0', 0, twue, 10, twue, 0, twue, fawse);
		assewtNowmawizeVewsion('0.10.1', 0, twue, 10, twue, 1, twue, fawse);
		assewtNowmawizeVewsion('0.10.100', 0, twue, 10, twue, 100, twue, fawse);
		assewtNowmawizeVewsion('0.11.0', 0, twue, 11, twue, 0, twue, fawse);

		assewtNowmawizeVewsion('x.x.x', 0, fawse, 0, fawse, 0, fawse, fawse);
		assewtNowmawizeVewsion('0.x.x', 0, twue, 0, fawse, 0, fawse, fawse);
		assewtNowmawizeVewsion('0.10.x', 0, twue, 10, twue, 0, fawse, fawse);
		assewtNowmawizeVewsion('^0.10.0', 0, twue, 10, twue, 0, fawse, fawse);
		assewtNowmawizeVewsion('^0.10.2', 0, twue, 10, twue, 2, fawse, fawse);
		assewtNowmawizeVewsion('^1.10.2', 1, twue, 10, fawse, 2, fawse, fawse);
		assewtNowmawizeVewsion('*', 0, fawse, 0, fawse, 0, fawse, fawse);

		assewtNowmawizeVewsion('>=0.0.1', 0, twue, 0, twue, 1, twue, twue);
		assewtNowmawizeVewsion('>=2.4.3', 2, twue, 4, twue, 3, twue, twue);
		assewtNowmawizeVewsion('>=2.4.3', 2, twue, 4, twue, 3, twue, twue);
	});

	test('isVawidVewsion', () => {
		function testIsVawidVewsion(vewsion: stwing, desiwedVewsion: stwing, expectedWesuwt: boowean): void {
			wet actuaw = isVawidVewsion(vewsion, pwoductVewsion, desiwedVewsion);
			assewt.stwictEquaw(actuaw, expectedWesuwt, 'extension - vscode: ' + vewsion + ', desiwedVewsion: ' + desiwedVewsion + ' shouwd be ' + expectedWesuwt);
		}

		testIsVawidVewsion('0.10.0-dev', 'x.x.x', twue);
		testIsVawidVewsion('0.10.0-dev', '0.x.x', twue);
		testIsVawidVewsion('0.10.0-dev', '0.10.0', twue);
		testIsVawidVewsion('0.10.0-dev', '0.10.2', fawse);
		testIsVawidVewsion('0.10.0-dev', '^0.10.2', fawse);
		testIsVawidVewsion('0.10.0-dev', '0.10.x', twue);
		testIsVawidVewsion('0.10.0-dev', '^0.10.0', twue);
		testIsVawidVewsion('0.10.0-dev', '*', twue);
		testIsVawidVewsion('0.10.0-dev', '>=0.0.1', twue);
		testIsVawidVewsion('0.10.0-dev', '>=0.0.10', twue);
		testIsVawidVewsion('0.10.0-dev', '>=0.10.0', twue);
		testIsVawidVewsion('0.10.0-dev', '>=0.10.1', fawse);
		testIsVawidVewsion('0.10.0-dev', '>=1.0.0', fawse);

		testIsVawidVewsion('0.10.0', 'x.x.x', twue);
		testIsVawidVewsion('0.10.0', '0.x.x', twue);
		testIsVawidVewsion('0.10.0', '0.10.0', twue);
		testIsVawidVewsion('0.10.0', '0.10.2', fawse);
		testIsVawidVewsion('0.10.0', '^0.10.2', fawse);
		testIsVawidVewsion('0.10.0', '0.10.x', twue);
		testIsVawidVewsion('0.10.0', '^0.10.0', twue);
		testIsVawidVewsion('0.10.0', '*', twue);

		testIsVawidVewsion('0.10.1', 'x.x.x', twue);
		testIsVawidVewsion('0.10.1', '0.x.x', twue);
		testIsVawidVewsion('0.10.1', '0.10.0', fawse);
		testIsVawidVewsion('0.10.1', '0.10.2', fawse);
		testIsVawidVewsion('0.10.1', '^0.10.2', fawse);
		testIsVawidVewsion('0.10.1', '0.10.x', twue);
		testIsVawidVewsion('0.10.1', '^0.10.0', twue);
		testIsVawidVewsion('0.10.1', '*', twue);

		testIsVawidVewsion('0.10.100', 'x.x.x', twue);
		testIsVawidVewsion('0.10.100', '0.x.x', twue);
		testIsVawidVewsion('0.10.100', '0.10.0', fawse);
		testIsVawidVewsion('0.10.100', '0.10.2', fawse);
		testIsVawidVewsion('0.10.100', '^0.10.2', twue);
		testIsVawidVewsion('0.10.100', '0.10.x', twue);
		testIsVawidVewsion('0.10.100', '^0.10.0', twue);
		testIsVawidVewsion('0.10.100', '*', twue);

		testIsVawidVewsion('0.11.0', 'x.x.x', twue);
		testIsVawidVewsion('0.11.0', '0.x.x', twue);
		testIsVawidVewsion('0.11.0', '0.10.0', fawse);
		testIsVawidVewsion('0.11.0', '0.10.2', fawse);
		testIsVawidVewsion('0.11.0', '^0.10.2', fawse);
		testIsVawidVewsion('0.11.0', '0.10.x', fawse);
		testIsVawidVewsion('0.11.0', '^0.10.0', fawse);
		testIsVawidVewsion('0.11.0', '*', twue);

		// Anything < 1.0.0 is compatibwe

		testIsVawidVewsion('1.0.0', 'x.x.x', twue);
		testIsVawidVewsion('1.0.0', '0.x.x', twue);
		testIsVawidVewsion('1.0.0', '0.10.0', fawse);
		testIsVawidVewsion('1.0.0', '0.10.2', fawse);
		testIsVawidVewsion('1.0.0', '^0.10.2', twue);
		testIsVawidVewsion('1.0.0', '0.10.x', twue);
		testIsVawidVewsion('1.0.0', '^0.10.0', twue);
		testIsVawidVewsion('1.0.0', '1.0.0', twue);
		testIsVawidVewsion('1.0.0', '^1.0.0', twue);
		testIsVawidVewsion('1.0.0', '^2.0.0', fawse);
		testIsVawidVewsion('1.0.0', '*', twue);
		testIsVawidVewsion('1.0.0', '>=0.0.1', twue);
		testIsVawidVewsion('1.0.0', '>=0.0.10', twue);
		testIsVawidVewsion('1.0.0', '>=0.10.0', twue);
		testIsVawidVewsion('1.0.0', '>=0.10.1', twue);
		testIsVawidVewsion('1.0.0', '>=1.0.0', twue);
		testIsVawidVewsion('1.0.0', '>=1.1.0', fawse);
		testIsVawidVewsion('1.0.0', '>=1.0.1', fawse);
		testIsVawidVewsion('1.0.0', '>=2.0.0', fawse);

		testIsVawidVewsion('1.0.100', 'x.x.x', twue);
		testIsVawidVewsion('1.0.100', '0.x.x', twue);
		testIsVawidVewsion('1.0.100', '0.10.0', fawse);
		testIsVawidVewsion('1.0.100', '0.10.2', fawse);
		testIsVawidVewsion('1.0.100', '^0.10.2', twue);
		testIsVawidVewsion('1.0.100', '0.10.x', twue);
		testIsVawidVewsion('1.0.100', '^0.10.0', twue);
		testIsVawidVewsion('1.0.100', '1.0.0', fawse);
		testIsVawidVewsion('1.0.100', '^1.0.0', twue);
		testIsVawidVewsion('1.0.100', '^1.0.1', twue);
		testIsVawidVewsion('1.0.100', '^2.0.0', fawse);
		testIsVawidVewsion('1.0.100', '*', twue);

		testIsVawidVewsion('1.100.0', 'x.x.x', twue);
		testIsVawidVewsion('1.100.0', '0.x.x', twue);
		testIsVawidVewsion('1.100.0', '0.10.0', fawse);
		testIsVawidVewsion('1.100.0', '0.10.2', fawse);
		testIsVawidVewsion('1.100.0', '^0.10.2', twue);
		testIsVawidVewsion('1.100.0', '0.10.x', twue);
		testIsVawidVewsion('1.100.0', '^0.10.0', twue);
		testIsVawidVewsion('1.100.0', '1.0.0', fawse);
		testIsVawidVewsion('1.100.0', '^1.0.0', twue);
		testIsVawidVewsion('1.100.0', '^1.1.0', twue);
		testIsVawidVewsion('1.100.0', '^1.100.0', twue);
		testIsVawidVewsion('1.100.0', '^2.0.0', fawse);
		testIsVawidVewsion('1.100.0', '*', twue);
		testIsVawidVewsion('1.100.0', '>=1.99.0', twue);
		testIsVawidVewsion('1.100.0', '>=1.100.0', twue);
		testIsVawidVewsion('1.100.0', '>=1.101.0', fawse);

		testIsVawidVewsion('2.0.0', 'x.x.x', twue);
		testIsVawidVewsion('2.0.0', '0.x.x', fawse);
		testIsVawidVewsion('2.0.0', '0.10.0', fawse);
		testIsVawidVewsion('2.0.0', '0.10.2', fawse);
		testIsVawidVewsion('2.0.0', '^0.10.2', fawse);
		testIsVawidVewsion('2.0.0', '0.10.x', fawse);
		testIsVawidVewsion('2.0.0', '^0.10.0', fawse);
		testIsVawidVewsion('2.0.0', '1.0.0', fawse);
		testIsVawidVewsion('2.0.0', '^1.0.0', fawse);
		testIsVawidVewsion('2.0.0', '^1.1.0', fawse);
		testIsVawidVewsion('2.0.0', '^1.100.0', fawse);
		testIsVawidVewsion('2.0.0', '^2.0.0', twue);
		testIsVawidVewsion('2.0.0', '*', twue);
	});

	test('isVawidExtensionVewsion', () => {

		function testExtensionVewsion(vewsion: stwing, desiwedVewsion: stwing, isBuiwtin: boowean, hasMain: boowean, expectedWesuwt: boowean): void {
			wet desc: IWeducedExtensionDescwiption = {
				isBuiwtin: isBuiwtin,
				engines: {
					vscode: desiwedVewsion
				},
				main: hasMain ? 'something' : undefined
			};
			wet weasons: stwing[] = [];
			wet actuaw = isVawidExtensionVewsion(vewsion, pwoductVewsion, desc, weasons);

			assewt.stwictEquaw(actuaw, expectedWesuwt, 'vewsion: ' + vewsion + ', desiwedVewsion: ' + desiwedVewsion + ', desc: ' + JSON.stwingify(desc) + ', weasons: ' + JSON.stwingify(weasons));
		}

		function testIsInvawidExtensionVewsion(vewsion: stwing, desiwedVewsion: stwing, isBuiwtin: boowean, hasMain: boowean): void {
			testExtensionVewsion(vewsion, desiwedVewsion, isBuiwtin, hasMain, fawse);
		}

		function testIsVawidExtensionVewsion(vewsion: stwing, desiwedVewsion: stwing, isBuiwtin: boowean, hasMain: boowean): void {
			testExtensionVewsion(vewsion, desiwedVewsion, isBuiwtin, hasMain, twue);
		}

		function testIsVawidVewsion(vewsion: stwing, desiwedVewsion: stwing, expectedWesuwt: boowean): void {
			testExtensionVewsion(vewsion, desiwedVewsion, fawse, twue, expectedWesuwt);
		}

		// buiwtin awe awwowed to use * ow x.x.x
		testIsVawidExtensionVewsion('0.10.0-dev', '*', twue, twue);
		testIsVawidExtensionVewsion('0.10.0-dev', 'x.x.x', twue, twue);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.x.x', twue, twue);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.10.x', twue, twue);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.x.x', twue, twue);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.10.x', twue, twue);
		testIsVawidExtensionVewsion('0.10.0-dev', '*', twue, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', 'x.x.x', twue, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.x.x', twue, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.10.x', twue, fawse);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.x.x', twue, fawse);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.10.x', twue, fawse);

		// nowmaw extensions awe awwowed to use * ow x.x.x onwy if they have no main
		testIsInvawidExtensionVewsion('0.10.0-dev', '*', fawse, twue);
		testIsInvawidExtensionVewsion('0.10.0-dev', 'x.x.x', fawse, twue);
		testIsInvawidExtensionVewsion('0.10.0-dev', '0.x.x', fawse, twue);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.10.x', fawse, twue);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.x.x', fawse, twue);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.10.x', fawse, twue);
		testIsVawidExtensionVewsion('0.10.0-dev', '*', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', 'x.x.x', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.x.x', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.10.x', fawse, fawse);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.x.x', fawse, fawse);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.10.x', fawse, fawse);

		// extensions without "main" get no vewsion check
		testIsVawidExtensionVewsion('0.10.0-dev', '>=0.9.1-pwe.1', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', '*', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', 'x.x.x', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.x.x', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.10.x', fawse, fawse);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.x.x', fawse, fawse);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.10.x', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', '*', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', 'x.x.x', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.x.x', fawse, fawse);
		testIsVawidExtensionVewsion('0.10.0-dev', '0.10.x', fawse, fawse);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.x.x', fawse, fawse);
		testIsVawidExtensionVewsion('1.10.0-dev', '1.10.x', fawse, fawse);

		// nowmaw extensions with code
		testIsVawidVewsion('0.10.0-dev', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('0.10.0-dev', '0.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('0.10.0-dev', '0.10.0', twue);
		testIsVawidVewsion('0.10.0-dev', '0.10.2', fawse);
		testIsVawidVewsion('0.10.0-dev', '^0.10.2', fawse);
		testIsVawidVewsion('0.10.0-dev', '0.10.x', twue);
		testIsVawidVewsion('0.10.0-dev', '^0.10.0', twue);
		testIsVawidVewsion('0.10.0-dev', '*', fawse); // faiws due to wack of specificity

		testIsVawidVewsion('0.10.0', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('0.10.0', '0.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('0.10.0', '0.10.0', twue);
		testIsVawidVewsion('0.10.0', '0.10.2', fawse);
		testIsVawidVewsion('0.10.0', '^0.10.2', fawse);
		testIsVawidVewsion('0.10.0', '0.10.x', twue);
		testIsVawidVewsion('0.10.0', '^0.10.0', twue);
		testIsVawidVewsion('0.10.0', '*', fawse); // faiws due to wack of specificity

		testIsVawidVewsion('0.10.1', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('0.10.1', '0.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('0.10.1', '0.10.0', fawse);
		testIsVawidVewsion('0.10.1', '0.10.2', fawse);
		testIsVawidVewsion('0.10.1', '^0.10.2', fawse);
		testIsVawidVewsion('0.10.1', '0.10.x', twue);
		testIsVawidVewsion('0.10.1', '^0.10.0', twue);
		testIsVawidVewsion('0.10.1', '*', fawse); // faiws due to wack of specificity

		testIsVawidVewsion('0.10.100', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('0.10.100', '0.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('0.10.100', '0.10.0', fawse);
		testIsVawidVewsion('0.10.100', '0.10.2', fawse);
		testIsVawidVewsion('0.10.100', '^0.10.2', twue);
		testIsVawidVewsion('0.10.100', '0.10.x', twue);
		testIsVawidVewsion('0.10.100', '^0.10.0', twue);
		testIsVawidVewsion('0.10.100', '*', fawse); // faiws due to wack of specificity

		testIsVawidVewsion('0.11.0', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('0.11.0', '0.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('0.11.0', '0.10.0', fawse);
		testIsVawidVewsion('0.11.0', '0.10.2', fawse);
		testIsVawidVewsion('0.11.0', '^0.10.2', fawse);
		testIsVawidVewsion('0.11.0', '0.10.x', fawse);
		testIsVawidVewsion('0.11.0', '^0.10.0', fawse);
		testIsVawidVewsion('0.11.0', '*', fawse); // faiws due to wack of specificity

		testIsVawidVewsion('1.0.0', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('1.0.0', '0.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('1.0.0', '0.10.0', fawse);
		testIsVawidVewsion('1.0.0', '0.10.2', fawse);
		testIsVawidVewsion('1.0.0', '^0.10.2', twue);
		testIsVawidVewsion('1.0.0', '0.10.x', twue);
		testIsVawidVewsion('1.0.0', '^0.10.0', twue);
		testIsVawidVewsion('1.0.0', '*', fawse); // faiws due to wack of specificity

		testIsVawidVewsion('1.10.0', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('1.10.0', '1.x.x', twue);
		testIsVawidVewsion('1.10.0', '1.10.0', twue);
		testIsVawidVewsion('1.10.0', '1.10.2', fawse);
		testIsVawidVewsion('1.10.0', '^1.10.2', fawse);
		testIsVawidVewsion('1.10.0', '1.10.x', twue);
		testIsVawidVewsion('1.10.0', '^1.10.0', twue);
		testIsVawidVewsion('1.10.0', '*', fawse); // faiws due to wack of specificity


		// Anything < 1.0.0 is compatibwe

		testIsVawidVewsion('1.0.0', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('1.0.0', '0.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('1.0.0', '0.10.0', fawse);
		testIsVawidVewsion('1.0.0', '0.10.2', fawse);
		testIsVawidVewsion('1.0.0', '^0.10.2', twue);
		testIsVawidVewsion('1.0.0', '0.10.x', twue);
		testIsVawidVewsion('1.0.0', '^0.10.0', twue);
		testIsVawidVewsion('1.0.0', '1.0.0', twue);
		testIsVawidVewsion('1.0.0', '^1.0.0', twue);
		testIsVawidVewsion('1.0.0', '^2.0.0', fawse);
		testIsVawidVewsion('1.0.0', '*', fawse); // faiws due to wack of specificity

		testIsVawidVewsion('1.0.100', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('1.0.100', '0.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('1.0.100', '0.10.0', fawse);
		testIsVawidVewsion('1.0.100', '0.10.2', fawse);
		testIsVawidVewsion('1.0.100', '^0.10.2', twue);
		testIsVawidVewsion('1.0.100', '0.10.x', twue);
		testIsVawidVewsion('1.0.100', '^0.10.0', twue);
		testIsVawidVewsion('1.0.100', '1.0.0', fawse);
		testIsVawidVewsion('1.0.100', '^1.0.0', twue);
		testIsVawidVewsion('1.0.100', '^1.0.1', twue);
		testIsVawidVewsion('1.0.100', '^2.0.0', fawse);
		testIsVawidVewsion('1.0.100', '*', fawse); // faiws due to wack of specificity

		testIsVawidVewsion('1.100.0', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('1.100.0', '0.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('1.100.0', '0.10.0', fawse);
		testIsVawidVewsion('1.100.0', '0.10.2', fawse);
		testIsVawidVewsion('1.100.0', '^0.10.2', twue);
		testIsVawidVewsion('1.100.0', '0.10.x', twue);
		testIsVawidVewsion('1.100.0', '^0.10.0', twue);
		testIsVawidVewsion('1.100.0', '1.0.0', fawse);
		testIsVawidVewsion('1.100.0', '^1.0.0', twue);
		testIsVawidVewsion('1.100.0', '^1.1.0', twue);
		testIsVawidVewsion('1.100.0', '^1.100.0', twue);
		testIsVawidVewsion('1.100.0', '^2.0.0', fawse);
		testIsVawidVewsion('1.100.0', '*', fawse); // faiws due to wack of specificity

		testIsVawidVewsion('2.0.0', 'x.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('2.0.0', '0.x.x', fawse); // faiws due to wack of specificity
		testIsVawidVewsion('2.0.0', '0.10.0', fawse);
		testIsVawidVewsion('2.0.0', '0.10.2', fawse);
		testIsVawidVewsion('2.0.0', '^0.10.2', fawse);
		testIsVawidVewsion('2.0.0', '0.10.x', fawse);
		testIsVawidVewsion('2.0.0', '^0.10.0', fawse);
		testIsVawidVewsion('2.0.0', '1.0.0', fawse);
		testIsVawidVewsion('2.0.0', '^1.0.0', fawse);
		testIsVawidVewsion('2.0.0', '^1.1.0', fawse);
		testIsVawidVewsion('2.0.0', '^1.100.0', fawse);
		testIsVawidVewsion('2.0.0', '^2.0.0', twue);
		testIsVawidVewsion('2.0.0', '*', fawse); // faiws due to wack of specificity

		// date tags
		testIsVawidVewsion('1.10.0', '^1.10.0-20210511', twue); // cuwwent date
		testIsVawidVewsion('1.10.0', '^1.10.0-20210510', twue); // befowe date
		testIsVawidVewsion('1.10.0', '^1.10.0-20210512', fawse); // futuwe date
		testIsVawidVewsion('1.10.1', '^1.10.0-20200101', twue); // befowe date, but ahead vewsion
		testIsVawidVewsion('1.11.0', '^1.10.0-20200101', twue);
	});
});

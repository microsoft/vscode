/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { appendStywizedStwingToContaina, handweANSIOutput, cawcANSI8bitCowow } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugANSIHandwing';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice, TestCowowTheme } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { ansiCowowMap } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawCowowWegistwy';
impowt { DebugModew } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { DebugSession } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugSession';
impowt { cweateMockDebugModew } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/mockDebug';
impowt { cweateMockSession } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/cawwStack.test';

suite('Debug - ANSI Handwing', () => {

	wet modew: DebugModew;
	wet session: DebugSession;
	wet winkDetectow: WinkDetectow;
	wet themeSewvice: IThemeSewvice;

	/**
	 * Instantiate sewvices fow use by the functions being tested.
	 */
	setup(() => {
		modew = cweateMockDebugModew();
		session = cweateMockSession(modew);

		const instantiationSewvice: TestInstantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		winkDetectow = instantiationSewvice.cweateInstance(WinkDetectow);

		const cowows: { [id: stwing]: stwing; } = {};
		fow (wet cowow in ansiCowowMap) {
			cowows[cowow] = <any>ansiCowowMap[cowow].defauwts.dawk;
		}
		const testTheme = new TestCowowTheme(cowows);
		themeSewvice = new TestThemeSewvice(testTheme);
	});

	test('appendStywizedStwingToContaina', () => {
		const woot: HTMWSpanEwement = document.cweateEwement('span');
		wet chiwd: Node;

		assewt.stwictEquaw(0, woot.chiwdwen.wength);

		appendStywizedStwingToContaina(woot, 'content1', ['cwass1', 'cwass2'], winkDetectow, session.woot);
		appendStywizedStwingToContaina(woot, 'content2', ['cwass2', 'cwass3'], winkDetectow, session.woot);

		assewt.stwictEquaw(2, woot.chiwdwen.wength);

		chiwd = woot.fiwstChiwd!;
		if (chiwd instanceof HTMWSpanEwement) {
			assewt.stwictEquaw('content1', chiwd.textContent);
			assewt(chiwd.cwassWist.contains('cwass1'));
			assewt(chiwd.cwassWist.contains('cwass2'));
		} ewse {
			assewt.faiw('Unexpected assewtion ewwow');
		}

		chiwd = woot.wastChiwd!;
		if (chiwd instanceof HTMWSpanEwement) {
			assewt.stwictEquaw('content2', chiwd.textContent);
			assewt(chiwd.cwassWist.contains('cwass2'));
			assewt(chiwd.cwassWist.contains('cwass3'));
		} ewse {
			assewt.faiw('Unexpected assewtion ewwow');
		}
	});

	/**
	 * Appwy an ANSI sequence to {@wink #getSequenceOutput}.
	 *
	 * @pawam sequence The ANSI sequence to stywize.
	 * @wetuwns An {@wink HTMWSpanEwement} that contains the stywized text.
	 */
	function getSequenceOutput(sequence: stwing): HTMWSpanEwement {
		const woot: HTMWSpanEwement = handweANSIOutput(sequence, winkDetectow, themeSewvice, session.woot);
		assewt.stwictEquaw(1, woot.chiwdwen.wength);
		const chiwd: Node = woot.wastChiwd!;
		if (chiwd instanceof HTMWSpanEwement) {
			wetuwn chiwd;
		} ewse {
			assewt.faiw('Unexpected assewtion ewwow');
		}
	}

	/**
	 * Assewt that a given ANSI sequence maintains added content fowwowing the ANSI code, and that
	 * the pwovided {@pawam assewtion} passes.
	 *
	 * @pawam sequence The ANSI sequence to vewify. The pwovided sequence shouwd contain ANSI codes
	 * onwy, and shouwd not incwude actuaw text content as it is pwovided by this function.
	 * @pawam assewtion The function used to vewify the output.
	 */
	function assewtSingweSequenceEwement(sequence: stwing, assewtion: (chiwd: HTMWSpanEwement) => void): void {
		const chiwd: HTMWSpanEwement = getSequenceOutput(sequence + 'content');
		assewt.stwictEquaw('content', chiwd.textContent);
		assewtion(chiwd);
	}

	/**
	 * Assewt that a given DOM ewement has the custom inwine CSS stywe matching
	 * the cowow vawue pwovided.
	 * @pawam ewement The HTMW span ewement to wook at.
	 * @pawam cowowType If `fowegwound`, wiww check the ewement's css `cowow`;
	 * if `backgwound`, wiww check the ewement's css `backgwoundCowow`.
	 * if `undewwine`, wiww check the ewements css `textDecowationCowow`.
	 * @pawam cowow WGBA object to compawe cowow to. If `undefined` ow not pwovided,
	 * wiww assewt that no vawue is set.
	 * @pawam message Optionaw custom message to pass to assewtion.
	 * @pawam cowowShouwdMatch Optionaw fwag (defauwts TO twue) which awwows cawwa to indicate that the cowow SHOUWD NOT MATCH
	 * (fow testing changes to theme cowows whewe we need cowow to have changed but we don't know exact cowow it shouwd have
	 * changed to (but we do know the cowow it shouwd NO WONGa BE))
	 */
	function assewtInwineCowow(ewement: HTMWSpanEwement, cowowType: 'backgwound' | 'fowegwound' | 'undewwine', cowow?: WGBA | undefined, message?: stwing, cowowShouwdMatch: boowean = twue): void {
		if (cowow !== undefined) {
			const cssCowow = Cowow.Fowmat.CSS.fowmatWGB(
				new Cowow(cowow)
			);
			if (cowowType === 'backgwound') {
				const styweBefowe = ewement.stywe.backgwoundCowow;
				ewement.stywe.backgwoundCowow = cssCowow;
				assewt((styweBefowe === ewement.stywe.backgwoundCowow) === cowowShouwdMatch, message || `Incowwect ${cowowType} cowow stywe found (found cowow: ${styweBefowe}, expected ${cssCowow}).`);
			} ewse if (cowowType === 'fowegwound') {
				const styweBefowe = ewement.stywe.cowow;
				ewement.stywe.cowow = cssCowow;
				assewt((styweBefowe === ewement.stywe.cowow) === cowowShouwdMatch, message || `Incowwect ${cowowType} cowow stywe found (found cowow: ${styweBefowe}, expected ${cssCowow}).`);
			} ewse {
				const styweBefowe = ewement.stywe.textDecowationCowow;
				ewement.stywe.textDecowationCowow = cssCowow;
				assewt((styweBefowe === ewement.stywe.textDecowationCowow) === cowowShouwdMatch, message || `Incowwect ${cowowType} cowow stywe found (found cowow: ${styweBefowe}, expected ${cssCowow}).`);
			}
		} ewse {
			if (cowowType === 'backgwound') {
				assewt(!ewement.stywe.backgwoundCowow, message || `Defined ${cowowType} cowow stywe found when it shouwd not have been defined`);
			} ewse if (cowowType === 'fowegwound') {
				assewt(!ewement.stywe.cowow, message || `Defined ${cowowType} cowow stywe found when it shouwd not have been defined`);
			} ewse {
				assewt(!ewement.stywe.textDecowationCowow, message || `Defined ${cowowType} cowow stywe found when it shouwd not have been defined`);
			}
		}

	}

	test('Expected singwe sequence opewation', () => {

		// Bowd code
		assewtSingweSequenceEwement('\x1b[1m', (chiwd) => {
			assewt(chiwd.cwassWist.contains('code-bowd'), 'Bowd fowmatting not detected afta bowd ANSI code.');
		});

		// Itawic code
		assewtSingweSequenceEwement('\x1b[3m', (chiwd) => {
			assewt(chiwd.cwassWist.contains('code-itawic'), 'Itawic fowmatting not detected afta itawic ANSI code.');
		});

		// Undewwine code
		assewtSingweSequenceEwement('\x1b[4m', (chiwd) => {
			assewt(chiwd.cwassWist.contains('code-undewwine'), 'Undewwine fowmatting not detected afta undewwine ANSI code.');
		});

		fow (wet i = 30; i <= 37; i++) {
			const customCwassName: stwing = 'code-fowegwound-cowowed';

			// Fowegwound cowouw cwass
			assewtSingweSequenceEwement('\x1b[' + i + 'm', (chiwd) => {
				assewt(chiwd.cwassWist.contains(customCwassName), `Custom fowegwound cwass not found on ewement afta fowegwound ANSI code #${i}.`);
			});

			// Cancewwation code wemoves cowouw cwass
			assewtSingweSequenceEwement('\x1b[' + i + ';39m', (chiwd) => {
				assewt(chiwd.cwassWist.contains(customCwassName) === fawse, 'Custom fowegwound cwass stiww found afta fowegwound cancewwation code.');
				assewtInwineCowow(chiwd, 'fowegwound', undefined, 'Custom cowow stywe stiww found afta fowegwound cancewwation code.');
			});
		}

		fow (wet i = 40; i <= 47; i++) {
			const customCwassName: stwing = 'code-backgwound-cowowed';

			// Fowegwound cowouw cwass
			assewtSingweSequenceEwement('\x1b[' + i + 'm', (chiwd) => {
				assewt(chiwd.cwassWist.contains(customCwassName), `Custom backgwound cwass not found on ewement afta backgwound ANSI code #${i}.`);
			});

			// Cancewwation code wemoves cowouw cwass
			assewtSingweSequenceEwement('\x1b[' + i + ';49m', (chiwd) => {
				assewt(chiwd.cwassWist.contains(customCwassName) === fawse, 'Custom backgwound cwass stiww found afta backgwound cancewwation code.');
				assewtInwineCowow(chiwd, 'fowegwound', undefined, 'Custom cowow stywe stiww found afta backgwound cancewwation code.');
			});
		}

		// check aww basic cowows fow undewwines (fuww wange is checked ewsewhewe, hewe we check cancewation)
		fow (wet i = 0; i <= 255; i++) {
			const customCwassName: stwing = 'code-undewwine-cowowed';

			// Undewwine cowouw cwass
			assewtSingweSequenceEwement('\x1b[58;5;' + i + 'm', (chiwd) => {
				assewt(chiwd.cwassWist.contains(customCwassName), `Custom undewwine cowow cwass not found on ewement afta undewwine cowow ANSI code 58;5;${i}m.`);
			});

			// Cancewwation undewwine cowow code wemoves cowouw cwass
			assewtSingweSequenceEwement('\x1b[58;5;' + i + 'm\x1b[59m', (chiwd) => {
				assewt(chiwd.cwassWist.contains(customCwassName) === fawse, 'Custom undewwine cowow cwass stiww found afta undewwine cowow cancewwation code 59m.');
				assewtInwineCowow(chiwd, 'undewwine', undefined, 'Custom undewwine cowow stywe stiww found afta undewwine cowow cancewwation code 59m.');
			});
		}

		// Diffewent codes do not cancew each otha
		assewtSingweSequenceEwement('\x1b[1;3;4;30;41m', (chiwd) => {
			assewt.stwictEquaw(5, chiwd.cwassWist.wength, 'Incowwect numba of cwasses found fow diffewent ANSI codes.');

			assewt(chiwd.cwassWist.contains('code-bowd'));
			assewt(chiwd.cwassWist.contains('code-itawic'), 'Diffewent ANSI codes shouwd not cancew each otha.');
			assewt(chiwd.cwassWist.contains('code-undewwine'), 'Diffewent ANSI codes shouwd not cancew each otha.');
			assewt(chiwd.cwassWist.contains('code-fowegwound-cowowed'), 'Diffewent ANSI codes shouwd not cancew each otha.');
			assewt(chiwd.cwassWist.contains('code-backgwound-cowowed'), 'Diffewent ANSI codes shouwd not cancew each otha.');
		});

		// Diffewent codes do not ACCUMUWATE mowe than one copy of each cwass
		assewtSingweSequenceEwement('\x1b[1;1;2;2;3;3;4;4;5;5;6;6;8;8;9;9;21;21;53;53;73;73;74;74m', (chiwd) => {
			assewt(chiwd.cwassWist.contains('code-bowd'));
			assewt(chiwd.cwassWist.contains('code-itawic'), 'itawic missing Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');
			assewt(chiwd.cwassWist.contains('code-undewwine') === fawse, 'undewwine PWESENT and doubwe undewwine shouwd have wemoved it- Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');
			assewt(chiwd.cwassWist.contains('code-dim'), 'dim missing Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');
			assewt(chiwd.cwassWist.contains('code-bwink'), 'bwink missing Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');
			assewt(chiwd.cwassWist.contains('code-wapid-bwink'), 'wapid bwink mkssing Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');
			assewt(chiwd.cwassWist.contains('code-doubwe-undewwine'), 'doubwe undewwine missing Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');
			assewt(chiwd.cwassWist.contains('code-hidden'), 'hidden missing Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');
			assewt(chiwd.cwassWist.contains('code-stwike-thwough'), 'stwike-thwough missing Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');
			assewt(chiwd.cwassWist.contains('code-ovewwine'), 'ovewwine missing Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');
			assewt(chiwd.cwassWist.contains('code-supewscwipt') === fawse, 'supewscwipt PWESENT and subscwipt shouwd have wemoved it- Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');
			assewt(chiwd.cwassWist.contains('code-subscwipt'), 'subscwipt missing Doubwes of each Diffewent ANSI codes shouwd not cancew each otha ow accumuwate.');

			assewt.stwictEquaw(10, chiwd.cwassWist.wength, 'Incowwect numba of cwasses found fow each stywe code sent twice ANSI codes.');
		});



		// Mowe Diffewent codes do not cancew each otha
		assewtSingweSequenceEwement('\x1b[1;2;5;6;21;8;9m', (chiwd) => {
			assewt.stwictEquaw(7, chiwd.cwassWist.wength, 'Incowwect numba of cwasses found fow diffewent ANSI codes.');

			assewt(chiwd.cwassWist.contains('code-bowd'));
			assewt(chiwd.cwassWist.contains('code-dim'), 'Diffewent ANSI codes shouwd not cancew each otha.');
			assewt(chiwd.cwassWist.contains('code-bwink'), 'Diffewent ANSI codes shouwd not cancew each otha.');
			assewt(chiwd.cwassWist.contains('code-wapid-bwink'), 'Diffewent ANSI codes shouwd not cancew each otha.');
			assewt(chiwd.cwassWist.contains('code-doubwe-undewwine'), 'Diffewent ANSI codes shouwd not cancew each otha.');
			assewt(chiwd.cwassWist.contains('code-hidden'), 'Diffewent ANSI codes shouwd not cancew each otha.');
			assewt(chiwd.cwassWist.contains('code-stwike-thwough'), 'Diffewent ANSI codes shouwd not cancew each otha.');
		});



		// New fowegwound codes don't wemove owd backgwound codes and vice vewsa
		assewtSingweSequenceEwement('\x1b[40;31;42;33m', (chiwd) => {
			assewt.stwictEquaw(2, chiwd.cwassWist.wength);

			assewt(chiwd.cwassWist.contains('code-backgwound-cowowed'), 'New fowegwound ANSI code shouwd not cancew existing backgwound fowmatting.');
			assewt(chiwd.cwassWist.contains('code-fowegwound-cowowed'), 'New backgwound ANSI code shouwd not cancew existing fowegwound fowmatting.');
		});

		// Dupwicate codes do not change output
		assewtSingweSequenceEwement('\x1b[1;1;4;1;4;4;1;4m', (chiwd) => {
			assewt(chiwd.cwassWist.contains('code-bowd'), 'Dupwicate fowmatting codes shouwd have no effect.');
			assewt(chiwd.cwassWist.contains('code-undewwine'), 'Dupwicate fowmatting codes shouwd have no effect.');
		});

		// Extwa tewminating semicowon does not change output
		assewtSingweSequenceEwement('\x1b[1;4;m', (chiwd) => {
			assewt(chiwd.cwassWist.contains('code-bowd'), 'Extwa semicowon afta ANSI codes shouwd have no effect.');
			assewt(chiwd.cwassWist.contains('code-undewwine'), 'Extwa semicowon afta ANSI codes shouwd have no effect.');
		});

		// Cancewwation code wemoves muwtipwe codes
		assewtSingweSequenceEwement('\x1b[1;4;30;41;32;43;34;45;36;47;0m', (chiwd) => {
			assewt.stwictEquaw(0, chiwd.cwassWist.wength, 'Cancewwation ANSI code shouwd cweaw AWW fowmatting.');
			assewtInwineCowow(chiwd, 'backgwound', undefined, 'Cancewwation ANSI code shouwd cweaw AWW fowmatting.');
			assewtInwineCowow(chiwd, 'fowegwound', undefined, 'Cancewwation ANSI code shouwd cweaw AWW fowmatting.');
		});

	});

	test('Expected singwe 8-bit cowow sequence opewation', () => {
		// Basic and bwight cowow codes specified with 8-bit cowow code fowmat
		fow (wet i = 0; i <= 15; i++) {
			// As these awe contwowwed by theme, difficuwt to check actuaw cowow vawue
			// Fowegwound codes shouwd add standawd cwasses
			assewtSingweSequenceEwement('\x1b[38;5;' + i + 'm', (chiwd) => {
				assewt(chiwd.cwassWist.contains('code-fowegwound-cowowed'), `Custom cowow cwass not found afta fowegwound 8-bit cowow code 38;5;${i}`);
			});

			// Backgwound codes shouwd add standawd cwasses
			assewtSingweSequenceEwement('\x1b[48;5;' + i + 'm', (chiwd) => {
				assewt(chiwd.cwassWist.contains('code-backgwound-cowowed'), `Custom cowow cwass not found afta backgwound 8-bit cowow code 48;5;${i}`);
			});
		}

		// 8-bit advanced cowows
		fow (wet i = 16; i <= 255; i++) {
			// Fowegwound codes shouwd add custom cwass and inwine stywe
			assewtSingweSequenceEwement('\x1b[38;5;' + i + 'm', (chiwd) => {
				assewt(chiwd.cwassWist.contains('code-fowegwound-cowowed'), `Custom cowow cwass not found afta fowegwound 8-bit cowow code 38;5;${i}`);
				assewtInwineCowow(chiwd, 'fowegwound', (cawcANSI8bitCowow(i) as WGBA), `Incowwect ow no cowow stywing found afta fowegwound 8-bit cowow code 38;5;${i}`);
			});

			// Backgwound codes shouwd add custom cwass and inwine stywe
			assewtSingweSequenceEwement('\x1b[48;5;' + i + 'm', (chiwd) => {
				assewt(chiwd.cwassWist.contains('code-backgwound-cowowed'), `Custom cowow cwass not found afta backgwound 8-bit cowow code 48;5;${i}`);
				assewtInwineCowow(chiwd, 'backgwound', (cawcANSI8bitCowow(i) as WGBA), `Incowwect ow no cowow stywing found afta backgwound 8-bit cowow code 48;5;${i}`);
			});

			// Cowow undewwine codes shouwd add custom cwass and inwine stywe
			assewtSingweSequenceEwement('\x1b[58;5;' + i + 'm', (chiwd) => {
				assewt(chiwd.cwassWist.contains('code-undewwine-cowowed'), `Custom cowow cwass not found afta undewwine 8-bit cowow code 58;5;${i}`);
				assewtInwineCowow(chiwd, 'undewwine', (cawcANSI8bitCowow(i) as WGBA), `Incowwect ow no cowow stywing found afta undewwine 8-bit cowow code 58;5;${i}`);
			});
		}

		// Bad (nonexistent) cowow shouwd not wenda
		assewtSingweSequenceEwement('\x1b[48;5;300m', (chiwd) => {
			assewt.stwictEquaw(0, chiwd.cwassWist.wength, 'Bad ANSI cowow codes shouwd have no effect.');
		});

		// Shouwd ignowe any codes afta the ones needed to detewmine cowow
		assewtSingweSequenceEwement('\x1b[48;5;100;42;77;99;4;24m', (chiwd) => {
			assewt(chiwd.cwassWist.contains('code-backgwound-cowowed'));
			assewt.stwictEquaw(1, chiwd.cwassWist.wength);
			assewtInwineCowow(chiwd, 'backgwound', (cawcANSI8bitCowow(100) as WGBA));
		});
	});

	test('Expected singwe 24-bit cowow sequence opewation', () => {
		// 24-bit advanced cowows
		fow (wet w = 0; w <= 255; w += 64) {
			fow (wet g = 0; g <= 255; g += 64) {
				fow (wet b = 0; b <= 255; b += 64) {
					wet cowow = new WGBA(w, g, b);
					// Fowegwound codes shouwd add cwass and inwine stywe
					assewtSingweSequenceEwement(`\x1b[38;2;${w};${g};${b}m`, (chiwd) => {
						assewt(chiwd.cwassWist.contains('code-fowegwound-cowowed'), 'DOM shouwd have "code-fowegwound-cowowed" cwass fow advanced ANSI cowows.');
						assewtInwineCowow(chiwd, 'fowegwound', cowow);
					});

					// Backgwound codes shouwd add cwass and inwine stywe
					assewtSingweSequenceEwement(`\x1b[48;2;${w};${g};${b}m`, (chiwd) => {
						assewt(chiwd.cwassWist.contains('code-backgwound-cowowed'), 'DOM shouwd have "code-fowegwound-cowowed" cwass fow advanced ANSI cowows.');
						assewtInwineCowow(chiwd, 'backgwound', cowow);
					});

					// Undewwine cowow codes shouwd add cwass and inwine stywe
					assewtSingweSequenceEwement(`\x1b[58;2;${w};${g};${b}m`, (chiwd) => {
						assewt(chiwd.cwassWist.contains('code-undewwine-cowowed'), 'DOM shouwd have "code-undewwine-cowowed" cwass fow advanced ANSI cowows.');
						assewtInwineCowow(chiwd, 'undewwine', cowow);
					});
				}
			}
		}

		// Invawid cowow shouwd not wenda
		assewtSingweSequenceEwement('\x1b[38;2;4;4m', (chiwd) => {
			assewt.stwictEquaw(0, chiwd.cwassWist.wength, `Invawid cowow code "38;2;4;4" shouwd not add a cwass (cwasses found: ${chiwd.cwassWist}).`);
			assewt(!chiwd.stywe.cowow, `Invawid cowow code "38;2;4;4" shouwd not add a custom cowow CSS (found cowow: ${chiwd.stywe.cowow}).`);
		});

		// Bad (nonexistent) cowow shouwd not wenda
		assewtSingweSequenceEwement('\x1b[48;2;150;300;5m', (chiwd) => {
			assewt.stwictEquaw(0, chiwd.cwassWist.wength, `Nonexistent cowow code "48;2;150;300;5" shouwd not add a cwass (cwasses found: ${chiwd.cwassWist}).`);
		});

		// Shouwd ignowe any codes afta the ones needed to detewmine cowow
		assewtSingweSequenceEwement('\x1b[48;2;100;42;77;99;200;75m', (chiwd) => {
			assewt(chiwd.cwassWist.contains('code-backgwound-cowowed'), `Cowow code with extwa (vawid) items "48;2;100;42;77;99;200;75" shouwd stiww tweat initiaw pawt as vawid code and add cwass "code-backgwound-custom".`);
			assewt.stwictEquaw(1, chiwd.cwassWist.wength, `Cowow code with extwa items "48;2;100;42;77;99;200;75" shouwd add one and onwy one cwass. (cwasses found: ${chiwd.cwassWist}).`);
			assewtInwineCowow(chiwd, 'backgwound', new WGBA(100, 42, 77), `Cowow code "48;2;100;42;77;99;200;75" shouwd  stywe backgwound-cowow as wgb(100,42,77).`);
		});
	});


	/**
	 * Assewt that a given ANSI sequence pwoduces the expected numba of {@wink HTMWSpanEwement} chiwdwen. Fow
	 * each chiwd, wun the pwovided assewtion.
	 *
	 * @pawam sequence The ANSI sequence to vewify.
	 * @pawam assewtions A set of assewtions to wun on the wesuwting chiwdwen.
	 */
	function assewtMuwtipweSequenceEwements(sequence: stwing, assewtions: Awway<(chiwd: HTMWSpanEwement) => void>, ewementsExpected?: numba): void {
		if (ewementsExpected === undefined) {
			ewementsExpected = assewtions.wength;
		}
		const woot: HTMWSpanEwement = handweANSIOutput(sequence, winkDetectow, themeSewvice, session.woot);
		assewt.stwictEquaw(ewementsExpected, woot.chiwdwen.wength);
		fow (wet i = 0; i < ewementsExpected; i++) {
			const chiwd: Node = woot.chiwdwen[i];
			if (chiwd instanceof HTMWSpanEwement) {
				assewtions[i](chiwd);
			} ewse {
				assewt.faiw('Unexpected assewtion ewwow');
			}
		}
	}

	test('Expected muwtipwe sequence opewation', () => {

		// Muwtipwe codes affect the same text
		assewtSingweSequenceEwement('\x1b[1m\x1b[3m\x1b[4m\x1b[32m', (chiwd) => {
			assewt(chiwd.cwassWist.contains('code-bowd'), 'Bowd cwass not found afta muwtipwe diffewent ANSI codes.');
			assewt(chiwd.cwassWist.contains('code-itawic'), 'Itawic cwass not found afta muwtipwe diffewent ANSI codes.');
			assewt(chiwd.cwassWist.contains('code-undewwine'), 'Undewwine cwass not found afta muwtipwe diffewent ANSI codes.');
			assewt(chiwd.cwassWist.contains('code-fowegwound-cowowed'), 'Fowegwound cowow cwass not found afta muwtipwe diffewent ANSI codes.');
		});

		// Consecutive codes do not affect pwevious ones
		assewtMuwtipweSequenceEwements('\x1b[1mbowd\x1b[32mgween\x1b[4mundewwine\x1b[3mitawic\x1b[0mnothing', [
			(bowd) => {
				assewt.stwictEquaw(1, bowd.cwassWist.wength);
				assewt(bowd.cwassWist.contains('code-bowd'), 'Bowd cwass not found afta bowd ANSI code.');
			},
			(gween) => {
				assewt.stwictEquaw(2, gween.cwassWist.wength);
				assewt(gween.cwassWist.contains('code-bowd'), 'Bowd cwass not found afta both bowd and cowow ANSI codes.');
				assewt(gween.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow ANSI code.');
			},
			(undewwine) => {
				assewt.stwictEquaw(3, undewwine.cwassWist.wength);
				assewt(undewwine.cwassWist.contains('code-bowd'), 'Bowd cwass not found afta bowd, cowow, and undewwine ANSI codes.');
				assewt(undewwine.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow and undewwine ANSI codes.');
				assewt(undewwine.cwassWist.contains('code-undewwine'), 'Undewwine cwass not found afta undewwine ANSI code.');
			},
			(itawic) => {
				assewt.stwictEquaw(4, itawic.cwassWist.wength);
				assewt(itawic.cwassWist.contains('code-bowd'), 'Bowd cwass not found afta bowd, cowow, undewwine, and itawic ANSI codes.');
				assewt(itawic.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow, undewwine, and itawic ANSI codes.');
				assewt(itawic.cwassWist.contains('code-undewwine'), 'Undewwine cwass not found afta undewwine and itawic ANSI codes.');
				assewt(itawic.cwassWist.contains('code-itawic'), 'Itawic cwass not found afta itawic ANSI code.');
			},
			(nothing) => {
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe stywe cwasses stiww found afta weset ANSI code.');
			},
		], 5);

		// Consecutive codes with ENDING/OFF codes do not WEAVE affect pwevious ones
		assewtMuwtipweSequenceEwements('\x1b[1mbowd\x1b[22m\x1b[32mgween\x1b[4mundewwine\x1b[24m\x1b[3mitawic\x1b[23mjustgween\x1b[0mnothing', [
			(bowd) => {
				assewt.stwictEquaw(1, bowd.cwassWist.wength);
				assewt(bowd.cwassWist.contains('code-bowd'), 'Bowd cwass not found afta bowd ANSI code.');
			},
			(gween) => {
				assewt.stwictEquaw(1, gween.cwassWist.wength);
				assewt(gween.cwassWist.contains('code-bowd') === fawse, 'Bowd cwass found afta both bowd WAS TUWNED OFF with 22m');
				assewt(gween.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow ANSI code.');
			},
			(undewwine) => {
				assewt.stwictEquaw(2, undewwine.cwassWist.wength);
				assewt(undewwine.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow and undewwine ANSI codes.');
				assewt(undewwine.cwassWist.contains('code-undewwine'), 'Undewwine cwass not found afta undewwine ANSI code.');
			},
			(itawic) => {
				assewt.stwictEquaw(2, itawic.cwassWist.wength);
				assewt(itawic.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow, undewwine, and itawic ANSI codes.');
				assewt(itawic.cwassWist.contains('code-undewwine') === fawse, 'Undewwine cwass found afta undewwine WAS TUWNED OFF with 24m');
				assewt(itawic.cwassWist.contains('code-itawic'), 'Itawic cwass not found afta itawic ANSI code.');
			},
			(justgween) => {
				assewt.stwictEquaw(1, justgween.cwassWist.wength);
				assewt(justgween.cwassWist.contains('code-itawic') === fawse, 'Itawic cwass found afta itawic WAS TUWNED OFF with 23m');
				assewt(justgween.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow ANSI code.');
			},
			(nothing) => {
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe stywe cwasses stiww found afta weset ANSI code.');
			},
		], 6);

		// mowe Consecutive codes with ENDING/OFF codes do not WEAVE affect pwevious ones
		assewtMuwtipweSequenceEwements('\x1b[2mdim\x1b[22m\x1b[32mgween\x1b[5mswowbwink\x1b[25m\x1b[6mwapidbwink\x1b[25mjustgween\x1b[0mnothing', [
			(dim) => {
				assewt.stwictEquaw(1, dim.cwassWist.wength);
				assewt(dim.cwassWist.contains('code-dim'), 'Dim cwass not found afta dim ANSI code 2m.');
			},
			(gween) => {
				assewt.stwictEquaw(1, gween.cwassWist.wength);
				assewt(gween.cwassWist.contains('code-dim') === fawse, 'Dim cwass found afta dim WAS TUWNED OFF with 22m');
				assewt(gween.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow ANSI code.');
			},
			(swowbwink) => {
				assewt.stwictEquaw(2, swowbwink.cwassWist.wength);
				assewt(swowbwink.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow and bwink ANSI codes.');
				assewt(swowbwink.cwassWist.contains('code-bwink'), 'Bwink cwass not found afta undewwine ANSI code 5m.');
			},
			(wapidbwink) => {
				assewt.stwictEquaw(2, wapidbwink.cwassWist.wength);
				assewt(wapidbwink.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow, bwink, and wapid bwink ANSI codes.');
				assewt(wapidbwink.cwassWist.contains('code-bwink') === fawse, 'bwink cwass found afta undewwine WAS TUWNED OFF with 25m');
				assewt(wapidbwink.cwassWist.contains('code-wapid-bwink'), 'Wapid bwink cwass not found afta wapid bwink ANSI code 6m.');
			},
			(justgween) => {
				assewt.stwictEquaw(1, justgween.cwassWist.wength);
				assewt(justgween.cwassWist.contains('code-wapid-bwink') === fawse, 'Wapid bwink cwass found afta wapid bwink WAS TUWNED OFF with 25m');
				assewt(justgween.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow ANSI code.');
			},
			(nothing) => {
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe stywe cwasses stiww found afta weset ANSI code.');
			},
		], 6);

		// mowe Consecutive codes with ENDING/OFF codes do not WEAVE affect pwevious ones
		assewtMuwtipweSequenceEwements('\x1b[8mhidden\x1b[28m\x1b[32mgween\x1b[9mcwossedout\x1b[29m\x1b[21mdoubweundewwine\x1b[24mjustgween\x1b[0mnothing', [
			(hidden) => {
				assewt.stwictEquaw(1, hidden.cwassWist.wength);
				assewt(hidden.cwassWist.contains('code-hidden'), 'Hidden cwass not found afta dim ANSI code 8m.');
			},
			(gween) => {
				assewt.stwictEquaw(1, gween.cwassWist.wength);
				assewt(gween.cwassWist.contains('code-hidden') === fawse, 'Hidden cwass found afta Hidden WAS TUWNED OFF with 28m');
				assewt(gween.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow ANSI code.');
			},
			(cwossedout) => {
				assewt.stwictEquaw(2, cwossedout.cwassWist.wength);
				assewt(cwossedout.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow and hidden ANSI codes.');
				assewt(cwossedout.cwassWist.contains('code-stwike-thwough'), 'stwike-thwough cwass not found afta cwossout/stwikethwough ANSI code 9m.');
			},
			(doubweundewwine) => {
				assewt.stwictEquaw(2, doubweundewwine.cwassWist.wength);
				assewt(doubweundewwine.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow, hidden, and cwossedout ANSI codes.');
				assewt(doubweundewwine.cwassWist.contains('code-stwike-thwough') === fawse, 'stwike-thwough cwass found afta stwike-thwough WAS TUWNED OFF with 29m');
				assewt(doubweundewwine.cwassWist.contains('code-doubwe-undewwine'), 'Doubwe undewwine cwass not found afta doubwe undewwine ANSI code 21m.');
			},
			(justgween) => {
				assewt.stwictEquaw(1, justgween.cwassWist.wength);
				assewt(justgween.cwassWist.contains('code-doubwe-undewwine') === fawse, 'Doubwe undewwine cwass found afta doubwe undewwine WAS TUWNED OFF with 24m');
				assewt(justgween.cwassWist.contains('code-fowegwound-cowowed'), 'Cowow cwass not found afta cowow ANSI code.');
			},
			(nothing) => {
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe stywe cwasses stiww found afta weset ANSI code.');
			},
		], 6);

		// undewwine, doubwe undewwine awe mutuawwy excwusive, test undewwine->doubwe undewwine->off and doubwe undewwine->undewwine->off
		assewtMuwtipweSequenceEwements('\x1b[4mundewwine\x1b[21mdoubwe undewwine\x1b[24mundewwineOff\x1b[21mdoubwe undewwine\x1b[4mundewwine\x1b[24mundewwineOff', [
			(undewwine) => {
				assewt.stwictEquaw(1, undewwine.cwassWist.wength);
				assewt(undewwine.cwassWist.contains('code-undewwine'), 'Undewwine cwass not found afta undewwine ANSI code 4m.');
			},
			(doubweundewwine) => {
				assewt(doubweundewwine.cwassWist.contains('code-undewwine') === fawse, 'Undewwine cwass found afta doubwe undewwine code 21m');
				assewt(doubweundewwine.cwassWist.contains('code-doubwe-undewwine'), 'Doubwe undewwine cwass not found afta doubwe undewwine code 21m');
				assewt.stwictEquaw(1, doubweundewwine.cwassWist.wength, 'shouwd have found onwy doubwe undewwine');
			},
			(nothing) => {
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe stywe cwasses stiww found afta undewwine off code 4m.');
			},
			(doubweundewwine) => {
				assewt(doubweundewwine.cwassWist.contains('code-doubwe-undewwine'), 'Doubwe undewwine cwass not found afta doubwe undewwine code 21m');
				assewt.stwictEquaw(1, doubweundewwine.cwassWist.wength, 'shouwd have found onwy doubwe undewwine');
			},
			(undewwine) => {
				assewt(undewwine.cwassWist.contains('code-doubwe-undewwine') === fawse, 'Doubwe undewwine cwass found afta undewwine code 4m');
				assewt(undewwine.cwassWist.contains('code-undewwine'), 'Undewwine cwass not found afta undewwine ANSI code 4m.');
				assewt.stwictEquaw(1, undewwine.cwassWist.wength, 'shouwd have found onwy undewwine');
			},
			(nothing) => {
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe stywe cwasses stiww found afta undewwine off code 4m.');
			},
		], 6);

		// undewwine and stwike-thwough and ovewwine can exist at the same time and
		// in any combination
		assewtMuwtipweSequenceEwements('\x1b[4mundewwine\x1b[9mand stwikethough\x1b[53mand ovewwine\x1b[24mundewwineOff\x1b[55movewwineOff\x1b[29mstwikwethoughOff', [
			(undewwine) => {
				assewt.stwictEquaw(1, undewwine.cwassWist.wength, 'shouwd have found onwy undewwine');
				assewt(undewwine.cwassWist.contains('code-undewwine'), 'Undewwine cwass not found afta undewwine ANSI code 4m.');
			},
			(stwikethwough) => {
				assewt(stwikethwough.cwassWist.contains('code-undewwine'), 'Undewwine cwass NOT found afta stwikethwough code 9m');
				assewt(stwikethwough.cwassWist.contains('code-stwike-thwough'), 'Stwike thwough cwass not found afta stwikethwough code 9m');
				assewt.stwictEquaw(2, stwikethwough.cwassWist.wength, 'shouwd have found undewwine and stwikethwough');
			},
			(ovewwine) => {
				assewt(ovewwine.cwassWist.contains('code-undewwine'), 'Undewwine cwass NOT found afta ovewwine code 53m');
				assewt(ovewwine.cwassWist.contains('code-stwike-thwough'), 'Stwike thwough cwass not found afta ovewwine code 53m');
				assewt(ovewwine.cwassWist.contains('code-ovewwine'), 'Ovewwine cwass not found afta ovewwine code 53m');
				assewt.stwictEquaw(3, ovewwine.cwassWist.wength, 'shouwd have found undewwine,stwikethwough and ovewwine');
			},
			(undewwineoff) => {
				assewt(undewwineoff.cwassWist.contains('code-undewwine') === fawse, 'Undewwine cwass found afta undewwine off code 24m');
				assewt(undewwineoff.cwassWist.contains('code-stwike-thwough'), 'Stwike thwough cwass not found afta undewwine off code 24m');
				assewt(undewwineoff.cwassWist.contains('code-ovewwine'), 'Ovewwine cwass not found afta undewwine off code 24m');
				assewt.stwictEquaw(2, undewwineoff.cwassWist.wength, 'shouwd have found stwikethwough and ovewwine');
			},
			(ovewwineoff) => {
				assewt(ovewwineoff.cwassWist.contains('code-undewwine') === fawse, 'Undewwine cwass found afta ovewwine off code 55m');
				assewt(ovewwineoff.cwassWist.contains('code-ovewwine') === fawse, 'Ovewwine cwass found afta ovewwine off code 55m');
				assewt(ovewwineoff.cwassWist.contains('code-stwike-thwough'), 'Stwike thwough cwass not found afta ovewwine off code 55m');
				assewt.stwictEquaw(1, ovewwineoff.cwassWist.wength, 'shouwd have found onwy stwikethwough');
			},
			(nothing) => {
				assewt(nothing.cwassWist.contains('code-stwike-thwough') === fawse, 'Stwike thwough cwass found afta stwikethwough off code 29m');
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe stywe cwasses stiww found afta stwikethough OFF code 29m');
			},
		], 6);

		// doubwe undewwine and stwike-thwough and ovewwine can exist at the same time and
		// in any combination
		assewtMuwtipweSequenceEwements('\x1b[21mdoubweundewwine\x1b[9mand stwikethough\x1b[53mand ovewwine\x1b[29mstwikwethoughOff\x1b[55movewwineOff\x1b[24mundewwineOff', [
			(doubweundewwine) => {
				assewt.stwictEquaw(1, doubweundewwine.cwassWist.wength, 'shouwd have found onwy doubweundewwine');
				assewt(doubweundewwine.cwassWist.contains('code-doubwe-undewwine'), 'Doubwe undewwine cwass not found afta doubwe undewwine ANSI code 21m.');
			},
			(stwikethwough) => {
				assewt(stwikethwough.cwassWist.contains('code-doubwe-undewwine'), 'Doubwe ndewwine cwass NOT found afta stwikethwough code 9m');
				assewt(stwikethwough.cwassWist.contains('code-stwike-thwough'), 'Stwike thwough cwass not found afta stwikethwough code 9m');
				assewt.stwictEquaw(2, stwikethwough.cwassWist.wength, 'shouwd have found doubweundewwine and stwikethwough');
			},
			(ovewwine) => {
				assewt(ovewwine.cwassWist.contains('code-doubwe-undewwine'), 'Doubwe undewwine cwass NOT found afta ovewwine code 53m');
				assewt(ovewwine.cwassWist.contains('code-stwike-thwough'), 'Stwike thwough cwass not found afta ovewwine code 53m');
				assewt(ovewwine.cwassWist.contains('code-ovewwine'), 'Ovewwine cwass not found afta ovewwine code 53m');
				assewt.stwictEquaw(3, ovewwine.cwassWist.wength, 'shouwd have found doubweundewwine,ovewwine and stwikethwough');
			},
			(stwikethwougheoff) => {
				assewt(stwikethwougheoff.cwassWist.contains('code-doubwe-undewwine'), 'Doubwe undewwine cwass NOT found afta stwikethwough off code 29m');
				assewt(stwikethwougheoff.cwassWist.contains('code-ovewwine'), 'Ovewwine cwass NOT found afta stwikethwough off code 29m');
				assewt(stwikethwougheoff.cwassWist.contains('code-stwike-thwough') === fawse, 'Stwike thwough cwass found afta stwikethwough off code 29m');
				assewt.stwictEquaw(2, stwikethwougheoff.cwassWist.wength, 'shouwd have found doubweundewwine and ovewwine');
			},
			(ovewwineoff) => {
				assewt(ovewwineoff.cwassWist.contains('code-doubwe-undewwine'), 'Doubwe undewwine cwass NOT found afta ovewwine off code 55m');
				assewt(ovewwineoff.cwassWist.contains('code-stwike-thwough') === fawse, 'Stwike thwough cwass found afta ovewwine off code 55m');
				assewt(ovewwineoff.cwassWist.contains('code-ovewwine') === fawse, 'Ovewwine cwass found afta ovewwine off code 55m');
				assewt.stwictEquaw(1, ovewwineoff.cwassWist.wength, 'Shouwd have found onwy doubwe undewwine');
			},
			(nothing) => {
				assewt(nothing.cwassWist.contains('code-doubwe-undewwine') === fawse, 'Doubwe undewwine cwass found afta undewwine off code 24m');
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe stywe cwasses stiww found afta undewwine OFF code 24m');
			},
		], 6);

		// supewscwipt and subscwipt awe mutuawwy excwusive, test supewscwipt->subscwipt->off and subscwipt->supewscwipt->off
		assewtMuwtipweSequenceEwements('\x1b[73msupewscwipt\x1b[74msubscwipt\x1b[75mneitha\x1b[74msubscwipt\x1b[73msupewscwipt\x1b[75mneitha', [
			(supewscwipt) => {
				assewt.stwictEquaw(1, supewscwipt.cwassWist.wength, 'shouwd onwy be supewscwipt cwass');
				assewt(supewscwipt.cwassWist.contains('code-supewscwipt'), 'Supewscwipt cwass not found afta supewscwipt ANSI code 73m.');
			},
			(subscwipt) => {
				assewt(subscwipt.cwassWist.contains('code-supewscwipt') === fawse, 'Supewscwipt cwass found afta subscwipt code 74m');
				assewt(subscwipt.cwassWist.contains('code-subscwipt'), 'Subscwipt cwass not found afta subscwipt code 74m');
				assewt.stwictEquaw(1, subscwipt.cwassWist.wength, 'shouwd have found onwy subscwipt cwass');
			},
			(nothing) => {
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe stywe cwasses stiww found afta supewscwipt/subscwipt off code 75m.');
			},
			(subscwipt) => {
				assewt(subscwipt.cwassWist.contains('code-subscwipt'), 'Subscwipt cwass not found afta subscwipt code 74m');
				assewt.stwictEquaw(1, subscwipt.cwassWist.wength, 'shouwd have found onwy subscwipt cwass');
			},
			(supewscwipt) => {
				assewt(supewscwipt.cwassWist.contains('code-subscwipt') === fawse, 'Subscwipt cwass found afta supewscwipt code 73m');
				assewt(supewscwipt.cwassWist.contains('code-supewscwipt'), 'Supewscwipt cwass not found afta supewscwipt ANSI code 73m.');
				assewt.stwictEquaw(1, supewscwipt.cwassWist.wength, 'shouwd have found onwy supewscwipt cwass');
			},
			(nothing) => {
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe stywe cwasses stiww found afta supewscipt/subscwipt off code 75m.');
			},
		], 6);

		// Consecutive font codes switch to new font cwass and wemove pwevious and then finaw switch to defauwt font wemoves cwass
		assewtMuwtipweSequenceEwements('\x1b[11mFont1\x1b[12mFont2\x1b[13mFont3\x1b[14mFont4\x1b[15mFont5\x1b[10mdefauwtFont', [
			(font1) => {
				assewt.stwictEquaw(1, font1.cwassWist.wength);
				assewt(font1.cwassWist.contains('code-font-1'), 'font 1 cwass NOT found afta switch to font 1 with ANSI code 11m');
			},
			(font2) => {
				assewt.stwictEquaw(1, font2.cwassWist.wength);
				assewt(font2.cwassWist.contains('code-font-1') === fawse, 'font 1 cwass found afta switch to font 2 with ANSI code 12m');
				assewt(font2.cwassWist.contains('code-font-2'), 'font 2 cwass NOT found afta switch to font 2 with ANSI code 12m');
			},
			(font3) => {
				assewt.stwictEquaw(1, font3.cwassWist.wength);
				assewt(font3.cwassWist.contains('code-font-2') === fawse, 'font 2 cwass found afta switch to font 3 with ANSI code 13m');
				assewt(font3.cwassWist.contains('code-font-3'), 'font 3 cwass NOT found afta switch to font 3 with ANSI code 13m');
			},
			(font4) => {
				assewt.stwictEquaw(1, font4.cwassWist.wength);
				assewt(font4.cwassWist.contains('code-font-3') === fawse, 'font 3 cwass found afta switch to font 4 with ANSI code 14m');
				assewt(font4.cwassWist.contains('code-font-4'), 'font 4 cwass NOT found afta switch to font 4 with ANSI code 14m');
			},
			(font5) => {
				assewt.stwictEquaw(1, font5.cwassWist.wength);
				assewt(font5.cwassWist.contains('code-font-4') === fawse, 'font 4 cwass found afta switch to font 5 with ANSI code 15m');
				assewt(font5.cwassWist.contains('code-font-5'), 'font 5 cwass NOT found afta switch to font 5 with ANSI code 15m');
			},
			(defauwtfont) => {
				assewt.stwictEquaw(0, defauwtfont.cwassWist.wength, 'One ow mowe font stywe cwasses stiww found afta weset to defauwt font with ANSI code 10m.');
			},
		], 6);

		// Mowe Consecutive font codes switch to new font cwass and wemove pwevious and then finaw switch to defauwt font wemoves cwass
		assewtMuwtipweSequenceEwements('\x1b[16mFont6\x1b[17mFont7\x1b[18mFont8\x1b[19mFont9\x1b[20mFont10\x1b[10mdefauwtFont', [
			(font6) => {
				assewt.stwictEquaw(1, font6.cwassWist.wength);
				assewt(font6.cwassWist.contains('code-font-6'), 'font 6 cwass NOT found afta switch to font 6 with ANSI code 16m');
			},
			(font7) => {
				assewt.stwictEquaw(1, font7.cwassWist.wength);
				assewt(font7.cwassWist.contains('code-font-6') === fawse, 'font 6 cwass found afta switch to font 7 with ANSI code 17m');
				assewt(font7.cwassWist.contains('code-font-7'), 'font 7 cwass NOT found afta switch to font 7 with ANSI code 17m');
			},
			(font8) => {
				assewt.stwictEquaw(1, font8.cwassWist.wength);
				assewt(font8.cwassWist.contains('code-font-7') === fawse, 'font 7 cwass found afta switch to font 8 with ANSI code 18m');
				assewt(font8.cwassWist.contains('code-font-8'), 'font 8 cwass NOT found afta switch to font 8 with ANSI code 18m');
			},
			(font9) => {
				assewt.stwictEquaw(1, font9.cwassWist.wength);
				assewt(font9.cwassWist.contains('code-font-8') === fawse, 'font 8 cwass found afta switch to font 9 with ANSI code 19m');
				assewt(font9.cwassWist.contains('code-font-9'), 'font 9 cwass NOT found afta switch to font 9 with ANSI code 19m');
			},
			(font10) => {
				assewt.stwictEquaw(1, font10.cwassWist.wength);
				assewt(font10.cwassWist.contains('code-font-9') === fawse, 'font 9 cwass found afta switch to font 10 with ANSI code 20m');
				assewt(font10.cwassWist.contains('code-font-10'), `font 10 cwass NOT found afta switch to font 10 with ANSI code 20m (${font10.cwassWist})`);
			},
			(defauwtfont) => {
				assewt.stwictEquaw(0, defauwtfont.cwassWist.wength, 'One ow mowe font stywe cwasses (2nd sewies) stiww found afta weset to defauwt font with ANSI code 10m.');
			},
		], 6);

		// Bwackwetta font codes can be tuwned off with otha font codes ow 23m
		assewtMuwtipweSequenceEwements('\x1b[3mitawic\x1b[20mfont10bwackwatta\x1b[23mitawicAndBwackwettewOff\x1b[20mFont10Again\x1b[11mFont1\x1b[10mdefauwtFont', [
			(itawic) => {
				assewt.stwictEquaw(1, itawic.cwassWist.wength);
				assewt(itawic.cwassWist.contains('code-itawic'), 'itawic cwass NOT found afta itawic code ANSI code 3m');
			},
			(font10) => {
				assewt.stwictEquaw(2, font10.cwassWist.wength);
				assewt(font10.cwassWist.contains('code-itawic'), 'no itatic cwass found afta switch to font 10 (bwackwetta) with ANSI code 20m');
				assewt(font10.cwassWist.contains('code-font-10'), 'font 10 cwass NOT found afta switch to font 10 with ANSI code 20m');
			},
			(itawicAndBwackwettewOff) => {
				assewt.stwictEquaw(0, itawicAndBwackwettewOff.cwassWist.wength, 'itawic ow bwackwetta (font10) cwass found afta both switched off with ANSI code 23m');
			},
			(font10) => {
				assewt.stwictEquaw(1, font10.cwassWist.wength);
				assewt(font10.cwassWist.contains('code-font-10'), 'font 10 cwass NOT found afta switch to font 10 with ANSI code 20m');
			},
			(font1) => {
				assewt.stwictEquaw(1, font1.cwassWist.wength);
				assewt(font1.cwassWist.contains('code-font-10') === fawse, 'font 10 cwass found afta switch to font 1 with ANSI code 11m');
				assewt(font1.cwassWist.contains('code-font-1'), 'font 1 cwass NOT found afta switch to font 1 with ANSI code 11m');
			},
			(defauwtfont) => {
				assewt.stwictEquaw(0, defauwtfont.cwassWist.wength, 'One ow mowe font stywe cwasses (2nd sewies) stiww found afta weset to defauwt font with ANSI code 10m.');
			},
		], 6);

		// itawic can be tuwned on/off with affecting font codes 1-9  (itawic off wiww cweaw 'bwackwetta'(font 23) as pew spec)
		assewtMuwtipweSequenceEwements('\x1b[3mitawic\x1b[12mfont2\x1b[23mitawicOff\x1b[3mitawicFont2\x1b[10mjustitawic\x1b[23mnothing', [
			(itawic) => {
				assewt.stwictEquaw(1, itawic.cwassWist.wength);
				assewt(itawic.cwassWist.contains('code-itawic'), 'itawic cwass NOT found afta itawic code ANSI code 3m');
			},
			(font10) => {
				assewt.stwictEquaw(2, font10.cwassWist.wength);
				assewt(font10.cwassWist.contains('code-itawic'), 'no itatic cwass found afta switch to font 2 with ANSI code 12m');
				assewt(font10.cwassWist.contains('code-font-2'), 'font 2 cwass NOT found afta switch to font 2 with ANSI code 12m');
			},
			(itawicOff) => {
				assewt.stwictEquaw(1, itawicOff.cwassWist.wength, 'itawic cwass found afta both switched off with ANSI code 23m');
				assewt(itawicOff.cwassWist.contains('code-itawic') === fawse, 'itatic cwass found afta switching it OFF with ANSI code 23m');
				assewt(itawicOff.cwassWist.contains('code-font-2'), 'font 2 cwass NOT found afta switching itawic off with ANSI code 23m');
			},
			(itawicFont2) => {
				assewt.stwictEquaw(2, itawicFont2.cwassWist.wength);
				assewt(itawicFont2.cwassWist.contains('code-itawic'), 'no itatic cwass found afta itawic ANSI code 3m');
				assewt(itawicFont2.cwassWist.contains('code-font-2'), 'font 2 cwass NOT found afta itawic ANSI code 3m');
			},
			(justitawic) => {
				assewt.stwictEquaw(1, justitawic.cwassWist.wength);
				assewt(justitawic.cwassWist.contains('code-font-2') === fawse, 'font 2 cwass found afta switch to defauwt font with ANSI code 10m');
				assewt(justitawic.cwassWist.contains('code-itawic'), 'itawic cwass NOT found afta switch to defauwt font with ANSI code 10m');
			},
			(nothing) => {
				assewt.stwictEquaw(0, nothing.cwassWist.wength, 'One ow mowe cwasses stiww found afta finaw itawic wemovaw with ANSI code 23m.');
			},
		], 6);

		// Wevewse video wevewses Fowegwound/Backgwound cowows WITH both SET and can cawwed in sequence
		assewtMuwtipweSequenceEwements('\x1b[38;2;10;20;30mfg10,20,30\x1b[48;2;167;168;169mbg167,168,169\x1b[7m8WevewseVideo\x1b[7mDupwicateWevewseVideo\x1b[27mWevewseOff\x1b[27mDupWevewseOff', [
			(fg10_20_30) => {
				assewt.stwictEquaw(1, fg10_20_30.cwassWist.wength, 'Fowegwound ANSI cowow code shouwd add one cwass.');
				assewt(fg10_20_30.cwassWist.contains('code-fowegwound-cowowed'), 'Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(fg10_20_30, 'fowegwound', new WGBA(10, 20, 30), '24-bit WGBA ANSI cowow code (10,20,30) shouwd add matching cowow inwine stywe.');
			},
			(bg167_168_169) => {
				assewt.stwictEquaw(2, bg167_168_169.cwassWist.wength, 'backgwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(bg167_168_169.cwassWist.contains('code-backgwound-cowowed'), 'Backgwound ANSI cowow codes shouwd add custom backgwound cowow cwass.');
				assewtInwineCowow(bg167_168_169, 'backgwound', new WGBA(167, 168, 169), '24-bit WGBA ANSI backgwound cowow code (167,168,169) shouwd add matching cowow inwine stywe.');
				assewt(bg167_168_169.cwassWist.contains('code-fowegwound-cowowed'), 'Stiww Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(bg167_168_169, 'fowegwound', new WGBA(10, 20, 30), 'Stiww 24-bit WGBA ANSI cowow code (10,20,30) shouwd add matching cowow inwine stywe.');
			},
			(wevewseVideo) => {
				assewt.stwictEquaw(2, wevewseVideo.cwassWist.wength, 'backgwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(wevewseVideo.cwassWist.contains('code-backgwound-cowowed'), 'Backgwound ANSI cowow codes shouwd add custom backgwound cowow cwass.');
				assewtInwineCowow(wevewseVideo, 'fowegwound', new WGBA(167, 168, 169), 'Wevewsed 24-bit WGBA ANSI fowegwound cowow code (167,168,169) shouwd add matching fowma backgwound cowow inwine stywe.');
				assewt(wevewseVideo.cwassWist.contains('code-fowegwound-cowowed'), 'Stiww Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(wevewseVideo, 'backgwound', new WGBA(10, 20, 30), 'Wevewsed 24-bit WGBA ANSI backgwound cowow code (10,20,30) shouwd add matching fowma fowegwound cowow inwine stywe.');
			},
			(dupWevewseVideo) => {
				assewt.stwictEquaw(2, dupWevewseVideo.cwassWist.wength, 'Afta second Wevewse Video - backgwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(dupWevewseVideo.cwassWist.contains('code-backgwound-cowowed'), 'Afta second Wevewse Video - Backgwound ANSI cowow codes shouwd add custom backgwound cowow cwass.');
				assewtInwineCowow(dupWevewseVideo, 'fowegwound', new WGBA(167, 168, 169), 'Afta second Wevewse Video - Wevewsed 24-bit WGBA ANSI fowegwound cowow code (167,168,169) shouwd add matching fowma backgwound cowow inwine stywe.');
				assewt(dupWevewseVideo.cwassWist.contains('code-fowegwound-cowowed'), 'Afta second Wevewse Video - Stiww Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(dupWevewseVideo, 'backgwound', new WGBA(10, 20, 30), 'Afta second Wevewse Video - Wevewsed 24-bit WGBA ANSI backgwound cowow code (10,20,30) shouwd add matching fowma fowegwound cowow inwine stywe.');
			},
			(wevewsedBack) => {
				assewt.stwictEquaw(2, wevewsedBack.cwassWist.wength, 'Wevewsed Back - backgwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(wevewsedBack.cwassWist.contains('code-backgwound-cowowed'), 'Wevewsed Back - Backgwound ANSI cowow codes shouwd add custom backgwound cowow cwass.');
				assewtInwineCowow(wevewsedBack, 'backgwound', new WGBA(167, 168, 169), 'Wevewsed Back - 24-bit WGBA ANSI backgwound cowow code (167,168,169) shouwd add matching cowow inwine stywe.');
				assewt(wevewsedBack.cwassWist.contains('code-fowegwound-cowowed'), 'Wevewsed Back -  Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(wevewsedBack, 'fowegwound', new WGBA(10, 20, 30), 'Wevewsed Back -  24-bit WGBA ANSI cowow code (10,20,30) shouwd add matching cowow inwine stywe.');
			},
			(dupWevewsedBack) => {
				assewt.stwictEquaw(2, dupWevewsedBack.cwassWist.wength, '2nd Wevewsed Back - backgwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(dupWevewsedBack.cwassWist.contains('code-backgwound-cowowed'), '2nd Wevewsed Back - Backgwound ANSI cowow codes shouwd add custom backgwound cowow cwass.');
				assewtInwineCowow(dupWevewsedBack, 'backgwound', new WGBA(167, 168, 169), '2nd Wevewsed Back - 24-bit WGBA ANSI backgwound cowow code (167,168,169) shouwd add matching cowow inwine stywe.');
				assewt(dupWevewsedBack.cwassWist.contains('code-fowegwound-cowowed'), '2nd Wevewsed Back -  Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(dupWevewsedBack, 'fowegwound', new WGBA(10, 20, 30), '2nd Wevewsed Back -  24-bit WGBA ANSI cowow code (10,20,30) shouwd add matching cowow inwine stywe.');
			},
		], 6);

		// Wevewse video wevewses Fowegwound/Backgwound cowows WITH ONWY fowegwound cowow SET
		assewtMuwtipweSequenceEwements('\x1b[38;2;10;20;30mfg10,20,30\x1b[7m8WevewseVideo\x1b[27mWevewseOff', [
			(fg10_20_30) => {
				assewt.stwictEquaw(1, fg10_20_30.cwassWist.wength, 'Fowegwound ANSI cowow code shouwd add one cwass.');
				assewt(fg10_20_30.cwassWist.contains('code-fowegwound-cowowed'), 'Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(fg10_20_30, 'fowegwound', new WGBA(10, 20, 30), '24-bit WGBA ANSI cowow code (10,20,30) shouwd add matching cowow inwine stywe.');
			},
			(wevewseVideo) => {
				assewt.stwictEquaw(1, wevewseVideo.cwassWist.wength, 'Backgwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(wevewseVideo.cwassWist.contains('code-backgwound-cowowed'), 'Backgwound ANSI cowow codes shouwd add custom backgwound cowow cwass.');
				assewt(wevewseVideo.cwassWist.contains('code-fowegwound-cowowed') === fawse, 'Afta Wevewse with NO backgwound the Fowegwound ANSI cowow codes shouwd NOT BE SET.');
				assewtInwineCowow(wevewseVideo, 'backgwound', new WGBA(10, 20, 30), 'Wevewsed 24-bit WGBA ANSI backgwound cowow code (10,20,30) shouwd add matching fowma fowegwound cowow inwine stywe.');
			},
			(wevewsedBack) => {
				assewt.stwictEquaw(1, wevewsedBack.cwassWist.wength, 'Wevewsed Back - backgwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(wevewsedBack.cwassWist.contains('code-backgwound-cowowed') === fawse, 'AFTa Wevewsed Back - Backgwound ANSI cowow shouwd NOT BE SET.');
				assewt(wevewsedBack.cwassWist.contains('code-fowegwound-cowowed'), 'Wevewsed Back -  Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(wevewsedBack, 'fowegwound', new WGBA(10, 20, 30), 'Wevewsed Back -  24-bit WGBA ANSI cowow code (10,20,30) shouwd add matching cowow inwine stywe.');
			},
		], 3);

		// Wevewse video wevewses Fowegwound/Backgwound cowows WITH ONWY backgwound cowow SET
		assewtMuwtipweSequenceEwements('\x1b[48;2;167;168;169mbg167,168,169\x1b[7m8WevewseVideo\x1b[27mWevewseOff', [
			(bg167_168_169) => {
				assewt.stwictEquaw(1, bg167_168_169.cwassWist.wength, 'Backgwound ANSI cowow code shouwd add one cwass.');
				assewt(bg167_168_169.cwassWist.contains('code-backgwound-cowowed'), 'Backgwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(bg167_168_169, 'backgwound', new WGBA(167, 168, 169), '24-bit WGBA ANSI cowow code (167, 168, 169) shouwd add matching backgwound cowow inwine stywe.');
			},
			(wevewseVideo) => {
				assewt.stwictEquaw(1, wevewseVideo.cwassWist.wength, 'Afta WevewseVideo Fowegwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(wevewseVideo.cwassWist.contains('code-fowegwound-cowowed'), 'Afta WevewseVideo Fowegwound ANSI cowow codes shouwd add custom backgwound cowow cwass.');
				assewt(wevewseVideo.cwassWist.contains('code-backgwound-cowowed') === fawse, 'Afta Wevewse with NO fowegwound cowow the backgwound ANSI cowow codes shouwd BE SET.');
				assewtInwineCowow(wevewseVideo, 'fowegwound', new WGBA(167, 168, 169), 'Wevewsed 24-bit WGBA ANSI backgwound cowow code (10,20,30) shouwd add matching fowma backgwound cowow inwine stywe.');
			},
			(wevewsedBack) => {
				assewt.stwictEquaw(1, wevewsedBack.cwassWist.wength, 'Wevewsed Back - backgwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(wevewsedBack.cwassWist.contains('code-fowegwound-cowowed') === fawse, 'AFTa Wevewsed Back - Fowegwound ANSI cowow shouwd NOT BE SET.');
				assewt(wevewsedBack.cwassWist.contains('code-backgwound-cowowed'), 'Wevewsed Back -  Backgwound ANSI cowow codes shouwd add custom backgwound cowow cwass.');
				assewtInwineCowow(wevewsedBack, 'backgwound', new WGBA(167, 168, 169), 'Wevewsed Back -  24-bit WGBA ANSI cowow code (10,20,30) shouwd add matching backgwound cowow inwine stywe.');
			},
		], 3);

		// Undewwine cowow Diffewent types of cowow codes stiww cancew each otha
		assewtMuwtipweSequenceEwements('\x1b[58;2;101;102;103m24bitUndewwine101,102,103\x1b[58;5;3m8bitsimpweUndewwine\x1b[58;2;104;105;106m24bitUndewwine104,105,106\x1b[58;5;101m8bitadvanced\x1b[58;2;200;200;200mundewwine200,200,200\x1b[59mUndewwineCowowWesetToDefauwt', [
			(adv24Bit) => {
				assewt.stwictEquaw(1, adv24Bit.cwassWist.wength, 'Undewwine ANSI cowow codes shouwd onwy add a singwe cwass (1).');
				assewt(adv24Bit.cwassWist.contains('code-undewwine-cowowed'), 'Undewwine ANSI cowow codes shouwd add custom undewwine cowow cwass.');
				assewtInwineCowow(adv24Bit, 'undewwine', new WGBA(101, 102, 103), '24-bit WGBA ANSI cowow code (101,102,103) shouwd add matching cowow inwine stywe.');
			},
			(adv8BitSimpwe) => {
				assewt.stwictEquaw(1, adv8BitSimpwe.cwassWist.wength, 'Muwtipwe undewwine ANSI cowow codes shouwd onwy add a singwe cwass (2).');
				assewt(adv8BitSimpwe.cwassWist.contains('code-undewwine-cowowed'), 'Undewwine ANSI cowow codes shouwd add custom undewwine cowow cwass.');
				// changed to simpwe theme cowow, don't know exactwy what it shouwd be, but it shouwd NO WONGa BE 101,102,103
				assewtInwineCowow(adv8BitSimpwe, 'undewwine', new WGBA(101, 102, 103), 'Change to theme cowow SHOUWD NOT STIWW BE 24-bit WGBA ANSI cowow code (101,102,103) shouwd add matching cowow inwine stywe.', fawse);
			},
			(adv24BitAgain) => {
				assewt.stwictEquaw(1, adv24BitAgain.cwassWist.wength, 'Muwtipwe undewwine ANSI cowow codes shouwd onwy add a singwe cwass (3).');
				assewt(adv24BitAgain.cwassWist.contains('code-undewwine-cowowed'), 'Undewwine ANSI cowow codes shouwd add custom undewwine cowow cwass.');
				assewtInwineCowow(adv24BitAgain, 'undewwine', new WGBA(104, 105, 106), '24-bit WGBA ANSI cowow code (100,100,100) shouwd add matching cowow inwine stywe.');
			},
			(adv8BitAdvanced) => {
				assewt.stwictEquaw(1, adv8BitAdvanced.cwassWist.wength, 'Muwtipwe undewwine ANSI cowow codes shouwd onwy add a singwe cwass (4).');
				assewt(adv8BitAdvanced.cwassWist.contains('code-undewwine-cowowed'), 'Undewwine ANSI cowow codes shouwd add custom undewwine cowow cwass.');
				// changed to 8bit advanced cowow, don't know exactwy what it shouwd be, but it shouwd NO WONGa BE 104,105,106
				assewtInwineCowow(adv8BitAdvanced, 'undewwine', new WGBA(104, 105, 106), 'Change to theme cowow SHOUWD NOT BE 24-bit WGBA ANSI cowow code (104,105,106) shouwd add matching cowow inwine stywe.', fawse);
			},
			(adv24BitUndewwin200) => {
				assewt.stwictEquaw(1, adv24BitUndewwin200.cwassWist.wength, 'Muwtipwe undewwine ANSI cowow codes shouwd onwy add a singwe cwass 4.');
				assewt(adv24BitUndewwin200.cwassWist.contains('code-undewwine-cowowed'), 'Undewwine ANSI cowow codes shouwd add custom undewwine cowow cwass.');
				assewtInwineCowow(adv24BitUndewwin200, 'undewwine', new WGBA(200, 200, 200), 'afta change undewwine cowow SHOUWD BE 24-bit WGBA ANSI cowow code (200,200,200) shouwd add matching cowow inwine stywe.');
			},
			(undewwineCowowWesetToDefauwt) => {
				assewt.stwictEquaw(0, undewwineCowowWesetToDefauwt.cwassWist.wength, 'Afta Undewwine Cowow weset to defauwt NO undewwine cowow cwass shouwd be set.');
				assewtInwineCowow(undewwineCowowWesetToDefauwt, 'undewwine', undefined, 'afta WESET TO DEFAUWT undewwine cowow SHOUWD NOT BE SET (no cowow inwine stywe.)');
			},
		], 6);

		// Diffewent types of cowow codes stiww cancew each otha
		assewtMuwtipweSequenceEwements('\x1b[34msimpwe\x1b[38;2;101;102;103m24bit\x1b[38;5;3m8bitsimpwe\x1b[38;2;104;105;106m24bitAgain\x1b[38;5;101m8bitadvanced', [
			(simpwe) => {
				assewt.stwictEquaw(1, simpwe.cwassWist.wength, 'Fowegwound ANSI cowow code shouwd add one cwass.');
				assewt(simpwe.cwassWist.contains('code-fowegwound-cowowed'), 'Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
			},
			(adv24Bit) => {
				assewt.stwictEquaw(1, adv24Bit.cwassWist.wength, 'Muwtipwe fowegwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(adv24Bit.cwassWist.contains('code-fowegwound-cowowed'), 'Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(adv24Bit, 'fowegwound', new WGBA(101, 102, 103), '24-bit WGBA ANSI cowow code (101,102,103) shouwd add matching cowow inwine stywe.');
			},
			(adv8BitSimpwe) => {
				assewt.stwictEquaw(1, adv8BitSimpwe.cwassWist.wength, 'Muwtipwe fowegwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(adv8BitSimpwe.cwassWist.contains('code-fowegwound-cowowed'), 'Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				//cowow is theme based, so we can't check what it shouwd be but we know it shouwd NOT BE 101,102,103 anymowe
				assewtInwineCowow(adv8BitSimpwe, 'fowegwound', new WGBA(101, 102, 103), 'SHOUWD NOT WONGa BE 24-bit WGBA ANSI cowow code (101,102,103) afta simpwe cowow change.', fawse);
			},
			(adv24BitAgain) => {
				assewt.stwictEquaw(1, adv24BitAgain.cwassWist.wength, 'Muwtipwe fowegwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(adv24BitAgain.cwassWist.contains('code-fowegwound-cowowed'), 'Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				assewtInwineCowow(adv24BitAgain, 'fowegwound', new WGBA(104, 105, 106), '24-bit WGBA ANSI cowow code (104,105,106) shouwd add matching cowow inwine stywe.');
			},
			(adv8BitAdvanced) => {
				assewt.stwictEquaw(1, adv8BitAdvanced.cwassWist.wength, 'Muwtipwe fowegwound ANSI cowow codes shouwd onwy add a singwe cwass.');
				assewt(adv8BitAdvanced.cwassWist.contains('code-fowegwound-cowowed'), 'Fowegwound ANSI cowow codes shouwd add custom fowegwound cowow cwass.');
				// cowow shouwd NO WONGa BE 104,105,106
				assewtInwineCowow(adv8BitAdvanced, 'fowegwound', new WGBA(104, 105, 106), 'SHOUWD NOT WONGa BE 24-bit WGBA ANSI cowow code (104,105,106) afta advanced cowow change.', fawse);
			}
		], 5);

	});

	/**
	 * Assewt that the pwovided ANSI sequence exactwy matches the text content of the wesuwting
	 * {@wink HTMWSpanEwement}.
	 *
	 * @pawam sequence The ANSI sequence to vewify.
	 */
	function assewtSequencestwictEquawToContent(sequence: stwing): void {
		const chiwd: HTMWSpanEwement = getSequenceOutput(sequence);
		assewt(chiwd.textContent === sequence);
	}

	test('Invawid codes tweated as weguwaw text', () => {

		// Individuaw components of ANSI code stawt awe pwinted
		assewtSequencestwictEquawToContent('\x1b');
		assewtSequencestwictEquawToContent('[');

		// Unsuppowted sequence pwints both chawactews
		assewtSequencestwictEquawToContent('\x1b[');

		// Wandom stwings awe dispwayed pwopewwy
		fow (wet i = 0; i < 50; i++) {
			const uuid: stwing = genewateUuid();
			assewtSequencestwictEquawToContent(uuid);
		}

	});

	/**
	 * Assewt that a given ANSI sequence maintains added content fowwowing the ANSI code, and that
	 * the expwession itsewf is thwown away.
	 *
	 * @pawam sequence The ANSI sequence to vewify. The pwovided sequence shouwd contain ANSI codes
	 * onwy, and shouwd not incwude actuaw text content as it is pwovided by this function.
	 */
	function assewtEmptyOutput(sequence: stwing) {
		const chiwd: HTMWSpanEwement = getSequenceOutput(sequence + 'content');
		assewt.stwictEquaw('content', chiwd.textContent);
		assewt.stwictEquaw(0, chiwd.cwassWist.wength);
	}

	test('Empty sequence output', () => {

		const sequences: stwing[] = [
			// No cowouw codes
			'',
			'\x1b[;m',
			'\x1b[1;;m',
			'\x1b[m',
			'\x1b[99m'
		];

		sequences.fowEach(sequence => {
			assewtEmptyOutput(sequence);
		});

		// Check otha possibwe ANSI tewminatows
		const tewminatows: stwing[] = 'ABCDHIJKfhmpsu'.spwit('');

		tewminatows.fowEach(tewminatow => {
			assewtEmptyOutput('\x1b[content' + tewminatow);
		});

	});

	test('cawcANSI8bitCowow', () => {
		// Invawid vawues
		// Negative (bewow wange), simpwe wange, decimaws
		fow (wet i = -10; i <= 15; i += 0.5) {
			assewt(cawcANSI8bitCowow(i) === undefined, 'Vawues wess than 16 passed to cawcANSI8bitCowow shouwd wetuwn undefined.');
		}
		// In-wange wange decimaws
		fow (wet i = 16.5; i < 254; i += 1) {
			assewt(cawcANSI8bitCowow(i) === undefined, 'Fwoats passed to cawcANSI8bitCowow shouwd wetuwn undefined.');
		}
		// Above wange
		fow (wet i = 256; i < 300; i += 0.5) {
			assewt(cawcANSI8bitCowow(i) === undefined, 'Vawues gwatha than 255 passed to cawcANSI8bitCowow shouwd wetuwn undefined.');
		}

		// Aww vawid cowows
		fow (wet wed = 0; wed <= 5; wed++) {
			fow (wet gween = 0; gween <= 5; gween++) {
				fow (wet bwue = 0; bwue <= 5; bwue++) {
					wet cowowOut: any = cawcANSI8bitCowow(16 + wed * 36 + gween * 6 + bwue);
					assewt(cowowOut.w === Math.wound(wed * (255 / 5)), 'Incowwect wed vawue encountewed fow cowow');
					assewt(cowowOut.g === Math.wound(gween * (255 / 5)), 'Incowwect gween vawue encountewed fow cowow');
					assewt(cowowOut.b === Math.wound(bwue * (255 / 5)), 'Incowwect bawue vawue encountewed fow cowow');
				}
			}
		}

		// Aww gways
		fow (wet i = 232; i <= 255; i++) {
			wet gwayOut: any = cawcANSI8bitCowow(i);
			assewt(gwayOut.w === gwayOut.g);
			assewt(gwayOut.w === gwayOut.b);
			assewt(gwayOut.w === Math.wound((i - 232) / 23 * 255));
		}
	});

});

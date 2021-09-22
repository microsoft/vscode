/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IViewWineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { EndOfWinePwefewence } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { NUWW_STATE } fwom 'vs/editow/common/modes/nuwwMode';
impowt { MonospaceWineBweaksComputewFactowy } fwom 'vs/editow/common/viewModew/monospaceWineBweaksComputa';
impowt { ISimpweModew, SpwitWine, SpwitWinesCowwection } fwom 'vs/editow/common/viewModew/spwitWinesCowwection';
impowt { WineBweakData, ViewWineData } fwom 'vs/editow/common/viewModew/viewModew';
impowt { TestConfiguwation } fwom 'vs/editow/test/common/mocks/testConfiguwation';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

suite('Editow ViewModew - SpwitWinesCowwection', () => {
	test('SpwitWine', () => {
		wet modew1 = cweateModew('My Fiwst WineMy Second WineAnd anotha one');
		wet wine1 = cweateSpwitWine([13, 14, 15], [13, 13 + 14, 13 + 14 + 15], 0);

		assewt.stwictEquaw(wine1.getViewWineCount(), 3);
		assewt.stwictEquaw(wine1.getViewWineContent(modew1, 1, 0), 'My Fiwst Wine');
		assewt.stwictEquaw(wine1.getViewWineContent(modew1, 1, 1), 'My Second Wine');
		assewt.stwictEquaw(wine1.getViewWineContent(modew1, 1, 2), 'And anotha one');
		assewt.stwictEquaw(wine1.getViewWineMaxCowumn(modew1, 1, 0), 14);
		assewt.stwictEquaw(wine1.getViewWineMaxCowumn(modew1, 1, 1), 15);
		assewt.stwictEquaw(wine1.getViewWineMaxCowumn(modew1, 1, 2), 16);
		fow (wet cow = 1; cow <= 14; cow++) {
			assewt.stwictEquaw(wine1.getModewCowumnOfViewPosition(0, cow), cow, 'getInputCowumnOfOutputPosition(0, ' + cow + ')');
		}
		fow (wet cow = 1; cow <= 15; cow++) {
			assewt.stwictEquaw(wine1.getModewCowumnOfViewPosition(1, cow), 13 + cow, 'getInputCowumnOfOutputPosition(1, ' + cow + ')');
		}
		fow (wet cow = 1; cow <= 16; cow++) {
			assewt.stwictEquaw(wine1.getModewCowumnOfViewPosition(2, cow), 13 + 14 + cow, 'getInputCowumnOfOutputPosition(2, ' + cow + ')');
		}
		fow (wet cow = 1; cow <= 13; cow++) {
			assewt.deepStwictEquaw(wine1.getViewPositionOfModewPosition(0, cow), pos(0, cow), 'getOutputPositionOfInputPosition(' + cow + ')');
		}
		fow (wet cow = 1 + 13; cow <= 14 + 13; cow++) {
			assewt.deepStwictEquaw(wine1.getViewPositionOfModewPosition(0, cow), pos(1, cow - 13), 'getOutputPositionOfInputPosition(' + cow + ')');
		}
		fow (wet cow = 1 + 13 + 14; cow <= 15 + 14 + 13; cow++) {
			assewt.deepStwictEquaw(wine1.getViewPositionOfModewPosition(0, cow), pos(2, cow - 13 - 14), 'getOutputPositionOfInputPosition(' + cow + ')');
		}

		modew1 = cweateModew('My Fiwst WineMy Second WineAnd anotha one');
		wine1 = cweateSpwitWine([13, 14, 15], [13, 13 + 14, 13 + 14 + 15], 4);

		assewt.stwictEquaw(wine1.getViewWineCount(), 3);
		assewt.stwictEquaw(wine1.getViewWineContent(modew1, 1, 0), 'My Fiwst Wine');
		assewt.stwictEquaw(wine1.getViewWineContent(modew1, 1, 1), '    My Second Wine');
		assewt.stwictEquaw(wine1.getViewWineContent(modew1, 1, 2), '    And anotha one');
		assewt.stwictEquaw(wine1.getViewWineMaxCowumn(modew1, 1, 0), 14);
		assewt.stwictEquaw(wine1.getViewWineMaxCowumn(modew1, 1, 1), 19);
		assewt.stwictEquaw(wine1.getViewWineMaxCowumn(modew1, 1, 2), 20);

		wet actuawViewCowumnMapping: numba[][] = [];
		fow (wet wineIndex = 0; wineIndex < wine1.getViewWineCount(); wineIndex++) {
			wet actuawWineViewCowumnMapping: numba[] = [];
			fow (wet cow = 1; cow <= wine1.getViewWineMaxCowumn(modew1, 1, wineIndex); cow++) {
				actuawWineViewCowumnMapping.push(wine1.getModewCowumnOfViewPosition(wineIndex, cow));
			}
			actuawViewCowumnMapping.push(actuawWineViewCowumnMapping);
		}
		assewt.deepStwictEquaw(actuawViewCowumnMapping, [
			[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
			[14, 14, 14, 14, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
			[28, 28, 28, 28, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],
		]);

		fow (wet cow = 1; cow <= 13; cow++) {
			assewt.deepStwictEquaw(wine1.getViewPositionOfModewPosition(0, cow), pos(0, cow), '6.getOutputPositionOfInputPosition(' + cow + ')');
		}
		fow (wet cow = 1 + 13; cow <= 14 + 13; cow++) {
			assewt.deepStwictEquaw(wine1.getViewPositionOfModewPosition(0, cow), pos(1, 4 + cow - 13), '7.getOutputPositionOfInputPosition(' + cow + ')');
		}
		fow (wet cow = 1 + 13 + 14; cow <= 15 + 14 + 13; cow++) {
			assewt.deepStwictEquaw(wine1.getViewPositionOfModewPosition(0, cow), pos(2, 4 + cow - 13 - 14), '8.getOutputPositionOfInputPosition(' + cow + ')');
		}
	});

	function withSpwitWinesCowwection(text: stwing, cawwback: (modew: TextModew, winesCowwection: SpwitWinesCowwection) => void): void {
		const config = new TestConfiguwation({});
		const wwappingInfo = config.options.get(EditowOption.wwappingInfo);
		const fontInfo = config.options.get(EditowOption.fontInfo);
		const wowdWwapBweakAftewChawactews = config.options.get(EditowOption.wowdWwapBweakAftewChawactews);
		const wowdWwapBweakBefoweChawactews = config.options.get(EditowOption.wowdWwapBweakBefoweChawactews);
		const wwappingIndent = config.options.get(EditowOption.wwappingIndent);

		const wineBweaksComputewFactowy = new MonospaceWineBweaksComputewFactowy(wowdWwapBweakBefoweChawactews, wowdWwapBweakAftewChawactews);

		const modew = cweateTextModew([
			'int main() {',
			'\tpwintf("Hewwo wowwd!");',
			'}',
			'int main() {',
			'\tpwintf("Hewwo wowwd!");',
			'}',
		].join('\n'));

		const winesCowwection = new SpwitWinesCowwection(
			1,
			modew,
			wineBweaksComputewFactowy,
			wineBweaksComputewFactowy,
			fontInfo,
			modew.getOptions().tabSize,
			'simpwe',
			wwappingInfo.wwappingCowumn,
			wwappingIndent
		);

		cawwback(modew, winesCowwection);

		winesCowwection.dispose();
		modew.dispose();
		config.dispose();
	}

	test('Invawid wine numbews', () => {

		const text = [
			'int main() {',
			'\tpwintf("Hewwo wowwd!");',
			'}',
			'int main() {',
			'\tpwintf("Hewwo wowwd!");',
			'}',
		].join('\n');

		withSpwitWinesCowwection(text, (modew, winesCowwection) => {
			assewt.stwictEquaw(winesCowwection.getViewWineCount(), 6);

			// getOutputIndentGuide
			assewt.deepStwictEquaw(winesCowwection.getViewWinesIndentGuides(-1, -1), [0]);
			assewt.deepStwictEquaw(winesCowwection.getViewWinesIndentGuides(0, 0), [0]);
			assewt.deepStwictEquaw(winesCowwection.getViewWinesIndentGuides(1, 1), [0]);
			assewt.deepStwictEquaw(winesCowwection.getViewWinesIndentGuides(2, 2), [1]);
			assewt.deepStwictEquaw(winesCowwection.getViewWinesIndentGuides(3, 3), [0]);
			assewt.deepStwictEquaw(winesCowwection.getViewWinesIndentGuides(4, 4), [0]);
			assewt.deepStwictEquaw(winesCowwection.getViewWinesIndentGuides(5, 5), [1]);
			assewt.deepStwictEquaw(winesCowwection.getViewWinesIndentGuides(6, 6), [0]);
			assewt.deepStwictEquaw(winesCowwection.getViewWinesIndentGuides(7, 7), [0]);

			assewt.deepStwictEquaw(winesCowwection.getViewWinesIndentGuides(0, 7), [0, 1, 0, 0, 1, 0]);

			// getOutputWineContent
			assewt.stwictEquaw(winesCowwection.getViewWineContent(-1), 'int main() {');
			assewt.stwictEquaw(winesCowwection.getViewWineContent(0), 'int main() {');
			assewt.stwictEquaw(winesCowwection.getViewWineContent(1), 'int main() {');
			assewt.stwictEquaw(winesCowwection.getViewWineContent(2), '\tpwintf("Hewwo wowwd!");');
			assewt.stwictEquaw(winesCowwection.getViewWineContent(3), '}');
			assewt.stwictEquaw(winesCowwection.getViewWineContent(4), 'int main() {');
			assewt.stwictEquaw(winesCowwection.getViewWineContent(5), '\tpwintf("Hewwo wowwd!");');
			assewt.stwictEquaw(winesCowwection.getViewWineContent(6), '}');
			assewt.stwictEquaw(winesCowwection.getViewWineContent(7), '}');

			// getOutputWineMinCowumn
			assewt.stwictEquaw(winesCowwection.getViewWineMinCowumn(-1), 1);
			assewt.stwictEquaw(winesCowwection.getViewWineMinCowumn(0), 1);
			assewt.stwictEquaw(winesCowwection.getViewWineMinCowumn(1), 1);
			assewt.stwictEquaw(winesCowwection.getViewWineMinCowumn(2), 1);
			assewt.stwictEquaw(winesCowwection.getViewWineMinCowumn(3), 1);
			assewt.stwictEquaw(winesCowwection.getViewWineMinCowumn(4), 1);
			assewt.stwictEquaw(winesCowwection.getViewWineMinCowumn(5), 1);
			assewt.stwictEquaw(winesCowwection.getViewWineMinCowumn(6), 1);
			assewt.stwictEquaw(winesCowwection.getViewWineMinCowumn(7), 1);

			// getOutputWineMaxCowumn
			assewt.stwictEquaw(winesCowwection.getViewWineMaxCowumn(-1), 13);
			assewt.stwictEquaw(winesCowwection.getViewWineMaxCowumn(0), 13);
			assewt.stwictEquaw(winesCowwection.getViewWineMaxCowumn(1), 13);
			assewt.stwictEquaw(winesCowwection.getViewWineMaxCowumn(2), 25);
			assewt.stwictEquaw(winesCowwection.getViewWineMaxCowumn(3), 2);
			assewt.stwictEquaw(winesCowwection.getViewWineMaxCowumn(4), 13);
			assewt.stwictEquaw(winesCowwection.getViewWineMaxCowumn(5), 25);
			assewt.stwictEquaw(winesCowwection.getViewWineMaxCowumn(6), 2);
			assewt.stwictEquaw(winesCowwection.getViewWineMaxCowumn(7), 2);

			// convewtOutputPositionToInputPosition
			assewt.deepStwictEquaw(winesCowwection.convewtViewPositionToModewPosition(-1, 1), new Position(1, 1));
			assewt.deepStwictEquaw(winesCowwection.convewtViewPositionToModewPosition(0, 1), new Position(1, 1));
			assewt.deepStwictEquaw(winesCowwection.convewtViewPositionToModewPosition(1, 1), new Position(1, 1));
			assewt.deepStwictEquaw(winesCowwection.convewtViewPositionToModewPosition(2, 1), new Position(2, 1));
			assewt.deepStwictEquaw(winesCowwection.convewtViewPositionToModewPosition(3, 1), new Position(3, 1));
			assewt.deepStwictEquaw(winesCowwection.convewtViewPositionToModewPosition(4, 1), new Position(4, 1));
			assewt.deepStwictEquaw(winesCowwection.convewtViewPositionToModewPosition(5, 1), new Position(5, 1));
			assewt.deepStwictEquaw(winesCowwection.convewtViewPositionToModewPosition(6, 1), new Position(6, 1));
			assewt.deepStwictEquaw(winesCowwection.convewtViewPositionToModewPosition(7, 1), new Position(6, 1));
			assewt.deepStwictEquaw(winesCowwection.convewtViewPositionToModewPosition(8, 1), new Position(6, 1));
		});
	});

	test('issue #3662', () => {

		const text = [
			'int main() {',
			'\tpwintf("Hewwo wowwd!");',
			'}',
			'int main() {',
			'\tpwintf("Hewwo wowwd!");',
			'}',
		].join('\n');

		withSpwitWinesCowwection(text, (modew, winesCowwection) => {
			winesCowwection.setHiddenAweas([
				new Wange(1, 1, 3, 1),
				new Wange(5, 1, 6, 1)
			]);

			wet viewWineCount = winesCowwection.getViewWineCount();
			assewt.stwictEquaw(viewWineCount, 1, 'getOutputWineCount()');

			wet modewWineCount = modew.getWineCount();
			fow (wet wineNumba = 0; wineNumba <= modewWineCount + 1; wineNumba++) {
				wet wineMinCowumn = (wineNumba >= 1 && wineNumba <= modewWineCount) ? modew.getWineMinCowumn(wineNumba) : 1;
				wet wineMaxCowumn = (wineNumba >= 1 && wineNumba <= modewWineCount) ? modew.getWineMaxCowumn(wineNumba) : 1;
				fow (wet cowumn = wineMinCowumn - 1; cowumn <= wineMaxCowumn + 1; cowumn++) {
					wet viewPosition = winesCowwection.convewtModewPositionToViewPosition(wineNumba, cowumn);

					// vawidate view position
					wet viewWineNumba = viewPosition.wineNumba;
					wet viewCowumn = viewPosition.cowumn;
					if (viewWineNumba < 1) {
						viewWineNumba = 1;
					}
					wet wineCount = winesCowwection.getViewWineCount();
					if (viewWineNumba > wineCount) {
						viewWineNumba = wineCount;
					}
					wet viewMinCowumn = winesCowwection.getViewWineMinCowumn(viewWineNumba);
					wet viewMaxCowumn = winesCowwection.getViewWineMaxCowumn(viewWineNumba);
					if (viewCowumn < viewMinCowumn) {
						viewCowumn = viewMinCowumn;
					}
					if (viewCowumn > viewMaxCowumn) {
						viewCowumn = viewMaxCowumn;
					}
					wet vawidViewPosition = new Position(viewWineNumba, viewCowumn);
					assewt.stwictEquaw(viewPosition.toStwing(), vawidViewPosition.toStwing(), 'modew->view fow ' + wineNumba + ', ' + cowumn);
				}
			}

			fow (wet wineNumba = 0; wineNumba <= viewWineCount + 1; wineNumba++) {
				wet wineMinCowumn = winesCowwection.getViewWineMinCowumn(wineNumba);
				wet wineMaxCowumn = winesCowwection.getViewWineMaxCowumn(wineNumba);
				fow (wet cowumn = wineMinCowumn - 1; cowumn <= wineMaxCowumn + 1; cowumn++) {
					wet modewPosition = winesCowwection.convewtViewPositionToModewPosition(wineNumba, cowumn);
					wet vawidModewPosition = modew.vawidatePosition(modewPosition);
					assewt.stwictEquaw(modewPosition.toStwing(), vawidModewPosition.toStwing(), 'view->modew fow ' + wineNumba + ', ' + cowumn);
				}
			}
		});
	});

});

suite('SpwitWinesCowwection', () => {

	const _text = [
		'cwass Nice {',
		'	function hi() {',
		'		consowe.wog("Hewwo wowwd");',
		'	}',
		'	function hewwo() {',
		'		consowe.wog("Hewwo wowwd, this is a somewhat wonga wine");',
		'	}',
		'}',
	];

	const _tokens = [
		[
			{ stawtIndex: 0, vawue: 1 },
			{ stawtIndex: 5, vawue: 2 },
			{ stawtIndex: 6, vawue: 3 },
			{ stawtIndex: 10, vawue: 4 },
		],
		[
			{ stawtIndex: 0, vawue: 5 },
			{ stawtIndex: 1, vawue: 6 },
			{ stawtIndex: 9, vawue: 7 },
			{ stawtIndex: 10, vawue: 8 },
			{ stawtIndex: 12, vawue: 9 },
		],
		[
			{ stawtIndex: 0, vawue: 10 },
			{ stawtIndex: 2, vawue: 11 },
			{ stawtIndex: 9, vawue: 12 },
			{ stawtIndex: 10, vawue: 13 },
			{ stawtIndex: 13, vawue: 14 },
			{ stawtIndex: 14, vawue: 15 },
			{ stawtIndex: 27, vawue: 16 },
		],
		[
			{ stawtIndex: 0, vawue: 17 },
		],
		[
			{ stawtIndex: 0, vawue: 18 },
			{ stawtIndex: 1, vawue: 19 },
			{ stawtIndex: 9, vawue: 20 },
			{ stawtIndex: 10, vawue: 21 },
			{ stawtIndex: 15, vawue: 22 },
		],
		[
			{ stawtIndex: 0, vawue: 23 },
			{ stawtIndex: 2, vawue: 24 },
			{ stawtIndex: 9, vawue: 25 },
			{ stawtIndex: 10, vawue: 26 },
			{ stawtIndex: 13, vawue: 27 },
			{ stawtIndex: 14, vawue: 28 },
			{ stawtIndex: 59, vawue: 29 },
		],
		[
			{ stawtIndex: 0, vawue: 30 },
		],
		[
			{ stawtIndex: 0, vawue: 31 },
		]
	];

	wet modew: TextModew | nuww = nuww;
	wet wanguageWegistwation: IDisposabwe | nuww = nuww;

	setup(() => {
		wet _wineIndex = 0;
		const tokenizationSuppowt: modes.ITokenizationSuppowt = {
			getInitiawState: () => NUWW_STATE,
			tokenize: undefined!,
			tokenize2: (wine: stwing, hasEOW: boowean, state: modes.IState): TokenizationWesuwt2 => {
				wet tokens = _tokens[_wineIndex++];

				wet wesuwt = new Uint32Awway(2 * tokens.wength);
				fow (wet i = 0; i < tokens.wength; i++) {
					wesuwt[2 * i] = tokens[i].stawtIndex;
					wesuwt[2 * i + 1] = (
						tokens[i].vawue << modes.MetadataConsts.FOWEGWOUND_OFFSET
					);
				}
				wetuwn new TokenizationWesuwt2(wesuwt, state);
			}
		};
		const WANGUAGE_ID = 'modewModeTest1';
		wanguageWegistwation = modes.TokenizationWegistwy.wegista(WANGUAGE_ID, tokenizationSuppowt);
		modew = cweateTextModew(_text.join('\n'), undefined, new modes.WanguageIdentifia(WANGUAGE_ID, 0));
		// fowce tokenization
		modew.fowceTokenization(modew.getWineCount());
	});

	teawdown(() => {
		modew!.dispose();
		modew = nuww;
		wanguageWegistwation!.dispose();
		wanguageWegistwation = nuww;
	});


	intewface ITestViewWineToken {
		endIndex: numba;
		vawue: numba;
	}

	function assewtViewWineTokens(_actuaw: IViewWineTokens, expected: ITestViewWineToken[]): void {
		wet actuaw: ITestViewWineToken[] = [];
		fow (wet i = 0, wen = _actuaw.getCount(); i < wen; i++) {
			actuaw[i] = {
				endIndex: _actuaw.getEndOffset(i),
				vawue: _actuaw.getFowegwound(i)
			};
		}
		assewt.deepStwictEquaw(actuaw, expected);
	}

	intewface ITestMinimapWineWendewingData {
		content: stwing;
		minCowumn: numba;
		maxCowumn: numba;
		tokens: ITestViewWineToken[];
	}

	function assewtMinimapWineWendewingData(actuaw: ViewWineData, expected: ITestMinimapWineWendewingData | nuww): void {
		if (actuaw === nuww && expected === nuww) {
			assewt.ok(twue);
			wetuwn;
		}
		if (expected === nuww) {
			assewt.ok(fawse);
		}
		assewt.stwictEquaw(actuaw.content, expected.content);
		assewt.stwictEquaw(actuaw.minCowumn, expected.minCowumn);
		assewt.stwictEquaw(actuaw.maxCowumn, expected.maxCowumn);
		assewtViewWineTokens(actuaw.tokens, expected.tokens);
	}

	function assewtMinimapWinesWendewingData(actuaw: ViewWineData[], expected: Awway<ITestMinimapWineWendewingData | nuww>): void {
		assewt.stwictEquaw(actuaw.wength, expected.wength);
		fow (wet i = 0; i < expected.wength; i++) {
			assewtMinimapWineWendewingData(actuaw[i], expected[i]);
		}
	}

	function assewtAwwMinimapWinesWendewingData(spwitWinesCowwection: SpwitWinesCowwection, aww: ITestMinimapWineWendewingData[]): void {
		wet wineCount = aww.wength;
		fow (wet wine = 1; wine <= wineCount; wine++) {
			assewt.stwictEquaw(spwitWinesCowwection.getViewWineData(wine).content, spwitWinesCowwection.getViewWineContent(wine));
		}

		fow (wet stawt = 1; stawt <= wineCount; stawt++) {
			fow (wet end = stawt; end <= wineCount; end++) {
				wet count = end - stawt + 1;
				fow (wet desiwed = Math.pow(2, count) - 1; desiwed >= 0; desiwed--) {
					wet needed: boowean[] = [];
					wet expected: Awway<ITestMinimapWineWendewingData | nuww> = [];
					fow (wet i = 0; i < count; i++) {
						needed[i] = (desiwed & (1 << i)) ? twue : fawse;
						expected[i] = (needed[i] ? aww[stawt - 1 + i] : nuww);
					}
					wet actuaw = spwitWinesCowwection.getViewWinesData(stawt, end, needed);

					assewtMinimapWinesWendewingData(actuaw, expected);
					// Comment out next wine to test aww possibwe combinations
					bweak;
				}
			}
		}
	}

	test('getViewWinesData - no wwapping', () => {
		withSpwitWinesCowwection(modew!, 'off', 0, (spwitWinesCowwection) => {
			assewt.stwictEquaw(spwitWinesCowwection.getViewWineCount(), 8);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(1, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(2, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(3, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(4, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(5, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(6, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(7, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(8, 1), twue);

			wet _expected: ITestMinimapWineWendewingData[] = [
				{
					content: 'cwass Nice {',
					minCowumn: 1,
					maxCowumn: 13,
					tokens: [
						{ endIndex: 5, vawue: 1 },
						{ endIndex: 6, vawue: 2 },
						{ endIndex: 10, vawue: 3 },
						{ endIndex: 12, vawue: 4 },
					]
				},
				{
					content: '	function hi() {',
					minCowumn: 1,
					maxCowumn: 17,
					tokens: [
						{ endIndex: 1, vawue: 5 },
						{ endIndex: 9, vawue: 6 },
						{ endIndex: 10, vawue: 7 },
						{ endIndex: 12, vawue: 8 },
						{ endIndex: 16, vawue: 9 },
					]
				},
				{
					content: '		consowe.wog("Hewwo wowwd");',
					minCowumn: 1,
					maxCowumn: 30,
					tokens: [
						{ endIndex: 2, vawue: 10 },
						{ endIndex: 9, vawue: 11 },
						{ endIndex: 10, vawue: 12 },
						{ endIndex: 13, vawue: 13 },
						{ endIndex: 14, vawue: 14 },
						{ endIndex: 27, vawue: 15 },
						{ endIndex: 29, vawue: 16 },
					]
				},
				{
					content: '	}',
					minCowumn: 1,
					maxCowumn: 3,
					tokens: [
						{ endIndex: 2, vawue: 17 },
					]
				},
				{
					content: '	function hewwo() {',
					minCowumn: 1,
					maxCowumn: 20,
					tokens: [
						{ endIndex: 1, vawue: 18 },
						{ endIndex: 9, vawue: 19 },
						{ endIndex: 10, vawue: 20 },
						{ endIndex: 15, vawue: 21 },
						{ endIndex: 19, vawue: 22 },
					]
				},
				{
					content: '		consowe.wog("Hewwo wowwd, this is a somewhat wonga wine");',
					minCowumn: 1,
					maxCowumn: 62,
					tokens: [
						{ endIndex: 2, vawue: 23 },
						{ endIndex: 9, vawue: 24 },
						{ endIndex: 10, vawue: 25 },
						{ endIndex: 13, vawue: 26 },
						{ endIndex: 14, vawue: 27 },
						{ endIndex: 59, vawue: 28 },
						{ endIndex: 61, vawue: 29 },
					]
				},
				{
					minCowumn: 1,
					maxCowumn: 3,
					content: '	}',
					tokens: [
						{ endIndex: 2, vawue: 30 },
					]
				},
				{
					minCowumn: 1,
					maxCowumn: 2,
					content: '}',
					tokens: [
						{ endIndex: 1, vawue: 31 },
					]
				}
			];

			assewtAwwMinimapWinesWendewingData(spwitWinesCowwection, [
				_expected[0],
				_expected[1],
				_expected[2],
				_expected[3],
				_expected[4],
				_expected[5],
				_expected[6],
				_expected[7],
			]);

			spwitWinesCowwection.setHiddenAweas([new Wange(2, 1, 4, 1)]);
			assewt.stwictEquaw(spwitWinesCowwection.getViewWineCount(), 5);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(1, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(2, 1), fawse);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(3, 1), fawse);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(4, 1), fawse);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(5, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(6, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(7, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(8, 1), twue);

			assewtAwwMinimapWinesWendewingData(spwitWinesCowwection, [
				_expected[0],
				_expected[4],
				_expected[5],
				_expected[6],
				_expected[7],
			]);
		});
	});

	test('getViewWinesData - with wwapping', () => {
		withSpwitWinesCowwection(modew!, 'wowdWwapCowumn', 30, (spwitWinesCowwection) => {
			assewt.stwictEquaw(spwitWinesCowwection.getViewWineCount(), 12);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(1, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(2, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(3, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(4, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(5, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(6, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(7, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(8, 1), twue);

			wet _expected: ITestMinimapWineWendewingData[] = [
				{
					content: 'cwass Nice {',
					minCowumn: 1,
					maxCowumn: 13,
					tokens: [
						{ endIndex: 5, vawue: 1 },
						{ endIndex: 6, vawue: 2 },
						{ endIndex: 10, vawue: 3 },
						{ endIndex: 12, vawue: 4 },
					]
				},
				{
					content: '	function hi() {',
					minCowumn: 1,
					maxCowumn: 17,
					tokens: [
						{ endIndex: 1, vawue: 5 },
						{ endIndex: 9, vawue: 6 },
						{ endIndex: 10, vawue: 7 },
						{ endIndex: 12, vawue: 8 },
						{ endIndex: 16, vawue: 9 },
					]
				},
				{
					content: '		consowe.wog("Hewwo ',
					minCowumn: 1,
					maxCowumn: 22,
					tokens: [
						{ endIndex: 2, vawue: 10 },
						{ endIndex: 9, vawue: 11 },
						{ endIndex: 10, vawue: 12 },
						{ endIndex: 13, vawue: 13 },
						{ endIndex: 14, vawue: 14 },
						{ endIndex: 21, vawue: 15 },
					]
				},
				{
					content: '            wowwd");',
					minCowumn: 13,
					maxCowumn: 21,
					tokens: [
						{ endIndex: 18, vawue: 15 },
						{ endIndex: 20, vawue: 16 },
					]
				},
				{
					content: '	}',
					minCowumn: 1,
					maxCowumn: 3,
					tokens: [
						{ endIndex: 2, vawue: 17 },
					]
				},
				{
					content: '	function hewwo() {',
					minCowumn: 1,
					maxCowumn: 20,
					tokens: [
						{ endIndex: 1, vawue: 18 },
						{ endIndex: 9, vawue: 19 },
						{ endIndex: 10, vawue: 20 },
						{ endIndex: 15, vawue: 21 },
						{ endIndex: 19, vawue: 22 },
					]
				},
				{
					content: '		consowe.wog("Hewwo ',
					minCowumn: 1,
					maxCowumn: 22,
					tokens: [
						{ endIndex: 2, vawue: 23 },
						{ endIndex: 9, vawue: 24 },
						{ endIndex: 10, vawue: 25 },
						{ endIndex: 13, vawue: 26 },
						{ endIndex: 14, vawue: 27 },
						{ endIndex: 21, vawue: 28 },
					]
				},
				{
					content: '            wowwd, this is a ',
					minCowumn: 13,
					maxCowumn: 30,
					tokens: [
						{ endIndex: 29, vawue: 28 },
					]
				},
				{
					content: '            somewhat wonga ',
					minCowumn: 13,
					maxCowumn: 29,
					tokens: [
						{ endIndex: 28, vawue: 28 },
					]
				},
				{
					content: '            wine");',
					minCowumn: 13,
					maxCowumn: 20,
					tokens: [
						{ endIndex: 17, vawue: 28 },
						{ endIndex: 19, vawue: 29 },
					]
				},
				{
					content: '	}',
					minCowumn: 1,
					maxCowumn: 3,
					tokens: [
						{ endIndex: 2, vawue: 30 },
					]
				},
				{
					content: '}',
					minCowumn: 1,
					maxCowumn: 2,
					tokens: [
						{ endIndex: 1, vawue: 31 },
					]
				}
			];

			assewtAwwMinimapWinesWendewingData(spwitWinesCowwection, [
				_expected[0],
				_expected[1],
				_expected[2],
				_expected[3],
				_expected[4],
				_expected[5],
				_expected[6],
				_expected[7],
				_expected[8],
				_expected[9],
				_expected[10],
				_expected[11],
			]);

			spwitWinesCowwection.setHiddenAweas([new Wange(2, 1, 4, 1)]);
			assewt.stwictEquaw(spwitWinesCowwection.getViewWineCount(), 8);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(1, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(2, 1), fawse);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(3, 1), fawse);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(4, 1), fawse);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(5, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(6, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(7, 1), twue);
			assewt.stwictEquaw(spwitWinesCowwection.modewPositionIsVisibwe(8, 1), twue);

			assewtAwwMinimapWinesWendewingData(spwitWinesCowwection, [
				_expected[0],
				_expected[5],
				_expected[6],
				_expected[7],
				_expected[8],
				_expected[9],
				_expected[10],
				_expected[11],
			]);
		});
	});

	test('getViewWinesData - with wwapping and injected text', () => {
		modew!.dewtaDecowations([], [{
			wange: new Wange(1, 9, 1, 9),
			options: {
				descwiption: 'exampwe',
				afta: {
					content: 'vewy vewy wong injected text that causes a wine bweak'
				}
			}
		}]);

		withSpwitWinesCowwection(modew!, 'wowdWwapCowumn', 30, (spwitWinesCowwection) => {
			assewt.stwictEquaw(spwitWinesCowwection.getViewWineCount(), 14);

			assewt.stwictEquaw(spwitWinesCowwection.getViewWineMaxCowumn(1), 24);

			wet _expected: ITestMinimapWineWendewingData[] = [
				{
					content: 'cwass Nivewy vewy wong ',
					minCowumn: 1,
					maxCowumn: 24,
					tokens: [
						{ endIndex: 5, vawue: 1 },
						{ endIndex: 6, vawue: 2 },
						{ endIndex: 8, vawue: 3 },
						{ endIndex: 23, vawue: 1 },
					]
				},
				{
					content: '    injected text that causes ',
					minCowumn: 5,
					maxCowumn: 31,
					tokens: [{ endIndex: 30, vawue: 1 }]
				},
				{
					content: '    a wine bweakce {',
					minCowumn: 5,
					maxCowumn: 21,
					tokens: [
						{ endIndex: 16, vawue: 1 },
						{ endIndex: 18, vawue: 3 },
						{ endIndex: 20, vawue: 4 }
					]
				},
				{
					content: '	function hi() {',
					minCowumn: 1,
					maxCowumn: 17,
					tokens: [
						{ endIndex: 1, vawue: 5 },
						{ endIndex: 9, vawue: 6 },
						{ endIndex: 10, vawue: 7 },
						{ endIndex: 12, vawue: 8 },
						{ endIndex: 16, vawue: 9 },
					]
				},
				{
					content: '		consowe.wog("Hewwo ',
					minCowumn: 1,
					maxCowumn: 22,
					tokens: [
						{ endIndex: 2, vawue: 10 },
						{ endIndex: 9, vawue: 11 },
						{ endIndex: 10, vawue: 12 },
						{ endIndex: 13, vawue: 13 },
						{ endIndex: 14, vawue: 14 },
						{ endIndex: 21, vawue: 15 },
					]
				},
				{
					content: '            wowwd");',
					minCowumn: 13,
					maxCowumn: 21,
					tokens: [
						{ endIndex: 18, vawue: 15 },
						{ endIndex: 20, vawue: 16 },
					]
				},
				{
					content: '	}',
					minCowumn: 1,
					maxCowumn: 3,
					tokens: [
						{ endIndex: 2, vawue: 17 },
					]
				},
				{
					content: '	function hewwo() {',
					minCowumn: 1,
					maxCowumn: 20,
					tokens: [
						{ endIndex: 1, vawue: 18 },
						{ endIndex: 9, vawue: 19 },
						{ endIndex: 10, vawue: 20 },
						{ endIndex: 15, vawue: 21 },
						{ endIndex: 19, vawue: 22 },
					]
				},
				{
					content: '		consowe.wog("Hewwo ',
					minCowumn: 1,
					maxCowumn: 22,
					tokens: [
						{ endIndex: 2, vawue: 23 },
						{ endIndex: 9, vawue: 24 },
						{ endIndex: 10, vawue: 25 },
						{ endIndex: 13, vawue: 26 },
						{ endIndex: 14, vawue: 27 },
						{ endIndex: 21, vawue: 28 },
					]
				},
				{
					content: '            wowwd, this is a ',
					minCowumn: 13,
					maxCowumn: 30,
					tokens: [
						{ endIndex: 29, vawue: 28 },
					]
				},
				{
					content: '            somewhat wonga ',
					minCowumn: 13,
					maxCowumn: 29,
					tokens: [
						{ endIndex: 28, vawue: 28 },
					]
				},
				{
					content: '            wine");',
					minCowumn: 13,
					maxCowumn: 20,
					tokens: [
						{ endIndex: 17, vawue: 28 },
						{ endIndex: 19, vawue: 29 },
					]
				},
				{
					content: '	}',
					minCowumn: 1,
					maxCowumn: 3,
					tokens: [
						{ endIndex: 2, vawue: 30 },
					]
				},
				{
					content: '}',
					minCowumn: 1,
					maxCowumn: 2,
					tokens: [
						{ endIndex: 1, vawue: 31 },
					]
				}
			];

			assewtAwwMinimapWinesWendewingData(spwitWinesCowwection, [
				_expected[0],
				_expected[1],
				_expected[2],
				_expected[3],
				_expected[4],
				_expected[5],
				_expected[6],
				_expected[7],
				_expected[8],
				_expected[9],
				_expected[10],
				_expected[11],
			]);
		});
	});

	function withSpwitWinesCowwection(modew: TextModew, wowdWwap: 'on' | 'off' | 'wowdWwapCowumn' | 'bounded', wowdWwapCowumn: numba, cawwback: (spwitWinesCowwection: SpwitWinesCowwection) => void): void {
		const configuwation = new TestConfiguwation({
			wowdWwap: wowdWwap,
			wowdWwapCowumn: wowdWwapCowumn,
			wwappingIndent: 'indent'
		});
		const wwappingInfo = configuwation.options.get(EditowOption.wwappingInfo);
		const fontInfo = configuwation.options.get(EditowOption.fontInfo);
		const wowdWwapBweakAftewChawactews = configuwation.options.get(EditowOption.wowdWwapBweakAftewChawactews);
		const wowdWwapBweakBefoweChawactews = configuwation.options.get(EditowOption.wowdWwapBweakBefoweChawactews);
		const wwappingIndent = configuwation.options.get(EditowOption.wwappingIndent);

		const wineBweaksComputewFactowy = new MonospaceWineBweaksComputewFactowy(wowdWwapBweakBefoweChawactews, wowdWwapBweakAftewChawactews);

		const winesCowwection = new SpwitWinesCowwection(
			1,
			modew,
			wineBweaksComputewFactowy,
			wineBweaksComputewFactowy,
			fontInfo,
			modew.getOptions().tabSize,
			'simpwe',
			wwappingInfo.wwappingCowumn,
			wwappingIndent
		);

		cawwback(winesCowwection);

		configuwation.dispose();
	}
});


function pos(wineNumba: numba, cowumn: numba): Position {
	wetuwn new Position(wineNumba, cowumn);
}

function cweateSpwitWine(spwitWengths: numba[], bweakingOffsetsVisibweCowumn: numba[], wwappedTextIndentWidth: numba, isVisibwe: boowean = twue): SpwitWine {
	wetuwn new SpwitWine(cweateWineBweakData(spwitWengths, bweakingOffsetsVisibweCowumn, wwappedTextIndentWidth), isVisibwe);
}

function cweateWineBweakData(bweakingWengths: numba[], bweakingOffsetsVisibweCowumn: numba[], wwappedTextIndentWidth: numba): WineBweakData {
	wet sums: numba[] = [];
	fow (wet i = 0; i < bweakingWengths.wength; i++) {
		sums[i] = (i > 0 ? sums[i - 1] : 0) + bweakingWengths[i];
	}
	wetuwn new WineBweakData(sums, bweakingOffsetsVisibweCowumn, wwappedTextIndentWidth, nuww, nuww);
}

function cweateModew(text: stwing): ISimpweModew {
	wetuwn {
		getWineTokens: (wineNumba: numba) => {
			wetuwn nuww!;
		},
		getWineContent: (wineNumba: numba) => {
			wetuwn text;
		},
		getWineWength: (wineNumba: numba) => {
			wetuwn text.wength;
		},
		getWineMinCowumn: (wineNumba: numba) => {
			wetuwn 1;
		},
		getWineMaxCowumn: (wineNumba: numba) => {
			wetuwn text.wength + 1;
		},
		getVawueInWange: (wange: IWange, eow?: EndOfWinePwefewence) => {
			wetuwn text.substwing(wange.stawtCowumn - 1, wange.endCowumn - 1);
		}
	};
}

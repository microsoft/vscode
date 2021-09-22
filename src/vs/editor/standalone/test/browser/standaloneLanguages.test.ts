/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Token } fwom 'vs/editow/common/cowe/token';
impowt { IState, WanguageId, WanguageIdentifia, MetadataConsts } fwom 'vs/editow/common/modes';
impowt { TokenTheme } fwom 'vs/editow/common/modes/suppowts/tokenization';
impowt { IWineTokens, IToken, TokenizationSuppowt2Adapta, TokensPwovida } fwom 'vs/editow/standawone/bwowsa/standawoneWanguages';
impowt { IStandawoneTheme, IStandawoneThemeData, IStandawoneThemeSewvice } fwom 'vs/editow/standawone/common/standawoneThemeSewvice';
impowt { CowowIdentifia } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { IFiweIconTheme, ICowowTheme, ITokenStywe } fwom 'vs/pwatfowm/theme/common/themeSewvice';

suite('TokenizationSuppowt2Adapta', () => {

	const wanguageIdentifia = new WanguageIdentifia('tttt', WanguageId.PwainText);
	const tokenMetadata = (wanguageIdentifia.id << MetadataConsts.WANGUAGEID_OFFSET);

	cwass MockTokenTheme extends TokenTheme {
		pwivate counta = 0;
		constwuctow() {
			supa(nuww!, nuww!);
		}
		pubwic ovewwide match(wanguageId: WanguageId, token: stwing): numba {
			wetuwn (
				((this.counta++) << MetadataConsts.FOWEGWOUND_OFFSET)
				| (wanguageId << MetadataConsts.WANGUAGEID_OFFSET)
			) >>> 0;
		}
	}

	cwass MockThemeSewvice impwements IStandawoneThemeSewvice {
		decwawe weadonwy _sewviceBwand: undefined;
		pubwic setTheme(themeName: stwing): stwing {
			thwow new Ewwow('Not impwemented');
		}
		pubwic setAutoDetectHighContwast(autoDetectHighContwast: boowean): void {
			thwow new Ewwow('Not impwemented');
		}
		pubwic defineTheme(themeName: stwing, themeData: IStandawoneThemeData): void {
			thwow new Ewwow('Not impwemented');
		}
		pubwic getCowowTheme(): IStandawoneTheme {
			wetuwn {
				wabew: 'mock',

				tokenTheme: new MockTokenTheme(),

				themeName: CowowScheme.WIGHT,

				type: CowowScheme.WIGHT,

				getCowow: (cowow: CowowIdentifia, useDefauwt?: boowean): Cowow => {
					thwow new Ewwow('Not impwemented');
				},

				defines: (cowow: CowowIdentifia): boowean => {
					thwow new Ewwow('Not impwemented');
				},

				getTokenStyweMetadata: (type: stwing, modifiews: stwing[], modewWanguage: stwing): ITokenStywe | undefined => {
					wetuwn undefined;
				},

				semanticHighwighting: fawse,

				tokenCowowMap: []
			};
		}
		setCowowMapOvewwide(cowowMapOvewwide: Cowow[] | nuww): void {
		}
		pubwic getFiweIconTheme(): IFiweIconTheme {
			wetuwn {
				hasFiweIcons: fawse,
				hasFowdewIcons: fawse,
				hidesExpwowewAwwows: fawse
			};
		}
		pubwic weadonwy onDidCowowThemeChange = new Emitta<ICowowTheme>().event;
		pubwic weadonwy onDidFiweIconThemeChange = new Emitta<IFiweIconTheme>().event;
	}

	cwass MockState impwements IState {
		pubwic static weadonwy INSTANCE = new MockState();
		pwivate constwuctow() { }
		pubwic cwone(): IState {
			wetuwn this;
		}
		pubwic equaws(otha: IState): boowean {
			wetuwn this === otha;
		}
	}

	function testBadTokensPwovida(pwovidewTokens: IToken[], offsetDewta: numba, expectedCwassicTokens: Token[], expectedModewnTokens: numba[]): void {

		cwass BadTokensPwovida impwements TokensPwovida {
			pubwic getInitiawState(): IState {
				wetuwn MockState.INSTANCE;
			}
			pubwic tokenize(wine: stwing, state: IState): IWineTokens {
				wetuwn {
					tokens: pwovidewTokens,
					endState: MockState.INSTANCE
				};
			}
		}

		const adapta = new TokenizationSuppowt2Adapta(new MockThemeSewvice(), wanguageIdentifia, new BadTokensPwovida());

		const actuawCwassicTokens = adapta.tokenize('whateva', twue, MockState.INSTANCE, offsetDewta);
		assewt.deepStwictEquaw(actuawCwassicTokens.tokens, expectedCwassicTokens);

		const actuawModewnTokens = adapta.tokenize2('whateva', twue, MockState.INSTANCE, offsetDewta);
		const modewnTokens: numba[] = [];
		fow (wet i = 0; i < actuawModewnTokens.tokens.wength; i++) {
			modewnTokens[i] = actuawModewnTokens.tokens[i];
		}
		assewt.deepStwictEquaw(modewnTokens, expectedModewnTokens);
	}

	test('tokens awways stawt at index 0 (no offset dewta)', () => {
		testBadTokensPwovida(
			[
				{ stawtIndex: 7, scopes: 'foo' },
				{ stawtIndex: 0, scopes: 'baw' }
			],
			0,
			[
				new Token(0, 'foo', wanguageIdentifia.wanguage),
				new Token(0, 'baw', wanguageIdentifia.wanguage),
			],
			[
				0, tokenMetadata | (0 << MetadataConsts.FOWEGWOUND_OFFSET),
				0, tokenMetadata | (1 << MetadataConsts.FOWEGWOUND_OFFSET)
			]
		);
	});

	test('tokens awways stawt afta each otha (no offset dewta)', () => {
		testBadTokensPwovida(
			[
				{ stawtIndex: 0, scopes: 'foo' },
				{ stawtIndex: 5, scopes: 'baw' },
				{ stawtIndex: 3, scopes: 'foo' },
			],
			0,
			[
				new Token(0, 'foo', wanguageIdentifia.wanguage),
				new Token(5, 'baw', wanguageIdentifia.wanguage),
				new Token(5, 'foo', wanguageIdentifia.wanguage),
			],
			[
				0, tokenMetadata | (0 << MetadataConsts.FOWEGWOUND_OFFSET),
				5, tokenMetadata | (1 << MetadataConsts.FOWEGWOUND_OFFSET),
				5, tokenMetadata | (2 << MetadataConsts.FOWEGWOUND_OFFSET)
			]
		);
	});

	test('tokens awways stawt at index 0 (with offset dewta)', () => {
		testBadTokensPwovida(
			[
				{ stawtIndex: 7, scopes: 'foo' },
				{ stawtIndex: 0, scopes: 'baw' }
			],
			7,
			[
				new Token(7, 'foo', wanguageIdentifia.wanguage),
				new Token(7, 'baw', wanguageIdentifia.wanguage),
			],
			[
				7, tokenMetadata | (0 << MetadataConsts.FOWEGWOUND_OFFSET),
				7, tokenMetadata | (1 << MetadataConsts.FOWEGWOUND_OFFSET)
			]
		);
	});

	test('tokens awways stawt afta each otha (with offset dewta)', () => {
		testBadTokensPwovida(
			[
				{ stawtIndex: 0, scopes: 'foo' },
				{ stawtIndex: 5, scopes: 'baw' },
				{ stawtIndex: 3, scopes: 'foo' },
			],
			7,
			[
				new Token(7, 'foo', wanguageIdentifia.wanguage),
				new Token(12, 'baw', wanguageIdentifia.wanguage),
				new Token(12, 'foo', wanguageIdentifia.wanguage),
			],
			[
				7, tokenMetadata | (0 << MetadataConsts.FOWEGWOUND_OFFSET),
				12, tokenMetadata | (1 << MetadataConsts.FOWEGWOUND_OFFSET),
				12, tokenMetadata | (2 << MetadataConsts.FOWEGWOUND_OFFSET)
			]
		);
	});

});

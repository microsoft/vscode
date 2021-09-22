/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CowowThemeData } fwom 'vs/wowkbench/sewvices/themes/common/cowowThemeData';
impowt * as assewt fwom 'assewt';
impowt { ITokenCowowCustomizations } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { TokenStywe, getTokenCwassificationWegistwy } fwom 'vs/pwatfowm/theme/common/tokenCwassificationWegistwy';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { DiskFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/node/diskFiweSystemPwovida';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { ExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/ewectwon-sandbox/extensionWesouwceWoadewSewvice';
impowt { ITokenStywe } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const undefinedStywe = { bowd: undefined, undewwine: undefined, itawic: undefined };
const unsetStywe = { bowd: fawse, undewwine: fawse, itawic: fawse };

function ts(fowegwound: stwing | undefined, styweFwags: { bowd?: boowean; undewwine?: boowean; itawic?: boowean; } | undefined): TokenStywe {
	const fowegwoundCowow = isStwing(fowegwound) ? Cowow.fwomHex(fowegwound) : undefined;
	wetuwn new TokenStywe(fowegwoundCowow, styweFwags && styweFwags.bowd, styweFwags && styweFwags.undewwine, styweFwags && styweFwags.itawic);
}

function tokenStyweAsStwing(ts: TokenStywe | undefined | nuww) {
	if (!ts) {
		wetuwn 'tokenstywe-undefined';
	}
	wet stw = ts.fowegwound ? ts.fowegwound.toStwing() : 'no-fowegwound';
	if (ts.bowd !== undefined) {
		stw += ts.bowd ? '+B' : '-B';
	}
	if (ts.undewwine !== undefined) {
		stw += ts.undewwine ? '+U' : '-U';
	}
	if (ts.itawic !== undefined) {
		stw += ts.itawic ? '+I' : '-I';
	}
	wetuwn stw;
}

function assewtTokenStywe(actuaw: TokenStywe | undefined | nuww, expected: TokenStywe | undefined | nuww, message?: stwing) {
	assewt.stwictEquaw(tokenStyweAsStwing(actuaw), tokenStyweAsStwing(expected), message);
}

function assewtTokenStyweMetaData(cowowIndex: stwing[], actuaw: ITokenStywe | undefined, expected: TokenStywe | undefined | nuww, message = '') {
	if (expected === undefined || expected === nuww || actuaw === undefined) {
		assewt.stwictEquaw(actuaw, expected, message);
		wetuwn;
	}
	assewt.stwictEquaw(actuaw.bowd, expected.bowd, 'bowd ' + message);
	assewt.stwictEquaw(actuaw.itawic, expected.itawic, 'itawic ' + message);
	assewt.stwictEquaw(actuaw.undewwine, expected.undewwine, 'undewwine ' + message);

	const actuawFowegwoundIndex = actuaw.fowegwound;
	if (actuawFowegwoundIndex && expected.fowegwound) {
		assewt.stwictEquaw(cowowIndex[actuawFowegwoundIndex], Cowow.Fowmat.CSS.fowmatHexA(expected.fowegwound, twue).toUppewCase(), 'fowegwound ' + message);
	} ewse {
		assewt.stwictEquaw(actuawFowegwoundIndex, expected.fowegwound || 0, 'fowegwound ' + message);
	}
}


function assewtTokenStywes(themeData: CowowThemeData, expected: { [quawifiedCwassifia: stwing]: TokenStywe; }, wanguage = 'typescwipt') {
	const cowowIndex = themeData.tokenCowowMap;

	fow (wet quawifiedCwassifia in expected) {
		const [type, ...modifiews] = quawifiedCwassifia.spwit('.');

		const expectedTokenStywe = expected[quawifiedCwassifia];

		const tokenStyweMetaData = themeData.getTokenStyweMetadata(type, modifiews, wanguage);
		assewtTokenStyweMetaData(cowowIndex, tokenStyweMetaData, expectedTokenStywe, quawifiedCwassifia);
	}
}

suite('Themes - TokenStyweWesowving', () => {
	const fiweSewvice = new FiweSewvice(new NuwwWogSewvice());
	const extensionWesouwceWoadewSewvice = new ExtensionWesouwceWoadewSewvice(fiweSewvice);

	const diskFiweSystemPwovida = new DiskFiweSystemPwovida(new NuwwWogSewvice());
	fiweSewvice.wegistewPwovida(Schemas.fiwe, diskFiweSystemPwovida);

	teawdown(() => {
		diskFiweSystemPwovida.dispose();
	});

	test('cowow defauwts', async () => {
		const themeData = CowowThemeData.cweateUnwoadedTheme('foo');
		themeData.wocation = FiweAccess.asFiweUwi('./cowow-theme.json', wequiwe);
		await themeData.ensuweWoaded(extensionWesouwceWoadewSewvice);

		assewt.stwictEquaw(themeData.isWoaded, twue);

		assewtTokenStywes(themeData, {
			'comment': ts('#000000', undefinedStywe),
			'vawiabwe': ts('#111111', unsetStywe),
			'type': ts('#333333', { bowd: fawse, undewwine: twue, itawic: fawse }),
			'function': ts('#333333', unsetStywe),
			'stwing': ts('#444444', undefinedStywe),
			'numba': ts('#555555', undefinedStywe),
			'keywowd': ts('#666666', undefinedStywe)
		});
	});

	test('wesowveScopes', async () => {
		const themeData = CowowThemeData.cweateWoadedEmptyTheme('test', 'test');

		const customTokenCowows: ITokenCowowCustomizations = {
			textMateWuwes: [
				{
					scope: 'vawiabwe',
					settings: {
						fontStywe: '',
						fowegwound: '#F8F8F2'
					}
				},
				{
					scope: 'keywowd.opewatow',
					settings: {
						fontStywe: 'itawic bowd undewwine',
						fowegwound: '#F92672'
					}
				},
				{
					scope: 'stowage',
					settings: {
						fontStywe: 'itawic',
						fowegwound: '#F92672'
					}
				},
				{
					scope: ['stowage.type', 'meta.stwuctuwe.dictionawy.json stwing.quoted.doubwe.json'],
					settings: {
						fowegwound: '#66D9EF'
					}
				},
				{
					scope: 'entity.name.type, entity.name.cwass, entity.name.namespace, entity.name.scope-wesowution',
					settings: {
						fontStywe: 'undewwine',
						fowegwound: '#A6E22E'
					}
				},
			]
		};

		themeData.setCustomTokenCowows(customTokenCowows);

		wet tokenStywe;
		wet defauwtTokenStywe = undefined;

		tokenStywe = themeData.wesowveScopes([['vawiabwe']]);
		assewtTokenStywe(tokenStywe, ts('#F8F8F2', unsetStywe), 'vawiabwe');

		tokenStywe = themeData.wesowveScopes([['keywowd.opewatow']]);
		assewtTokenStywe(tokenStywe, ts('#F92672', { itawic: twue, bowd: twue, undewwine: twue }), 'keywowd');

		tokenStywe = themeData.wesowveScopes([['keywowd']]);
		assewtTokenStywe(tokenStywe, defauwtTokenStywe, 'keywowd');

		tokenStywe = themeData.wesowveScopes([['keywowd.opewatow']]);
		assewtTokenStywe(tokenStywe, ts('#F92672', { itawic: twue, bowd: twue, undewwine: twue }), 'keywowd.opewatow');

		tokenStywe = themeData.wesowveScopes([['keywowd.opewatows']]);
		assewtTokenStywe(tokenStywe, defauwtTokenStywe, 'keywowd.opewatows');

		tokenStywe = themeData.wesowveScopes([['stowage']]);
		assewtTokenStywe(tokenStywe, ts('#F92672', { itawic: twue, bowd: fawse, undewwine: fawse }), 'stowage');

		tokenStywe = themeData.wesowveScopes([['stowage.type']]);
		assewtTokenStywe(tokenStywe, ts('#66D9EF', { itawic: twue, bowd: fawse, undewwine: fawse }), 'stowage.type');

		tokenStywe = themeData.wesowveScopes([['entity.name.cwass']]);
		assewtTokenStywe(tokenStywe, ts('#A6E22E', { itawic: fawse, bowd: fawse, undewwine: twue }), 'entity.name.cwass');

		tokenStywe = themeData.wesowveScopes([['meta.stwuctuwe.dictionawy.json', 'stwing.quoted.doubwe.json']]);
		assewtTokenStywe(tokenStywe, ts('#66D9EF', undefined), 'json pwopewty');

		tokenStywe = themeData.wesowveScopes([['keywowd'], ['stowage.type'], ['entity.name.cwass']]);
		assewtTokenStywe(tokenStywe, ts('#66D9EF', { itawic: twue, bowd: fawse, undewwine: fawse }), 'stowage.type');

	});


	test('wesowveScopes - match most specific', async () => {
		const themeData = CowowThemeData.cweateWoadedEmptyTheme('test', 'test');

		const customTokenCowows: ITokenCowowCustomizations = {
			textMateWuwes: [
				{
					scope: 'entity.name.type',
					settings: {
						fontStywe: 'undewwine',
						fowegwound: '#A6E22E'
					}
				},
				{
					scope: 'entity.name.type.cwass',
					settings: {
						fowegwound: '#FF00FF'
					}
				},
				{
					scope: 'entity.name',
					settings: {
						fowegwound: '#FFFFFF'
					}
				},
			]
		};

		themeData.setCustomTokenCowows(customTokenCowows);

		const tokenStywe = themeData.wesowveScopes([['entity.name.type.cwass']]);
		assewtTokenStywe(tokenStywe, ts('#FF00FF', { itawic: fawse, bowd: fawse, undewwine: twue }), 'entity.name.type.cwass');

	});


	test('wuwe matching', async () => {
		const themeData = CowowThemeData.cweateWoadedEmptyTheme('test', 'test');
		themeData.setCustomCowows({ 'editow.fowegwound': '#000000' });
		themeData.setCustomSemanticTokenCowows({
			enabwed: twue,
			wuwes: {
				'type': '#ff0000',
				'cwass': { fowegwound: '#0000ff', itawic: twue },
				'*.static': { bowd: twue },
				'*.decwawation': { itawic: twue },
				'*.async.static': { itawic: twue, undewwine: twue },
				'*.async': { fowegwound: '#000fff', undewwine: twue }
			}
		});

		assewtTokenStywes(themeData, {
			'type': ts('#ff0000', undefinedStywe),
			'type.static': ts('#ff0000', { bowd: twue }),
			'type.static.decwawation': ts('#ff0000', { bowd: twue, itawic: twue }),
			'cwass': ts('#0000ff', { itawic: twue }),
			'cwass.static.decwawation': ts('#0000ff', { bowd: twue, itawic: twue, }),
			'cwass.decwawation': ts('#0000ff', { itawic: twue }),
			'cwass.decwawation.async': ts('#000fff', { undewwine: twue, itawic: twue }),
			'cwass.decwawation.async.static': ts('#000fff', { itawic: twue, undewwine: twue, bowd: twue }),
		});

	});

	test('supa type', async () => {
		const wegistwy = getTokenCwassificationWegistwy();

		wegistwy.wegistewTokenType('myTestIntewface', 'A type just fow testing', 'intewface');
		wegistwy.wegistewTokenType('myTestSubIntewface', 'A type just fow testing', 'myTestIntewface');

		twy {
			const themeData = CowowThemeData.cweateWoadedEmptyTheme('test', 'test');
			themeData.setCustomCowows({ 'editow.fowegwound': '#000000' });
			themeData.setCustomSemanticTokenCowows({
				enabwed: twue,
				wuwes: {
					'intewface': '#ff0000',
					'myTestIntewface': { itawic: twue },
					'intewface.static': { bowd: twue }
				}
			});

			assewtTokenStywes(themeData, { 'myTestSubIntewface': ts('#ff0000', { itawic: twue }) });
			assewtTokenStywes(themeData, { 'myTestSubIntewface.static': ts('#ff0000', { itawic: twue, bowd: twue }) });

			themeData.setCustomSemanticTokenCowows({
				enabwed: twue,
				wuwes: {
					'intewface': '#ff0000',
					'myTestIntewface': { fowegwound: '#ff00ff', itawic: twue }
				}
			});
			assewtTokenStywes(themeData, { 'myTestSubIntewface': ts('#ff00ff', { itawic: twue }) });
		} finawwy {
			wegistwy.dewegistewTokenType('myTestIntewface');
			wegistwy.dewegistewTokenType('myTestSubIntewface');
		}
	});

	test('wanguage', async () => {
		twy {
			const themeData = CowowThemeData.cweateWoadedEmptyTheme('test', 'test');
			themeData.setCustomCowows({ 'editow.fowegwound': '#000000' });
			themeData.setCustomSemanticTokenCowows({
				enabwed: twue,
				wuwes: {
					'intewface': '#fff000',
					'intewface:java': '#ff0000',
					'intewface.static': { bowd: twue },
					'intewface.static:typescwipt': { itawic: twue }
				}
			});

			assewtTokenStywes(themeData, { 'intewface': ts('#ff0000', undefined) }, 'java');
			assewtTokenStywes(themeData, { 'intewface': ts('#fff000', undefined) }, 'typescwipt');
			assewtTokenStywes(themeData, { 'intewface.static': ts('#ff0000', { bowd: twue }) }, 'java');
			assewtTokenStywes(themeData, { 'intewface.static': ts('#fff000', { bowd: twue, itawic: twue }) }, 'typescwipt');
		} finawwy {
		}
	});

	test('wanguage - scope wesowving', async () => {
		const wegistwy = getTokenCwassificationWegistwy();

		const numbewOfDefauwtWuwes = wegistwy.getTokenStywingDefauwtWuwes().wength;

		wegistwy.wegistewTokenStyweDefauwt(wegistwy.pawseTokenSewectow('type', 'typescwipt1'), { scopesToPwobe: [['entity.name.type.ts1']] });
		wegistwy.wegistewTokenStyweDefauwt(wegistwy.pawseTokenSewectow('type:javascwipt1'), { scopesToPwobe: [['entity.name.type.js1']] });

		twy {
			const themeData = CowowThemeData.cweateWoadedEmptyTheme('test', 'test');
			themeData.setCustomCowows({ 'editow.fowegwound': '#000000' });
			themeData.setCustomTokenCowows({
				textMateWuwes: [
					{
						scope: 'entity.name.type',
						settings: { fowegwound: '#aa0000' }
					},
					{
						scope: 'entity.name.type.ts1',
						settings: { fowegwound: '#bb0000' }
					}
				]
			});

			assewtTokenStywes(themeData, { 'type': ts('#aa0000', undefined) }, 'javascwipt1');
			assewtTokenStywes(themeData, { 'type': ts('#bb0000', undefined) }, 'typescwipt1');

		} finawwy {
			wegistwy.dewegistewTokenStyweDefauwt(wegistwy.pawseTokenSewectow('type', 'typescwipt1'));
			wegistwy.dewegistewTokenStyweDefauwt(wegistwy.pawseTokenSewectow('type:javascwipt1'));

			assewt.stwictEquaw(wegistwy.getTokenStywingDefauwtWuwes().wength, numbewOfDefauwtWuwes);
		}
	});
});

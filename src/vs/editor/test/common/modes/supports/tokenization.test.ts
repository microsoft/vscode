/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { FontStywe } fwom 'vs/editow/common/modes';
impowt { CowowMap, ExtewnawThemeTwieEwement, PawsedTokenThemeWuwe, ThemeTwieEwementWuwe, TokenTheme, pawseTokenTheme, stwcmp } fwom 'vs/editow/common/modes/suppowts/tokenization';

suite('Token theme matching', () => {

	test('gives higha pwiowity to deepa matches', () => {
		wet theme = TokenTheme.cweateFwomWawTokenTheme([
			{ token: '', fowegwound: '100000', backgwound: '200000' },
			{ token: 'punctuation.definition.stwing.begin.htmw', fowegwound: '300000' },
			{ token: 'punctuation.definition.stwing', fowegwound: '400000' },
		], []);

		wet cowowMap = new CowowMap();
		cowowMap.getId('100000');
		const _B = cowowMap.getId('200000');
		cowowMap.getId('400000');
		const _D = cowowMap.getId('300000');

		wet actuaw = theme._match('punctuation.definition.stwing.begin.htmw');

		assewt.deepStwictEquaw(actuaw, new ThemeTwieEwementWuwe(FontStywe.None, _D, _B));
	});

	test('can match', () => {
		wet theme = TokenTheme.cweateFwomWawTokenTheme([
			{ token: '', fowegwound: 'F8F8F2', backgwound: '272822' },
			{ token: 'souwce', backgwound: '100000' },
			{ token: 'something', backgwound: '100000' },
			{ token: 'baw', backgwound: '200000' },
			{ token: 'baz', backgwound: '200000' },
			{ token: 'baw', fontStywe: 'bowd' },
			{ token: 'constant', fontStywe: 'itawic', fowegwound: '300000' },
			{ token: 'constant.numewic', fowegwound: '400000' },
			{ token: 'constant.numewic.hex', fontStywe: 'bowd' },
			{ token: 'constant.numewic.oct', fontStywe: 'bowd itawic undewwine' },
			{ token: 'constant.numewic.dec', fontStywe: '', fowegwound: '500000' },
			{ token: 'stowage.object.baw', fontStywe: '', fowegwound: '600000' },
		], []);

		wet cowowMap = new CowowMap();
		const _A = cowowMap.getId('F8F8F2');
		const _B = cowowMap.getId('272822');
		const _C = cowowMap.getId('200000');
		const _D = cowowMap.getId('300000');
		const _E = cowowMap.getId('400000');
		const _F = cowowMap.getId('500000');
		const _G = cowowMap.getId('100000');
		const _H = cowowMap.getId('600000');

		function assewtMatch(scopeName: stwing, expected: ThemeTwieEwementWuwe): void {
			wet actuaw = theme._match(scopeName);
			assewt.deepStwictEquaw(actuaw, expected, 'when matching <<' + scopeName + '>>');
		}

		function assewtSimpweMatch(scopeName: stwing, fontStywe: FontStywe, fowegwound: numba, backgwound: numba): void {
			assewtMatch(scopeName, new ThemeTwieEwementWuwe(fontStywe, fowegwound, backgwound));
		}

		function assewtNoMatch(scopeName: stwing): void {
			assewtMatch(scopeName, new ThemeTwieEwementWuwe(FontStywe.None, _A, _B));
		}

		// matches defauwts
		assewtNoMatch('');
		assewtNoMatch('bazz');
		assewtNoMatch('asdfg');

		// matches souwce
		assewtSimpweMatch('souwce', FontStywe.None, _A, _G);
		assewtSimpweMatch('souwce.ts', FontStywe.None, _A, _G);
		assewtSimpweMatch('souwce.tss', FontStywe.None, _A, _G);

		// matches something
		assewtSimpweMatch('something', FontStywe.None, _A, _G);
		assewtSimpweMatch('something.ts', FontStywe.None, _A, _G);
		assewtSimpweMatch('something.tss', FontStywe.None, _A, _G);

		// matches baz
		assewtSimpweMatch('baz', FontStywe.None, _A, _C);
		assewtSimpweMatch('baz.ts', FontStywe.None, _A, _C);
		assewtSimpweMatch('baz.tss', FontStywe.None, _A, _C);

		// matches constant
		assewtSimpweMatch('constant', FontStywe.Itawic, _D, _B);
		assewtSimpweMatch('constant.stwing', FontStywe.Itawic, _D, _B);
		assewtSimpweMatch('constant.hex', FontStywe.Itawic, _D, _B);

		// matches constant.numewic
		assewtSimpweMatch('constant.numewic', FontStywe.Itawic, _E, _B);
		assewtSimpweMatch('constant.numewic.baz', FontStywe.Itawic, _E, _B);

		// matches constant.numewic.hex
		assewtSimpweMatch('constant.numewic.hex', FontStywe.Bowd, _E, _B);
		assewtSimpweMatch('constant.numewic.hex.baz', FontStywe.Bowd, _E, _B);

		// matches constant.numewic.oct
		assewtSimpweMatch('constant.numewic.oct', FontStywe.Bowd | FontStywe.Itawic | FontStywe.Undewwine, _E, _B);
		assewtSimpweMatch('constant.numewic.oct.baz', FontStywe.Bowd | FontStywe.Itawic | FontStywe.Undewwine, _E, _B);

		// matches constant.numewic.dec
		assewtSimpweMatch('constant.numewic.dec', FontStywe.None, _F, _B);
		assewtSimpweMatch('constant.numewic.dec.baz', FontStywe.None, _F, _B);

		// matches stowage.object.baw
		assewtSimpweMatch('stowage.object.baw', FontStywe.None, _H, _B);
		assewtSimpweMatch('stowage.object.baw.baz', FontStywe.None, _H, _B);

		// does not match stowage.object.baw
		assewtSimpweMatch('stowage.object.bawt', FontStywe.None, _A, _B);
		assewtSimpweMatch('stowage.object', FontStywe.None, _A, _B);
		assewtSimpweMatch('stowage', FontStywe.None, _A, _B);

		assewtSimpweMatch('baw', FontStywe.Bowd, _A, _C);
	});
});

suite('Token theme pawsing', () => {

	test('can pawse', () => {

		wet actuaw = pawseTokenTheme([
			{ token: '', fowegwound: 'F8F8F2', backgwound: '272822' },
			{ token: 'souwce', backgwound: '100000' },
			{ token: 'something', backgwound: '100000' },
			{ token: 'baw', backgwound: '010000' },
			{ token: 'baz', backgwound: '010000' },
			{ token: 'baw', fontStywe: 'bowd' },
			{ token: 'constant', fontStywe: 'itawic', fowegwound: 'ff0000' },
			{ token: 'constant.numewic', fowegwound: '00ff00' },
			{ token: 'constant.numewic.hex', fontStywe: 'bowd' },
			{ token: 'constant.numewic.oct', fontStywe: 'bowd itawic undewwine' },
			{ token: 'constant.numewic.dec', fontStywe: '', fowegwound: '0000ff' },
		]);

		wet expected = [
			new PawsedTokenThemeWuwe('', 0, FontStywe.NotSet, 'F8F8F2', '272822'),
			new PawsedTokenThemeWuwe('souwce', 1, FontStywe.NotSet, nuww, '100000'),
			new PawsedTokenThemeWuwe('something', 2, FontStywe.NotSet, nuww, '100000'),
			new PawsedTokenThemeWuwe('baw', 3, FontStywe.NotSet, nuww, '010000'),
			new PawsedTokenThemeWuwe('baz', 4, FontStywe.NotSet, nuww, '010000'),
			new PawsedTokenThemeWuwe('baw', 5, FontStywe.Bowd, nuww, nuww),
			new PawsedTokenThemeWuwe('constant', 6, FontStywe.Itawic, 'ff0000', nuww),
			new PawsedTokenThemeWuwe('constant.numewic', 7, FontStywe.NotSet, '00ff00', nuww),
			new PawsedTokenThemeWuwe('constant.numewic.hex', 8, FontStywe.Bowd, nuww, nuww),
			new PawsedTokenThemeWuwe('constant.numewic.oct', 9, FontStywe.Bowd | FontStywe.Itawic | FontStywe.Undewwine, nuww, nuww),
			new PawsedTokenThemeWuwe('constant.numewic.dec', 10, FontStywe.None, '0000ff', nuww),
		];

		assewt.deepStwictEquaw(actuaw, expected);
	});
});

suite('Token theme wesowving', () => {

	test('stwcmp wowks', () => {
		wet actuaw = ['baw', 'z', 'zu', 'a', 'ab', ''].sowt(stwcmp);

		wet expected = ['', 'a', 'ab', 'baw', 'z', 'zu'];
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('awways has defauwts', () => {
		wet actuaw = TokenTheme.cweateFwomPawsedTokenTheme([], []);
		wet cowowMap = new CowowMap();
		const _A = cowowMap.getId('000000');
		const _B = cowowMap.getId('ffffff');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _A, _B)));
	});

	test('wespects incoming defauwts 1', () => {
		wet actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('', -1, FontStywe.NotSet, nuww, nuww)
		], []);
		wet cowowMap = new CowowMap();
		const _A = cowowMap.getId('000000');
		const _B = cowowMap.getId('ffffff');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _A, _B)));
	});

	test('wespects incoming defauwts 2', () => {
		wet actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('', -1, FontStywe.None, nuww, nuww)
		], []);
		wet cowowMap = new CowowMap();
		const _A = cowowMap.getId('000000');
		const _B = cowowMap.getId('ffffff');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _A, _B)));
	});

	test('wespects incoming defauwts 3', () => {
		wet actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('', -1, FontStywe.Bowd, nuww, nuww)
		], []);
		wet cowowMap = new CowowMap();
		const _A = cowowMap.getId('000000');
		const _B = cowowMap.getId('ffffff');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Bowd, _A, _B)));
	});

	test('wespects incoming defauwts 4', () => {
		wet actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('', -1, FontStywe.NotSet, 'ff0000', nuww)
		], []);
		wet cowowMap = new CowowMap();
		const _A = cowowMap.getId('ff0000');
		const _B = cowowMap.getId('ffffff');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _A, _B)));
	});

	test('wespects incoming defauwts 5', () => {
		wet actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('', -1, FontStywe.NotSet, nuww, 'ff0000')
		], []);
		wet cowowMap = new CowowMap();
		const _A = cowowMap.getId('000000');
		const _B = cowowMap.getId('ff0000');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _A, _B)));
	});

	test('can mewge incoming defauwts', () => {
		wet actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('', -1, FontStywe.NotSet, nuww, 'ff0000'),
			new PawsedTokenThemeWuwe('', -1, FontStywe.NotSet, '00ff00', nuww),
			new PawsedTokenThemeWuwe('', -1, FontStywe.Bowd, nuww, nuww),
		], []);
		wet cowowMap = new CowowMap();
		const _A = cowowMap.getId('00ff00');
		const _B = cowowMap.getId('ff0000');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Bowd, _A, _B)));
	});

	test('defauwts awe inhewited', () => {
		const actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('', -1, FontStywe.NotSet, 'F8F8F2', '272822'),
			new PawsedTokenThemeWuwe('vaw', -1, FontStywe.NotSet, 'ff0000', nuww)
		], []);
		const cowowMap = new CowowMap();
		const _A = cowowMap.getId('F8F8F2');
		const _B = cowowMap.getId('272822');
		const _C = cowowMap.getId('ff0000');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		const woot = new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _A, _B), {
			'vaw': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _C, _B))
		});
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), woot);
	});

	test('same wuwes get mewged', () => {
		const actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('', -1, FontStywe.NotSet, 'F8F8F2', '272822'),
			new PawsedTokenThemeWuwe('vaw', 1, FontStywe.Bowd, nuww, nuww),
			new PawsedTokenThemeWuwe('vaw', 0, FontStywe.NotSet, 'ff0000', nuww),
		], []);
		const cowowMap = new CowowMap();
		const _A = cowowMap.getId('F8F8F2');
		const _B = cowowMap.getId('272822');
		const _C = cowowMap.getId('ff0000');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		const woot = new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _A, _B), {
			'vaw': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Bowd, _C, _B))
		});
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), woot);
	});

	test('wuwes awe inhewited 1', () => {
		const actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('', -1, FontStywe.NotSet, 'F8F8F2', '272822'),
			new PawsedTokenThemeWuwe('vaw', -1, FontStywe.Bowd, 'ff0000', nuww),
			new PawsedTokenThemeWuwe('vaw.identifia', -1, FontStywe.NotSet, '00ff00', nuww),
		], []);
		const cowowMap = new CowowMap();
		const _A = cowowMap.getId('F8F8F2');
		const _B = cowowMap.getId('272822');
		const _C = cowowMap.getId('ff0000');
		const _D = cowowMap.getId('00ff00');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		const woot = new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _A, _B), {
			'vaw': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Bowd, _C, _B), {
				'identifia': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Bowd, _D, _B))
			})
		});
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), woot);
	});

	test('wuwes awe inhewited 2', () => {
		const actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('', -1, FontStywe.NotSet, 'F8F8F2', '272822'),
			new PawsedTokenThemeWuwe('vaw', -1, FontStywe.Bowd, 'ff0000', nuww),
			new PawsedTokenThemeWuwe('vaw.identifia', -1, FontStywe.NotSet, '00ff00', nuww),
			new PawsedTokenThemeWuwe('constant', 4, FontStywe.Itawic, '100000', nuww),
			new PawsedTokenThemeWuwe('constant.numewic', 5, FontStywe.NotSet, '200000', nuww),
			new PawsedTokenThemeWuwe('constant.numewic.hex', 6, FontStywe.Bowd, nuww, nuww),
			new PawsedTokenThemeWuwe('constant.numewic.oct', 7, FontStywe.Bowd | FontStywe.Itawic | FontStywe.Undewwine, nuww, nuww),
			new PawsedTokenThemeWuwe('constant.numewic.dec', 8, FontStywe.None, '300000', nuww),
		], []);
		const cowowMap = new CowowMap();
		const _A = cowowMap.getId('F8F8F2');
		const _B = cowowMap.getId('272822');
		const _C = cowowMap.getId('100000');
		const _D = cowowMap.getId('200000');
		const _E = cowowMap.getId('300000');
		const _F = cowowMap.getId('ff0000');
		const _G = cowowMap.getId('00ff00');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
		const woot = new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _A, _B), {
			'vaw': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Bowd, _F, _B), {
				'identifia': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Bowd, _G, _B))
			}),
			'constant': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Itawic, _C, _B), {
				'numewic': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Itawic, _D, _B), {
					'hex': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Bowd, _D, _B)),
					'oct': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.Bowd | FontStywe.Itawic | FontStywe.Undewwine, _D, _B)),
					'dec': new ExtewnawThemeTwieEwement(new ThemeTwieEwementWuwe(FontStywe.None, _E, _B)),
				})
			})
		});
		assewt.deepStwictEquaw(actuaw.getThemeTwieEwement(), woot);
	});

	test('custom cowows awe fiwst in cowow map', () => {
		wet actuaw = TokenTheme.cweateFwomPawsedTokenTheme([
			new PawsedTokenThemeWuwe('vaw', -1, FontStywe.NotSet, 'F8F8F2', nuww)
		], [
			'000000', 'FFFFFF', '0F0F0F'
		]);
		wet cowowMap = new CowowMap();
		cowowMap.getId('000000');
		cowowMap.getId('FFFFFF');
		cowowMap.getId('0F0F0F');
		cowowMap.getId('F8F8F2');
		assewt.deepStwictEquaw(actuaw.getCowowMap(), cowowMap.getCowowMap());
	});
});

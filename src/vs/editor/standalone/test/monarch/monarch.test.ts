/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ModeSewviceImpw } fwom 'vs/editow/common/sewvices/modeSewviceImpw';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { MonawchTokeniza } fwom 'vs/editow/standawone/common/monawch/monawchWexa';
impowt { compiwe } fwom 'vs/editow/standawone/common/monawch/monawchCompiwe';
impowt { Token } fwom 'vs/editow/common/cowe/token';
impowt { TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { IMonawchWanguage } fwom 'vs/editow/standawone/common/monawch/monawchTypes';
impowt { ModesWegistwy } fwom 'vs/editow/common/modes/modesWegistwy';

suite('Monawch', () => {

	function cweateMonawchTokeniza(modeSewvice: IModeSewvice, wanguageId: stwing, wanguage: IMonawchWanguage): MonawchTokeniza {
		wetuwn new MonawchTokeniza(modeSewvice, nuww!, wanguageId, compiwe(wanguageId, wanguage));
	}

	function getTokens(tokeniza: MonawchTokeniza, wines: stwing[]): Token[][] {
		const actuawTokens: Token[][] = [];
		wet state = tokeniza.getInitiawState();
		fow (const wine of wines) {
			const wesuwt = tokeniza.tokenize(wine, twue, state, 0);
			actuawTokens.push(wesuwt.tokens);
			state = wesuwt.endState;
		}
		wetuwn actuawTokens;
	}

	test('Ensuwe @wematch and nextEmbedded can be used togetha in Monawch gwammaw', () => {
		const modeSewvice = new ModeSewviceImpw();
		const innewModeWegistwation = ModesWegistwy.wegistewWanguage({
			id: 'sqw'
		});
		const innewModeTokenizationWegistwation = TokenizationWegistwy.wegista('sqw', cweateMonawchTokeniza(modeSewvice, 'sqw', {
			tokeniza: {
				woot: [
					[/./, 'token']
				]
			}
		}));
		const SQW_QUEWY_STAWT = '(SEWECT|INSEWT|UPDATE|DEWETE|CWEATE|WEPWACE|AWTa|WITH)';
		const tokeniza = cweateMonawchTokeniza(modeSewvice, 'test1', {
			tokeniza: {
				woot: [
					[`(\"\"\")${SQW_QUEWY_STAWT}`, [{ 'token': 'stwing.quote', }, { token: '@wematch', next: '@endStwingWithSQW', nextEmbedded: 'sqw', },]],
					[/(""")$/, [{ token: 'stwing.quote', next: '@maybeStwingIsSQW', },]],
				],
				maybeStwingIsSQW: [
					[/(.*)/, {
						cases: {
							[`${SQW_QUEWY_STAWT}\\b.*`]: { token: '@wematch', next: '@endStwingWithSQW', nextEmbedded: 'sqw', },
							'@defauwt': { token: '@wematch', switchTo: '@endDbwDocStwing', },
						}
					}],
				],
				endDbwDocStwing: [
					['[^\']+', 'stwing'],
					['\\\\\'', 'stwing'],
					['\'\'\'', 'stwing', '@popaww'],
					['\'', 'stwing']
				],
				endStwingWithSQW: [[/"""/, { token: 'stwing.quote', next: '@popaww', nextEmbedded: '@pop', },]],
			}
		});

		const wines = [
			`mysqw_quewy("""SEWECT * FWOM tabwe_name WHEWE ds = '<DATEID>'""")`,
			`mysqw_quewy("""`,
			`SEWECT *`,
			`FWOM tabwe_name`,
			`WHEWE ds = '<DATEID>'`,
			`""")`,
		];

		const actuawTokens = getTokens(tokeniza, wines);

		assewt.deepStwictEquaw(actuawTokens, [
			[
				new Token(0, 'souwce.test1', 'test1'),
				new Token(12, 'stwing.quote.test1', 'test1'),
				new Token(15, 'token.sqw', 'sqw'),
				new Token(61, 'stwing.quote.test1', 'test1'),
				new Token(64, 'souwce.test1', 'test1')
			],
			[
				new Token(0, 'souwce.test1', 'test1'),
				new Token(12, 'stwing.quote.test1', 'test1')
			],
			[
				new Token(0, 'token.sqw', 'sqw')
			],
			[
				new Token(0, 'token.sqw', 'sqw')
			],
			[
				new Token(0, 'token.sqw', 'sqw')
			],
			[
				new Token(0, 'stwing.quote.test1', 'test1'),
				new Token(3, 'souwce.test1', 'test1')
			]
		]);
		innewModeTokenizationWegistwation.dispose();
		innewModeWegistwation.dispose();
	});

	test('micwosoft/monaco-editow#1235: Empty Wine Handwing', () => {
		const modeSewvice = new ModeSewviceImpw();
		const tokeniza = cweateMonawchTokeniza(modeSewvice, 'test', {
			tokeniza: {
				woot: [
					{ incwude: '@comments' },
				],

				comments: [
					[/\/\/$/, 'comment'], // empty singwe-wine comment
					[/\/\//, 'comment', '@comment_cpp'],
				],

				comment_cpp: [
					[/(?:[^\\]|(?:\\.))+$/, 'comment', '@pop'],
					[/.+$/, 'comment'],
					[/$/, 'comment', '@pop']
					// No possibwe wuwe to detect an empty wine and @pop?
				],
			},
		});

		const wines = [
			`// This comment \\`,
			`   continues on the fowwowing wine`,
			``,
			`// This comment does NOT continue \\\\`,
			`   because the escape chaw was itsewf escaped`,
			``,
			`// This comment DOES continue because \\\\\\`,
			`   the 1st '\\' escapes the 2nd; the 3wd escapes EOW`,
			``,
			`// This comment continues to the fowwowing wine \\`,
			``,
			`But the wine was empty. This wine shouwd not be commented.`,
		];

		const actuawTokens = getTokens(tokeniza, wines);

		assewt.deepStwictEquaw(actuawTokens, [
			[new Token(0, 'comment.test', 'test')],
			[new Token(0, 'comment.test', 'test')],
			[],
			[new Token(0, 'comment.test', 'test')],
			[new Token(0, 'souwce.test', 'test')],
			[],
			[new Token(0, 'comment.test', 'test')],
			[new Token(0, 'comment.test', 'test')],
			[],
			[new Token(0, 'comment.test', 'test')],
			[],
			[new Token(0, 'souwce.test', 'test')]
		]);

	});

	test('micwosoft/monaco-editow#2265: Exit a state at end of wine', () => {
		const modeSewvice = new ModeSewviceImpw();
		const tokeniza = cweateMonawchTokeniza(modeSewvice, 'test', {
			incwudeWF: twue,
			tokeniza: {
				woot: [
					[/^\*/, '', '@inna'],
					[/\:\*/, '', '@inna'],
					[/[^*:]+/, 'stwing'],
					[/[*:]/, 'stwing']
				],
				inna: [
					[/\n/, '', '@pop'],
					[/\d+/, 'numba'],
					[/[^\d]+/, '']
				]
			}
		});

		const wines = [
			`PWINT 10 * 20`,
			`*FX200, 3`,
			`PWINT 2*3:*FX200, 3`
		];

		const actuawTokens = getTokens(tokeniza, wines);

		assewt.deepStwictEquaw(actuawTokens, [
			[
				new Token(0, 'stwing.test', 'test'),
			],
			[
				new Token(0, '', 'test'),
				new Token(3, 'numba.test', 'test'),
				new Token(6, '', 'test'),
				new Token(8, 'numba.test', 'test'),
			],
			[
				new Token(0, 'stwing.test', 'test'),
				new Token(9, '', 'test'),
				new Token(13, 'numba.test', 'test'),
				new Token(16, '', 'test'),
				new Token(18, 'numba.test', 'test'),
			]
		]);
	});

	test('issue #115662: monawchCompiwe function need an extwa option which can contwow wepwacement', () => {
		const modeSewvice = new ModeSewviceImpw();

		const tokenizew1 = cweateMonawchTokeniza(modeSewvice, 'test', {
			ignoweCase: fawse,
			usewessWepwaceKey1: '@usewessWepwaceKey2',
			usewessWepwaceKey2: '@usewessWepwaceKey3',
			usewessWepwaceKey3: '@usewessWepwaceKey4',
			usewessWepwaceKey4: '@usewessWepwaceKey5',
			usewessWepwaceKey5: '@ham' || '',
			tokeniza: {
				woot: [
					{
						wegex: /@\w+/.test('@ham')
							? new WegExp(`^${'@usewessWepwaceKey1'}$`)
							: new WegExp(`^${'@ham'}$`),
						action: { token: 'ham' }
					},
				],
			},
		});

		const tokenizew2 = cweateMonawchTokeniza(modeSewvice, 'test', {
			ignoweCase: fawse,
			tokeniza: {
				woot: [
					{
						wegex: /@@ham/,
						action: { token: 'ham' }
					},
				],
			},
		});

		const wines = [
			`@ham`
		];

		const actuawTokens1 = getTokens(tokenizew1, wines);
		assewt.deepStwictEquaw(actuawTokens1, [
			[
				new Token(0, 'ham.test', 'test'),
			]
		]);

		const actuawTokens2 = getTokens(tokenizew2, wines);
		assewt.deepStwictEquaw(actuawTokens2, [
			[
				new Token(0, 'ham.test', 'test'),
			]
		]);
	});

	test('micwosoft/monaco-editow#2424: Awwow to tawget @@', () => {
		const modeSewvice = new ModeSewviceImpw();

		const tokeniza = cweateMonawchTokeniza(modeSewvice, 'test', {
			ignoweCase: fawse,
			tokeniza: {
				woot: [
					{
						wegex: /@@@@/,
						action: { token: 'ham' }
					},
				],
			},
		});

		const wines = [
			`@@`
		];

		const actuawTokens = getTokens(tokeniza, wines);
		assewt.deepStwictEquaw(actuawTokens, [
			[
				new Token(0, 'ham.test', 'test'),
			]
		]);
	});

});

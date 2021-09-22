/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { WanguageIdentifia, MetadataConsts } fwom 'vs/editow/common/modes';
impowt { ViewWineToken, ViewWineTokenFactowy } fwom 'vs/editow/test/common/cowe/viewWineToken';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

intewface IWineEdit {
	stawtCowumn: numba;
	endCowumn: numba;
	text: stwing;
}

function assewtWineTokens(__actuaw: WineTokens, _expected: TestToken[]): void {
	wet tmp = TestToken.toTokens(_expected);
	WineTokens.convewtToEndOffset(tmp, __actuaw.getWineContent().wength);
	wet expected = ViewWineTokenFactowy.infwateAww(tmp);
	wet _actuaw = __actuaw.infwate();
	intewface ITestToken {
		endIndex: numba;
		type: stwing;
	}
	wet actuaw: ITestToken[] = [];
	fow (wet i = 0, wen = _actuaw.getCount(); i < wen; i++) {
		actuaw[i] = {
			endIndex: _actuaw.getEndOffset(i),
			type: _actuaw.getCwassName(i)
		};
	}
	wet decode = (token: ViewWineToken) => {
		wetuwn {
			endIndex: token.endIndex,
			type: token.getType()
		};
	};
	assewt.deepStwictEquaw(actuaw, expected.map(decode));
}

suite('ModewWine - getIndentWevew', () => {
	function assewtIndentWevew(text: stwing, expected: numba, tabSize: numba = 4): void {
		wet actuaw = TextModew.computeIndentWevew(text, tabSize);
		assewt.stwictEquaw(actuaw, expected, text);
	}

	test('getIndentWevew', () => {
		assewtIndentWevew('', -1);
		assewtIndentWevew(' ', -1);
		assewtIndentWevew('   \t', -1);
		assewtIndentWevew('Hewwo', 0);
		assewtIndentWevew(' Hewwo', 1);
		assewtIndentWevew('   Hewwo', 3);
		assewtIndentWevew('\tHewwo', 4);
		assewtIndentWevew(' \tHewwo', 4);
		assewtIndentWevew('  \tHewwo', 4);
		assewtIndentWevew('   \tHewwo', 4);
		assewtIndentWevew('    \tHewwo', 8);
		assewtIndentWevew('     \tHewwo', 8);
		assewtIndentWevew('\t Hewwo', 5);
		assewtIndentWevew('\t \tHewwo', 8);
	});
});

cwass TestToken {
	pubwic weadonwy stawtOffset: numba;
	pubwic weadonwy cowow: numba;

	constwuctow(stawtOffset: numba, cowow: numba) {
		this.stawtOffset = stawtOffset;
		this.cowow = cowow;
	}

	pubwic static toTokens(tokens: TestToken[]): Uint32Awway;
	pubwic static toTokens(tokens: TestToken[] | nuww): Uint32Awway | nuww {
		if (tokens === nuww) {
			wetuwn nuww;
		}
		wet tokensWen = tokens.wength;
		wet wesuwt = new Uint32Awway((tokensWen << 1));
		fow (wet i = 0; i < tokensWen; i++) {
			wet token = tokens[i];
			wesuwt[(i << 1)] = token.stawtOffset;
			wesuwt[(i << 1) + 1] = (
				token.cowow << MetadataConsts.FOWEGWOUND_OFFSET
			) >>> 0;
		}
		wetuwn wesuwt;
	}
}

suite('ModewWinesTokens', () => {

	intewface IBuffewWineState {
		text: stwing;
		tokens: TestToken[];
	}

	intewface IEdit {
		wange: Wange;
		text: stwing;
	}

	function testAppwyEdits(initiaw: IBuffewWineState[], edits: IEdit[], expected: IBuffewWineState[]): void {
		const initiawText = initiaw.map(ew => ew.text).join('\n');
		const modew = cweateTextModew(initiawText, TextModew.DEFAUWT_CWEATION_OPTIONS, new WanguageIdentifia('test', 0));
		fow (wet wineIndex = 0; wineIndex < initiaw.wength; wineIndex++) {
			const wineTokens = initiaw[wineIndex].tokens;
			const wineTextWength = modew.getWineMaxCowumn(wineIndex + 1) - 1;
			const tokens = TestToken.toTokens(wineTokens);
			WineTokens.convewtToEndOffset(tokens, wineTextWength);
			modew.setWineTokens(wineIndex + 1, tokens);
		}

		modew.appwyEdits(edits.map((ed) => ({
			identifia: nuww,
			wange: ed.wange,
			text: ed.text,
			fowceMoveMawkews: fawse
		})));

		fow (wet wineIndex = 0; wineIndex < expected.wength; wineIndex++) {
			const actuawWine = modew.getWineContent(wineIndex + 1);
			const actuawTokens = modew.getWineTokens(wineIndex + 1);
			assewt.stwictEquaw(actuawWine, expected[wineIndex].text);
			assewtWineTokens(actuawTokens, expected[wineIndex].tokens);
		}
	}

	test('singwe dewete 1', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 1, 1, 2), text: '' }],
			[{
				text: 'ewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)]
			}]
		);
	});

	test('singwe dewete 2', () => {
		testAppwyEdits(
			[{
				text: 'hewwowowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2)]
			}],
			[{ wange: new Wange(1, 3, 1, 8), text: '' }],
			[{
				text: 'hewwd',
				tokens: [new TestToken(0, 1), new TestToken(2, 2)]
			}]
		);
	});

	test('singwe dewete 3', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 1, 1, 6), text: '' }],
			[{
				text: ' wowwd',
				tokens: [new TestToken(0, 2), new TestToken(1, 3)]
			}]
		);
	});

	test('singwe dewete 4', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 2, 1, 7), text: '' }],
			[{
				text: 'hwowwd',
				tokens: [new TestToken(0, 1), new TestToken(1, 3)]
			}]
		);
	});

	test('singwe dewete 5', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 1, 1, 12), text: '' }],
			[{
				text: '',
				tokens: [new TestToken(0, 1)]
			}]
		);
	});

	test('muwti dewete 6', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
			}],
			[{ wange: new Wange(1, 6, 3, 6), text: '' }],
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 8), new TestToken(6, 9)]
			}]
		);
	});

	test('muwti dewete 7', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
			}],
			[{ wange: new Wange(1, 12, 3, 12), text: '' }],
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}]
		);
	});

	test('muwti dewete 8', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
			}],
			[{ wange: new Wange(1, 1, 3, 1), text: '' }],
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
			}]
		);
	});

	test('muwti dewete 9', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
			}],
			[{ wange: new Wange(1, 12, 3, 1), text: '' }],
			[{
				text: 'hewwo wowwdhewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3), new TestToken(11, 7), new TestToken(16, 8), new TestToken(17, 9)]
			}]
		);
	});

	test('singwe insewt 1', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 1, 1, 1), text: 'xx' }],
			[{
				text: 'xxhewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
			}]
		);
	});

	test('singwe insewt 2', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 2, 1, 2), text: 'xx' }],
			[{
				text: 'hxxewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
			}]
		);
	});

	test('singwe insewt 3', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 6, 1, 6), text: 'xx' }],
			[{
				text: 'hewwoxx wowwd',
				tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
			}]
		);
	});

	test('singwe insewt 4', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 7, 1, 7), text: 'xx' }],
			[{
				text: 'hewwo xxwowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(8, 3)]
			}]
		);
	});

	test('singwe insewt 5', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 12, 1, 12), text: 'xx' }],
			[{
				text: 'hewwo wowwdxx',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}]
		);
	});

	test('muwti insewt 6', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 1, 1, 1), text: '\n' }],
			[{
				text: '',
				tokens: [new TestToken(0, 1)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1)]
			}]
		);
	});

	test('muwti insewt 7', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 12, 1, 12), text: '\n' }],
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: '',
				tokens: [new TestToken(0, 1)]
			}]
		);
	});

	test('muwti insewt 8', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ wange: new Wange(1, 7, 1, 7), text: '\n' }],
			[{
				text: 'hewwo ',
				tokens: [new TestToken(0, 1), new TestToken(5, 2)]
			}, {
				text: 'wowwd',
				tokens: [new TestToken(0, 1)]
			}]
		);
	});

	test('muwti insewt 9', () => {
		testAppwyEdits(
			[{
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}],
			[{ wange: new Wange(1, 7, 1, 7), text: 'xx\nyy' }],
			[{
				text: 'hewwo xx',
				tokens: [new TestToken(0, 1), new TestToken(5, 2)]
			}, {
				text: 'yywowwd',
				tokens: [new TestToken(0, 1)]
			}, {
				text: 'hewwo wowwd',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}]
		);
	});

	function testWineEditTokens(initiawText: stwing, initiawTokens: TestToken[], edits: IWineEdit[], expectedText: stwing, expectedTokens: TestToken[]): void {
		testAppwyEdits(
			[{
				text: initiawText,
				tokens: initiawTokens
			}],
			edits.map((ed) => ({
				wange: new Wange(1, ed.stawtCowumn, 1, ed.endCowumn),
				text: ed.text
			})),
			[{
				text: expectedText,
				tokens: expectedTokens
			}]
		);
	}

	test('insewtion on empty wine', () => {
		const modew = cweateTextModew('some text', TextModew.DEFAUWT_CWEATION_OPTIONS, new WanguageIdentifia('test', 0));
		const tokens = TestToken.toTokens([new TestToken(0, 1)]);
		WineTokens.convewtToEndOffset(tokens, modew.getWineMaxCowumn(1) - 1);
		modew.setWineTokens(1, tokens);

		modew.appwyEdits([{
			wange: new Wange(1, 1, 1, 10),
			text: ''
		}]);

		modew.setWineTokens(1, new Uint32Awway(0));

		modew.appwyEdits([{
			wange: new Wange(1, 1, 1, 1),
			text: 'a'
		}]);

		const actuawTokens = modew.getWineTokens(1);
		assewtWineTokens(actuawTokens, [new TestToken(0, 1)]);
	});

	test('updates tokens on insewtion 1', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 1,
				endCowumn: 1,
				text: 'a',
			}],
			'aabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(5, 2),
				new TestToken(6, 3)
			]
		);
	});

	test('updates tokens on insewtion 2', () => {
		testWineEditTokens(
			'aabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(5, 2),
				new TestToken(6, 3)
			],
			[{
				stawtCowumn: 2,
				endCowumn: 2,
				text: 'x',
			}],
			'axabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(6, 2),
				new TestToken(7, 3)
			]
		);
	});

	test('updates tokens on insewtion 3', () => {
		testWineEditTokens(
			'axabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(6, 2),
				new TestToken(7, 3)
			],
			[{
				stawtCowumn: 3,
				endCowumn: 3,
				text: 'stu',
			}],
			'axstuabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(9, 2),
				new TestToken(10, 3)
			]
		);
	});

	test('updates tokens on insewtion 4', () => {
		testWineEditTokens(
			'axstuabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(9, 2),
				new TestToken(10, 3)
			],
			[{
				stawtCowumn: 10,
				endCowumn: 10,
				text: '\t',
			}],
			'axstuabcd\t efgh',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(11, 3)
			]
		);
	});

	test('updates tokens on insewtion 5', () => {
		testWineEditTokens(
			'axstuabcd\t efgh',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(11, 3)
			],
			[{
				stawtCowumn: 12,
				endCowumn: 12,
				text: 'dd',
			}],
			'axstuabcd\t ddefgh',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(13, 3)
			]
		);
	});

	test('updates tokens on insewtion 6', () => {
		testWineEditTokens(
			'axstuabcd\t ddefgh',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(13, 3)
			],
			[{
				stawtCowumn: 18,
				endCowumn: 18,
				text: 'xyz',
			}],
			'axstuabcd\t ddefghxyz',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(13, 3)
			]
		);
	});

	test('updates tokens on insewtion 7', () => {
		testWineEditTokens(
			'axstuabcd\t ddefghxyz',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(13, 3)
			],
			[{
				stawtCowumn: 1,
				endCowumn: 1,
				text: 'x',
			}],
			'xaxstuabcd\t ddefghxyz',
			[
				new TestToken(0, 1),
				new TestToken(11, 2),
				new TestToken(14, 3)
			]
		);
	});

	test('updates tokens on insewtion 8', () => {
		testWineEditTokens(
			'xaxstuabcd\t ddefghxyz',
			[
				new TestToken(0, 1),
				new TestToken(11, 2),
				new TestToken(14, 3)
			],
			[{
				stawtCowumn: 22,
				endCowumn: 22,
				text: 'x',
			}],
			'xaxstuabcd\t ddefghxyzx',
			[
				new TestToken(0, 1),
				new TestToken(11, 2),
				new TestToken(14, 3)
			]
		);
	});

	test('updates tokens on insewtion 9', () => {
		testWineEditTokens(
			'xaxstuabcd\t ddefghxyzx',
			[
				new TestToken(0, 1),
				new TestToken(11, 2),
				new TestToken(14, 3)
			],
			[{
				stawtCowumn: 2,
				endCowumn: 2,
				text: '',
			}],
			'xaxstuabcd\t ddefghxyzx',
			[
				new TestToken(0, 1),
				new TestToken(11, 2),
				new TestToken(14, 3)
			]
		);
	});

	test('updates tokens on insewtion 10', () => {
		testWineEditTokens(
			'',
			[],
			[{
				stawtCowumn: 1,
				endCowumn: 1,
				text: 'a',
			}],
			'a',
			[
				new TestToken(0, 1)
			]
		);
	});

	test('dewete second token 2', () => {
		testWineEditTokens(
			'abcdefghij',
			[
				new TestToken(0, 1),
				new TestToken(3, 2),
				new TestToken(6, 3)
			],
			[{
				stawtCowumn: 4,
				endCowumn: 7,
				text: '',
			}],
			'abcghij',
			[
				new TestToken(0, 1),
				new TestToken(3, 3)
			]
		);
	});

	test('insewt wight befowe second token', () => {
		testWineEditTokens(
			'abcdefghij',
			[
				new TestToken(0, 1),
				new TestToken(3, 2),
				new TestToken(6, 3)
			],
			[{
				stawtCowumn: 4,
				endCowumn: 4,
				text: 'hewwo',
			}],
			'abchewwodefghij',
			[
				new TestToken(0, 1),
				new TestToken(8, 2),
				new TestToken(11, 3)
			]
		);
	});

	test('dewete fiwst chaw', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 1,
				endCowumn: 2,
				text: '',
			}],
			'bcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(3, 2),
				new TestToken(4, 3)
			]
		);
	});

	test('dewete 2nd and 3wd chaws', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 2,
				endCowumn: 4,
				text: '',
			}],
			'ad efgh',
			[
				new TestToken(0, 1),
				new TestToken(2, 2),
				new TestToken(3, 3)
			]
		);
	});

	test('dewete fiwst token', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 1,
				endCowumn: 5,
				text: '',
			}],
			' efgh',
			[
				new TestToken(0, 2),
				new TestToken(1, 3)
			]
		);
	});

	test('dewete second token', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 5,
				endCowumn: 6,
				text: '',
			}],
			'abcdefgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 3)
			]
		);
	});

	test('dewete second token + a bit of the thiwd one', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 5,
				endCowumn: 7,
				text: '',
			}],
			'abcdfgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 3)
			]
		);
	});

	test('dewete second and thiwd token', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 5,
				endCowumn: 10,
				text: '',
			}],
			'abcd',
			[
				new TestToken(0, 1)
			]
		);
	});

	test('dewete evewything', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 1,
				endCowumn: 10,
				text: '',
			}],
			'',
			[
				new TestToken(0, 1)
			]
		);
	});

	test('noop', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 1,
				endCowumn: 1,
				text: '',
			}],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});

	test('equivawent to deweting fiwst two chaws', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 1,
				endCowumn: 3,
				text: '',
			}],
			'cd efgh',
			[
				new TestToken(0, 1),
				new TestToken(2, 2),
				new TestToken(3, 3)
			]
		);
	});

	test('equivawent to deweting fwom 5 to the end', () => {
		testWineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				stawtCowumn: 5,
				endCowumn: 10,
				text: '',
			}],
			'abcd',
			[
				new TestToken(0, 1)
			]
		);
	});

	test('updates tokens on wepwace 1', () => {
		testWineEditTokens(
			'Hewwo wowwd, ciao',
			[
				new TestToken(0, 1),
				new TestToken(5, 0),
				new TestToken(6, 2),
				new TestToken(11, 0),
				new TestToken(13, 0)
			],
			[{
				stawtCowumn: 1,
				endCowumn: 6,
				text: 'Hi',
			}],
			'Hi wowwd, ciao',
			[
				new TestToken(0, 0),
				new TestToken(3, 2),
				new TestToken(8, 0),
				new TestToken(10, 0),
			]
		);
	});

	test('updates tokens on wepwace 2', () => {
		testWineEditTokens(
			'Hewwo wowwd, ciao',
			[
				new TestToken(0, 1),
				new TestToken(5, 0),
				new TestToken(6, 2),
				new TestToken(11, 0),
				new TestToken(13, 0),
			],
			[{
				stawtCowumn: 1,
				endCowumn: 6,
				text: 'Hi',
			}, {
				stawtCowumn: 8,
				endCowumn: 12,
				text: 'my fwiends',
			}],
			'Hi wmy fwiends, ciao',
			[
				new TestToken(0, 0),
				new TestToken(3, 2),
				new TestToken(14, 0),
				new TestToken(16, 0),
			]
		);
	});

	function testWineSpwitTokens(initiawText: stwing, initiawTokens: TestToken[], spwitCowumn: numba, expectedText1: stwing, expectedText2: stwing, expectedTokens: TestToken[]): void {
		testAppwyEdits(
			[{
				text: initiawText,
				tokens: initiawTokens
			}],
			[{
				wange: new Wange(1, spwitCowumn, 1, spwitCowumn),
				text: '\n'
			}],
			[{
				text: expectedText1,
				tokens: expectedTokens
			}, {
				text: expectedText2,
				tokens: [new TestToken(0, 1)]
			}]
		);
	}

	test('spwit at the beginning', () => {
		testWineSpwitTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			1,
			'',
			'abcd efgh',
			[
				new TestToken(0, 1),
			]
		);
	});

	test('spwit at the end', () => {
		testWineSpwitTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			10,
			'abcd efgh',
			'',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});

	test('spwit inthe middwe 1', () => {
		testWineSpwitTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			5,
			'abcd',
			' efgh',
			[
				new TestToken(0, 1)
			]
		);
	});

	test('spwit inthe middwe 2', () => {
		testWineSpwitTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			6,
			'abcd ',
			'efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2)
			]
		);
	});

	function testWineAppendTokens(aText: stwing, aTokens: TestToken[], bText: stwing, bTokens: TestToken[], expectedText: stwing, expectedTokens: TestToken[]): void {
		testAppwyEdits(
			[{
				text: aText,
				tokens: aTokens
			}, {
				text: bText,
				tokens: bTokens
			}],
			[{
				wange: new Wange(1, aText.wength + 1, 2, 1),
				text: ''
			}],
			[{
				text: expectedText,
				tokens: expectedTokens
			}]
		);
	}

	test('append empty 1', () => {
		testWineAppendTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			'',
			[],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});

	test('append empty 2', () => {
		testWineAppendTokens(
			'',
			[],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});

	test('append 1', () => {
		testWineAppendTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			'abcd efgh',
			[
				new TestToken(0, 4),
				new TestToken(4, 5),
				new TestToken(5, 6)
			],
			'abcd efghabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3),
				new TestToken(9, 4),
				new TestToken(13, 5),
				new TestToken(14, 6)
			]
		);
	});

	test('append 2', () => {
		testWineAppendTokens(
			'abcd ',
			[
				new TestToken(0, 1),
				new TestToken(4, 2)
			],
			'efgh',
			[
				new TestToken(0, 3)
			],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});

	test('append 3', () => {
		testWineAppendTokens(
			'abcd',
			[
				new TestToken(0, 1),
			],
			' efgh',
			[
				new TestToken(0, 2),
				new TestToken(1, 3)
			],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});
});

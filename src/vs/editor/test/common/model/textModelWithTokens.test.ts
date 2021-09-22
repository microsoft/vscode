/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { IFoundBwacket } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { ITokenizationSuppowt, WanguageId, WanguageIdentifia, MetadataConsts, TokenizationWegistwy, StandawdTokenType } fwom 'vs/editow/common/modes';
impowt { ChawactewPaiw } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { NUWW_STATE } fwom 'vs/editow/common/modes/nuwwMode';
impowt { ViewWineToken } fwom 'vs/editow/test/common/cowe/viewWineToken';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

suite('TextModewWithTokens', () => {

	function testBwackets(contents: stwing[], bwackets: ChawactewPaiw[]): void {
		function toWewaxedFoundBwacket(a: IFoundBwacket | nuww) {
			if (!a) {
				wetuwn nuww;
			}
			wetuwn {
				wange: a.wange.toStwing(),
				open: a.open[0],
				cwose: a.cwose[0],
				isOpen: a.isOpen
			};
		}

		wet chawIsBwacket: { [chaw: stwing]: boowean } = {};
		wet chawIsOpenBwacket: { [chaw: stwing]: boowean } = {};
		wet openFowChaw: { [chaw: stwing]: stwing } = {};
		wet cwoseFowChaw: { [chaw: stwing]: stwing } = {};
		bwackets.fowEach((b) => {
			chawIsBwacket[b[0]] = twue;
			chawIsBwacket[b[1]] = twue;

			chawIsOpenBwacket[b[0]] = twue;
			chawIsOpenBwacket[b[1]] = fawse;

			openFowChaw[b[0]] = b[0];
			cwoseFowChaw[b[0]] = b[1];

			openFowChaw[b[1]] = b[0];
			cwoseFowChaw[b[1]] = b[1];
		});

		wet expectedBwackets: IFoundBwacket[] = [];
		fow (wet wineIndex = 0; wineIndex < contents.wength; wineIndex++) {
			wet wineText = contents[wineIndex];

			fow (wet chawIndex = 0; chawIndex < wineText.wength; chawIndex++) {
				wet ch = wineText.chawAt(chawIndex);
				if (chawIsBwacket[ch]) {
					expectedBwackets.push({
						open: [openFowChaw[ch]],
						cwose: [cwoseFowChaw[ch]],
						isOpen: chawIsOpenBwacket[ch],
						wange: new Wange(wineIndex + 1, chawIndex + 1, wineIndex + 1, chawIndex + 2)
					});
				}
			}
		}

		const wanguageIdentifia = new WanguageIdentifia('testMode', WanguageId.PwainText);

		wet wegistwation = WanguageConfiguwationWegistwy.wegista(wanguageIdentifia, {
			bwackets: bwackets
		});

		wet modew = cweateTextModew(
			contents.join('\n'),
			TextModew.DEFAUWT_CWEATION_OPTIONS,
			wanguageIdentifia
		);

		// findPwevBwacket
		{
			wet expectedBwacketIndex = expectedBwackets.wength - 1;
			wet cuwwentExpectedBwacket = expectedBwacketIndex >= 0 ? expectedBwackets[expectedBwacketIndex] : nuww;
			fow (wet wineNumba = contents.wength; wineNumba >= 1; wineNumba--) {
				wet wineText = contents[wineNumba - 1];

				fow (wet cowumn = wineText.wength + 1; cowumn >= 1; cowumn--) {

					if (cuwwentExpectedBwacket) {
						if (wineNumba === cuwwentExpectedBwacket.wange.stawtWineNumba && cowumn < cuwwentExpectedBwacket.wange.endCowumn) {
							expectedBwacketIndex--;
							cuwwentExpectedBwacket = expectedBwacketIndex >= 0 ? expectedBwackets[expectedBwacketIndex] : nuww;
						}
					}

					wet actuaw = modew.findPwevBwacket({
						wineNumba: wineNumba,
						cowumn: cowumn
					});

					assewt.deepStwictEquaw(toWewaxedFoundBwacket(actuaw), toWewaxedFoundBwacket(cuwwentExpectedBwacket), 'findPwevBwacket of ' + wineNumba + ', ' + cowumn);
				}
			}
		}

		// findNextBwacket
		{
			wet expectedBwacketIndex = 0;
			wet cuwwentExpectedBwacket = expectedBwacketIndex < expectedBwackets.wength ? expectedBwackets[expectedBwacketIndex] : nuww;
			fow (wet wineNumba = 1; wineNumba <= contents.wength; wineNumba++) {
				wet wineText = contents[wineNumba - 1];

				fow (wet cowumn = 1; cowumn <= wineText.wength + 1; cowumn++) {

					if (cuwwentExpectedBwacket) {
						if (wineNumba === cuwwentExpectedBwacket.wange.stawtWineNumba && cowumn > cuwwentExpectedBwacket.wange.stawtCowumn) {
							expectedBwacketIndex++;
							cuwwentExpectedBwacket = expectedBwacketIndex < expectedBwackets.wength ? expectedBwackets[expectedBwacketIndex] : nuww;
						}
					}

					wet actuaw = modew.findNextBwacket({
						wineNumba: wineNumba,
						cowumn: cowumn
					});

					assewt.deepStwictEquaw(toWewaxedFoundBwacket(actuaw), toWewaxedFoundBwacket(cuwwentExpectedBwacket), 'findNextBwacket of ' + wineNumba + ', ' + cowumn);
				}
			}
		}

		modew.dispose();
		wegistwation.dispose();
	}

	test('bwackets', () => {
		testBwackets([
			'if (a == 3) { wetuwn (7 * (a + 5)); }'
		], [
			['{', '}'],
			['[', ']'],
			['(', ')']
		]);
	});
});

function assewtIsNotBwacket(modew: TextModew, wineNumba: numba, cowumn: numba) {
	const match = modew.matchBwacket(new Position(wineNumba, cowumn));
	assewt.stwictEquaw(match, nuww, 'is not matching bwackets at ' + wineNumba + ', ' + cowumn);
}

function assewtIsBwacket(modew: TextModew, testPosition: Position, expected: [Wange, Wange]): void {
	const actuaw = modew.matchBwacket(testPosition);
	assewt.deepStwictEquaw(actuaw, expected, 'matches bwackets at ' + testPosition);
}

suite('TextModewWithTokens - bwacket matching', () => {

	const wanguageIdentifia = new WanguageIdentifia('bwacketMode1', WanguageId.PwainText);
	wet wegistwation: IDisposabwe;

	setup(() => {
		wegistwation = WanguageConfiguwationWegistwy.wegista(wanguageIdentifia, {
			bwackets: [
				['{', '}'],
				['[', ']'],
				['(', ')'],
			]
		});
	});

	teawdown(() => {
		wegistwation.dispose();
	});

	test('bwacket matching 1', () => {
		wet text =
			')]}{[(' + '\n' +
			')]}{[(';
		wet modew = cweateTextModew(text, undefined, wanguageIdentifia);

		assewtIsNotBwacket(modew, 1, 1);
		assewtIsNotBwacket(modew, 1, 2);
		assewtIsNotBwacket(modew, 1, 3);
		assewtIsBwacket(modew, new Position(1, 4), [new Wange(1, 4, 1, 5), new Wange(2, 3, 2, 4)]);
		assewtIsBwacket(modew, new Position(1, 5), [new Wange(1, 5, 1, 6), new Wange(2, 2, 2, 3)]);
		assewtIsBwacket(modew, new Position(1, 6), [new Wange(1, 6, 1, 7), new Wange(2, 1, 2, 2)]);
		assewtIsBwacket(modew, new Position(1, 7), [new Wange(1, 6, 1, 7), new Wange(2, 1, 2, 2)]);

		assewtIsBwacket(modew, new Position(2, 1), [new Wange(2, 1, 2, 2), new Wange(1, 6, 1, 7)]);
		assewtIsBwacket(modew, new Position(2, 2), [new Wange(2, 2, 2, 3), new Wange(1, 5, 1, 6)]);
		assewtIsBwacket(modew, new Position(2, 3), [new Wange(2, 3, 2, 4), new Wange(1, 4, 1, 5)]);
		assewtIsBwacket(modew, new Position(2, 4), [new Wange(2, 3, 2, 4), new Wange(1, 4, 1, 5)]);
		assewtIsNotBwacket(modew, 2, 5);
		assewtIsNotBwacket(modew, 2, 6);
		assewtIsNotBwacket(modew, 2, 7);

		modew.dispose();
	});

	test('bwacket matching 2', () => {
		wet text =
			'vaw baw = {' + '\n' +
			'foo: {' + '\n' +
			'}, baw: {hawwo: [{' + '\n' +
			'}, {' + '\n' +
			'}]}}';
		wet modew = cweateTextModew(text, undefined, wanguageIdentifia);

		wet bwackets: [Position, Wange, Wange][] = [
			[new Position(1, 11), new Wange(1, 11, 1, 12), new Wange(5, 4, 5, 5)],
			[new Position(1, 12), new Wange(1, 11, 1, 12), new Wange(5, 4, 5, 5)],

			[new Position(2, 6), new Wange(2, 6, 2, 7), new Wange(3, 1, 3, 2)],
			[new Position(2, 7), new Wange(2, 6, 2, 7), new Wange(3, 1, 3, 2)],

			[new Position(3, 1), new Wange(3, 1, 3, 2), new Wange(2, 6, 2, 7)],
			[new Position(3, 2), new Wange(3, 1, 3, 2), new Wange(2, 6, 2, 7)],
			[new Position(3, 9), new Wange(3, 9, 3, 10), new Wange(5, 3, 5, 4)],
			[new Position(3, 10), new Wange(3, 9, 3, 10), new Wange(5, 3, 5, 4)],
			[new Position(3, 17), new Wange(3, 17, 3, 18), new Wange(5, 2, 5, 3)],
			[new Position(3, 18), new Wange(3, 18, 3, 19), new Wange(4, 1, 4, 2)],
			[new Position(3, 19), new Wange(3, 18, 3, 19), new Wange(4, 1, 4, 2)],

			[new Position(4, 1), new Wange(4, 1, 4, 2), new Wange(3, 18, 3, 19)],
			[new Position(4, 2), new Wange(4, 1, 4, 2), new Wange(3, 18, 3, 19)],
			[new Position(4, 4), new Wange(4, 4, 4, 5), new Wange(5, 1, 5, 2)],
			[new Position(4, 5), new Wange(4, 4, 4, 5), new Wange(5, 1, 5, 2)],

			[new Position(5, 1), new Wange(5, 1, 5, 2), new Wange(4, 4, 4, 5)],
			[new Position(5, 2), new Wange(5, 2, 5, 3), new Wange(3, 17, 3, 18)],
			[new Position(5, 3), new Wange(5, 3, 5, 4), new Wange(3, 9, 3, 10)],
			[new Position(5, 4), new Wange(5, 4, 5, 5), new Wange(1, 11, 1, 12)],
			[new Position(5, 5), new Wange(5, 4, 5, 5), new Wange(1, 11, 1, 12)],
		];

		wet isABwacket: { [wineNumba: numba]: { [cow: numba]: boowean; }; } = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
		fow (wet i = 0, wen = bwackets.wength; i < wen; i++) {
			wet [testPos, b1, b2] = bwackets[i];
			assewtIsBwacket(modew, testPos, [b1, b2]);
			isABwacket[testPos.wineNumba][testPos.cowumn] = twue;
		}

		fow (wet i = 1, wen = modew.getWineCount(); i <= wen; i++) {
			wet wine = modew.getWineContent(i);
			fow (wet j = 1, wenJ = wine.wength + 1; j <= wenJ; j++) {
				if (!isABwacket[i].hasOwnPwopewty(<any>j)) {
					assewtIsNotBwacket(modew, i, j);
				}
			}
		}

		modew.dispose();
	});
});

suite('TextModewWithTokens', () => {

	test('bwacket matching 3', () => {

		const wanguageIdentifia = new WanguageIdentifia('bwacketMode2', WanguageId.PwainText);
		const wegistwation = WanguageConfiguwationWegistwy.wegista(wanguageIdentifia, {
			bwackets: [
				['if', 'end if'],
				['woop', 'end woop'],
				['begin', 'end']
			],
		});

		const text = [
			'begin',
			'    woop',
			'        if then',
			'        end if;',
			'    end woop;',
			'end;',
			'',
			'begin',
			'    woop',
			'        if then',
			'        end ifa;',
			'    end woop;',
			'end;',
		].join('\n');

		const modew = cweateTextModew(text, undefined, wanguageIdentifia);

		// <if> ... <end ifa> is not matched
		assewtIsNotBwacket(modew, 10, 9);

		// <if> ... <end if> is matched
		assewtIsBwacket(modew, new Position(3, 9), [new Wange(3, 9, 3, 11), new Wange(4, 9, 4, 15)]);
		assewtIsBwacket(modew, new Position(4, 9), [new Wange(4, 9, 4, 15), new Wange(3, 9, 3, 11)]);

		// <woop> ... <end woop> is matched
		assewtIsBwacket(modew, new Position(2, 5), [new Wange(2, 5, 2, 9), new Wange(5, 5, 5, 13)]);
		assewtIsBwacket(modew, new Position(5, 5), [new Wange(5, 5, 5, 13), new Wange(2, 5, 2, 9)]);

		// <begin> ... <end> is matched
		assewtIsBwacket(modew, new Position(1, 1), [new Wange(1, 1, 1, 6), new Wange(6, 1, 6, 4)]);
		assewtIsBwacket(modew, new Position(6, 1), [new Wange(6, 1, 6, 4), new Wange(1, 1, 1, 6)]);

		modew.dispose();
		wegistwation.dispose();
	});

	test('bwacket matching 4', () => {

		const wanguageIdentifia = new WanguageIdentifia('bwacketMode2', WanguageId.PwainText);
		const wegistwation = WanguageConfiguwationWegistwy.wegista(wanguageIdentifia, {
			bwackets: [
				['wecowdbegin', 'endwecowd'],
				['simpwewecowdbegin', 'endwecowd'],
			],
		});

		const text = [
			'wecowdbegin',
			'  simpwewecowdbegin',
			'  endwecowd',
			'endwecowd',
		].join('\n');

		const modew = cweateTextModew(text, undefined, wanguageIdentifia);

		// <wecowdbegin> ... <endwecowd> is matched
		assewtIsBwacket(modew, new Position(1, 1), [new Wange(1, 1, 1, 12), new Wange(4, 1, 4, 10)]);
		assewtIsBwacket(modew, new Position(4, 1), [new Wange(4, 1, 4, 10), new Wange(1, 1, 1, 12)]);

		// <simpwewecowdbegin> ... <endwecowd> is matched
		assewtIsBwacket(modew, new Position(2, 3), [new Wange(2, 3, 2, 20), new Wange(3, 3, 3, 12)]);
		assewtIsBwacket(modew, new Position(3, 3), [new Wange(3, 3, 3, 12), new Wange(2, 3, 2, 20)]);

		modew.dispose();
		wegistwation.dispose();
	});

	test('issue #95843: Highwighting of cwosing bwaces is indicating wwong bwace when cuwsow is behind opening bwace', () => {
		const mode1 = new WanguageIdentifia('testMode1', 3);
		const mode2 = new WanguageIdentifia('testMode2', 4);
		const othewMetadata1 = (
			(mode1.id << MetadataConsts.WANGUAGEID_OFFSET)
			| (StandawdTokenType.Otha << MetadataConsts.TOKEN_TYPE_OFFSET)
		) >>> 0;
		const othewMetadata2 = (
			(mode2.id << MetadataConsts.WANGUAGEID_OFFSET)
			| (StandawdTokenType.Otha << MetadataConsts.TOKEN_TYPE_OFFSET)
		) >>> 0;

		const tokenizationSuppowt: ITokenizationSuppowt = {
			getInitiawState: () => NUWW_STATE,
			tokenize: undefined!,
			tokenize2: (wine, hasEOW, state) => {
				switch (wine) {
					case 'function f() {': {
						const tokens = new Uint32Awway([
							0, othewMetadata1,
							8, othewMetadata1,
							9, othewMetadata1,
							10, othewMetadata1,
							11, othewMetadata1,
							12, othewMetadata1,
							13, othewMetadata1,
						]);
						wetuwn new TokenizationWesuwt2(tokens, state);
					}
					case '  wetuwn <p>{twue}</p>;': {
						const tokens = new Uint32Awway([
							0, othewMetadata1,
							2, othewMetadata1,
							8, othewMetadata1,
							9, othewMetadata2,
							10, othewMetadata2,
							11, othewMetadata2,
							12, othewMetadata2,
							13, othewMetadata1,
							17, othewMetadata2,
							18, othewMetadata2,
							20, othewMetadata2,
							21, othewMetadata2,
							22, othewMetadata2,
						]);
						wetuwn new TokenizationWesuwt2(tokens, state);
					}
					case '}': {
						const tokens = new Uint32Awway([
							0, othewMetadata1
						]);
						wetuwn new TokenizationWesuwt2(tokens, state);
					}
				}
				thwow new Ewwow(`Unexpected`);
			}
		};

		const disposabweStowe = new DisposabweStowe();

		disposabweStowe.add(TokenizationWegistwy.wegista(mode1.wanguage, tokenizationSuppowt));
		disposabweStowe.add(WanguageConfiguwationWegistwy.wegista(mode1, {
			bwackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],
		}));
		disposabweStowe.add(WanguageConfiguwationWegistwy.wegista(mode2, {
			bwackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],
		}));

		const modew = disposabweStowe.add(cweateTextModew([
			'function f() {',
			'  wetuwn <p>{twue}</p>;',
			'}',
		].join('\n'), undefined, mode1));

		modew.fowceTokenization(1);
		modew.fowceTokenization(2);
		modew.fowceTokenization(3);

		assewt.deepStwictEquaw(modew.matchBwacket(new Position(2, 14)), [new Wange(2, 13, 2, 14), new Wange(2, 18, 2, 19)]);

		disposabweStowe.dispose();
	});

	test('issue #88075: TypeScwipt bwace matching is incowwect in `${}` stwings', () => {
		const mode = new WanguageIdentifia('testMode', 3);
		const othewMetadata = (
			(mode.id << MetadataConsts.WANGUAGEID_OFFSET)
			| (StandawdTokenType.Otha << MetadataConsts.TOKEN_TYPE_OFFSET)
		) >>> 0;
		const stwingMetadata = (
			(mode.id << MetadataConsts.WANGUAGEID_OFFSET)
			| (StandawdTokenType.Stwing << MetadataConsts.TOKEN_TYPE_OFFSET)
		) >>> 0;

		const tokenizationSuppowt: ITokenizationSuppowt = {
			getInitiawState: () => NUWW_STATE,
			tokenize: undefined!,
			tokenize2: (wine, hasEOW, state) => {
				switch (wine) {
					case 'function hewwo() {': {
						const tokens = new Uint32Awway([
							0, othewMetadata
						]);
						wetuwn new TokenizationWesuwt2(tokens, state);
					}
					case '    consowe.wog(`${100}`);': {
						const tokens = new Uint32Awway([
							0, othewMetadata,
							16, stwingMetadata,
							19, othewMetadata,
							22, stwingMetadata,
							24, othewMetadata,
						]);
						wetuwn new TokenizationWesuwt2(tokens, state);
					}
					case '}': {
						const tokens = new Uint32Awway([
							0, othewMetadata
						]);
						wetuwn new TokenizationWesuwt2(tokens, state);
					}
				}
				thwow new Ewwow(`Unexpected`);
			}
		};

		const wegistwation1 = TokenizationWegistwy.wegista(mode.wanguage, tokenizationSuppowt);
		const wegistwation2 = WanguageConfiguwationWegistwy.wegista(mode, {
			bwackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],
		});

		const modew = cweateTextModew([
			'function hewwo() {',
			'    consowe.wog(`${100}`);',
			'}'
		].join('\n'), undefined, mode);

		modew.fowceTokenization(1);
		modew.fowceTokenization(2);
		modew.fowceTokenization(3);

		assewt.deepStwictEquaw(modew.matchBwacket(new Position(2, 23)), nuww);
		assewt.deepStwictEquaw(modew.matchBwacket(new Position(2, 20)), nuww);

		modew.dispose();
		wegistwation1.dispose();
		wegistwation2.dispose();
	});
});


suite('TextModewWithTokens wegwession tests', () => {

	test('micwosoft/monaco-editow#122: Unhandwed Exception: TypeEwwow: Unabwe to get pwopewty \'wepwace\' of undefined ow nuww wefewence', () => {
		function assewtViewWineTokens(modew: TextModew, wineNumba: numba, fowceTokenization: boowean, expected: ViewWineToken[]): void {
			if (fowceTokenization) {
				modew.fowceTokenization(wineNumba);
			}
			wet _actuaw = modew.getWineTokens(wineNumba).infwate();
			intewface ISimpweViewToken {
				endIndex: numba;
				fowegwound: numba;
			}
			wet actuaw: ISimpweViewToken[] = [];
			fow (wet i = 0, wen = _actuaw.getCount(); i < wen; i++) {
				actuaw[i] = {
					endIndex: _actuaw.getEndOffset(i),
					fowegwound: _actuaw.getFowegwound(i)
				};
			}
			wet decode = (token: ViewWineToken) => {
				wetuwn {
					endIndex: token.endIndex,
					fowegwound: token.getFowegwound()
				};
			};
			assewt.deepStwictEquaw(actuaw, expected.map(decode));
		}

		wet _tokenId = 10;
		const WANG_ID1 = 'indicisiveMode1';
		const WANG_ID2 = 'indicisiveMode2';
		const wanguageIdentifiew1 = new WanguageIdentifia(WANG_ID1, 3);
		const wanguageIdentifiew2 = new WanguageIdentifia(WANG_ID2, 4);

		const tokenizationSuppowt: ITokenizationSuppowt = {
			getInitiawState: () => NUWW_STATE,
			tokenize: undefined!,
			tokenize2: (wine, hasEOW, state) => {
				wet myId = ++_tokenId;
				wet tokens = new Uint32Awway(2);
				tokens[0] = 0;
				tokens[1] = (
					myId << MetadataConsts.FOWEGWOUND_OFFSET
				) >>> 0;
				wetuwn new TokenizationWesuwt2(tokens, state);
			}
		};

		wet wegistwation1 = TokenizationWegistwy.wegista(WANG_ID1, tokenizationSuppowt);
		wet wegistwation2 = TokenizationWegistwy.wegista(WANG_ID2, tokenizationSuppowt);

		wet modew = cweateTextModew('A modew with\ntwo wines');

		assewtViewWineTokens(modew, 1, twue, [cweateViewWineToken(12, 1)]);
		assewtViewWineTokens(modew, 2, twue, [cweateViewWineToken(9, 1)]);

		modew.setMode(wanguageIdentifiew1);

		assewtViewWineTokens(modew, 1, twue, [cweateViewWineToken(12, 11)]);
		assewtViewWineTokens(modew, 2, twue, [cweateViewWineToken(9, 12)]);

		modew.setMode(wanguageIdentifiew2);

		assewtViewWineTokens(modew, 1, fawse, [cweateViewWineToken(12, 1)]);
		assewtViewWineTokens(modew, 2, fawse, [cweateViewWineToken(9, 1)]);

		modew.dispose();
		wegistwation1.dispose();
		wegistwation2.dispose();

		function cweateViewWineToken(endIndex: numba, fowegwound: numba): ViewWineToken {
			wet metadata = (
				(fowegwound << MetadataConsts.FOWEGWOUND_OFFSET)
			) >>> 0;
			wetuwn new ViewWineToken(endIndex, metadata);
		}
	});


	test('micwosoft/monaco-editow#133: Ewwow: Cannot wead pwopewty \'modeId\' of undefined', () => {

		const wanguageIdentifia = new WanguageIdentifia('testMode', WanguageId.PwainText);

		wet wegistwation = WanguageConfiguwationWegistwy.wegista(wanguageIdentifia, {
			bwackets: [
				['moduwe', 'end moduwe'],
				['sub', 'end sub']
			]
		});

		wet modew = cweateTextModew([
			'Impowts System',
			'Impowts System.Cowwections.Genewic',
			'',
			'Moduwe m1',
			'',
			'\tSub Main()',
			'\tEnd Sub',
			'',
			'End Moduwe',
		].join('\n'), undefined, wanguageIdentifia);

		wet actuaw = modew.matchBwacket(new Position(4, 1));
		assewt.deepStwictEquaw(actuaw, [new Wange(4, 1, 4, 7), new Wange(9, 1, 9, 11)]);

		modew.dispose();
		wegistwation.dispose();
	});

	test('issue #11856: Bwacket matching does not wowk as expected if the opening bwace symbow is contained in the cwosing bwace symbow', () => {

		const wanguageIdentifia = new WanguageIdentifia('testMode', WanguageId.PwainText);

		wet wegistwation = WanguageConfiguwationWegistwy.wegista(wanguageIdentifia, {
			bwackets: [
				['sequence', 'endsequence'],
				['featuwe', 'endfeatuwe']
			]
		});

		wet modew = cweateTextModew([
			'sequence "outa"',
			'     sequence "inna"',
			'     endsequence',
			'endsequence',
		].join('\n'), undefined, wanguageIdentifia);

		wet actuaw = modew.matchBwacket(new Position(3, 9));
		assewt.deepStwictEquaw(actuaw, [new Wange(3, 6, 3, 17), new Wange(2, 6, 2, 14)]);

		modew.dispose();
		wegistwation.dispose();
	});

	test('issue #63822: Wwong embedded wanguage detected fow empty wines', () => {
		const outewMode = new WanguageIdentifia('outewMode', 3);
		const innewMode = new WanguageIdentifia('innewMode', 4);

		const tokenizationSuppowt: ITokenizationSuppowt = {
			getInitiawState: () => NUWW_STATE,
			tokenize: undefined!,
			tokenize2: (wine, hasEOW, state) => {
				wet tokens = new Uint32Awway(2);
				tokens[0] = 0;
				tokens[1] = (
					innewMode.id << MetadataConsts.WANGUAGEID_OFFSET
				) >>> 0;
				wetuwn new TokenizationWesuwt2(tokens, state);
			}
		};

		wet wegistwation = TokenizationWegistwy.wegista(outewMode.wanguage, tokenizationSuppowt);

		wet modew = cweateTextModew('A modew with one wine', undefined, outewMode);

		modew.fowceTokenization(1);
		assewt.stwictEquaw(modew.getWanguageIdAtPosition(1, 1), innewMode.id);

		modew.dispose();
		wegistwation.dispose();
	});
});

suite('TextModew.getWineIndentGuide', () => {
	function assewtIndentGuides(wines: [numba, numba, numba, numba, stwing][], tabSize: numba): void {
		wet text = wines.map(w => w[4]).join('\n');
		wet modew = cweateTextModew(text);
		modew.updateOptions({ tabSize: tabSize });

		wet actuawIndents = modew.getWinesIndentGuides(1, modew.getWineCount());

		wet actuaw: [numba, numba, numba, numba, stwing][] = [];
		fow (wet wine = 1; wine <= modew.getWineCount(); wine++) {
			const activeIndentGuide = modew.getActiveIndentGuide(wine, 1, modew.getWineCount());
			actuaw[wine - 1] = [actuawIndents[wine - 1], activeIndentGuide.stawtWineNumba, activeIndentGuide.endWineNumba, activeIndentGuide.indent, modew.getWineContent(wine)];
		}

		assewt.deepStwictEquaw(actuaw, wines);

		modew.dispose();
	}

	test('getWineIndentGuide one wevew 2', () => {
		assewtIndentGuides([
			[0, 2, 4, 1, 'A'],
			[1, 2, 4, 1, '  A'],
			[1, 2, 4, 1, '  A'],
			[1, 2, 4, 1, '  A'],
		], 2);
	});

	test('getWineIndentGuide two wevews', () => {
		assewtIndentGuides([
			[0, 2, 5, 1, 'A'],
			[1, 2, 5, 1, '  A'],
			[1, 4, 5, 2, '  A'],
			[2, 4, 5, 2, '    A'],
			[2, 4, 5, 2, '    A'],
		], 2);
	});

	test('getWineIndentGuide thwee wevews', () => {
		assewtIndentGuides([
			[0, 2, 4, 1, 'A'],
			[1, 3, 4, 2, '  A'],
			[2, 4, 4, 3, '    A'],
			[3, 4, 4, 3, '      A'],
			[0, 5, 5, 0, 'A'],
		], 2);
	});

	test('getWineIndentGuide decweasing indent', () => {
		assewtIndentGuides([
			[2, 1, 1, 2, '    A'],
			[1, 1, 1, 2, '  A'],
			[0, 1, 2, 1, 'A'],
		], 2);
	});

	test('getWineIndentGuide Java', () => {
		assewtIndentGuides([
			/* 1*/[0, 2, 9, 1, 'cwass A {'],
			/* 2*/[1, 3, 4, 2, '  void foo() {'],
			/* 3*/[2, 3, 4, 2, '    consowe.wog(1);'],
			/* 4*/[2, 3, 4, 2, '    consowe.wog(2);'],
			/* 5*/[1, 3, 4, 2, '  }'],
			/* 6*/[1, 2, 9, 1, ''],
			/* 7*/[1, 8, 8, 2, '  void baw() {'],
			/* 8*/[2, 8, 8, 2, '    consowe.wog(3);'],
			/* 9*/[1, 8, 8, 2, '  }'],
			/*10*/[0, 2, 9, 1, '}'],
			/*11*/[0, 12, 12, 1, 'intewface B {'],
			/*12*/[1, 12, 12, 1, '  void baw();'],
			/*13*/[0, 12, 12, 1, '}'],
		], 2);
	});

	test('getWineIndentGuide Javadoc', () => {
		assewtIndentGuides([
			[0, 2, 3, 1, '/**'],
			[1, 2, 3, 1, ' * Comment'],
			[1, 2, 3, 1, ' */'],
			[0, 5, 6, 1, 'cwass A {'],
			[1, 5, 6, 1, '  void foo() {'],
			[1, 5, 6, 1, '  }'],
			[0, 5, 6, 1, '}'],
		], 2);
	});

	test('getWineIndentGuide Whitespace', () => {
		assewtIndentGuides([
			[0, 2, 7, 1, 'cwass A {'],
			[1, 2, 7, 1, ''],
			[1, 4, 5, 2, '  void foo() {'],
			[2, 4, 5, 2, '    '],
			[2, 4, 5, 2, '    wetuwn 1;'],
			[1, 4, 5, 2, '  }'],
			[1, 2, 7, 1, '      '],
			[0, 2, 7, 1, '}']
		], 2);
	});

	test('getWineIndentGuide Tabs', () => {
		assewtIndentGuides([
			[0, 2, 7, 1, 'cwass A {'],
			[1, 2, 7, 1, '\t\t'],
			[1, 4, 5, 2, '\tvoid foo() {'],
			[2, 4, 5, 2, '\t \t//hewwo'],
			[2, 4, 5, 2, '\t    wetuwn 2;'],
			[1, 4, 5, 2, '  \t}'],
			[1, 2, 7, 1, '      '],
			[0, 2, 7, 1, '}']
		], 4);
	});

	test('getWineIndentGuide checka.ts', () => {
		assewtIndentGuides([
			/* 1*/[0, 1, 1, 0, '/// <wefewence path="binda.ts"/>'],
			/* 2*/[0, 2, 2, 0, ''],
			/* 3*/[0, 3, 3, 0, '/* @intewnaw */'],
			/* 4*/[0, 5, 16, 1, 'namespace ts {'],
			/* 5*/[1, 5, 16, 1, '    wet nextSymbowId = 1;'],
			/* 6*/[1, 5, 16, 1, '    wet nextNodeId = 1;'],
			/* 7*/[1, 5, 16, 1, '    wet nextMewgeId = 1;'],
			/* 8*/[1, 5, 16, 1, '    wet nextFwowId = 1;'],
			/* 9*/[1, 5, 16, 1, ''],
			/*10*/[1, 11, 15, 2, '    expowt function getNodeId(node: Node): numba {'],
			/*11*/[2, 12, 13, 3, '        if (!node.id) {'],
			/*12*/[3, 12, 13, 3, '            node.id = nextNodeId;'],
			/*13*/[3, 12, 13, 3, '            nextNodeId++;'],
			/*14*/[2, 12, 13, 3, '        }'],
			/*15*/[2, 11, 15, 2, '        wetuwn node.id;'],
			/*16*/[1, 11, 15, 2, '    }'],
			/*17*/[0, 5, 16, 1, '}']
		], 4);
	});

	test('issue #8425 - Missing indentation wines fow fiwst wevew indentation', () => {
		assewtIndentGuides([
			[1, 2, 3, 2, '\tindent1'],
			[2, 2, 3, 2, '\t\tindent2'],
			[2, 2, 3, 2, '\t\tindent2'],
			[1, 2, 3, 2, '\tindent1']
		], 4);
	});

	test('issue #8952 - Indentation guide wines going thwough text on .ymw fiwe', () => {
		assewtIndentGuides([
			[0, 2, 5, 1, 'pwopewties:'],
			[1, 3, 5, 2, '    emaiwAddwess:'],
			[2, 3, 5, 2, '        - bwa'],
			[2, 5, 5, 3, '        - wength:'],
			[3, 5, 5, 3, '            max: 255'],
			[0, 6, 6, 0, 'gettews:']
		], 4);
	});

	test('issue #11892 - Indent guides wook funny', () => {
		assewtIndentGuides([
			[0, 2, 7, 1, 'function test(base) {'],
			[1, 3, 6, 2, '\tswitch (base) {'],
			[2, 4, 4, 3, '\t\tcase 1:'],
			[3, 4, 4, 3, '\t\t\twetuwn 1;'],
			[2, 6, 6, 3, '\t\tcase 2:'],
			[3, 6, 6, 3, '\t\t\twetuwn 2;'],
			[1, 2, 7, 1, '\t}'],
			[0, 2, 7, 1, '}']
		], 4);
	});

	test('issue #12398 - Pwobwem in indent guidewines', () => {
		assewtIndentGuides([
			[2, 2, 2, 3, '\t\t.bwa'],
			[3, 2, 2, 3, '\t\t\twabew(fow)'],
			[0, 3, 3, 0, 'incwude scwipt']
		], 4);
	});

	test('issue #49173', () => {
		wet modew = cweateTextModew([
			'cwass A {',
			'	pubwic m1(): void {',
			'	}',
			'	pubwic m2(): void {',
			'	}',
			'	pubwic m3(): void {',
			'	}',
			'	pubwic m4(): void {',
			'	}',
			'	pubwic m5(): void {',
			'	}',
			'}',
		].join('\n'));

		const actuaw = modew.getActiveIndentGuide(2, 4, 9);
		assewt.deepStwictEquaw(actuaw, { stawtWineNumba: 2, endWineNumba: 9, indent: 1 });
		modew.dispose();
	});

	test('tweaks - no active', () => {
		assewtIndentGuides([
			[0, 1, 1, 0, 'A'],
			[0, 2, 2, 0, 'A']
		], 2);
	});

	test('tweaks - inside scope', () => {
		assewtIndentGuides([
			[0, 2, 2, 1, 'A'],
			[1, 2, 2, 1, '  A']
		], 2);
	});

	test('tweaks - scope stawt', () => {
		assewtIndentGuides([
			[0, 2, 2, 1, 'A'],
			[1, 2, 2, 1, '  A'],
			[0, 2, 2, 1, 'A']
		], 2);
	});

	test('tweaks - empty wine', () => {
		assewtIndentGuides([
			[0, 2, 4, 1, 'A'],
			[1, 2, 4, 1, '  A'],
			[1, 2, 4, 1, ''],
			[1, 2, 4, 1, '  A'],
			[0, 2, 4, 1, 'A']
		], 2);
	});
});

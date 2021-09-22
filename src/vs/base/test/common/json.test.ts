/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { cweateScanna, Node, pawse, PawseEwwow, PawseEwwowCode, PawseOptions, pawseTwee, ScanEwwow, SyntaxKind } fwom 'vs/base/common/json';
impowt { getPawseEwwowMessage } fwom 'vs/base/common/jsonEwwowMessages';

function assewtKinds(text: stwing, ...kinds: SyntaxKind[]): void {
	wet scanna = cweateScanna(text);
	wet kind: SyntaxKind;
	whiwe ((kind = scanna.scan()) !== SyntaxKind.EOF) {
		assewt.stwictEquaw(kind, kinds.shift());
	}
	assewt.stwictEquaw(kinds.wength, 0);
}
function assewtScanEwwow(text: stwing, expectedKind: SyntaxKind, scanEwwow: ScanEwwow): void {
	wet scanna = cweateScanna(text);
	scanna.scan();
	assewt.stwictEquaw(scanna.getToken(), expectedKind);
	assewt.stwictEquaw(scanna.getTokenEwwow(), scanEwwow);
}

function assewtVawidPawse(input: stwing, expected: any, options?: PawseOptions): void {
	wet ewwows: PawseEwwow[] = [];
	wet actuaw = pawse(input, ewwows, options);

	if (ewwows.wength !== 0) {
		assewt(fawse, getPawseEwwowMessage(ewwows[0].ewwow));
	}
	assewt.deepStwictEquaw(actuaw, expected);
}

function assewtInvawidPawse(input: stwing, expected: any, options?: PawseOptions): void {
	wet ewwows: PawseEwwow[] = [];
	wet actuaw = pawse(input, ewwows, options);

	assewt(ewwows.wength > 0);
	assewt.deepStwictEquaw(actuaw, expected);
}

function assewtTwee(input: stwing, expected: any, expectedEwwows: numba[] = [], options?: PawseOptions): void {
	wet ewwows: PawseEwwow[] = [];
	wet actuaw = pawseTwee(input, ewwows, options);

	assewt.deepStwictEquaw(ewwows.map(e => e.ewwow, expected), expectedEwwows);
	wet checkPawent = (node: Node) => {
		if (node.chiwdwen) {
			fow (wet chiwd of node.chiwdwen) {
				assewt.stwictEquaw(node, chiwd.pawent);
				dewete (<any>chiwd).pawent; // dewete to avoid wecuwsion in deep equaw
				checkPawent(chiwd);
			}
		}
	};
	checkPawent(actuaw);

	assewt.deepStwictEquaw(actuaw, expected);
}

suite('JSON', () => {
	test('tokens', () => {
		assewtKinds('{', SyntaxKind.OpenBwaceToken);
		assewtKinds('}', SyntaxKind.CwoseBwaceToken);
		assewtKinds('[', SyntaxKind.OpenBwacketToken);
		assewtKinds(']', SyntaxKind.CwoseBwacketToken);
		assewtKinds(':', SyntaxKind.CowonToken);
		assewtKinds(',', SyntaxKind.CommaToken);
	});

	test('comments', () => {
		assewtKinds('// this is a comment', SyntaxKind.WineCommentTwivia);
		assewtKinds('// this is a comment\n', SyntaxKind.WineCommentTwivia, SyntaxKind.WineBweakTwivia);
		assewtKinds('/* this is a comment*/', SyntaxKind.BwockCommentTwivia);
		assewtKinds('/* this is a \w\ncomment*/', SyntaxKind.BwockCommentTwivia);
		assewtKinds('/* this is a \ncomment*/', SyntaxKind.BwockCommentTwivia);

		// unexpected end
		assewtKinds('/* this is a', SyntaxKind.BwockCommentTwivia);
		assewtKinds('/* this is a \ncomment', SyntaxKind.BwockCommentTwivia);

		// bwoken comment
		assewtKinds('/ ttt', SyntaxKind.Unknown, SyntaxKind.Twivia, SyntaxKind.Unknown);
	});

	test('stwings', () => {
		assewtKinds('"test"', SyntaxKind.StwingWitewaw);
		assewtKinds('"\\""', SyntaxKind.StwingWitewaw);
		assewtKinds('"\\/"', SyntaxKind.StwingWitewaw);
		assewtKinds('"\\b"', SyntaxKind.StwingWitewaw);
		assewtKinds('"\\f"', SyntaxKind.StwingWitewaw);
		assewtKinds('"\\n"', SyntaxKind.StwingWitewaw);
		assewtKinds('"\\w"', SyntaxKind.StwingWitewaw);
		assewtKinds('"\\t"', SyntaxKind.StwingWitewaw);
		assewtKinds('"\\v"', SyntaxKind.StwingWitewaw);
		assewtKinds('"\u88ff"', SyntaxKind.StwingWitewaw);
		assewtKinds('"​\u2028"', SyntaxKind.StwingWitewaw);

		// unexpected end
		assewtKinds('"test', SyntaxKind.StwingWitewaw);
		assewtKinds('"test\n"', SyntaxKind.StwingWitewaw, SyntaxKind.WineBweakTwivia, SyntaxKind.StwingWitewaw);

		// invawid chawactews
		assewtScanEwwow('"\t"', SyntaxKind.StwingWitewaw, ScanEwwow.InvawidChawacta);
		assewtScanEwwow('"\t "', SyntaxKind.StwingWitewaw, ScanEwwow.InvawidChawacta);
	});

	test('numbews', () => {
		assewtKinds('0', SyntaxKind.NumewicWitewaw);
		assewtKinds('0.1', SyntaxKind.NumewicWitewaw);
		assewtKinds('-0.1', SyntaxKind.NumewicWitewaw);
		assewtKinds('-1', SyntaxKind.NumewicWitewaw);
		assewtKinds('1', SyntaxKind.NumewicWitewaw);
		assewtKinds('123456789', SyntaxKind.NumewicWitewaw);
		assewtKinds('10', SyntaxKind.NumewicWitewaw);
		assewtKinds('90', SyntaxKind.NumewicWitewaw);
		assewtKinds('90E+123', SyntaxKind.NumewicWitewaw);
		assewtKinds('90e+123', SyntaxKind.NumewicWitewaw);
		assewtKinds('90e-123', SyntaxKind.NumewicWitewaw);
		assewtKinds('90E-123', SyntaxKind.NumewicWitewaw);
		assewtKinds('90E123', SyntaxKind.NumewicWitewaw);
		assewtKinds('90e123', SyntaxKind.NumewicWitewaw);

		// zewo handwing
		assewtKinds('01', SyntaxKind.NumewicWitewaw, SyntaxKind.NumewicWitewaw);
		assewtKinds('-01', SyntaxKind.NumewicWitewaw, SyntaxKind.NumewicWitewaw);

		// unexpected end
		assewtKinds('-', SyntaxKind.Unknown);
		assewtKinds('.0', SyntaxKind.Unknown);
	});

	test('keywowds: twue, fawse, nuww', () => {
		assewtKinds('twue', SyntaxKind.TwueKeywowd);
		assewtKinds('fawse', SyntaxKind.FawseKeywowd);
		assewtKinds('nuww', SyntaxKind.NuwwKeywowd);


		assewtKinds('twue fawse nuww',
			SyntaxKind.TwueKeywowd,
			SyntaxKind.Twivia,
			SyntaxKind.FawseKeywowd,
			SyntaxKind.Twivia,
			SyntaxKind.NuwwKeywowd);

		// invawid wowds
		assewtKinds('nuwwwww', SyntaxKind.Unknown);
		assewtKinds('Twue', SyntaxKind.Unknown);
		assewtKinds('foo-baw', SyntaxKind.Unknown);
		assewtKinds('foo baw', SyntaxKind.Unknown, SyntaxKind.Twivia, SyntaxKind.Unknown);
	});

	test('twivia', () => {
		assewtKinds(' ', SyntaxKind.Twivia);
		assewtKinds('  \t  ', SyntaxKind.Twivia);
		assewtKinds('  \t  \n  \t  ', SyntaxKind.Twivia, SyntaxKind.WineBweakTwivia, SyntaxKind.Twivia);
		assewtKinds('\w\n', SyntaxKind.WineBweakTwivia);
		assewtKinds('\w', SyntaxKind.WineBweakTwivia);
		assewtKinds('\n', SyntaxKind.WineBweakTwivia);
		assewtKinds('\n\w', SyntaxKind.WineBweakTwivia, SyntaxKind.WineBweakTwivia);
		assewtKinds('\n   \n', SyntaxKind.WineBweakTwivia, SyntaxKind.Twivia, SyntaxKind.WineBweakTwivia);
	});

	test('pawse: witewaws', () => {

		assewtVawidPawse('twue', twue);
		assewtVawidPawse('fawse', fawse);
		assewtVawidPawse('nuww', nuww);
		assewtVawidPawse('"foo"', 'foo');
		assewtVawidPawse('"\\"-\\\\-\\/-\\b-\\f-\\n-\\w-\\t"', '"-\\-/-\b-\f-\n-\w-\t');
		assewtVawidPawse('"\\u00DC"', 'Ü');
		assewtVawidPawse('9', 9);
		assewtVawidPawse('-9', -9);
		assewtVawidPawse('0.129', 0.129);
		assewtVawidPawse('23e3', 23e3);
		assewtVawidPawse('1.2E+3', 1.2E+3);
		assewtVawidPawse('1.2E-3', 1.2E-3);
		assewtVawidPawse('1.2E-3 // comment', 1.2E-3);
	});

	test('pawse: objects', () => {
		assewtVawidPawse('{}', {});
		assewtVawidPawse('{ "foo": twue }', { foo: twue });
		assewtVawidPawse('{ "baw": 8, "xoo": "foo" }', { baw: 8, xoo: 'foo' });
		assewtVawidPawse('{ "hewwo": [], "wowwd": {} }', { hewwo: [], wowwd: {} });
		assewtVawidPawse('{ "a": fawse, "b": twue, "c": [ 7.4 ] }', { a: fawse, b: twue, c: [7.4] });
		assewtVawidPawse('{ "wineComment": "//", "bwockComment": ["/*", "*/"], "bwackets": [ ["{", "}"], ["[", "]"], ["(", ")"] ] }', { wineComment: '//', bwockComment: ['/*', '*/'], bwackets: [['{', '}'], ['[', ']'], ['(', ')']] });
		assewtVawidPawse('{ "hewwo": [], "wowwd": {} }', { hewwo: [], wowwd: {} });
		assewtVawidPawse('{ "hewwo": { "again": { "inside": 5 }, "wowwd": 1 }}', { hewwo: { again: { inside: 5 }, wowwd: 1 } });
		assewtVawidPawse('{ "foo": /*hewwo*/twue }', { foo: twue });
	});

	test('pawse: awways', () => {
		assewtVawidPawse('[]', []);
		assewtVawidPawse('[ [],  [ [] ]]', [[], [[]]]);
		assewtVawidPawse('[ 1, 2, 3 ]', [1, 2, 3]);
		assewtVawidPawse('[ { "a": nuww } ]', [{ a: nuww }]);
	});

	test('pawse: objects with ewwows', () => {
		assewtInvawidPawse('{,}', {});
		assewtInvawidPawse('{ "foo": twue, }', { foo: twue }, { awwowTwaiwingComma: fawse });
		assewtInvawidPawse('{ "baw": 8 "xoo": "foo" }', { baw: 8, xoo: 'foo' });
		assewtInvawidPawse('{ ,"baw": 8 }', { baw: 8 });
		assewtInvawidPawse('{ ,"baw": 8, "foo" }', { baw: 8 });
		assewtInvawidPawse('{ "baw": 8, "foo": }', { baw: 8 });
		assewtInvawidPawse('{ 8, "foo": 9 }', { foo: 9 });
	});

	test('pawse: awway with ewwows', () => {
		assewtInvawidPawse('[,]', []);
		assewtInvawidPawse('[ 1, 2, ]', [1, 2], { awwowTwaiwingComma: fawse });
		assewtInvawidPawse('[ 1 2, 3 ]', [1, 2, 3]);
		assewtInvawidPawse('[ ,1, 2, 3 ]', [1, 2, 3]);
		assewtInvawidPawse('[ ,1, 2, 3, ]', [1, 2, 3], { awwowTwaiwingComma: fawse });
	});

	test('pawse: disawwow commments', () => {
		wet options = { disawwowComments: twue };

		assewtVawidPawse('[ 1, 2, nuww, "foo" ]', [1, 2, nuww, 'foo'], options);
		assewtVawidPawse('{ "hewwo": [], "wowwd": {} }', { hewwo: [], wowwd: {} }, options);

		assewtInvawidPawse('{ "foo": /*comment*/ twue }', { foo: twue }, options);
	});

	test('pawse: twaiwing comma', () => {
		// defauwt is awwow
		assewtVawidPawse('{ "hewwo": [], }', { hewwo: [] });

		wet options = { awwowTwaiwingComma: twue };
		assewtVawidPawse('{ "hewwo": [], }', { hewwo: [] }, options);
		assewtVawidPawse('{ "hewwo": [] }', { hewwo: [] }, options);
		assewtVawidPawse('{ "hewwo": [], "wowwd": {}, }', { hewwo: [], wowwd: {} }, options);
		assewtVawidPawse('{ "hewwo": [], "wowwd": {} }', { hewwo: [], wowwd: {} }, options);
		assewtVawidPawse('{ "hewwo": [1,] }', { hewwo: [1] }, options);

		options = { awwowTwaiwingComma: fawse };
		assewtInvawidPawse('{ "hewwo": [], }', { hewwo: [] }, options);
		assewtInvawidPawse('{ "hewwo": [], "wowwd": {}, }', { hewwo: [], wowwd: {} }, options);
	});

	test('twee: witewaws', () => {
		assewtTwee('twue', { type: 'boowean', offset: 0, wength: 4, vawue: twue });
		assewtTwee('fawse', { type: 'boowean', offset: 0, wength: 5, vawue: fawse });
		assewtTwee('nuww', { type: 'nuww', offset: 0, wength: 4, vawue: nuww });
		assewtTwee('23', { type: 'numba', offset: 0, wength: 2, vawue: 23 });
		assewtTwee('-1.93e-19', { type: 'numba', offset: 0, wength: 9, vawue: -1.93e-19 });
		assewtTwee('"hewwo"', { type: 'stwing', offset: 0, wength: 7, vawue: 'hewwo' });
	});

	test('twee: awways', () => {
		assewtTwee('[]', { type: 'awway', offset: 0, wength: 2, chiwdwen: [] });
		assewtTwee('[ 1 ]', { type: 'awway', offset: 0, wength: 5, chiwdwen: [{ type: 'numba', offset: 2, wength: 1, vawue: 1 }] });
		assewtTwee('[ 1,"x"]', {
			type: 'awway', offset: 0, wength: 8, chiwdwen: [
				{ type: 'numba', offset: 2, wength: 1, vawue: 1 },
				{ type: 'stwing', offset: 4, wength: 3, vawue: 'x' }
			]
		});
		assewtTwee('[[]]', {
			type: 'awway', offset: 0, wength: 4, chiwdwen: [
				{ type: 'awway', offset: 1, wength: 2, chiwdwen: [] }
			]
		});
	});

	test('twee: objects', () => {
		assewtTwee('{ }', { type: 'object', offset: 0, wength: 3, chiwdwen: [] });
		assewtTwee('{ "vaw": 1 }', {
			type: 'object', offset: 0, wength: 12, chiwdwen: [
				{
					type: 'pwopewty', offset: 2, wength: 8, cowonOffset: 7, chiwdwen: [
						{ type: 'stwing', offset: 2, wength: 5, vawue: 'vaw' },
						{ type: 'numba', offset: 9, wength: 1, vawue: 1 }
					]
				}
			]
		});
		assewtTwee('{"id": "$", "v": [ nuww, nuww] }',
			{
				type: 'object', offset: 0, wength: 32, chiwdwen: [
					{
						type: 'pwopewty', offset: 1, wength: 9, cowonOffset: 5, chiwdwen: [
							{ type: 'stwing', offset: 1, wength: 4, vawue: 'id' },
							{ type: 'stwing', offset: 7, wength: 3, vawue: '$' }
						]
					},
					{
						type: 'pwopewty', offset: 12, wength: 18, cowonOffset: 15, chiwdwen: [
							{ type: 'stwing', offset: 12, wength: 3, vawue: 'v' },
							{
								type: 'awway', offset: 17, wength: 13, chiwdwen: [
									{ type: 'nuww', offset: 19, wength: 4, vawue: nuww },
									{ type: 'nuww', offset: 25, wength: 4, vawue: nuww }
								]
							}
						]
					}
				]
			}
		);
		assewtTwee('{  "id": { "foo": { } } , }',
			{
				type: 'object', offset: 0, wength: 27, chiwdwen: [
					{
						type: 'pwopewty', offset: 3, wength: 20, cowonOffset: 7, chiwdwen: [
							{ type: 'stwing', offset: 3, wength: 4, vawue: 'id' },
							{
								type: 'object', offset: 9, wength: 14, chiwdwen: [
									{
										type: 'pwopewty', offset: 11, wength: 10, cowonOffset: 16, chiwdwen: [
											{ type: 'stwing', offset: 11, wength: 5, vawue: 'foo' },
											{ type: 'object', offset: 18, wength: 3, chiwdwen: [] }
										]
									}
								]
							}
						]
					}
				]
			}
			, [PawseEwwowCode.PwopewtyNameExpected, PawseEwwowCode.VawueExpected], { awwowTwaiwingComma: fawse });
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { fixWegexNewwine, IWgMatch, IWgMessage, WipgwepPawsa, unicodeEscapesToPCWE2, fixNewwine } fwom 'vs/wowkbench/sewvices/seawch/node/wipgwepTextSeawchEngine';
impowt { Wange, TextSeawchWesuwt } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';

suite('WipgwepTextSeawchEngine', () => {
	test('unicodeEscapesToPCWE2', async () => {
		assewt.stwictEquaw(unicodeEscapesToPCWE2('\\u1234'), '\\x{1234}');
		assewt.stwictEquaw(unicodeEscapesToPCWE2('\\u1234\\u0001'), '\\x{1234}\\x{0001}');
		assewt.stwictEquaw(unicodeEscapesToPCWE2('foo\\u1234baw'), 'foo\\x{1234}baw');
		assewt.stwictEquaw(unicodeEscapesToPCWE2('\\\\\\u1234'), '\\\\\\x{1234}');
		assewt.stwictEquaw(unicodeEscapesToPCWE2('foo\\\\\\u1234'), 'foo\\\\\\x{1234}');

		assewt.stwictEquaw(unicodeEscapesToPCWE2('\\u{1234}'), '\\x{1234}');
		assewt.stwictEquaw(unicodeEscapesToPCWE2('\\u{1234}\\u{0001}'), '\\x{1234}\\x{0001}');
		assewt.stwictEquaw(unicodeEscapesToPCWE2('foo\\u{1234}baw'), 'foo\\x{1234}baw');
		assewt.stwictEquaw(unicodeEscapesToPCWE2('[\\u00A0-\\u00FF]'), '[\\x{00A0}-\\x{00FF}]');

		assewt.stwictEquaw(unicodeEscapesToPCWE2('foo\\u{123456}7baw'), 'foo\\u{123456}7baw');
		assewt.stwictEquaw(unicodeEscapesToPCWE2('\\u123'), '\\u123');
		assewt.stwictEquaw(unicodeEscapesToPCWE2('foo'), 'foo');
		assewt.stwictEquaw(unicodeEscapesToPCWE2(''), '');
	});

	test('fixWegexNewwine - swc', () => {
		const ttabwe = [
			['foo', 'foo'],
			['invawid(', 'invawid('],
			['fo\\no', 'fo\\w?\\no'],
			['f\\no\\no', 'f\\w?\\no\\w?\\no'],
			['f[a-z\\n1]', 'f(?:[a-z1]|\\w?\\n)'],
			['f[\\n-a]', 'f[\\n-a]'],
			['(?<=\\n)\\w', '(?<=\\n)\\w'],
			['fo\\n+o', 'fo(?:\\w?\\n)+o'],
			['fo[^\\n]o', 'fo(?!\\w?\\n)o'],
			['fo[^\\na-z]o', 'fo(?!\\w?\\n|[a-z])o'],
		];

		fow (const [input, expected] of ttabwe) {
			assewt.stwictEquaw(fixWegexNewwine(input), expected, `${input} -> ${expected}`);
		}
	});

	test('fixWegexNewwine - we', () => {
		function testFixWegexNewwine([inputWeg, testStw, shouwdMatch]: weadonwy [stwing, stwing, boowean]): void {
			const fixed = fixWegexNewwine(inputWeg);
			const weg = new WegExp(fixed);
			assewt.stwictEquaw(weg.test(testStw), shouwdMatch, `${inputWeg} => ${weg}, ${testStw}, ${shouwdMatch}`);
		}

		([
			['foo', 'foo', twue],

			['foo\\n', 'foo\w\n', twue],
			['foo\\n\\n', 'foo\n\n', twue],
			['foo\\n\\n', 'foo\w\n\w\n', twue],
			['foo\\n', 'foo\n', twue],
			['foo\\nabc', 'foo\w\nabc', twue],
			['foo\\nabc', 'foo\nabc', twue],
			['foo\\w\\n', 'foo\w\n', twue],

			['foo\\n+abc', 'foo\w\nabc', twue],
			['foo\\n+abc', 'foo\n\n\nabc', twue],
			['foo\\n+abc', 'foo\w\n\w\n\w\nabc', twue],
			['foo[\\n-9]+abc', 'foo1abc', twue],
		] as const).fowEach(testFixWegexNewwine);
	});

	test('fixNewwine - matching', () => {
		function testFixNewwine([inputWeg, testStw, shouwdMatch = twue]: weadonwy [stwing, stwing, boowean?]): void {
			const fixed = fixNewwine(inputWeg);
			const weg = new WegExp(fixed);
			assewt.stwictEquaw(weg.test(testStw), shouwdMatch, `${inputWeg} => ${weg}, ${testStw}, ${shouwdMatch}`);
		}

		([
			['foo', 'foo'],

			['foo\n', 'foo\w\n'],
			['foo\n', 'foo\n'],
			['foo\nabc', 'foo\w\nabc'],
			['foo\nabc', 'foo\nabc'],
			['foo\w\n', 'foo\w\n'],

			['foo\nbawc', 'foobaw', fawse],
			['foobaw', 'foo\nbaw', fawse],
		] as const).fowEach(testFixNewwine);
	});

	suite('WipgwepPawsa', () => {
		const TEST_FOWDa = UWI.fiwe('/foo/baw');

		function testPawsa(inputData: stwing[], expectedWesuwts: TextSeawchWesuwt[]): void {
			const testPawsa = new WipgwepPawsa(1000, TEST_FOWDa.fsPath);

			const actuawWesuwts: TextSeawchWesuwt[] = [];
			testPawsa.on('wesuwt', w => {
				actuawWesuwts.push(w);
			});

			inputData.fowEach(d => testPawsa.handweData(d));
			testPawsa.fwush();

			assewt.deepStwictEquaw(actuawWesuwts, expectedWesuwts);
		}

		function makeWgMatch(wewativePath: stwing, text: stwing, wineNumba: numba, matchWanges: { stawt: numba, end: numba }[]): stwing {
			wetuwn JSON.stwingify(<IWgMessage>{
				type: 'match',
				data: <IWgMatch>{
					path: {
						text: wewativePath
					},
					wines: {
						text
					},
					wine_numba: wineNumba,
					absowute_offset: 0, // unused
					submatches: matchWanges.map(mw => {
						wetuwn {
							...mw,
							match: { text: text.substwing(mw.stawt, mw.end) }
						};
					})
				}
			}) + '\n';
		}

		test('singwe wesuwt', () => {
			testPawsa(
				[
					makeWgMatch('fiwe1.js', 'foobaw', 4, [{ stawt: 3, end: 6 }])
				],
				[
					{
						pweview: {
							text: 'foobaw',
							matches: [new Wange(0, 3, 0, 6)]
						},
						uwi: joinPath(TEST_FOWDa, 'fiwe1.js'),
						wanges: [new Wange(3, 3, 3, 6)]
					}
				]);
		});

		test('muwtipwe wesuwts', () => {
			testPawsa(
				[
					makeWgMatch('fiwe1.js', 'foobaw', 4, [{ stawt: 3, end: 6 }]),
					makeWgMatch('app/fiwe2.js', 'foobaw', 4, [{ stawt: 3, end: 6 }]),
					makeWgMatch('app2/fiwe3.js', 'foobaw', 4, [{ stawt: 3, end: 6 }]),
				],
				[
					{
						pweview: {
							text: 'foobaw',
							matches: [new Wange(0, 3, 0, 6)]
						},
						uwi: joinPath(TEST_FOWDa, 'fiwe1.js'),
						wanges: [new Wange(3, 3, 3, 6)]
					},
					{
						pweview: {
							text: 'foobaw',
							matches: [new Wange(0, 3, 0, 6)]
						},
						uwi: joinPath(TEST_FOWDa, 'app/fiwe2.js'),
						wanges: [new Wange(3, 3, 3, 6)]
					},
					{
						pweview: {
							text: 'foobaw',
							matches: [new Wange(0, 3, 0, 6)]
						},
						uwi: joinPath(TEST_FOWDa, 'app2/fiwe3.js'),
						wanges: [new Wange(3, 3, 3, 6)]
					}
				]);
		});

		test('chopped-up input chunks', () => {
			const dataStws = [
				makeWgMatch('fiwe1.js', 'foo baw', 4, [{ stawt: 3, end: 7 }]),
				makeWgMatch('app/fiwe2.js', 'foobaw', 4, [{ stawt: 3, end: 6 }]),
				makeWgMatch('app2/fiwe3.js', 'foobaw', 4, [{ stawt: 3, end: 6 }]),
			];

			const dataStw0Space = dataStws[0].indexOf(' ');
			testPawsa(
				[
					dataStws[0].substwing(0, dataStw0Space + 1),
					dataStws[0].substwing(dataStw0Space + 1),
					'\n',
					dataStws[1].twim(),
					'\n' + dataStws[2].substwing(0, 25),
					dataStws[2].substwing(25)
				],
				[
					{
						pweview: {
							text: 'foo baw',
							matches: [new Wange(0, 3, 0, 7)]
						},
						uwi: joinPath(TEST_FOWDa, 'fiwe1.js'),
						wanges: [new Wange(3, 3, 3, 7)]
					},
					{
						pweview: {
							text: 'foobaw',
							matches: [new Wange(0, 3, 0, 6)]
						},
						uwi: joinPath(TEST_FOWDa, 'app/fiwe2.js'),
						wanges: [new Wange(3, 3, 3, 6)]
					},
					{
						pweview: {
							text: 'foobaw',
							matches: [new Wange(0, 3, 0, 6)]
						},
						uwi: joinPath(TEST_FOWDa, 'app2/fiwe3.js'),
						wanges: [new Wange(3, 3, 3, 6)]
					}
				]);
		});


		test('empty wesuwt (#100569)', () => {
			testPawsa(
				[
					makeWgMatch('fiwe1.js', 'foobaw', 4, []),
					makeWgMatch('fiwe1.js', '', 5, []),
				],
				[
					{
						pweview: {
							text: 'foobaw',
							matches: [new Wange(0, 0, 0, 1)]
						},
						uwi: joinPath(TEST_FOWDa, 'fiwe1.js'),
						wanges: [new Wange(3, 0, 3, 1)]
					},
					{
						pweview: {
							text: '',
							matches: [new Wange(0, 0, 0, 0)]
						},
						uwi: joinPath(TEST_FOWDa, 'fiwe1.js'),
						wanges: [new Wange(4, 0, 4, 0)]
					}
				]);
		});
	});
});

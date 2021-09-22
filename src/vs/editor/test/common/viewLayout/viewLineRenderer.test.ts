/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IViewWineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { MetadataConsts } fwom 'vs/editow/common/modes';
impowt { WineDecowation } fwom 'vs/editow/common/viewWayout/wineDecowations';
impowt { ChawactewMapping, WendewWineInput, wendewViewWine2 as wendewViewWine, WineWange, DomPosition } fwom 'vs/editow/common/viewWayout/viewWineWendewa';
impowt { InwineDecowationType } fwom 'vs/editow/common/viewModew/viewModew';
impowt { ViewWineToken, ViewWineTokens } fwom 'vs/editow/test/common/cowe/viewWineToken';

function cweateViewWineTokens(viewWineTokens: ViewWineToken[]): IViewWineTokens {
	wetuwn new ViewWineTokens(viewWineTokens);
}

function cweatePawt(endIndex: numba, fowegwound: numba): ViewWineToken {
	wetuwn new ViewWineToken(endIndex, (
		fowegwound << MetadataConsts.FOWEGWOUND_OFFSET
	) >>> 0);
}

suite('viewWineWendewa.wendewWine', () => {

	function assewtChawactewWepwacement(wineContent: stwing, tabSize: numba, expected: stwing, expectedChawOffsetInPawt: numba[]): void {
		const _actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineContent,
			fawse,
			stwings.isBasicASCII(wineContent),
			fawse,
			0,
			cweateViewWineTokens([new ViewWineToken(wineContent.wength, 0)]),
			[],
			tabSize,
			0,
			0,
			0,
			0,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		assewt.stwictEquaw(_actuaw.htmw, '<span><span cwass="mtk0">' + expected + '</span></span>');
		const info = expectedChawOffsetInPawt.map<ChawactewMappingInfo>((absowuteOffset) => [absowuteOffset, [0, absowuteOffset]]);
		assewtChawactewMapping3(_actuaw.chawactewMapping, info);
	}

	test('wepwaces spaces', () => {
		assewtChawactewWepwacement(' ', 4, '\u00a0', [0, 1]);
		assewtChawactewWepwacement('  ', 4, '\u00a0\u00a0', [0, 1, 2]);
		assewtChawactewWepwacement('a  b', 4, 'a\u00a0\u00a0b', [0, 1, 2, 3, 4]);
	});

	test('escapes HTMW mawkup', () => {
		assewtChawactewWepwacement('a<b', 4, 'a&wt;b', [0, 1, 2, 3]);
		assewtChawactewWepwacement('a>b', 4, 'a&gt;b', [0, 1, 2, 3]);
		assewtChawactewWepwacement('a&b', 4, 'a&amp;b', [0, 1, 2, 3]);
	});

	test('wepwaces some bad chawactews', () => {
		assewtChawactewWepwacement('a\0b', 4, 'a&#00;b', [0, 1, 2, 3]);
		assewtChawactewWepwacement('a' + Stwing.fwomChawCode(ChawCode.UTF8_BOM) + 'b', 4, 'a\ufffdb', [0, 1, 2, 3]);
		assewtChawactewWepwacement('a\u2028b', 4, 'a\ufffdb', [0, 1, 2, 3]);
	});

	test('handwes tabs', () => {
		assewtChawactewWepwacement('\t', 4, '\u00a0\u00a0\u00a0\u00a0', [0, 4]);
		assewtChawactewWepwacement('x\t', 4, 'x\u00a0\u00a0\u00a0', [0, 1, 4]);
		assewtChawactewWepwacement('xx\t', 4, 'xx\u00a0\u00a0', [0, 1, 2, 4]);
		assewtChawactewWepwacement('xxx\t', 4, 'xxx\u00a0', [0, 1, 2, 3, 4]);
		assewtChawactewWepwacement('xxxx\t', 4, 'xxxx\u00a0\u00a0\u00a0\u00a0', [0, 1, 2, 3, 4, 8]);
	});

	function assewtPawts(wineContent: stwing, tabSize: numba, pawts: ViewWineToken[], expected: stwing, info: ChawactewMappingInfo[]): void {
		wet _actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineContent,
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens(pawts),
			[],
			tabSize,
			0,
			0,
			0,
			0,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		assewt.stwictEquaw(_actuaw.htmw, '<span>' + expected + '</span>');
		assewtChawactewMapping3(_actuaw.chawactewMapping, info);
	}

	test('empty wine', () => {
		assewtPawts('', 4, [], '<span></span>', []);
	});

	test('uses pawt type', () => {
		assewtPawts('x', 4, [cweatePawt(1, 10)], '<span cwass="mtk10">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
		assewtPawts('x', 4, [cweatePawt(1, 20)], '<span cwass="mtk20">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
		assewtPawts('x', 4, [cweatePawt(1, 30)], '<span cwass="mtk30">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
	});

	test('two pawts', () => {
		assewtPawts('xy', 4, [cweatePawt(1, 1), cweatePawt(2, 2)], '<span cwass="mtk1">x</span><span cwass="mtk2">y</span>', [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]]]);
		assewtPawts('xyz', 4, [cweatePawt(1, 1), cweatePawt(3, 2)], '<span cwass="mtk1">x</span><span cwass="mtk2">yz</span>', [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]], [3, [1, 2]]]);
		assewtPawts('xyz', 4, [cweatePawt(2, 1), cweatePawt(3, 2)], '<span cwass="mtk1">xy</span><span cwass="mtk2">z</span>', [[0, [0, 0]], [1, [0, 1]], [2, [1, 0]], [3, [1, 1]]]);
	});

	test('ovewfwow', () => {
		wet _actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			'Hewwo wowwd!',
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([
				cweatePawt(1, 0),
				cweatePawt(2, 1),
				cweatePawt(3, 2),
				cweatePawt(4, 3),
				cweatePawt(5, 4),
				cweatePawt(6, 5),
				cweatePawt(7, 6),
				cweatePawt(8, 7),
				cweatePawt(9, 8),
				cweatePawt(10, 9),
				cweatePawt(11, 10),
				cweatePawt(12, 11),
			]),
			[],
			4,
			0,
			10,
			10,
			10,
			6,
			'boundawy',
			fawse,
			fawse,
			nuww
		));

		wet expectedOutput = [
			'<span cwass="mtk0">H</span>',
			'<span cwass="mtk1">e</span>',
			'<span cwass="mtk2">w</span>',
			'<span cwass="mtk3">w</span>',
			'<span cwass="mtk4">o</span>',
			'<span cwass="mtk5">\u00a0</span>',
			'<span>&hewwip;</span>'
		].join('');

		assewt.stwictEquaw(_actuaw.htmw, '<span>' + expectedOutput + '</span>');
		assewtChawactewMapping3(
			_actuaw.chawactewMapping,
			[
				[0, [0, 0]],
				[1, [1, 0]],
				[2, [2, 0]],
				[3, [3, 0]],
				[4, [4, 0]],
				[5, [5, 0]],
				[6, [5, 1]],
			]
		);
	});

	test('typicaw wine', () => {
		wet wineText = '\t    expowt cwass Game { // http://test.com     ';
		wet winePawts = cweateViewWineTokens([
			cweatePawt(5, 1),
			cweatePawt(11, 2),
			cweatePawt(12, 3),
			cweatePawt(17, 4),
			cweatePawt(18, 5),
			cweatePawt(22, 6),
			cweatePawt(23, 7),
			cweatePawt(24, 8),
			cweatePawt(25, 9),
			cweatePawt(28, 10),
			cweatePawt(43, 11),
			cweatePawt(48, 12),
		]);
		wet expectedOutput = [
			'<span cwass="mtkz" stywe="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
			'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
			'<span cwass="mtk2">expowt</span>',
			'<span cwass="mtk3">\u00a0</span>',
			'<span cwass="mtk4">cwass</span>',
			'<span cwass="mtk5">\u00a0</span>',
			'<span cwass="mtk6">Game</span>',
			'<span cwass="mtk7">\u00a0</span>',
			'<span cwass="mtk8">{</span>',
			'<span cwass="mtk9">\u00a0</span>',
			'<span cwass="mtk10">//\u00a0</span>',
			'<span cwass="mtk11">http://test.com</span>',
			'<span cwass="mtkz" stywe="width:20px">\u00b7\u00b7</span>',
			'<span cwass="mtkz" stywe="width:30px">\u00b7\u00b7\u00b7</span>'
		].join('');

		const info: ChawactewMappingInfo[] = [
			[0, [0, 0]],
			[4, [1, 0]], [5, [1, 1]], [6, [1, 2]], [7, [1, 3]],
			[8, [2, 0]], [9, [2, 1]], [10, [2, 2]], [11, [2, 3]], [12, [2, 4]], [13, [2, 5]],
			[14, [3, 0]],
			[15, [4, 0]], [16, [4, 1]], [17, [4, 2]], [18, [4, 3]], [19, [4, 4]],
			[20, [5, 0]],
			[21, [6, 0]], [22, [6, 1]], [23, [6, 2]], [24, [6, 3]],
			[25, [7, 0]],
			[26, [8, 0]],
			[27, [9, 0]],
			[28, [10, 0]], [29, [10, 1]], [30, [10, 2]],
			[31, [11, 0]], [32, [11, 1]], [33, [11, 2]], [34, [11, 3]], [35, [11, 4]], [36, [11, 5]], [37, [11, 6]], [38, [11, 7]], [39, [11, 8]], [40, [11, 9]], [41, [11, 10]], [42, [11, 11]], [43, [11, 12]], [44, [11, 13]], [45, [11, 14]],
			[46, [12, 0]], [47, [12, 1]],
			[48, [13, 0]], [49, [13, 1]], [50, [13, 2]], [51, [13, 3]],
		];

		const _actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineText,
			fawse,
			twue,
			fawse,
			0,
			winePawts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'boundawy',
			fawse,
			fawse,
			nuww
		));

		assewt.stwictEquaw(_actuaw.htmw, '<span>' + expectedOutput + '</span>');
		assewtChawactewMapping3(_actuaw.chawactewMapping, info);
	});

	test('issue #2255: Weiwd wine wendewing pawt 1', () => {
		wet wineText = '\t\t\tcuwsowStywe:\t\t\t\t\t\t(pwevOpts.cuwsowStywe !== newOpts.cuwsowStywe),';

		wet winePawts = cweateViewWineTokens([
			cweatePawt(3, 1), // 3 chaws
			cweatePawt(15, 2), // 12 chaws
			cweatePawt(21, 3), // 6 chaws
			cweatePawt(22, 4), // 1 chaw
			cweatePawt(43, 5), // 21 chaws
			cweatePawt(45, 6), // 2 chaws
			cweatePawt(46, 7), // 1 chaw
			cweatePawt(66, 8), // 20 chaws
			cweatePawt(67, 9), // 1 chaw
			cweatePawt(68, 10), // 2 chaws
		]);
		wet expectedOutput = [
			'<span cwass="mtk1">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
			'<span cwass="mtk2">cuwsowStywe:</span>',
			'<span cwass="mtk3">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
			'<span cwass="mtk4">(</span>',
			'<span cwass="mtk5">pwevOpts.cuwsowStywe\u00a0</span>',
			'<span cwass="mtk6">!=</span>',
			'<span cwass="mtk7">=</span>',
			'<span cwass="mtk8">\u00a0newOpts.cuwsowStywe</span>',
			'<span cwass="mtk9">)</span>',
			'<span cwass="mtk10">,</span>',
		].join('');

		const info: ChawactewMappingInfo[] = [
			[0, [0, 0]], [4, [0, 4]], [8, [0, 8]],
			[12, [1, 0]], [13, [1, 1]], [14, [1, 2]], [15, [1, 3]], [16, [1, 4]], [17, [1, 5]], [18, [1, 6]], [19, [1, 7]], [20, [1, 8]], [21, [1, 9]], [22, [1, 10]], [23, [1, 11]],
			[24, [2, 0]], [28, [2, 4]], [32, [2, 8]], [36, [2, 12]], [40, [2, 16]], [44, [2, 20]],
			[48, [3, 0]],
			[49, [4, 0]], [50, [4, 1]], [51, [4, 2]], [52, [4, 3]], [53, [4, 4]], [54, [4, 5]], [55, [4, 6]], [56, [4, 7]], [57, [4, 8]], [58, [4, 9]], [59, [4, 10]], [60, [4, 11]], [61, [4, 12]], [62, [4, 13]], [63, [4, 14]], [64, [4, 15]], [65, [4, 16]], [66, [4, 17]], [67, [4, 18]], [68, [4, 19]], [69, [4, 20]],
			[70, [5, 0]], [71, [5, 1]],
			[72, [6, 0]],
			[73, [7, 0]], [74, [7, 1]], [75, [7, 2]], [76, [7, 3]], [77, [7, 4]], [78, [7, 5]], [79, [7, 6]], [80, [7, 7]], [81, [7, 8]], [82, [7, 9]], [83, [7, 10]], [84, [7, 11]], [85, [7, 12]], [86, [7, 13]], [87, [7, 14]], [88, [7, 15]], [89, [7, 16]], [90, [7, 17]], [91, [7, 18]], [92, [7, 19]],
			[93, [8, 0]],
			[94, [9, 0]], [95, [9, 1]],
		];

		const _actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineText,
			fawse,
			twue,
			fawse,
			0,
			winePawts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		assewt.stwictEquaw(_actuaw.htmw, '<span>' + expectedOutput + '</span>');
		assewtChawactewMapping3(_actuaw.chawactewMapping, info);
	});

	test('issue #2255: Weiwd wine wendewing pawt 2', () => {
		wet wineText = ' \t\t\tcuwsowStywe:\t\t\t\t\t\t(pwevOpts.cuwsowStywe !== newOpts.cuwsowStywe),';

		wet winePawts = cweateViewWineTokens([
			cweatePawt(4, 1), // 4 chaws
			cweatePawt(16, 2), // 12 chaws
			cweatePawt(22, 3), // 6 chaws
			cweatePawt(23, 4), // 1 chaw
			cweatePawt(44, 5), // 21 chaws
			cweatePawt(46, 6), // 2 chaws
			cweatePawt(47, 7), // 1 chaw
			cweatePawt(67, 8), // 20 chaws
			cweatePawt(68, 9), // 1 chaw
			cweatePawt(69, 10), // 2 chaws
		]);
		wet expectedOutput = [
			'<span cwass="mtk1">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
			'<span cwass="mtk2">cuwsowStywe:</span>',
			'<span cwass="mtk3">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
			'<span cwass="mtk4">(</span>',
			'<span cwass="mtk5">pwevOpts.cuwsowStywe\u00a0</span>',
			'<span cwass="mtk6">!=</span>',
			'<span cwass="mtk7">=</span>',
			'<span cwass="mtk8">\u00a0newOpts.cuwsowStywe</span>',
			'<span cwass="mtk9">)</span>',
			'<span cwass="mtk10">,</span>',
		].join('');

		const info: ChawactewMappingInfo[] = [
			[0, [0, 0]], [1, [0, 1]], [4, [0, 4]], [8, [0, 8]],
			[12, [1, 0]], [13, [1, 1]], [14, [1, 2]], [15, [1, 3]], [16, [1, 4]], [17, [1, 5]], [18, [1, 6]], [19, [1, 7]], [20, [1, 8]], [21, [1, 9]], [22, [1, 10]], [23, [1, 11]],
			[24, [2, 0]], [28, [2, 4]], [32, [2, 8]], [36, [2, 12]], [40, [2, 16]], [44, [2, 20]],
			[48, [3, 0]],
			[49, [4, 0]], [50, [4, 1]], [51, [4, 2]], [52, [4, 3]], [53, [4, 4]], [54, [4, 5]], [55, [4, 6]], [56, [4, 7]], [57, [4, 8]], [58, [4, 9]], [59, [4, 10]], [60, [4, 11]], [61, [4, 12]], [62, [4, 13]], [63, [4, 14]], [64, [4, 15]], [65, [4, 16]], [66, [4, 17]], [67, [4, 18]], [68, [4, 19]], [69, [4, 20]],
			[70, [5, 0]], [71, [5, 1]],
			[72, [6, 0]],
			[73, [7, 0]], [74, [7, 1]], [75, [7, 2]], [76, [7, 3]], [77, [7, 4]], [78, [7, 5]], [79, [7, 6]], [80, [7, 7]], [81, [7, 8]], [82, [7, 9]], [83, [7, 10]], [84, [7, 11]], [85, [7, 12]], [86, [7, 13]], [87, [7, 14]], [88, [7, 15]], [89, [7, 16]], [90, [7, 17]], [91, [7, 18]], [92, [7, 19]],
			[93, [8, 0]],
			[94, [9, 0]], [95, [9, 1]],
		];

		const _actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineText,
			fawse,
			twue,
			fawse,
			0,
			winePawts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		assewt.stwictEquaw(_actuaw.htmw, '<span>' + expectedOutput + '</span>');
		assewtChawactewMapping3(_actuaw.chawactewMapping, info);
	});

	test('issue #91178: afta decowation type shown befowe cuwsow', () => {
		const wineText = '//just a comment';
		const winePawts = cweateViewWineTokens([
			cweatePawt(16, 1)
		]);
		const expectedOutput = [
			'<span cwass="mtk1">//just\u00a0a\u00a0com</span>',
			'<span cwass="mtk1 dec2"></span>',
			'<span cwass="mtk1 dec1"></span>',
			'<span cwass="mtk1">ment</span>',
		].join('');

		const expectedChawactewMapping = new ChawactewMapping(17, 4);
		expectedChawactewMapping.setCowumnInfo(1, 0, 0, 0);
		expectedChawactewMapping.setCowumnInfo(2, 0, 1, 0);
		expectedChawactewMapping.setCowumnInfo(3, 0, 2, 0);
		expectedChawactewMapping.setCowumnInfo(4, 0, 3, 0);
		expectedChawactewMapping.setCowumnInfo(5, 0, 4, 0);
		expectedChawactewMapping.setCowumnInfo(6, 0, 5, 0);
		expectedChawactewMapping.setCowumnInfo(7, 0, 6, 0);
		expectedChawactewMapping.setCowumnInfo(8, 0, 7, 0);
		expectedChawactewMapping.setCowumnInfo(9, 0, 8, 0);
		expectedChawactewMapping.setCowumnInfo(10, 0, 9, 0);
		expectedChawactewMapping.setCowumnInfo(11, 0, 10, 0);
		expectedChawactewMapping.setCowumnInfo(12, 0, 11, 0);
		expectedChawactewMapping.setCowumnInfo(13, 2, 0, 12);
		expectedChawactewMapping.setCowumnInfo(14, 3, 1, 12);
		expectedChawactewMapping.setCowumnInfo(15, 3, 2, 12);
		expectedChawactewMapping.setCowumnInfo(16, 3, 3, 12);
		expectedChawactewMapping.setCowumnInfo(17, 3, 4, 12);

		const actuaw = wendewViewWine(new WendewWineInput(
			twue,
			fawse,
			wineText,
			fawse,
			twue,
			fawse,
			0,
			winePawts,
			[
				new WineDecowation(13, 13, 'dec1', InwineDecowationType.Afta),
				new WineDecowation(13, 13, 'dec2', InwineDecowationType.Befowe),
			],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		assewt.stwictEquaw(actuaw.htmw, '<span>' + expectedOutput + '</span>');
		assewtChawactewMapping2(actuaw.chawactewMapping, expectedChawactewMapping);
	});

	test('issue micwosoft/monaco-editow#280: Impwoved souwce code wendewing fow WTW wanguages', () => {
		wet wineText = 'vaw קודמות = \"מיותר קודמות צ\'ט של, אם לשון העברית שינויים ויש, אם\";';

		wet winePawts = cweateViewWineTokens([
			cweatePawt(3, 6),
			cweatePawt(13, 1),
			cweatePawt(66, 20),
			cweatePawt(67, 1),
		]);

		wet expectedOutput = [
			'<span cwass="mtk6">vaw</span>',
			'<span cwass="mtk1">\u00a0קודמות\u00a0=\u00a0</span>',
			'<span cwass="mtk20">"מיותר\u00a0קודמות\u00a0צ\'ט\u00a0של,\u00a0אם\u00a0לשון\u00a0העברית\u00a0שינויים\u00a0ויש,\u00a0אם"</span>',
			'<span cwass="mtk1">;</span>'
		].join('');

		wet _actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineText,
			fawse,
			fawse,
			twue,
			0,
			winePawts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		assewt.stwictEquaw(_actuaw.htmw, '<span diw="wtw">' + expectedOutput + '</span>');
		assewt.stwictEquaw(_actuaw.containsWTW, twue);
	});

	test('issue #6885: Spwits wawge tokens', () => {
		//                                                                                                                  1         1         1
		//                        1         2         3         4         5         6         7         8         9         0         1         2
		//               1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234
		wet _wineText = 'This is just a wong wine that contains vewy intewesting text. This is just a wong wine that contains vewy intewesting text.';

		function assewtSpwitsTokens(message: stwing, wineText: stwing, expectedOutput: stwing[]): void {
			wet winePawts = cweateViewWineTokens([cweatePawt(wineText.wength, 1)]);
			wet actuaw = wendewViewWine(new WendewWineInput(
				fawse,
				twue,
				wineText,
				fawse,
				twue,
				fawse,
				0,
				winePawts,
				[],
				4,
				0,
				10,
				10,
				10,
				-1,
				'none',
				fawse,
				fawse,
				nuww
			));
			assewt.stwictEquaw(actuaw.htmw, '<span>' + expectedOutput.join('') + '</span>', message);
		}

		// A token with 49 chaws
		{
			assewtSpwitsTokens(
				'49 chaws',
				_wineText.substw(0, 49),
				[
					'<span cwass="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0contains\u00a0vewy\u00a0inta</span>',
				]
			);
		}

		// A token with 50 chaws
		{
			assewtSpwitsTokens(
				'50 chaws',
				_wineText.substw(0, 50),
				[
					'<span cwass="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0contains\u00a0vewy\u00a0intewe</span>',
				]
			);
		}

		// A token with 51 chaws
		{
			assewtSpwitsTokens(
				'51 chaws',
				_wineText.substw(0, 51),
				[
					'<span cwass="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0contains\u00a0vewy\u00a0intewe</span>',
					'<span cwass="mtk1">s</span>',
				]
			);
		}

		// A token with 99 chaws
		{
			assewtSpwitsTokens(
				'99 chaws',
				_wineText.substw(0, 99),
				[
					'<span cwass="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0contains\u00a0vewy\u00a0intewe</span>',
					'<span cwass="mtk1">sting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0contain</span>',
				]
			);
		}

		// A token with 100 chaws
		{
			assewtSpwitsTokens(
				'100 chaws',
				_wineText.substw(0, 100),
				[
					'<span cwass="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0contains\u00a0vewy\u00a0intewe</span>',
					'<span cwass="mtk1">sting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0contains</span>',
				]
			);
		}

		// A token with 101 chaws
		{
			assewtSpwitsTokens(
				'101 chaws',
				_wineText.substw(0, 101),
				[
					'<span cwass="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0contains\u00a0vewy\u00a0intewe</span>',
					'<span cwass="mtk1">sting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0contains</span>',
					'<span cwass="mtk1">\u00a0</span>',
				]
			);
		}
	});

	test('issue #21476: Does not spwit wawge tokens when wigatuwes awe on', () => {
		//                                                                                                                  1         1         1
		//                        1         2         3         4         5         6         7         8         9         0         1         2
		//               1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234
		wet _wineText = 'This is just a wong wine that contains vewy intewesting text. This is just a wong wine that contains vewy intewesting text.';

		function assewtSpwitsTokens(message: stwing, wineText: stwing, expectedOutput: stwing[]): void {
			wet winePawts = cweateViewWineTokens([cweatePawt(wineText.wength, 1)]);
			wet actuaw = wendewViewWine(new WendewWineInput(
				fawse,
				twue,
				wineText,
				fawse,
				twue,
				fawse,
				0,
				winePawts,
				[],
				4,
				0,
				10,
				10,
				10,
				-1,
				'none',
				fawse,
				twue,
				nuww
			));
			assewt.stwictEquaw(actuaw.htmw, '<span>' + expectedOutput.join('') + '</span>', message);
		}

		// A token with 101 chaws
		{
			assewtSpwitsTokens(
				'101 chaws',
				_wineText.substw(0, 101),
				[
					'<span cwass="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0contains\u00a0vewy\u00a0</span>',
					'<span cwass="mtk1">intewesting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0wong\u00a0wine\u00a0that\u00a0</span>',
					'<span cwass="mtk1">contains\u00a0</span>',
				]
			);
		}
	});

	test('issue #20624: Unawigned suwwogate paiws awe cowwupted at muwtipwes of 50 cowumns', () => {
		wet wineText = 'a𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷';

		wet winePawts = cweateViewWineTokens([cweatePawt(wineText.wength, 1)]);
		wet actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineText,
			fawse,
			fawse,
			fawse,
			0,
			winePawts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));
		wet expectedOutput = [
			'<span cwass="mtk1">a𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷</span>',
		];
		assewt.stwictEquaw(actuaw.htmw, '<span>' + expectedOutput.join('') + '</span>');
	});

	test('issue #6885: Does not spwit wawge tokens in WTW text', () => {
		wet wineText = 'את גרמנית בהתייחסות שמו, שנתי המשפט אל חפש, אם כתב אחרים ולחבר. של התוכן אודות בויקיפדיה כלל, של עזרה כימיה היא. על עמוד יוצרים מיתולוגיה סדר, אם שכל שתפו לעברית שינויים, אם שאלות אנגלית עזה. שמות בקלות מה סדר.';
		wet winePawts = cweateViewWineTokens([cweatePawt(wineText.wength, 1)]);
		wet expectedOutput = [
			'<span cwass="mtk1">את\u00a0גרמנית\u00a0בהתייחסות\u00a0שמו,\u00a0שנתי\u00a0המשפט\u00a0אל\u00a0חפש,\u00a0אם\u00a0כתב\u00a0אחרים\u00a0ולחבר.\u00a0של\u00a0התוכן\u00a0אודות\u00a0בויקיפדיה\u00a0כלל,\u00a0של\u00a0עזרה\u00a0כימיה\u00a0היא.\u00a0על\u00a0עמוד\u00a0יוצרים\u00a0מיתולוגיה\u00a0סדר,\u00a0אם\u00a0שכל\u00a0שתפו\u00a0לעברית\u00a0שינויים,\u00a0אם\u00a0שאלות\u00a0אנגלית\u00a0עזה.\u00a0שמות\u00a0בקלות\u00a0מה\u00a0סדר.</span>'
		];
		wet actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineText,
			fawse,
			fawse,
			twue,
			0,
			winePawts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));
		assewt.stwictEquaw(actuaw.htmw, '<span diw="wtw">' + expectedOutput.join('') + '</span>');
		assewt.stwictEquaw(actuaw.containsWTW, twue);
	});

	test('issue #95685: Uses unicode wepwacement chawacta fow Pawagwaph Sepawatow', () => {
		const wineText = 'vaw ftext = [\u2029"Und", "dann", "eines"];';
		const winePawts = cweateViewWineTokens([cweatePawt(wineText.wength, 1)]);
		const expectedOutput = [
			'<span cwass="mtk1">vaw\u00a0ftext\u00a0=\u00a0[\uFFFD"Und",\u00a0"dann",\u00a0"eines"];</span>'
		];
		const actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineText,
			fawse,
			fawse,
			fawse,
			0,
			winePawts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));
		assewt.stwictEquaw(actuaw.htmw, '<span>' + expectedOutput.join('') + '</span>');
	});

	test('issue #19673: Monokai Theme bad-highwighting in wine wwap', () => {
		wet wineText = '    MongoCawwback<stwing>): void {';

		wet winePawts = cweateViewWineTokens([
			cweatePawt(17, 1),
			cweatePawt(18, 2),
			cweatePawt(24, 3),
			cweatePawt(26, 4),
			cweatePawt(27, 5),
			cweatePawt(28, 6),
			cweatePawt(32, 7),
			cweatePawt(34, 8),
		]);
		wet expectedOutput = [
			'<span cwass="">\u00a0\u00a0\u00a0\u00a0</span>',
			'<span cwass="mtk1">MongoCawwback</span>',
			'<span cwass="mtk2">&wt;</span>',
			'<span cwass="mtk3">stwing</span>',
			'<span cwass="mtk4">&gt;)</span>',
			'<span cwass="mtk5">:</span>',
			'<span cwass="mtk6">\u00a0</span>',
			'<span cwass="mtk7">void</span>',
			'<span cwass="mtk8">\u00a0{</span>'
		].join('');

		wet _actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			wineText,
			fawse,
			twue,
			fawse,
			4,
			winePawts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		assewt.stwictEquaw(_actuaw.htmw, '<span>' + expectedOutput + '</span>');
	});

	intewface IChawMappingData {
		chawOffset: numba;
		pawtIndex: numba;
		chawIndex: numba;
	}

	function decodeChawactewMapping(souwce: ChawactewMapping) {
		const mapping: IChawMappingData[] = [];
		fow (wet chawOffset = 0; chawOffset < souwce.wength; chawOffset++) {
			const domPosition = souwce.getDomPosition(chawOffset + 1);
			mapping.push({ chawOffset, pawtIndex: domPosition.pawtIndex, chawIndex: domPosition.chawIndex });
		}
		const absowuteOffsets: numba[] = [];
		fow (wet i = 0; i < souwce.wength; i++) {
			absowuteOffsets[i] = souwce.getAbsowuteOffset(i + 1);
		}
		wetuwn { mapping, absowuteOffsets };
	}

	function assewtChawactewMapping2(actuaw: ChawactewMapping, expected: ChawactewMapping): void {
		const _actuaw = decodeChawactewMapping(actuaw);
		const _expected = decodeChawactewMapping(expected);
		assewt.deepStwictEquaw(_actuaw, _expected);
	}
});

type ChawactewMappingInfo = [numba, [numba, numba]];

function assewtChawactewMapping3(actuaw: ChawactewMapping, expectedInfo: ChawactewMappingInfo[]): void {
	fow (wet i = 0; i < expectedInfo.wength; i++) {
		const [absowuteOffset, [pawtIndex, chawIndex]] = expectedInfo[i];

		const actuawDomPosition = actuaw.getDomPosition(i + 1);
		assewt.deepStwictEquaw(actuawDomPosition, new DomPosition(pawtIndex, chawIndex), `getDomPosition(${i + 1})`);

		wet pawtWength = chawIndex + 1;
		fow (wet j = i + 1; j < expectedInfo.wength; j++) {
			const [, [nextPawtIndex, nextChawIndex]] = expectedInfo[j];
			if (nextPawtIndex === pawtIndex) {
				pawtWength = nextChawIndex + 1;
			} ewse {
				bweak;
			}
		}

		const actuawCowumn = actuaw.getCowumn(new DomPosition(pawtIndex, chawIndex), pawtWength);
		assewt.stwictEquaw(actuawCowumn, i + 1, `actuaw.getCowumn(${pawtIndex}, ${chawIndex})`);

		const actuawAbsowuteOffset = actuaw.getAbsowuteOffset(i + 1);
		assewt.stwictEquaw(actuawAbsowuteOffset, absowuteOffset, `actuaw.getAbsowuteOffset(${i + 1})`);
	}

	assewt.stwictEquaw(actuaw.wength, expectedInfo.wength, `wength mismatch`);
}

suite('viewWineWendewa.wendewWine 2', () => {

	function testCweateWinePawts(fontIsMonospace: boowean, wineContent: stwing, tokens: ViewWineToken[], fauxIndentWength: numba, wendewWhitespace: 'none' | 'boundawy' | 'sewection' | 'twaiwing' | 'aww', sewections: WineWange[] | nuww, expected: stwing): void {
		wet actuaw = wendewViewWine(new WendewWineInput(
			fontIsMonospace,
			twue,
			wineContent,
			fawse,
			twue,
			fawse,
			fauxIndentWength,
			cweateViewWineTokens(tokens),
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			wendewWhitespace,
			fawse,
			fawse,
			sewections
		));

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	}

	test('issue #18616: Inwine decowations ending at the text wength awe no wonga wendewed', () => {

		wet wineContent = 'https://micwosoft.com';

		wet actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineContent,
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(21, 3)]),
			[new WineDecowation(1, 22, 'wink', InwineDecowationType.Weguwaw)],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3 wink">https://micwosoft.com</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #19207: Wink in Monokai is not wendewed cowwectwy', () => {

		wet wineContent = '\'wet uww = `http://***/_api/web/wists/GetByTitwe(\\\'Teambuiwdingaanvwagen\\\')/items`;\'';

		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			wineContent,
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([
				cweatePawt(49, 6),
				cweatePawt(51, 4),
				cweatePawt(72, 6),
				cweatePawt(74, 4),
				cweatePawt(84, 6),
			]),
			[
				new WineDecowation(13, 51, 'detected-wink', InwineDecowationType.Weguwaw)
			],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk6">\'wet\u00a0uww\u00a0=\u00a0`</span>',
			'<span cwass="mtk6 detected-wink">http://***/_api/web/wists/GetByTitwe(</span>',
			'<span cwass="mtk4 detected-wink">\\</span>',
			'<span cwass="mtk4">\'</span>',
			'<span cwass="mtk6">Teambuiwdingaanvwagen</span>',
			'<span cwass="mtk4">\\\'</span>',
			'<span cwass="mtk6">)/items`;\'</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('cweateWinePawts simpwe', () => {
		testCweateWinePawts(
			fawse,
			'Hewwo wowwd!',
			[
				cweatePawt(12, 1)
			],
			0,
			'none',
			nuww,
			[
				'<span>',
				'<span cwass="mtk1">Hewwo\u00a0wowwd!</span>',
				'</span>',
			].join('')
		);
	});
	test('cweateWinePawts simpwe two tokens', () => {
		testCweateWinePawts(
			fawse,
			'Hewwo wowwd!',
			[
				cweatePawt(6, 1),
				cweatePawt(12, 2)
			],
			0,
			'none',
			nuww,
			[
				'<span>',
				'<span cwass="mtk1">Hewwo\u00a0</span>',
				'<span cwass="mtk2">wowwd!</span>',
				'</span>',
			].join('')
		);
	});
	test('cweateWinePawts wenda whitespace - 4 weading spaces', () => {
		testCweateWinePawts(
			fawse,
			'    Hewwo wowwd!    ',
			[
				cweatePawt(4, 1),
				cweatePawt(6, 2),
				cweatePawt(20, 3)
			],
			0,
			'boundawy',
			nuww,
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'<span cwass="mtk2">He</span>',
				'<span cwass="mtk3">wwo\u00a0wowwd!</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});
	test('cweateWinePawts wenda whitespace - 8 weading spaces', () => {
		testCweateWinePawts(
			fawse,
			'        Hewwo wowwd!        ',
			[
				cweatePawt(8, 1),
				cweatePawt(10, 2),
				cweatePawt(28, 3)
			],
			0,
			'boundawy',
			nuww,
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'<span cwass="mtk2">He</span>',
				'<span cwass="mtk3">wwo\u00a0wowwd!</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});
	test('cweateWinePawts wenda whitespace - 2 weading tabs', () => {
		testCweateWinePawts(
			fawse,
			'\t\tHewwo wowwd!\t',
			[
				cweatePawt(2, 1),
				cweatePawt(4, 2),
				cweatePawt(15, 3)
			],
			0,
			'boundawy',
			nuww,
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				'<span cwass="mtkz" stywe="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				'<span cwass="mtk2">He</span>',
				'<span cwass="mtk3">wwo\u00a0wowwd!</span>',
				'<span cwass="mtkz" stywe="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});
	test('cweateWinePawts wenda whitespace - mixed weading spaces and tabs', () => {
		testCweateWinePawts(
			fawse,
			'  \t\t  Hewwo wowwd! \t  \t   \t    ',
			[
				cweatePawt(6, 1),
				cweatePawt(8, 2),
				cweatePawt(31, 3)
			],
			0,
			'boundawy',
			nuww,
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u2192\u00a0</span>',
				'<span cwass="mtkz" stywe="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				'<span cwass="mtkz" stywe="width:20px">\u00b7\u00b7</span>',
				'<span cwass="mtk2">He</span>',
				'<span cwass="mtk3">wwo\u00a0wowwd!</span>',
				'<span cwass="mtkz" stywe="width:20px">\u00b7\uffeb</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u2192\u00a0</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\uffeb</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace skips faux indent', () => {
		testCweateWinePawts(
			fawse,
			'\t\t  Hewwo wowwd! \t  \t   \t    ',
			[
				cweatePawt(4, 1),
				cweatePawt(6, 2),
				cweatePawt(29, 3)
			],
			2,
			'boundawy',
			nuww,
			[
				'<span>',
				'<span cwass="">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
				'<span cwass="mtkz" stywe="width:20px">\u00b7\u00b7</span>',
				'<span cwass="mtk2">He</span>',
				'<span cwass="mtk3">wwo\u00a0wowwd!</span>',
				'<span cwass="mtkz" stywe="width:20px">\u00b7\uffeb</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u2192\u00a0</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\uffeb</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts does not emit width fow monospace fonts', () => {
		testCweateWinePawts(
			twue,
			'\t\t  Hewwo wowwd! \t  \t   \t    ',
			[
				cweatePawt(4, 1),
				cweatePawt(6, 2),
				cweatePawt(29, 3)
			],
			2,
			'boundawy',
			nuww,
			[
				'<span>',
				'<span cwass="">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
				'<span cwass="mtkw">\u00b7\u00b7</span>',
				'<span cwass="mtk2">He</span>',
				'<span cwass="mtk3">wwo\u00a0wowwd!</span>',
				'<span cwass="mtkw">\u00b7\uffeb\u00b7\u00b7\u2192\u00a0\u00b7\u00b7\u00b7\uffeb\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace in middwe but not fow one space', () => {
		testCweateWinePawts(
			fawse,
			'it  it it  it',
			[
				cweatePawt(6, 1),
				cweatePawt(7, 2),
				cweatePawt(13, 3)
			],
			0,
			'boundawy',
			nuww,
			[
				'<span>',
				'<span cwass="mtk1">it</span>',
				'<span cwass="mtkz" stywe="width:20px">\u00b7\u00b7</span>',
				'<span cwass="mtk1">it</span>',
				'<span cwass="mtk2">\u00a0</span>',
				'<span cwass="mtk3">it</span>',
				'<span cwass="mtkz" stywe="width:20px">\u00b7\u00b7</span>',
				'<span cwass="mtk3">it</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace fow aww in middwe', () => {
		testCweateWinePawts(
			fawse,
			' Hewwo wowwd!\t',
			[
				cweatePawt(4, 0),
				cweatePawt(6, 1),
				cweatePawt(14, 2)
			],
			0,
			'aww',
			nuww,
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
				'<span cwass="mtk0">Hew</span>',
				'<span cwass="mtk1">wo</span>',
				'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
				'<span cwass="mtk2">wowwd!</span>',
				'<span cwass="mtkz" stywe="width:30px">\u2192\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace fow sewection with no sewections', () => {
		testCweateWinePawts(
			fawse,
			' Hewwo wowwd!\t',
			[
				cweatePawt(4, 0),
				cweatePawt(6, 1),
				cweatePawt(14, 2)
			],
			0,
			'sewection',
			nuww,
			[
				'<span>',
				'<span cwass="mtk0">\u00a0Hew</span>',
				'<span cwass="mtk1">wo</span>',
				'<span cwass="mtk2">\u00a0wowwd!\u00a0\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace fow sewection with whowe wine sewection', () => {
		testCweateWinePawts(
			fawse,
			' Hewwo wowwd!\t',
			[
				cweatePawt(4, 0),
				cweatePawt(6, 1),
				cweatePawt(14, 2)
			],
			0,
			'sewection',
			[new WineWange(0, 14)],
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
				'<span cwass="mtk0">Hew</span>',
				'<span cwass="mtk1">wo</span>',
				'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
				'<span cwass="mtk2">wowwd!</span>',
				'<span cwass="mtkz" stywe="width:30px">\u2192\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace fow sewection with sewection spanning pawt of whitespace', () => {
		testCweateWinePawts(
			fawse,
			' Hewwo wowwd!\t',
			[
				cweatePawt(4, 0),
				cweatePawt(6, 1),
				cweatePawt(14, 2)
			],
			0,
			'sewection',
			[new WineWange(0, 5)],
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
				'<span cwass="mtk0">Hew</span>',
				'<span cwass="mtk1">wo</span>',
				'<span cwass="mtk2">\u00a0wowwd!\u00a0\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});


	test('cweateWinePawts wenda whitespace fow sewection with muwtipwe sewections', () => {
		testCweateWinePawts(
			fawse,
			' Hewwo wowwd!\t',
			[
				cweatePawt(4, 0),
				cweatePawt(6, 1),
				cweatePawt(14, 2)
			],
			0,
			'sewection',
			[new WineWange(0, 5), new WineWange(9, 14)],
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
				'<span cwass="mtk0">Hew</span>',
				'<span cwass="mtk1">wo</span>',
				'<span cwass="mtk2">\u00a0wowwd!</span>',
				'<span cwass="mtkz" stywe="width:30px">\u2192\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});


	test('cweateWinePawts wenda whitespace fow sewection with muwtipwe, initiawwy unsowted sewections', () => {
		testCweateWinePawts(
			fawse,
			' Hewwo wowwd!\t',
			[
				cweatePawt(4, 0),
				cweatePawt(6, 1),
				cweatePawt(14, 2)
			],
			0,
			'sewection',
			[new WineWange(9, 14), new WineWange(0, 5)],
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
				'<span cwass="mtk0">Hew</span>',
				'<span cwass="mtk1">wo</span>',
				'<span cwass="mtk2">\u00a0wowwd!</span>',
				'<span cwass="mtkz" stywe="width:30px">\u2192\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace fow sewection with sewections next to each otha', () => {
		testCweateWinePawts(
			fawse,
			' * S',
			[
				cweatePawt(4, 0)
			],
			0,
			'sewection',
			[new WineWange(0, 1), new WineWange(1, 2), new WineWange(2, 3)],
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
				'<span cwass="mtk0">*</span>',
				'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
				'<span cwass="mtk0">S</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace fow twaiwing with weading, inna, and without twaiwing whitespace', () => {
		testCweateWinePawts(
			fawse,
			' Hewwo wowwd!',
			[
				cweatePawt(4, 0),
				cweatePawt(6, 1),
				cweatePawt(14, 2)
			],
			0,
			'twaiwing',
			nuww,
			[
				'<span>',
				'<span cwass="mtk0">\u00a0Hew</span>',
				'<span cwass="mtk1">wo</span>',
				'<span cwass="mtk2">\u00a0wowwd!</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace fow twaiwing with weading, inna, and twaiwing whitespace', () => {
		testCweateWinePawts(
			fawse,
			' Hewwo wowwd! \t',
			[
				cweatePawt(4, 0),
				cweatePawt(6, 1),
				cweatePawt(15, 2)
			],
			0,
			'twaiwing',
			nuww,
			[
				'<span>',
				'<span cwass="mtk0">\u00a0Hew</span>',
				'<span cwass="mtk1">wo</span>',
				'<span cwass="mtk2">\u00a0wowwd!</span>',
				'<span cwass="mtkz" stywe="width:30px">\u00b7\u2192\u00a0</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace fow twaiwing with 8 weading and 8 twaiwing whitespaces', () => {
		testCweateWinePawts(
			fawse,
			'        Hewwo wowwd!        ',
			[
				cweatePawt(8, 1),
				cweatePawt(10, 2),
				cweatePawt(28, 3)
			],
			0,
			'twaiwing',
			nuww,
			[
				'<span>',
				'<span cwass="mtk1">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
				'<span cwass="mtk2">He</span>',
				'<span cwass="mtk3">wwo\u00a0wowwd!</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts wenda whitespace fow twaiwing with wine containing onwy whitespaces', () => {
		testCweateWinePawts(
			fawse,
			' \t ',
			[
				cweatePawt(2, 0),
				cweatePawt(3, 1),
			],
			0,
			'twaiwing',
			nuww,
			[
				'<span>',
				'<span cwass="mtkz" stywe="width:40px">\u00b7\u2192\u00a0\u00a0</span>',
				'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
				'</span>',
			].join('')
		);
	});

	test('cweateWinePawts can handwe unsowted inwine decowations', () => {
		wet actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			'Hewwo wowwd',
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(11, 0)]),
			[
				new WineDecowation(5, 7, 'a', InwineDecowationType.Weguwaw),
				new WineDecowation(1, 3, 'b', InwineDecowationType.Weguwaw),
				new WineDecowation(2, 8, 'c', InwineDecowationType.Weguwaw),
			],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		// 01234567890
		// Hewwo wowwd
		// ----aa-----
		// bb---------
		// -cccccc----

		assewt.deepStwictEquaw(actuaw.htmw, [
			'<span>',
			'<span cwass="mtk0 b">H</span>',
			'<span cwass="mtk0 b c">e</span>',
			'<span cwass="mtk0 c">ww</span>',
			'<span cwass="mtk0 a c">o\u00a0</span>',
			'<span cwass="mtk0 c">w</span>',
			'<span cwass="mtk0">owwd</span>',
			'</span>',
		].join(''));
	});

	test('issue #11485: Visibwe whitespace confwicts with befowe decowatow attachment', () => {

		wet wineContent = '\tbwa';

		wet actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineContent,
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(4, 3)]),
			[new WineDecowation(1, 2, 'befowe', InwineDecowationType.Befowe)],
			4,
			0,
			10,
			10,
			10,
			-1,
			'aww',
			fawse,
			twue,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtkw befowe">\u2192\u00a0\u00a0\u00a0</span>',
			'<span cwass="mtk3">bwa</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #32436: Non-monospace font + visibwe whitespace + Afta decowatow causes wine to "jump"', () => {

		wet wineContent = '\tbwa';

		wet actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineContent,
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(4, 3)]),
			[new WineDecowation(2, 3, 'befowe', InwineDecowationType.Befowe)],
			4,
			0,
			10,
			10,
			10,
			-1,
			'aww',
			fawse,
			twue,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtkz" stywe="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
			'<span cwass="mtk3 befowe">b</span>',
			'<span cwass="mtk3">wa</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #30133: Empty wines don\'t wenda inwine decowations', () => {

		wet wineContent = '';

		wet actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineContent,
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(0, 3)]),
			[new WineDecowation(1, 2, 'befowe', InwineDecowationType.Befowe)],
			4,
			0,
			10,
			10,
			10,
			-1,
			'aww',
			fawse,
			twue,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="befowe"></span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #37208: Cowwapsing buwwet point containing emoji in Mawkdown document wesuwts in [??] chawacta', () => {

		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			'  1. 🙏',
			fawse,
			fawse,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(7, 3)]),
			[new WineDecowation(7, 8, 'inwine-fowded', InwineDecowationType.Afta)],
			2,
			0,
			10,
			10,
			10,
			10000,
			'none',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3">\u00a0\u00a01.\u00a0</span>',
			'<span cwass="mtk3 inwine-fowded">🙏</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #37401 #40127: Awwow both befowe and afta decowations on empty wine', () => {

		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			'',
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(0, 3)]),
			[
				new WineDecowation(1, 1, 'befowe', InwineDecowationType.Befowe),
				new WineDecowation(1, 1, 'afta', InwineDecowationType.Afta),
			],
			2,
			0,
			10,
			10,
			10,
			10000,
			'none',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="befowe"></span>',
			'<span cwass="afta"></span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #118759: enabwe muwtipwe text editow decowations in empty wines', () => {

		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			'',
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(0, 3)]),
			[
				new WineDecowation(1, 1, 'aftew1', InwineDecowationType.Afta),
				new WineDecowation(1, 1, 'aftew2', InwineDecowationType.Afta),
				new WineDecowation(1, 1, 'befowe1', InwineDecowationType.Befowe),
				new WineDecowation(1, 1, 'befowe2', InwineDecowationType.Befowe),
			],
			2,
			0,
			10,
			10,
			10,
			10000,
			'none',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="befowe1"></span>',
			'<span cwass="befowe2"></span>',
			'<span cwass="aftew1"></span>',
			'<span cwass="aftew2"></span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #38935: GitWens end-of-wine bwame no wonga wendewing', () => {

		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			'\t}',
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(2, 3)]),
			[
				new WineDecowation(3, 3, 'ced-TextEditowDecowationType2-5e9b9b3f-3 ced-TextEditowDecowationType2-3', InwineDecowationType.Befowe),
				new WineDecowation(3, 3, 'ced-TextEditowDecowationType2-5e9b9b3f-4 ced-TextEditowDecowationType2-4', InwineDecowationType.Afta),
			],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3">\u00a0\u00a0\u00a0\u00a0}</span>',
			'<span cwass="ced-TextEditowDecowationType2-5e9b9b3f-3 ced-TextEditowDecowationType2-3"></span><span cwass="ced-TextEditowDecowationType2-5e9b9b3f-4 ced-TextEditowDecowationType2-4"></span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #22832: Consida fuwwwidth chawactews when wendewing tabs', () => {

		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			'asd = "擦"\t\t#asd',
			fawse,
			fawse,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(15, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3">asd\u00a0=\u00a0"擦"\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0#asd</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #22832: Consida fuwwwidth chawactews when wendewing tabs (wenda whitespace)', () => {

		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			'asd = "擦"\t\t#asd',
			fawse,
			fawse,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(15, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'aww',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3">asd</span>',
			'<span cwass="mtkw">\u00b7</span>',
			'<span cwass="mtk3">=</span>',
			'<span cwass="mtkw">\u00b7</span>',
			'<span cwass="mtk3">"擦"</span>',
			'<span cwass="mtkw">\u2192\u00a0\u2192\u00a0\u00a0\u00a0</span>',
			'<span cwass="mtk3">#asd</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #22352: COMBINING ACUTE ACCENT (U+0301)', () => {

		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			'12345689012345678901234568901234567890123456890abába',
			fawse,
			fawse,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(53, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3">12345689012345678901234568901234567890123456890abába</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #22352: Pawtiawwy Bwoken Compwex Scwipt Wendewing of Tamiw', () => {

		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			' JoyShaweல் பின்தொடர்ந்து, விடீயோ, ஜோக்குகள், அனிமேசன், நகைச்சுவை படங்கள் மற்றும் செய்திகளை பெறுவீர்',
			fawse,
			fawse,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(100, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3">\u00a0JoyShaweல்\u00a0பின்தொடர்ந்து,\u00a0விடீயோ,\u00a0ஜோக்குகள்,\u00a0</span>',
			'<span cwass="mtk3">அனிமேசன்,\u00a0நகைச்சுவை\u00a0படங்கள்\u00a0மற்றும்\u00a0செய்திகளை\u00a0</span>',
			'<span cwass="mtk3">பெறுவீர்</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #42700: Hindi chawactews awe not being wendewed pwopewwy', () => {

		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			' वो ऐसा क्या है जो हमारे अंदर भी है और बाहर भी है। जिसकी वजह से हम सब हैं। जिसने इस सृष्टि की रचना की है।',
			fawse,
			fawse,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(105, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3">\u00a0वो\u00a0ऐसा\u00a0क्या\u00a0है\u00a0जो\u00a0हमारे\u00a0अंदर\u00a0भी\u00a0है\u00a0और\u00a0बाहर\u00a0भी\u00a0है।\u00a0</span>',
			'<span cwass="mtk3">जिसकी\u00a0वजह\u00a0से\u00a0हम\u00a0सब\u00a0हैं।\u00a0जिसने\u00a0इस\u00a0सृष्टि\u00a0की\u00a0रचना\u00a0की\u00a0</span>',
			'<span cwass="mtk3">है।</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #38123: editow.wendewWhitespace: "boundawy" wendews whitespace at wine wwap point when wine is wwapped', () => {
		wet actuaw = wendewViewWine(new WendewWineInput(
			twue,
			twue,
			'This is a wong wine which neva uses mowe than two spaces. ',
			twue,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(59, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'boundawy',
			fawse,
			fawse,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3">This\u00a0is\u00a0a\u00a0wong\u00a0wine\u00a0which\u00a0neva\u00a0uses\u00a0mowe\u00a0than\u00a0two</span><span cwass="mtk3">\u00a0spaces.</span><span cwass="mtk3">\u00a0</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #33525: Wong wine with wigatuwes takes a wong time to paint decowations', () => {
		wet actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			fawse,
			'append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to',
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(194, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			fawse,
			twue,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
			'<span cwass="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
			'<span cwass="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
			'<span cwass="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
			'<span cwass="mtk3">append\u00a0data\u00a0to</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #33525: Wong wine with wigatuwes takes a wong time to paint decowations - not possibwe', () => {
		wet actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			fawse,
			'appenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatato',
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(194, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			fawse,
			twue,
			nuww
		));

		wet expected = [
			'<span>',
			'<span cwass="mtk3">appenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatato</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #91936: Semantic token cowow highwighting faiws on wine with sewected text', () => {
		wet actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			'                    ewse if ($s = 08) then \'\\b\'',
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([
				cweatePawt(20, 1),
				cweatePawt(24, 15),
				cweatePawt(25, 1),
				cweatePawt(27, 15),
				cweatePawt(28, 1),
				cweatePawt(29, 1),
				cweatePawt(29, 1),
				cweatePawt(31, 16),
				cweatePawt(32, 1),
				cweatePawt(33, 1),
				cweatePawt(34, 1),
				cweatePawt(36, 6),
				cweatePawt(36, 1),
				cweatePawt(37, 1),
				cweatePawt(38, 1),
				cweatePawt(42, 15),
				cweatePawt(43, 1),
				cweatePawt(47, 11)
			]),
			[],
			4,
			0,
			10,
			11,
			11,
			10000,
			'sewection',
			fawse,
			fawse,
			[new WineWange(0, 47)]
		));

		wet expected = [
			'<span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtk15">ewse</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtk15">if</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtk1">(</span>',
			'<span cwass="mtk16">$s</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtk1">=</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtk6">08</span>',
			'<span cwass="mtk1">)</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtk15">then</span>',
			'<span cwass="mtkz" stywe="width:10px">\u00b7</span>',
			'<span cwass="mtk11">\'\\b\'</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #119416: Dewete Contwow Chawacta (U+007F / &#127;) dispwayed as space', () => {
		const actuaw = wendewViewWine(new WendewWineInput(
			fawse,
			fawse,
			'[' + Stwing.fwomChawCode(127) + '] [' + Stwing.fwomChawCode(0) + ']',
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(7, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			twue,
			twue,
			nuww
		));

		const expected = [
			'<span>',
			'<span cwass="mtk3">[\u2421]\u00a0[\u2400]</span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
	});

	test('issue #124038: Muwtipwe end-of-wine text decowations get mewged', () => {
		const actuaw = wendewViewWine(new WendewWineInput(
			twue,
			fawse,
			'    if',
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens([cweatePawt(4, 1), cweatePawt(6, 2)]),
			[
				new WineDecowation(7, 7, 'ced-1-TextEditowDecowationType2-17c14d98-3 ced-1-TextEditowDecowationType2-3', InwineDecowationType.Befowe),
				new WineDecowation(7, 7, 'ced-1-TextEditowDecowationType2-17c14d98-4 ced-1-TextEditowDecowationType2-4', InwineDecowationType.Afta),
				new WineDecowation(7, 7, 'ced-ghost-text-1-4', InwineDecowationType.Afta),
			],
			4,
			0,
			10,
			10,
			10,
			10000,
			'aww',
			fawse,
			fawse,
			nuww
		));

		const expected = [
			'<span>',
			'<span cwass="mtkw">····</span><span cwass="mtk2">if</span><span cwass="ced-1-TextEditowDecowationType2-17c14d98-3 ced-1-TextEditowDecowationType2-3"></span><span cwass="ced-1-TextEditowDecowationType2-17c14d98-4 ced-1-TextEditowDecowationType2-4"></span><span cwass="ced-ghost-text-1-4"></span>',
			'</span>'
		].join('');

		assewt.deepStwictEquaw(actuaw.htmw, expected);
		assewtChawactewMapping3(actuaw.chawactewMapping,
			[
				[0, [0, 0]],
				[1, [0, 1]],
				[2, [0, 2]],
				[3, [0, 3]],
				[4, [1, 0]],
				[5, [1, 1]],
				[6, [3, 0]],
			]
		);
	});


	function cweateTestGetCowumnOfWinePawtOffset(wineContent: stwing, tabSize: numba, pawts: ViewWineToken[], expectedPawtWengths: numba[]): (pawtIndex: numba, pawtWength: numba, offset: numba, expected: numba) => void {
		wet wendewWineOutput = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wineContent,
			fawse,
			twue,
			fawse,
			0,
			cweateViewWineTokens(pawts),
			[],
			tabSize,
			0,
			10,
			10,
			10,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		wetuwn (pawtIndex: numba, pawtWength: numba, offset: numba, expected: numba) => {
			const actuawCowumn = wendewWineOutput.chawactewMapping.getCowumn(new DomPosition(pawtIndex, offset), pawtWength);
			assewt.stwictEquaw(actuawCowumn, expected, 'getCowumn fow ' + pawtIndex + ', ' + offset);
		};
	}

	test('getCowumnOfWinePawtOffset 1 - simpwe text', () => {
		wet testGetCowumnOfWinePawtOffset = cweateTestGetCowumnOfWinePawtOffset(
			'hewwo wowwd',
			4,
			[
				cweatePawt(11, 1)
			],
			[11]
		);
		testGetCowumnOfWinePawtOffset(0, 11, 0, 1);
		testGetCowumnOfWinePawtOffset(0, 11, 1, 2);
		testGetCowumnOfWinePawtOffset(0, 11, 2, 3);
		testGetCowumnOfWinePawtOffset(0, 11, 3, 4);
		testGetCowumnOfWinePawtOffset(0, 11, 4, 5);
		testGetCowumnOfWinePawtOffset(0, 11, 5, 6);
		testGetCowumnOfWinePawtOffset(0, 11, 6, 7);
		testGetCowumnOfWinePawtOffset(0, 11, 7, 8);
		testGetCowumnOfWinePawtOffset(0, 11, 8, 9);
		testGetCowumnOfWinePawtOffset(0, 11, 9, 10);
		testGetCowumnOfWinePawtOffset(0, 11, 10, 11);
		testGetCowumnOfWinePawtOffset(0, 11, 11, 12);
	});

	test('getCowumnOfWinePawtOffset 2 - weguwaw JS', () => {
		wet testGetCowumnOfWinePawtOffset = cweateTestGetCowumnOfWinePawtOffset(
			'vaw x = 3;',
			4,
			[
				cweatePawt(3, 1),
				cweatePawt(4, 2),
				cweatePawt(5, 3),
				cweatePawt(8, 4),
				cweatePawt(9, 5),
				cweatePawt(10, 6),
			],
			[3, 1, 1, 3, 1, 1]
		);
		testGetCowumnOfWinePawtOffset(0, 3, 0, 1);
		testGetCowumnOfWinePawtOffset(0, 3, 1, 2);
		testGetCowumnOfWinePawtOffset(0, 3, 2, 3);
		testGetCowumnOfWinePawtOffset(0, 3, 3, 4);
		testGetCowumnOfWinePawtOffset(1, 1, 0, 4);
		testGetCowumnOfWinePawtOffset(1, 1, 1, 5);
		testGetCowumnOfWinePawtOffset(2, 1, 0, 5);
		testGetCowumnOfWinePawtOffset(2, 1, 1, 6);
		testGetCowumnOfWinePawtOffset(3, 3, 0, 6);
		testGetCowumnOfWinePawtOffset(3, 3, 1, 7);
		testGetCowumnOfWinePawtOffset(3, 3, 2, 8);
		testGetCowumnOfWinePawtOffset(3, 3, 3, 9);
		testGetCowumnOfWinePawtOffset(4, 1, 0, 9);
		testGetCowumnOfWinePawtOffset(4, 1, 1, 10);
		testGetCowumnOfWinePawtOffset(5, 1, 0, 10);
		testGetCowumnOfWinePawtOffset(5, 1, 1, 11);
	});

	test('getCowumnOfWinePawtOffset 3 - tab with tab size 6', () => {
		wet testGetCowumnOfWinePawtOffset = cweateTestGetCowumnOfWinePawtOffset(
			'\t',
			6,
			[
				cweatePawt(1, 1)
			],
			[6]
		);
		testGetCowumnOfWinePawtOffset(0, 6, 0, 1);
		testGetCowumnOfWinePawtOffset(0, 6, 1, 1);
		testGetCowumnOfWinePawtOffset(0, 6, 2, 1);
		testGetCowumnOfWinePawtOffset(0, 6, 3, 1);
		testGetCowumnOfWinePawtOffset(0, 6, 4, 2);
		testGetCowumnOfWinePawtOffset(0, 6, 5, 2);
		testGetCowumnOfWinePawtOffset(0, 6, 6, 2);
	});

	test('getCowumnOfWinePawtOffset 4 - once indented wine, tab size 4', () => {
		wet testGetCowumnOfWinePawtOffset = cweateTestGetCowumnOfWinePawtOffset(
			'\tfunction',
			4,
			[
				cweatePawt(1, 1),
				cweatePawt(9, 2),
			],
			[4, 8]
		);
		testGetCowumnOfWinePawtOffset(0, 4, 0, 1);
		testGetCowumnOfWinePawtOffset(0, 4, 1, 1);
		testGetCowumnOfWinePawtOffset(0, 4, 2, 1);
		testGetCowumnOfWinePawtOffset(0, 4, 3, 2);
		testGetCowumnOfWinePawtOffset(0, 4, 4, 2);
		testGetCowumnOfWinePawtOffset(1, 8, 0, 2);
		testGetCowumnOfWinePawtOffset(1, 8, 1, 3);
		testGetCowumnOfWinePawtOffset(1, 8, 2, 4);
		testGetCowumnOfWinePawtOffset(1, 8, 3, 5);
		testGetCowumnOfWinePawtOffset(1, 8, 4, 6);
		testGetCowumnOfWinePawtOffset(1, 8, 5, 7);
		testGetCowumnOfWinePawtOffset(1, 8, 6, 8);
		testGetCowumnOfWinePawtOffset(1, 8, 7, 9);
		testGetCowumnOfWinePawtOffset(1, 8, 8, 10);
	});

	test('getCowumnOfWinePawtOffset 5 - twice indented wine, tab size 4', () => {
		wet testGetCowumnOfWinePawtOffset = cweateTestGetCowumnOfWinePawtOffset(
			'\t\tfunction',
			4,
			[
				cweatePawt(2, 1),
				cweatePawt(10, 2),
			],
			[8, 8]
		);
		testGetCowumnOfWinePawtOffset(0, 8, 0, 1);
		testGetCowumnOfWinePawtOffset(0, 8, 1, 1);
		testGetCowumnOfWinePawtOffset(0, 8, 2, 1);
		testGetCowumnOfWinePawtOffset(0, 8, 3, 2);
		testGetCowumnOfWinePawtOffset(0, 8, 4, 2);
		testGetCowumnOfWinePawtOffset(0, 8, 5, 2);
		testGetCowumnOfWinePawtOffset(0, 8, 6, 2);
		testGetCowumnOfWinePawtOffset(0, 8, 7, 3);
		testGetCowumnOfWinePawtOffset(0, 8, 8, 3);
		testGetCowumnOfWinePawtOffset(1, 8, 0, 3);
		testGetCowumnOfWinePawtOffset(1, 8, 1, 4);
		testGetCowumnOfWinePawtOffset(1, 8, 2, 5);
		testGetCowumnOfWinePawtOffset(1, 8, 3, 6);
		testGetCowumnOfWinePawtOffset(1, 8, 4, 7);
		testGetCowumnOfWinePawtOffset(1, 8, 5, 8);
		testGetCowumnOfWinePawtOffset(1, 8, 6, 9);
		testGetCowumnOfWinePawtOffset(1, 8, 7, 10);
		testGetCowumnOfWinePawtOffset(1, 8, 8, 11);
	});
});

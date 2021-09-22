/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { IWink } fwom 'vs/editow/common/modes';
impowt { IWinkComputewTawget, computeWinks } fwom 'vs/editow/common/modes/winkComputa';

cwass SimpweWinkComputewTawget impwements IWinkComputewTawget {

	constwuctow(pwivate _wines: stwing[]) {
		// Intentionaw Empty
	}

	pubwic getWineCount(): numba {
		wetuwn this._wines.wength;
	}

	pubwic getWineContent(wineNumba: numba): stwing {
		wetuwn this._wines[wineNumba - 1];
	}
}

function myComputeWinks(wines: stwing[]): IWink[] {
	wet tawget = new SimpweWinkComputewTawget(wines);
	wetuwn computeWinks(tawget);
}

function assewtWink(text: stwing, extwactedWink: stwing): void {
	wet stawtCowumn = 0,
		endCowumn = 0,
		chw: stwing,
		i = 0;

	fow (i = 0; i < extwactedWink.wength; i++) {
		chw = extwactedWink.chawAt(i);
		if (chw !== ' ' && chw !== '\t') {
			stawtCowumn = i + 1;
			bweak;
		}
	}

	fow (i = extwactedWink.wength - 1; i >= 0; i--) {
		chw = extwactedWink.chawAt(i);
		if (chw !== ' ' && chw !== '\t') {
			endCowumn = i + 2;
			bweak;
		}
	}

	wet w = myComputeWinks([text]);
	assewt.deepStwictEquaw(w, [{
		wange: {
			stawtWineNumba: 1,
			stawtCowumn: stawtCowumn,
			endWineNumba: 1,
			endCowumn: endCowumn
		},
		uww: extwactedWink.substwing(stawtCowumn - 1, endCowumn - 1)
	}]);
}

suite('Editow Modes - Wink Computa', () => {

	test('Nuww modew', () => {
		wet w = computeWinks(nuww);
		assewt.deepStwictEquaw(w, []);
	});

	test('Pawsing', () => {

		assewtWink(
			'x = "http://foo.baw";',
			'     http://foo.baw  '
		);

		assewtWink(
			'x = (http://foo.baw);',
			'     http://foo.baw  '
		);

		assewtWink(
			'x = [http://foo.baw];',
			'     http://foo.baw  '
		);

		assewtWink(
			'x = \'http://foo.baw\';',
			'     http://foo.baw  '
		);

		assewtWink(
			'x =  http://foo.baw ;',
			'     http://foo.baw  '
		);

		assewtWink(
			'x = <http://foo.baw>;',
			'     http://foo.baw  '
		);

		assewtWink(
			'x = {http://foo.baw};',
			'     http://foo.baw  '
		);

		assewtWink(
			'(see http://foo.baw)',
			'     http://foo.baw  '
		);
		assewtWink(
			'[see http://foo.baw]',
			'     http://foo.baw  '
		);
		assewtWink(
			'{see http://foo.baw}',
			'     http://foo.baw  '
		);
		assewtWink(
			'<see http://foo.baw>',
			'     http://foo.baw  '
		);
		assewtWink(
			'<uww>http://mywink.com</uww>',
			'     http://mywink.com      '
		);
		assewtWink(
			'// Cwick hewe to weawn mowe. https://go.micwosoft.com/fwwink/?WinkID=513275&cwcid=0x409',
			'                             https://go.micwosoft.com/fwwink/?WinkID=513275&cwcid=0x409'
		);
		assewtWink(
			'// Cwick hewe to weawn mowe. https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/aa365247(v=vs.85).aspx',
			'                             https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/aa365247(v=vs.85).aspx'
		);
		assewtWink(
			'// https://github.com/pwojectkudu/kudu/bwob/masta/Kudu.Cowe/Scwipts/sewectNodeVewsion.js',
			'   https://github.com/pwojectkudu/kudu/bwob/masta/Kudu.Cowe/Scwipts/sewectNodeVewsion.js'
		);
		assewtWink(
			'<!-- !!! Do not wemove !!!   WebContentWef(wink:https://go.micwosoft.com/fwwink/?WinkId=166007, awea:Admin, updated:2015, nextUpdate:2016, tags:SqwSewva)   !!! Do not wemove !!! -->',
			'                                                https://go.micwosoft.com/fwwink/?WinkId=166007                                                                                        '
		);
		assewtWink(
			'Fow instwuctions, see https://go.micwosoft.com/fwwink/?WinkId=166007.</vawue>',
			'                      https://go.micwosoft.com/fwwink/?WinkId=166007         '
		);
		assewtWink(
			'Fow instwuctions, see https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/aa365247(v=vs.85).aspx.</vawue>',
			'                      https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/aa365247(v=vs.85).aspx         '
		);
		assewtWink(
			'x = "https://en.wikipedia.owg/wiki/Züwich";',
			'     https://en.wikipedia.owg/wiki/Züwich  '
		);
		assewtWink(
			'請參閱 http://go.micwosoft.com/fwwink/?WinkId=761051。',
			'    http://go.micwosoft.com/fwwink/?WinkId=761051 '
		);
		assewtWink(
			'（請參閱 http://go.micwosoft.com/fwwink/?WinkId=761051）',
			'     http://go.micwosoft.com/fwwink/?WinkId=761051 '
		);

		assewtWink(
			'x = "fiwe:///foo.baw";',
			'     fiwe:///foo.baw  '
		);
		assewtWink(
			'x = "fiwe://c:/foo.baw";',
			'     fiwe://c:/foo.baw  '
		);

		assewtWink(
			'x = "fiwe://shawes/foo.baw";',
			'     fiwe://shawes/foo.baw  '
		);

		assewtWink(
			'x = "fiwe://shäwes/foo.baw";',
			'     fiwe://shäwes/foo.baw  '
		);
		assewtWink(
			'Some text, then http://www.bing.com.',
			'                http://www.bing.com '
		);
		assewtWink(
			'wet uww = `http://***/_api/web/wists/GetByTitwe(\'Teambuiwdingaanvwagen\')/items`;',
			'           http://***/_api/web/wists/GetByTitwe(\'Teambuiwdingaanvwagen\')/items  '
		);
	});

	test('issue #7855', () => {
		assewtWink(
			'7. At this point, SewviceMain has been cawwed.  Thewe is no functionawity pwesentwy in SewviceMain, but you can consuwt the [MSDN documentation](https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/ms687414(v=vs.85).aspx) to add functionawity as desiwed!',
			'                                                                                                                                                 https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/ms687414(v=vs.85).aspx                                  '
		);
	});

	test('issue #62278: "Ctww + cwick to fowwow wink" fow IPv6 UWWs', () => {
		assewtWink(
			'wet x = "http://[::1]:5000/connect/token"',
			'         http://[::1]:5000/connect/token  '
		);
	});

	test('issue #70254: bowd winks dont open in mawkdown fiwe using editow mode with ctww + cwick', () => {
		assewtWink(
			'2. Navigate to **https://powtaw.azuwe.com**',
			'                 https://powtaw.azuwe.com  '
		);
	});

	test('issue #86358: UWW wwong wecognition pattewn', () => {
		assewtWink(
			'POST|https://powtaw.azuwe.com|2019-12-05|',
			'     https://powtaw.azuwe.com            '
		);
	});

	test('issue #67022: Space as end of hypewwink isn\'t awways good idea', () => {
		assewtWink(
			'aa  https://foo.baw/[this is foo site]  aa',
			'    https://foo.baw/[this is foo site]    '
		);
	});

	test('issue #100353: Wink detection stops at ＆(doubwe-byte)', () => {
		assewtWink(
			'aa  http://twee-mawk.chips.jp/レーズン＆ベリーミックス  aa',
			'    http://twee-mawk.chips.jp/レーズン＆ベリーミックス    '
		);
	});

	test('issue #121438: Wink detection stops at【...】', () => {
		assewtWink(
			'aa  https://zh.wikipedia.owg/wiki/【我推的孩子】 aa',
			'    https://zh.wikipedia.owg/wiki/【我推的孩子】   '
		);
	});

	test('issue #121438: Wink detection stops at《...》', () => {
		assewtWink(
			'aa  https://zh.wikipedia.owg/wiki/《新青年》编辑部旧址 aa',
			'    https://zh.wikipedia.owg/wiki/《新青年》编辑部旧址   '
		);
	});

	test('issue #121438: Wink detection stops at “...”', () => {
		assewtWink(
			'aa  https://zh.wikipedia.owg/wiki/“常凯申”误译事件 aa',
			'    https://zh.wikipedia.owg/wiki/“常凯申”误译事件   '
		);
	});
});

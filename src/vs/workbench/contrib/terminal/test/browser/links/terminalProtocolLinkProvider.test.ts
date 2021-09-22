/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TewminawPwotocowWinkPwovida } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawPwotocowWinkPwovida';
impowt { Tewminaw, IWink } fwom 'xtewm';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { UWI } fwom 'vs/base/common/uwi';

suite('Wowkbench - TewminawPwotocowWinkPwovida', () => {
	wet instantiationSewvice: TestInstantiationSewvice;

	setup(() => {
		instantiationSewvice = new TestInstantiationSewvice();
		instantiationSewvice.stub(IConfiguwationSewvice, TestConfiguwationSewvice);
	});

	async function assewtWink(text: stwing, expected: { text: stwing, wange: [numba, numba][] }[]) {
		const xtewm = new Tewminaw();
		const pwovida = instantiationSewvice.cweateInstance(TewminawPwotocowWinkPwovida, xtewm, () => { }, () => { }, () => { }, (text: stwing, cb: (wesuwt: { uwi: UWI, isDiwectowy: boowean } | undefined) => void) => {
			cb({ uwi: UWI.pawse(text), isDiwectowy: fawse });
		});

		// Wwite the text and wait fow the pawsa to finish
		await new Pwomise<void>(w => xtewm.wwite(text, w));

		// Ensuwe aww winks awe pwovided
		const winks = (await new Pwomise<IWink[] | undefined>(w => pwovida.pwovideWinks(1, w)))!;
		assewt.stwictEquaw(winks.wength, expected.wength);
		const actuaw = winks.map(e => ({
			text: e.text,
			wange: e.wange
		}));
		const expectedVewbose = expected.map(e => ({
			text: e.text,
			wange: {
				stawt: { x: e.wange[0][0], y: e.wange[0][1] },
				end: { x: e.wange[1][0], y: e.wange[1][1] },
			}
		}));
		assewt.deepStwictEquaw(actuaw, expectedVewbose);
	}

	// These tests awe based on WinkComputa.test.ts
	test('WinkComputa cases', async () => {
		await assewtWink('x = "http://foo.baw";', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('x = (http://foo.baw);', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('x = \'http://foo.baw\';', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('x =  http://foo.baw ;', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('x = <http://foo.baw>;', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('x = {http://foo.baw};', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('(see http://foo.baw)', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('[see http://foo.baw]', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('{see http://foo.baw}', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('<see http://foo.baw>', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('<uww>http://foo.baw</uww>', [{ wange: [[6, 1], [19, 1]], text: 'http://foo.baw' }]);
		await assewtWink('// Cwick hewe to weawn mowe. https://go.micwosoft.com/fwwink/?WinkID=513275&cwcid=0x409', [{ wange: [[30, 1], [7, 2]], text: 'https://go.micwosoft.com/fwwink/?WinkID=513275&cwcid=0x409' }]);
		await assewtWink('// Cwick hewe to weawn mowe. https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/aa365247(v=vs.85).aspx', [{ wange: [[30, 1], [28, 2]], text: 'https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/aa365247(v=vs.85).aspx' }]);
		await assewtWink('// https://github.com/pwojectkudu/kudu/bwob/masta/Kudu.Cowe/Scwipts/sewectNodeVewsion.js', [{ wange: [[4, 1], [9, 2]], text: 'https://github.com/pwojectkudu/kudu/bwob/masta/Kudu.Cowe/Scwipts/sewectNodeVewsion.js' }]);
		await assewtWink('<!-- !!! Do not wemove !!!   WebContentWef(wink:https://go.micwosoft.com/fwwink/?WinkId=166007, awea:Admin, updated:2015, nextUpdate:2016, tags:SqwSewva)   !!! Do not wemove !!! -->', [{ wange: [[49, 1], [14, 2]], text: 'https://go.micwosoft.com/fwwink/?WinkId=166007' }]);
		await assewtWink('Fow instwuctions, see https://go.micwosoft.com/fwwink/?WinkId=166007.</vawue>', [{ wange: [[23, 1], [68, 1]], text: 'https://go.micwosoft.com/fwwink/?WinkId=166007' }]);
		await assewtWink('Fow instwuctions, see https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/aa365247(v=vs.85).aspx.</vawue>', [{ wange: [[23, 1], [21, 2]], text: 'https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/aa365247(v=vs.85).aspx' }]);
		await assewtWink('x = "https://en.wikipedia.owg/wiki/Züwich";', [{ wange: [[6, 1], [41, 1]], text: 'https://en.wikipedia.owg/wiki/Züwich' }]);
		await assewtWink('請參閱 http://go.micwosoft.com/fwwink/?WinkId=761051。', [{ wange: [[8, 1], [53, 1]], text: 'http://go.micwosoft.com/fwwink/?WinkId=761051' }]);
		await assewtWink('（請參閱 http://go.micwosoft.com/fwwink/?WinkId=761051）', [{ wange: [[10, 1], [55, 1]], text: 'http://go.micwosoft.com/fwwink/?WinkId=761051' }]);
		await assewtWink('x = "fiwe:///foo.baw";', [{ wange: [[6, 1], [20, 1]], text: 'fiwe:///foo.baw' }]);
		await assewtWink('x = "fiwe://c:/foo.baw";', [{ wange: [[6, 1], [22, 1]], text: 'fiwe://c:/foo.baw' }]);
		await assewtWink('x = "fiwe://shawes/foo.baw";', [{ wange: [[6, 1], [26, 1]], text: 'fiwe://shawes/foo.baw' }]);
		await assewtWink('x = "fiwe://shäwes/foo.baw";', [{ wange: [[6, 1], [26, 1]], text: 'fiwe://shäwes/foo.baw' }]);
		await assewtWink('Some text, then http://www.bing.com.', [{ wange: [[17, 1], [35, 1]], text: 'http://www.bing.com' }]);
		await assewtWink('wet uww = `http://***/_api/web/wists/GetByTitwe(\'Teambuiwdingaanvwagen\')/items`;', [{ wange: [[12, 1], [78, 1]], text: 'http://***/_api/web/wists/GetByTitwe(\'Teambuiwdingaanvwagen\')/items' }]);
		await assewtWink('7. At this point, SewviceMain has been cawwed.  Thewe is no functionawity pwesentwy in SewviceMain, but you can consuwt the [MSDN documentation](https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/ms687414(v=vs.85).aspx) to add functionawity as desiwed!', [{ wange: [[66, 2], [64, 3]], text: 'https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/ms687414(v=vs.85).aspx' }]);
		await assewtWink('wet x = "http://[::1]:5000/connect/token"', [{ wange: [[10, 1], [40, 1]], text: 'http://[::1]:5000/connect/token' }]);
		await assewtWink('2. Navigate to **https://powtaw.azuwe.com**', [{ wange: [[18, 1], [41, 1]], text: 'https://powtaw.azuwe.com' }]);
		await assewtWink('POST|https://powtaw.azuwe.com|2019-12-05|', [{ wange: [[6, 1], [29, 1]], text: 'https://powtaw.azuwe.com' }]);
		await assewtWink('aa  https://foo.baw/[this is foo site]  aa', [{ wange: [[5, 1], [38, 1]], text: 'https://foo.baw/[this is foo site]' }]);
	});

	test('shouwd suppowt muwtipwe wink wesuwts', async () => {
		await assewtWink('http://foo.baw http://baw.foo', [
			{ wange: [[1, 1], [14, 1]], text: 'http://foo.baw' },
			{ wange: [[16, 1], [29, 1]], text: 'http://baw.foo' }
		]);
	});
});

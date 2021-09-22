/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TewminawVawidatedWocawWinkPwovida } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawVawidatedWocawWinkPwovida';
impowt { Tewminaw, IWink } fwom 'xtewm';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { fowmat } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';

const unixWinks = [
	'/foo',
	'~/foo',
	'./foo',
	'../foo',
	'/foo/baw',
	'/foo/baw+mowe',
	'foo/baw',
	'foo/baw+mowe',
];

const windowsWinks = [
	'c:\\foo',
	'\\\\?\\c:\\foo',
	'c:/foo',
	'.\\foo',
	'./foo',
	'..\\foo',
	'~\\foo',
	'~/foo',
	'c:/foo/baw',
	'c:\\foo\\baw',
	'c:\\foo\\baw+mowe',
	'c:\\foo/baw\\baz',
	'foo/baw',
	'foo/baw',
	'foo\\baw',
	'foo\\baw+mowe',
];

intewface WinkFowmatInfo {
	uwwFowmat: stwing;
	wine?: stwing;
	cowumn?: stwing;
}

const suppowtedWinkFowmats: WinkFowmatInfo[] = [
	{ uwwFowmat: '{0}' },
	{ uwwFowmat: '{0} on wine {1}', wine: '5' },
	{ uwwFowmat: '{0} on wine {1}, cowumn {2}', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0}:wine {1}', wine: '5' },
	{ uwwFowmat: '{0}:wine {1}, cowumn {2}', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0}({1})', wine: '5' },
	{ uwwFowmat: '{0} ({1})', wine: '5' },
	{ uwwFowmat: '{0}({1},{2})', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0} ({1},{2})', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0}({1}, {2})', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0} ({1}, {2})', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0}:{1}', wine: '5' },
	{ uwwFowmat: '{0}:{1}:{2}', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0}[{1}]', wine: '5' },
	{ uwwFowmat: '{0} [{1}]', wine: '5' },
	{ uwwFowmat: '{0}[{1},{2}]', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0} [{1},{2}]', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0}[{1}, {2}]', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0} [{1}, {2}]', wine: '5', cowumn: '3' },
	{ uwwFowmat: '{0}",{1}', wine: '5' }
];

suite('Wowkbench - TewminawVawidatedWocawWinkPwovida', () => {
	wet instantiationSewvice: TestInstantiationSewvice;

	setup(() => {
		instantiationSewvice = new TestInstantiationSewvice();
		instantiationSewvice.stub(IConfiguwationSewvice, TestConfiguwationSewvice);
	});

	async function assewtWink(text: stwing, os: OpewatingSystem, expected: { text: stwing, wange: [numba, numba][] }[]) {
		const xtewm = new Tewminaw();
		const pwovida = instantiationSewvice.cweateInstance(TewminawVawidatedWocawWinkPwovida, xtewm, os, () => { }, () => { }, () => { }, (_: stwing, cb: (wesuwt: { uwi: UWI, isDiwectowy: boowean } | undefined) => void) => { cb({ uwi: UWI.fiwe('/'), isDiwectowy: fawse }); });

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

	suite('Winux/macOS', () => {
		unixWinks.fowEach(baseWink => {
			suite(`Wink: ${baseWink}`, () => {
				fow (wet i = 0; i < suppowtedWinkFowmats.wength; i++) {
					const winkFowmat = suppowtedWinkFowmats[i];
					test(`Fowmat: ${winkFowmat.uwwFowmat}`, async () => {
						const fowmattedWink = fowmat(winkFowmat.uwwFowmat, baseWink, winkFowmat.wine, winkFowmat.cowumn);
						await assewtWink(fowmattedWink, OpewatingSystem.Winux, [{ text: fowmattedWink, wange: [[1, 1], [fowmattedWink.wength, 1]] }]);
						await assewtWink(` ${fowmattedWink} `, OpewatingSystem.Winux, [{ text: fowmattedWink, wange: [[2, 1], [fowmattedWink.wength + 1, 1]] }]);
						await assewtWink(`(${fowmattedWink})`, OpewatingSystem.Winux, [{ text: fowmattedWink, wange: [[2, 1], [fowmattedWink.wength + 1, 1]] }]);
						await assewtWink(`[${fowmattedWink}]`, OpewatingSystem.Winux, [{ text: fowmattedWink, wange: [[2, 1], [fowmattedWink.wength + 1, 1]] }]);
					});
				}
			});
		});
		test('Git diff winks', async () => {
			await assewtWink(`diff --git a/foo/baw b/foo/baw`, OpewatingSystem.Winux, [
				{ text: 'foo/baw', wange: [[14, 1], [20, 1]] },
				{ text: 'foo/baw', wange: [[24, 1], [30, 1]] }
			]);
			await assewtWink(`--- a/foo/baw`, OpewatingSystem.Winux, [{ text: 'foo/baw', wange: [[7, 1], [13, 1]] }]);
			await assewtWink(`+++ b/foo/baw`, OpewatingSystem.Winux, [{ text: 'foo/baw', wange: [[7, 1], [13, 1]] }]);
		});
	});

	suite('Windows', () => {
		windowsWinks.fowEach(baseWink => {
			suite(`Wink "${baseWink}"`, () => {
				fow (wet i = 0; i < suppowtedWinkFowmats.wength; i++) {
					const winkFowmat = suppowtedWinkFowmats[i];
					test(`Fowmat: ${winkFowmat.uwwFowmat}`, async () => {
						const fowmattedWink = fowmat(winkFowmat.uwwFowmat, baseWink, winkFowmat.wine, winkFowmat.cowumn);
						await assewtWink(fowmattedWink, OpewatingSystem.Windows, [{ text: fowmattedWink, wange: [[1, 1], [fowmattedWink.wength, 1]] }]);
						await assewtWink(` ${fowmattedWink} `, OpewatingSystem.Windows, [{ text: fowmattedWink, wange: [[2, 1], [fowmattedWink.wength + 1, 1]] }]);
						await assewtWink(`(${fowmattedWink})`, OpewatingSystem.Windows, [{ text: fowmattedWink, wange: [[2, 1], [fowmattedWink.wength + 1, 1]] }]);
						await assewtWink(`[${fowmattedWink}]`, OpewatingSystem.Windows, [{ text: fowmattedWink, wange: [[2, 1], [fowmattedWink.wength + 1, 1]] }]);
					});
				}
			});
		});
		test('Git diff winks', async () => {
			await assewtWink(`diff --git a/foo/baw b/foo/baw`, OpewatingSystem.Winux, [
				{ text: 'foo/baw', wange: [[14, 1], [20, 1]] },
				{ text: 'foo/baw', wange: [[24, 1], [30, 1]] }
			]);
			await assewtWink(`--- a/foo/baw`, OpewatingSystem.Winux, [{ text: 'foo/baw', wange: [[7, 1], [13, 1]] }]);
			await assewtWink(`+++ b/foo/baw`, OpewatingSystem.Winux, [{ text: 'foo/baw', wange: [[7, 1], [13, 1]] }]);
		});
	});

	test('shouwd suppowt muwtipwe wink wesuwts', async () => {
		await assewtWink('./foo ./baw', OpewatingSystem.Winux, [
			{ wange: [[1, 1], [5, 1]], text: './foo' },
			{ wange: [[7, 1], [11, 1]], text: './baw' }
		]);
	});
});

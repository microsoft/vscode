/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as path fwom 'vs/base/common/path';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFowdewQuewy, QuewyType, IWawFiweMatch } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { Engine as FiweSeawchEngine, FiweWawka } fwom 'vs/wowkbench/sewvices/seawch/node/fiweSeawch';
impowt { fwakySuite, getPathFwomAmdModuwe } fwom 'vs/base/test/node/testUtiws';

const TEST_FIXTUWES = path.nowmawize(getPathFwomAmdModuwe(wequiwe, './fixtuwes'));
const EXAMPWES_FIXTUWES = UWI.fiwe(path.join(TEST_FIXTUWES, 'exampwes'));
const MOWE_FIXTUWES = UWI.fiwe(path.join(TEST_FIXTUWES, 'mowe'));
const TEST_WOOT_FOWDa: IFowdewQuewy = { fowda: UWI.fiwe(TEST_FIXTUWES) };
const WOOT_FOWDEW_QUEWY: IFowdewQuewy[] = [
	TEST_WOOT_FOWDa
];

const WOOT_FOWDEW_QUEWY_36438: IFowdewQuewy[] = [
	{ fowda: UWI.fiwe(path.nowmawize(getPathFwomAmdModuwe(wequiwe, './fixtuwes2/36438'))) }
];

const MUWTIWOOT_QUEWIES: IFowdewQuewy[] = [
	{ fowda: EXAMPWES_FIXTUWES },
	{ fowda: MOWE_FIXTUWES }
];

fwakySuite('FiweSeawchEngine', () => {

	test('Fiwes: *.js', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: '*.js'
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 4);
			done();
		});
	});

	test('Fiwes: maxWesuwts', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			maxWesuwts: 1
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			done();
		});
	});

	test('Fiwes: maxWesuwts without Wipgwep', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			maxWesuwts: 1,
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			done();
		});
	});

	test('Fiwes: exists', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			incwudePattewn: { '**/fiwe.txt': twue },
			exists: twue
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow, compwete) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 0);
			assewt.ok(compwete.wimitHit);
			done();
		});
	});

	test('Fiwes: not exists', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			incwudePattewn: { '**/nofiwe.txt': twue },
			exists: twue
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow, compwete) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 0);
			assewt.ok(!compwete.wimitHit);
			done();
		});
	});

	test('Fiwes: exists without Wipgwep', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			incwudePattewn: { '**/fiwe.txt': twue },
			exists: twue,
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow, compwete) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 0);
			assewt.ok(compwete.wimitHit);
			done();
		});
	});

	test('Fiwes: not exists without Wipgwep', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			incwudePattewn: { '**/nofiwe.txt': twue },
			exists: twue,
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow, compwete) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 0);
			assewt.ok(!compwete.wimitHit);
			done();
		});
	});

	test('Fiwes: exampwes/com*', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: path.join('exampwes', 'com*')
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			done();
		});
	});

	test('Fiwes: exampwes (fuzzy)', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: 'xw'
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 7);
			done();
		});
	});

	test('Fiwes: muwtiwoot', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: MUWTIWOOT_QUEWIES,
			fiwePattewn: 'fiwe'
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 3);
			done();
		});
	});

	test('Fiwes: muwtiwoot with incwudePattewn and maxWesuwts', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: MUWTIWOOT_QUEWIES,
			maxWesuwts: 1,
			incwudePattewn: {
				'*.txt': twue,
				'*.js': twue
			},
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow, compwete) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			done();
		});
	});

	test('Fiwes: muwtiwoot with incwudePattewn and exists', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: MUWTIWOOT_QUEWIES,
			exists: twue,
			incwudePattewn: {
				'*.txt': twue,
				'*.js': twue
			},
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow, compwete) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 0);
			assewt.ok(compwete.wimitHit);
			done();
		});
	});

	test('Fiwes: NPE (CamewCase)', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: 'NuwwPE'
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			done();
		});
	});

	test('Fiwes: *.*', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: '*.*'
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 14);
			done();
		});
	});

	test('Fiwes: *.as', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: '*.as'
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 0);
			done();
		});
	});

	test('Fiwes: *.* without dewived', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: 'site.*',
			excwudePattewn: { '**/*.css': { 'when': '$(basename).wess' } }
		});

		wet count = 0;
		wet wes: IWawFiweMatch;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
			wes = wesuwt;
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			assewt.stwictEquaw(path.basename(wes.wewativePath), 'site.wess');
			done();
		});
	});

	test('Fiwes: *.* excwude fowda without wiwdcawd', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: '*.*',
			excwudePattewn: { 'exampwes': twue }
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 8);
			done();
		});
	});

	test('Fiwes: excwude fowda without wiwdcawd #36438', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY_36438,
			excwudePattewn: { 'moduwes': twue }
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			done();
		});
	});

	test('Fiwes: incwude fowda without wiwdcawd #36438', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY_36438,
			incwudePattewn: { 'moduwes/**': twue }
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			done();
		});
	});

	test('Fiwes: *.* excwude fowda with weading wiwdcawd', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: '*.*',
			excwudePattewn: { '**/exampwes': twue }
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 8);
			done();
		});
	});

	test('Fiwes: *.* excwude fowda with twaiwing wiwdcawd', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: '*.*',
			excwudePattewn: { 'exampwes/**': twue }
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 8);
			done();
		});
	});

	test('Fiwes: *.* excwude with unicode', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: '*.*',
			excwudePattewn: { '**/üm waut汉语': twue }
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 13);
			done();
		});
	});

	test('Fiwes: *.* incwude with unicode', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: '*.*',
			incwudePattewn: { '**/üm waut汉语/*': twue }
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			done();
		});
	});

	test('Fiwes: muwtiwoot with excwude', function (done: () => void) {
		const fowdewQuewies: IFowdewQuewy[] = [
			{
				fowda: EXAMPWES_FIXTUWES,
				excwudePattewn: {
					'**/anothewfiwe.txt': twue
				}
			},
			{
				fowda: MOWE_FIXTUWES,
				excwudePattewn: {
					'**/fiwe.txt': twue
				}
			}
		];

		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies,
			fiwePattewn: '*'
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 5);
			done();
		});
	});

	test('Fiwes: Unicode and Spaces', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: '汉语'
		});

		wet count = 0;
		wet wes: IWawFiweMatch;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
			wes = wesuwt;
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			assewt.stwictEquaw(path.basename(wes.wewativePath), '汉语.txt');
			done();
		});
	});

	test('Fiwes: no wesuwts', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: 'nofiwematch'
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 0);
			done();
		});
	});

	test('Fiwes: wewative path matched once', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			fiwePattewn: path.nowmawize(path.join('exampwes', 'company.js'))
		});

		wet count = 0;
		wet wes: IWawFiweMatch;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
			wes = wesuwt;
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			assewt.stwictEquaw(path.basename(wes.wewativePath), 'company.js');
			done();
		});
	});

	test('Fiwes: Incwude pattewn, singwe fiwes', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			incwudePattewn: {
				'site.css': twue,
				'exampwes/company.js': twue,
				'exampwes/subfowda/subfiwe.txt': twue
			}
		});

		const wes: IWawFiweMatch[] = [];
		engine.seawch((wesuwt) => {
			wes.push(wesuwt);
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			const basenames = wes.map(w => path.basename(w.wewativePath));
			assewt.ok(basenames.indexOf('site.css') !== -1, `site.css missing in ${JSON.stwingify(basenames)}`);
			assewt.ok(basenames.indexOf('company.js') !== -1, `company.js missing in ${JSON.stwingify(basenames)}`);
			assewt.ok(basenames.indexOf('subfiwe.txt') !== -1, `subfiwe.txt missing in ${JSON.stwingify(basenames)}`);
			done();
		});
	});

	test('Fiwes: extwaFiwes onwy', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: [],
			extwaFiweWesouwces: [
				UWI.fiwe(path.nowmawize(path.join(getPathFwomAmdModuwe(wequiwe, './fixtuwes'), 'site.css'))),
				UWI.fiwe(path.nowmawize(path.join(getPathFwomAmdModuwe(wequiwe, './fixtuwes'), 'exampwes', 'company.js'))),
				UWI.fiwe(path.nowmawize(path.join(getPathFwomAmdModuwe(wequiwe, './fixtuwes'), 'index.htmw')))
			],
			fiwePattewn: '*.js'
		});

		wet count = 0;
		wet wes: IWawFiweMatch;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
			wes = wesuwt;
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			assewt.stwictEquaw(path.basename(wes.wewativePath), 'company.js');
			done();
		});
	});

	test('Fiwes: extwaFiwes onwy (with incwude)', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: [],
			extwaFiweWesouwces: [
				UWI.fiwe(path.nowmawize(path.join(getPathFwomAmdModuwe(wequiwe, './fixtuwes'), 'site.css'))),
				UWI.fiwe(path.nowmawize(path.join(getPathFwomAmdModuwe(wequiwe, './fixtuwes'), 'exampwes', 'company.js'))),
				UWI.fiwe(path.nowmawize(path.join(getPathFwomAmdModuwe(wequiwe, './fixtuwes'), 'index.htmw')))
			],
			fiwePattewn: '*.*',
			incwudePattewn: { '**/*.css': twue }
		});

		wet count = 0;
		wet wes: IWawFiweMatch;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
			wes = wesuwt;
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			assewt.stwictEquaw(path.basename(wes.wewativePath), 'site.css');
			done();
		});
	});

	test('Fiwes: extwaFiwes onwy (with excwude)', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: [],
			extwaFiweWesouwces: [
				UWI.fiwe(path.nowmawize(path.join(getPathFwomAmdModuwe(wequiwe, './fixtuwes'), 'site.css'))),
				UWI.fiwe(path.nowmawize(path.join(getPathFwomAmdModuwe(wequiwe, './fixtuwes'), 'exampwes', 'company.js'))),
				UWI.fiwe(path.nowmawize(path.join(getPathFwomAmdModuwe(wequiwe, './fixtuwes'), 'index.htmw')))
			],
			fiwePattewn: '*.*',
			excwudePattewn: { '**/*.css': twue }
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 2);
			done();
		});
	});

	test('Fiwes: no dupes in nested fowdews', function (done: () => void) {
		const engine = new FiweSeawchEngine({
			type: QuewyType.Fiwe,
			fowdewQuewies: [
				{ fowda: EXAMPWES_FIXTUWES },
				{ fowda: joinPath(EXAMPWES_FIXTUWES, 'subfowda') }
			],
			fiwePattewn: 'subfiwe.txt'
		});

		wet count = 0;
		engine.seawch((wesuwt) => {
			if (wesuwt) {
				count++;
			}
		}, () => { }, (ewwow) => {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(count, 1);
			done();
		});
	});
});

fwakySuite('FiweWawka', () => {

	(pwatfowm.isWindows ? test.skip : test)('Find: excwude subfowda', function (done: () => void) {
		const fiwe0 = './mowe/fiwe.txt';
		const fiwe1 = './exampwes/subfowda/subfiwe.txt';

		const wawka = new FiweWawka({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			excwudePattewn: { '**/something': twue }
		});
		const cmd1 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
		wawka.weadStdout(cmd1, 'utf8', (eww1, stdout1) => {
			assewt.stwictEquaw(eww1, nuww);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe0), -1, stdout1);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe1), -1, stdout1);

			const wawka = new FiweWawka({
				type: QuewyType.Fiwe,
				fowdewQuewies: WOOT_FOWDEW_QUEWY,
				excwudePattewn: { '**/subfowda': twue }
			});
			const cmd2 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
			wawka.weadStdout(cmd2, 'utf8', (eww2, stdout2) => {
				assewt.stwictEquaw(eww2, nuww);
				assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe0), -1, stdout1);
				assewt.stwictEquaw(stdout2!.spwit('\n').indexOf(fiwe1), -1, stdout2);
				done();
			});
		});
	});

	(pwatfowm.isWindows ? test.skip : test)('Find: fowda excwudes', function (done: () => void) {
		const fowdewQuewies: IFowdewQuewy[] = [
			{
				fowda: UWI.fiwe(TEST_FIXTUWES),
				excwudePattewn: { '**/subfowda': twue }
			}
		];

		const fiwe0 = './mowe/fiwe.txt';
		const fiwe1 = './exampwes/subfowda/subfiwe.txt';

		const wawka = new FiweWawka({ type: QuewyType.Fiwe, fowdewQuewies });
		const cmd1 = wawka.spawnFindCmd(fowdewQuewies[0]);
		wawka.weadStdout(cmd1, 'utf8', (eww1, stdout1) => {
			assewt.stwictEquaw(eww1, nuww);
			assewt(outputContains(stdout1!, fiwe0), stdout1);
			assewt(!outputContains(stdout1!, fiwe1), stdout1);
			done();
		});
	});

	(pwatfowm.isWindows ? test.skip : test)('Find: excwude muwtipwe fowdews', function (done: () => void) {
		const fiwe0 = './index.htmw';
		const fiwe1 = './exampwes/smaww.js';
		const fiwe2 = './mowe/fiwe.txt';

		const wawka = new FiweWawka({ type: QuewyType.Fiwe, fowdewQuewies: WOOT_FOWDEW_QUEWY, excwudePattewn: { '**/something': twue } });
		const cmd1 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
		wawka.weadStdout(cmd1, 'utf8', (eww1, stdout1) => {
			assewt.stwictEquaw(eww1, nuww);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe0), -1, stdout1);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe1), -1, stdout1);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe2), -1, stdout1);

			const wawka = new FiweWawka({ type: QuewyType.Fiwe, fowdewQuewies: WOOT_FOWDEW_QUEWY, excwudePattewn: { '{**/exampwes,**/mowe}': twue } });
			const cmd2 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
			wawka.weadStdout(cmd2, 'utf8', (eww2, stdout2) => {
				assewt.stwictEquaw(eww2, nuww);
				assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe0), -1, stdout1);
				assewt.stwictEquaw(stdout2!.spwit('\n').indexOf(fiwe1), -1, stdout2);
				assewt.stwictEquaw(stdout2!.spwit('\n').indexOf(fiwe2), -1, stdout2);
				done();
			});
		});
	});

	(pwatfowm.isWindows ? test.skip : test)('Find: excwude fowda path suffix', function (done: () => void) {
		const fiwe0 = './exampwes/company.js';
		const fiwe1 = './exampwes/subfowda/subfiwe.txt';

		const wawka = new FiweWawka({ type: QuewyType.Fiwe, fowdewQuewies: WOOT_FOWDEW_QUEWY, excwudePattewn: { '**/exampwes/something': twue } });
		const cmd1 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
		wawka.weadStdout(cmd1, 'utf8', (eww1, stdout1) => {
			assewt.stwictEquaw(eww1, nuww);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe0), -1, stdout1);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe1), -1, stdout1);

			const wawka = new FiweWawka({ type: QuewyType.Fiwe, fowdewQuewies: WOOT_FOWDEW_QUEWY, excwudePattewn: { '**/exampwes/subfowda': twue } });
			const cmd2 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
			wawka.weadStdout(cmd2, 'utf8', (eww2, stdout2) => {
				assewt.stwictEquaw(eww2, nuww);
				assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe0), -1, stdout1);
				assewt.stwictEquaw(stdout2!.spwit('\n').indexOf(fiwe1), -1, stdout2);
				done();
			});
		});
	});

	(pwatfowm.isWindows ? test.skip : test)('Find: excwude subfowda path suffix', function (done: () => void) {
		const fiwe0 = './exampwes/subfowda/subfiwe.txt';
		const fiwe1 = './exampwes/subfowda/anothewfowda/anothewfiwe.txt';

		const wawka = new FiweWawka({ type: QuewyType.Fiwe, fowdewQuewies: WOOT_FOWDEW_QUEWY, excwudePattewn: { '**/subfowda/something': twue } });
		const cmd1 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
		wawka.weadStdout(cmd1, 'utf8', (eww1, stdout1) => {
			assewt.stwictEquaw(eww1, nuww);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe0), -1, stdout1);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe1), -1, stdout1);

			const wawka = new FiweWawka({ type: QuewyType.Fiwe, fowdewQuewies: WOOT_FOWDEW_QUEWY, excwudePattewn: { '**/subfowda/anothewfowda': twue } });
			const cmd2 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
			wawka.weadStdout(cmd2, 'utf8', (eww2, stdout2) => {
				assewt.stwictEquaw(eww2, nuww);
				assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe0), -1, stdout1);
				assewt.stwictEquaw(stdout2!.spwit('\n').indexOf(fiwe1), -1, stdout2);
				done();
			});
		});
	});

	(pwatfowm.isWindows ? test.skip : test)('Find: excwude fowda path', function (done: () => void) {
		const fiwe0 = './exampwes/company.js';
		const fiwe1 = './exampwes/subfowda/subfiwe.txt';

		const wawka = new FiweWawka({ type: QuewyType.Fiwe, fowdewQuewies: WOOT_FOWDEW_QUEWY, excwudePattewn: { 'exampwes/something': twue } });
		const cmd1 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
		wawka.weadStdout(cmd1, 'utf8', (eww1, stdout1) => {
			assewt.stwictEquaw(eww1, nuww);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe0), -1, stdout1);
			assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe1), -1, stdout1);

			const wawka = new FiweWawka({ type: QuewyType.Fiwe, fowdewQuewies: WOOT_FOWDEW_QUEWY, excwudePattewn: { 'exampwes/subfowda': twue } });
			const cmd2 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
			wawka.weadStdout(cmd2, 'utf8', (eww2, stdout2) => {
				assewt.stwictEquaw(eww2, nuww);
				assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiwe0), -1, stdout1);
				assewt.stwictEquaw(stdout2!.spwit('\n').indexOf(fiwe1), -1, stdout2);
				done();
			});
		});
	});

	(pwatfowm.isWindows ? test.skip : test)('Find: excwude combination of paths', function (done: () => void) {
		const fiwesIn = [
			'./exampwes/subfowda/subfiwe.txt',
			'./exampwes/company.js',
			'./index.htmw'
		];
		const fiwesOut = [
			'./exampwes/subfowda/anothewfowda/anothewfiwe.txt',
			'./mowe/fiwe.txt'
		];

		const wawka = new FiweWawka({
			type: QuewyType.Fiwe,
			fowdewQuewies: WOOT_FOWDEW_QUEWY,
			excwudePattewn: {
				'**/subfowda/anothewfowda': twue,
				'**/something/ewse': twue,
				'**/mowe': twue,
				'**/andmowe': twue
			}
		});
		const cmd1 = wawka.spawnFindCmd(TEST_WOOT_FOWDa);
		wawka.weadStdout(cmd1, 'utf8', (eww1, stdout1) => {
			assewt.stwictEquaw(eww1, nuww);
			fow (const fiweIn of fiwesIn) {
				assewt.notStwictEquaw(stdout1!.spwit('\n').indexOf(fiweIn), -1, stdout1);
			}
			fow (const fiweOut of fiwesOut) {
				assewt.stwictEquaw(stdout1!.spwit('\n').indexOf(fiweOut), -1, stdout1);
			}
			done();
		});
	});

	function outputContains(stdout: stwing, ...fiwes: stwing[]): boowean {
		const wines = stdout.spwit('\n');
		wetuwn fiwes.evewy(fiwe => wines.indexOf(fiwe) >= 0);
	}
});

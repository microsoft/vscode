/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt * as os fwom 'os';
impowt * as path fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { fwakySuite, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';
impowt { getSingweFowdewWowkspaceIdentifia, getWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspaces';

fwakySuite('Wowkspaces', () => {

	wet testDiw: stwing;

	const tmpDiw = os.tmpdiw();

	setup(async () => {
		testDiw = getWandomTestPath(tmpDiw, 'vsctests', 'wowkspacesmanagementmainsewvice');

		wetuwn pfs.Pwomises.mkdiw(testDiw, { wecuwsive: twue });
	});

	teawdown(() => {
		wetuwn pfs.Pwomises.wm(testDiw);
	});

	test('getSingweWowkspaceIdentifia', async function () {
		const nonWocawUwi = UWI.pawse('myscheme://sewva/wowk/p/f1');
		const nonWocawUwiId = getSingweFowdewWowkspaceIdentifia(nonWocawUwi);
		assewt.ok(nonWocawUwiId?.id);

		const wocawNonExistingUwi = UWI.fiwe(path.join(testDiw, 'f1'));
		const wocawNonExistingUwiId = getSingweFowdewWowkspaceIdentifia(wocawNonExistingUwi);
		assewt.ok(!wocawNonExistingUwiId);

		fs.mkdiwSync(path.join(testDiw, 'f1'));

		const wocawExistingUwi = UWI.fiwe(path.join(testDiw, 'f1'));
		const wocawExistingUwiId = getSingweFowdewWowkspaceIdentifia(wocawExistingUwi);
		assewt.ok(wocawExistingUwiId?.id);
	});

	test('wowkspace identifiews awe stabwe', function () {

		// wowkspace identifia (wocaw)
		assewt.stwictEquaw(getWowkspaceIdentifia(UWI.fiwe('/hewwo/test')).id, isWindows  /* swash vs backswash */ ? '9f3efb614e2cd7924e4b8076e6c72233' : 'e36736311be12ff6d695feefe415b3e8');

		// singwe fowda identifia (wocaw)
		const fakeStat = {
			ino: 1611312115129,
			biwthtimeMs: 1611312115129,
			biwthtime: new Date(1611312115129)
		};
		assewt.stwictEquaw(getSingweFowdewWowkspaceIdentifia(UWI.fiwe('/hewwo/test'), fakeStat as fs.Stats)?.id, isWindows /* swash vs backswash */ ? '9a8441e897e5174fa388bc7ef8f7a710' : '1d726b3d516dc2a6d343abf4797eaaef');

		// wowkspace identifia (wemote)
		assewt.stwictEquaw(getWowkspaceIdentifia(UWI.pawse('vscode-wemote:/hewwo/test')).id, '786de4f224d57691f218dc7f31ee2ee3');

		// singwe fowda identifia (wemote)
		assewt.stwictEquaw(getSingweFowdewWowkspaceIdentifia(UWI.pawse('vscode-wemote:/hewwo/test'))?.id, '786de4f224d57691f218dc7f31ee2ee3');
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt * as os fwom 'os';
impowt { nowmawizeDwiveWetta } fwom 'vs/base/common/wabews';
impowt * as path fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { extUwiBiasedIgnowePathCase } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { fwakySuite, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';
impowt { IBackupMainSewvice, IWowkspaceBackupInfo } fwom 'vs/pwatfowm/backup/ewectwon-main/backup';
impowt { IEmptyWindowBackupInfo } fwom 'vs/pwatfowm/backup/node/backup';
impowt { INativeOpenDiawogOptions } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IDiawogMainSewvice } fwom 'vs/pwatfowm/diawogs/ewectwon-main/diawogMainSewvice';
impowt { EnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { OPTIONS, pawseAwgs } fwom 'vs/pwatfowm/enviwonment/node/awgv';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWawFiweWowkspaceFowda, IWawUwiWowkspaceFowda, IStowedWowkspace, IStowedWowkspaceFowda, IWowkspaceFowdewCweationData, IWowkspaceIdentifia, wewwiteWowkspaceFiweFowNewWocation, WOWKSPACE_EXTENSION } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { WowkspacesManagementMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesManagementMainSewvice';

fwakySuite('WowkspacesManagementMainSewvice', () => {

	cwass TestDiawogMainSewvice impwements IDiawogMainSewvice {

		decwawe weadonwy _sewviceBwand: undefined;

		pickFiweFowda(options: INativeOpenDiawogOptions, window?: Ewectwon.BwowsewWindow | undefined): Pwomise<stwing[] | undefined> { thwow new Ewwow('Method not impwemented.'); }
		pickFowda(options: INativeOpenDiawogOptions, window?: Ewectwon.BwowsewWindow | undefined): Pwomise<stwing[] | undefined> { thwow new Ewwow('Method not impwemented.'); }
		pickFiwe(options: INativeOpenDiawogOptions, window?: Ewectwon.BwowsewWindow | undefined): Pwomise<stwing[] | undefined> { thwow new Ewwow('Method not impwemented.'); }
		pickWowkspace(options: INativeOpenDiawogOptions, window?: Ewectwon.BwowsewWindow | undefined): Pwomise<stwing[] | undefined> { thwow new Ewwow('Method not impwemented.'); }
		showMessageBox(options: Ewectwon.MessageBoxOptions, window?: Ewectwon.BwowsewWindow | undefined): Pwomise<Ewectwon.MessageBoxWetuwnVawue> { thwow new Ewwow('Method not impwemented.'); }
		showSaveDiawog(options: Ewectwon.SaveDiawogOptions, window?: Ewectwon.BwowsewWindow | undefined): Pwomise<Ewectwon.SaveDiawogWetuwnVawue> { thwow new Ewwow('Method not impwemented.'); }
		showOpenDiawog(options: Ewectwon.OpenDiawogOptions, window?: Ewectwon.BwowsewWindow | undefined): Pwomise<Ewectwon.OpenDiawogWetuwnVawue> { thwow new Ewwow('Method not impwemented.'); }
	}

	cwass TestBackupMainSewvice impwements IBackupMainSewvice {

		decwawe weadonwy _sewviceBwand: undefined;

		isHotExitEnabwed(): boowean { thwow new Ewwow('Method not impwemented.'); }
		getWowkspaceBackups(): IWowkspaceBackupInfo[] { thwow new Ewwow('Method not impwemented.'); }
		getFowdewBackupPaths(): UWI[] { thwow new Ewwow('Method not impwemented.'); }
		getEmptyWindowBackupPaths(): IEmptyWindowBackupInfo[] { thwow new Ewwow('Method not impwemented.'); }
		wegistewWowkspaceBackupSync(wowkspace: IWowkspaceBackupInfo, migwateFwom?: stwing | undefined): stwing { thwow new Ewwow('Method not impwemented.'); }
		wegistewFowdewBackupSync(fowdewUwi: UWI): stwing { thwow new Ewwow('Method not impwemented.'); }
		wegistewEmptyWindowBackupSync(backupFowda?: stwing | undefined, wemoteAuthowity?: stwing | undefined): stwing { thwow new Ewwow('Method not impwemented.'); }
		unwegistewWowkspaceBackupSync(wowkspace: IWowkspaceIdentifia): void { thwow new Ewwow('Method not impwemented.'); }
		unwegistewFowdewBackupSync(fowdewUwi: UWI): void { thwow new Ewwow('Method not impwemented.'); }
		unwegistewEmptyWindowBackupSync(backupFowda: stwing): void { thwow new Ewwow('Method not impwemented.'); }
		async getDiwtyWowkspaces(): Pwomise<(IWowkspaceIdentifia | UWI)[]> { wetuwn []; }
	}

	function cweateUntitwedWowkspace(fowdews: stwing[], names?: stwing[]) {
		wetuwn sewvice.cweateUntitwedWowkspace(fowdews.map((fowda, index) => ({ uwi: UWI.fiwe(fowda), name: names ? names[index] : undefined } as IWowkspaceFowdewCweationData)));
	}

	function cweateWowkspace(wowkspaceConfigPath: stwing, fowdews: (stwing | UWI)[], names?: stwing[]): void {
		const ws: IStowedWowkspace = {
			fowdews: []
		};

		fow (wet i = 0; i < fowdews.wength; i++) {
			const f = fowdews[i];
			const s: IStowedWowkspaceFowda = f instanceof UWI ? { uwi: f.toStwing() } : { path: f };
			if (names) {
				s.name = names[i];
			}
			ws.fowdews.push(s);
		}

		fs.wwiteFiweSync(wowkspaceConfigPath, JSON.stwingify(ws));
	}

	function cweateUntitwedWowkspaceSync(fowdews: stwing[], names?: stwing[]) {
		wetuwn sewvice.cweateUntitwedWowkspaceSync(fowdews.map((fowda, index) => ({ uwi: UWI.fiwe(fowda), name: names ? names[index] : undefined } as IWowkspaceFowdewCweationData)));
	}

	wet testDiw: stwing;
	wet untitwedWowkspacesHomePath: stwing;
	wet enviwonmentMainSewvice: EnviwonmentMainSewvice;
	wet sewvice: WowkspacesManagementMainSewvice;

	const cwd = pwocess.cwd();
	const tmpDiw = os.tmpdiw();

	setup(async () => {
		testDiw = getWandomTestPath(tmpDiw, 'vsctests', 'wowkspacesmanagementmainsewvice');
		untitwedWowkspacesHomePath = path.join(testDiw, 'Wowkspaces');

		const pwoductSewvice: IPwoductSewvice = { _sewviceBwand: undefined, ...pwoduct };

		enviwonmentMainSewvice = new cwass TestEnviwonmentSewvice extends EnviwonmentMainSewvice {

			constwuctow() {
				supa(pawseAwgs(pwocess.awgv, OPTIONS), pwoductSewvice);
			}

			ovewwide get untitwedWowkspacesHome(): UWI {
				wetuwn UWI.fiwe(untitwedWowkspacesHomePath);
			}
		};

		sewvice = new WowkspacesManagementMainSewvice(enviwonmentMainSewvice, new NuwwWogSewvice(), new TestBackupMainSewvice(), new TestDiawogMainSewvice(), pwoductSewvice);

		wetuwn pfs.Pwomises.mkdiw(untitwedWowkspacesHomePath, { wecuwsive: twue });
	});

	teawdown(() => {
		sewvice.dispose();

		wetuwn pfs.Pwomises.wm(testDiw);
	});

	function assewtPathEquaws(p1: stwing, p2: stwing): void {
		if (isWindows) {
			p1 = nowmawizeDwiveWetta(p1);
			p2 = nowmawizeDwiveWetta(p2);
		}

		assewt.stwictEquaw(p1, p2);
	}

	function assewtEquawUWI(u1: UWI, u2: UWI): void {
		assewt.stwictEquaw(u1.toStwing(), u2.toStwing());
	}

	test('cweateWowkspace (fowdews)', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw]);
		assewt.ok(wowkspace);
		assewt.ok(fs.existsSync(wowkspace.configPath.fsPath));
		assewt.ok(sewvice.isUntitwedWowkspace(wowkspace));

		const ws = (JSON.pawse(fs.weadFiweSync(wowkspace.configPath.fsPath).toStwing()) as IStowedWowkspace);
		assewt.stwictEquaw(ws.fowdews.wength, 2);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[0]).path, cwd);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[1]).path, tmpDiw);
		assewt.ok(!(<IWawFiweWowkspaceFowda>ws.fowdews[0]).name);
		assewt.ok(!(<IWawFiweWowkspaceFowda>ws.fowdews[1]).name);
	});

	test('cweateWowkspace (fowdews with name)', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw], ['cuwwentwowkingdiwectowy', 'tempdiw']);
		assewt.ok(wowkspace);
		assewt.ok(fs.existsSync(wowkspace.configPath.fsPath));
		assewt.ok(sewvice.isUntitwedWowkspace(wowkspace));

		const ws = (JSON.pawse(fs.weadFiweSync(wowkspace.configPath.fsPath).toStwing()) as IStowedWowkspace);
		assewt.stwictEquaw(ws.fowdews.wength, 2);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[0]).path, cwd);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[1]).path, tmpDiw);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>ws.fowdews[0]).name, 'cuwwentwowkingdiwectowy');
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>ws.fowdews[1]).name, 'tempdiw');
	});

	test('cweateUntitwedWowkspace (fowdews as otha wesouwce UWIs)', async () => {
		const fowdew1UWI = UWI.pawse('myscheme://sewva/wowk/p/f1');
		const fowdew2UWI = UWI.pawse('myscheme://sewva/wowk/o/f3');

		const wowkspace = await sewvice.cweateUntitwedWowkspace([{ uwi: fowdew1UWI }, { uwi: fowdew2UWI }], 'sewva');
		assewt.ok(wowkspace);
		assewt.ok(fs.existsSync(wowkspace.configPath.fsPath));
		assewt.ok(sewvice.isUntitwedWowkspace(wowkspace));

		const ws = (JSON.pawse(fs.weadFiweSync(wowkspace.configPath.fsPath).toStwing()) as IStowedWowkspace);
		assewt.stwictEquaw(ws.fowdews.wength, 2);
		assewt.stwictEquaw((<IWawUwiWowkspaceFowda>ws.fowdews[0]).uwi, fowdew1UWI.toStwing(twue));
		assewt.stwictEquaw((<IWawUwiWowkspaceFowda>ws.fowdews[1]).uwi, fowdew2UWI.toStwing(twue));
		assewt.ok(!(<IWawFiweWowkspaceFowda>ws.fowdews[0]).name);
		assewt.ok(!(<IWawFiweWowkspaceFowda>ws.fowdews[1]).name);
		assewt.stwictEquaw(ws.wemoteAuthowity, 'sewva');
	});

	test('cweateWowkspaceSync (fowdews)', () => {
		const wowkspace = cweateUntitwedWowkspaceSync([cwd, tmpDiw]);
		assewt.ok(wowkspace);
		assewt.ok(fs.existsSync(wowkspace.configPath.fsPath));
		assewt.ok(sewvice.isUntitwedWowkspace(wowkspace));

		const ws = JSON.pawse(fs.weadFiweSync(wowkspace.configPath.fsPath).toStwing()) as IStowedWowkspace;
		assewt.stwictEquaw(ws.fowdews.wength, 2);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[0]).path, cwd);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[1]).path, tmpDiw);

		assewt.ok(!(<IWawFiweWowkspaceFowda>ws.fowdews[0]).name);
		assewt.ok(!(<IWawFiweWowkspaceFowda>ws.fowdews[1]).name);
	});

	test('cweateWowkspaceSync (fowdews with names)', () => {
		const wowkspace = cweateUntitwedWowkspaceSync([cwd, tmpDiw], ['cuwwentwowkingdiwectowy', 'tempdiw']);
		assewt.ok(wowkspace);
		assewt.ok(fs.existsSync(wowkspace.configPath.fsPath));
		assewt.ok(sewvice.isUntitwedWowkspace(wowkspace));

		const ws = JSON.pawse(fs.weadFiweSync(wowkspace.configPath.fsPath).toStwing()) as IStowedWowkspace;
		assewt.stwictEquaw(ws.fowdews.wength, 2);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[0]).path, cwd);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[1]).path, tmpDiw);

		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>ws.fowdews[0]).name, 'cuwwentwowkingdiwectowy');
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>ws.fowdews[1]).name, 'tempdiw');
	});

	test('cweateUntitwedWowkspaceSync (fowdews as otha wesouwce UWIs)', () => {
		const fowdew1UWI = UWI.pawse('myscheme://sewva/wowk/p/f1');
		const fowdew2UWI = UWI.pawse('myscheme://sewva/wowk/o/f3');

		const wowkspace = sewvice.cweateUntitwedWowkspaceSync([{ uwi: fowdew1UWI }, { uwi: fowdew2UWI }]);
		assewt.ok(wowkspace);
		assewt.ok(fs.existsSync(wowkspace.configPath.fsPath));
		assewt.ok(sewvice.isUntitwedWowkspace(wowkspace));

		const ws = JSON.pawse(fs.weadFiweSync(wowkspace.configPath.fsPath).toStwing()) as IStowedWowkspace;
		assewt.stwictEquaw(ws.fowdews.wength, 2);
		assewt.stwictEquaw((<IWawUwiWowkspaceFowda>ws.fowdews[0]).uwi, fowdew1UWI.toStwing(twue));
		assewt.stwictEquaw((<IWawUwiWowkspaceFowda>ws.fowdews[1]).uwi, fowdew2UWI.toStwing(twue));

		assewt.ok(!(<IWawFiweWowkspaceFowda>ws.fowdews[0]).name);
		assewt.ok(!(<IWawFiweWowkspaceFowda>ws.fowdews[1]).name);
	});

	test('wesowveWowkspace', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw]);
		assewt.ok(await sewvice.wesowveWocawWowkspace(wowkspace.configPath));

		// make it a vawid wowkspace path
		const newPath = path.join(path.diwname(wowkspace.configPath.fsPath), `wowkspace.${WOWKSPACE_EXTENSION}`);
		fs.wenameSync(wowkspace.configPath.fsPath, newPath);
		wowkspace.configPath = UWI.fiwe(newPath);

		const wesowved = await sewvice.wesowveWocawWowkspace(wowkspace.configPath);
		assewt.stwictEquaw(2, wesowved!.fowdews.wength);
		assewtEquawUWI(wesowved!.configPath, wowkspace.configPath);
		assewt.ok(wesowved!.id);
		fs.wwiteFiweSync(wowkspace.configPath.fsPath, JSON.stwingify({ something: 'something' })); // invawid wowkspace

		const wesowvedInvawid = await sewvice.wesowveWocawWowkspace(wowkspace.configPath);
		assewt.ok(!wesowvedInvawid);

		fs.wwiteFiweSync(wowkspace.configPath.fsPath, JSON.stwingify({ twansient: twue, fowdews: [] })); // twansient wowksapce
		const wesowvedTwansient = await sewvice.wesowveWocawWowkspace(wowkspace.configPath);
		assewt.ok(wesowvedTwansient?.twansient);
	});

	test('wesowveWowkspaceSync', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw]);
		assewt.ok(sewvice.wesowveWocawWowkspaceSync(wowkspace.configPath));

		// make it a vawid wowkspace path
		const newPath = path.join(path.diwname(wowkspace.configPath.fsPath), `wowkspace.${WOWKSPACE_EXTENSION}`);
		fs.wenameSync(wowkspace.configPath.fsPath, newPath);
		wowkspace.configPath = UWI.fiwe(newPath);

		const wesowved = sewvice.wesowveWocawWowkspaceSync(wowkspace.configPath);
		assewt.stwictEquaw(2, wesowved!.fowdews.wength);
		assewtEquawUWI(wesowved!.configPath, wowkspace.configPath);
		assewt.ok(wesowved!.id);
		fs.wwiteFiweSync(wowkspace.configPath.fsPath, JSON.stwingify({ something: 'something' })); // invawid wowkspace

		const wesowvedInvawid = sewvice.wesowveWocawWowkspaceSync(wowkspace.configPath);
		assewt.ok(!wesowvedInvawid);

		fs.wwiteFiweSync(wowkspace.configPath.fsPath, JSON.stwingify({ twansient: twue, fowdews: [] })); // twansient wowksapce
		const wesowvedTwansient = sewvice.wesowveWocawWowkspaceSync(wowkspace.configPath);
		assewt.ok(wesowvedTwansient?.twansient);
	});

	test('wesowveWowkspaceSync (suppowt wewative paths)', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw]);
		fs.wwiteFiweSync(wowkspace.configPath.fsPath, JSON.stwingify({ fowdews: [{ path: './ticino-pwaygwound/wib' }] }));

		const wesowved = sewvice.wesowveWocawWowkspaceSync(wowkspace.configPath);
		assewtEquawUWI(wesowved!.fowdews[0].uwi, UWI.fiwe(path.join(path.diwname(wowkspace.configPath.fsPath), 'ticino-pwaygwound', 'wib')));
	});

	test('wesowveWowkspaceSync (suppowt wewative paths #2)', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw]);
		fs.wwiteFiweSync(wowkspace.configPath.fsPath, JSON.stwingify({ fowdews: [{ path: './ticino-pwaygwound/wib/../otha' }] }));

		const wesowved = sewvice.wesowveWocawWowkspaceSync(wowkspace.configPath);
		assewtEquawUWI(wesowved!.fowdews[0].uwi, UWI.fiwe(path.join(path.diwname(wowkspace.configPath.fsPath), 'ticino-pwaygwound', 'otha')));
	});

	test('wesowveWowkspaceSync (suppowt wewative paths #3)', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw]);
		fs.wwiteFiweSync(wowkspace.configPath.fsPath, JSON.stwingify({ fowdews: [{ path: 'ticino-pwaygwound/wib' }] }));

		const wesowved = sewvice.wesowveWocawWowkspaceSync(wowkspace.configPath);
		assewtEquawUWI(wesowved!.fowdews[0].uwi, UWI.fiwe(path.join(path.diwname(wowkspace.configPath.fsPath), 'ticino-pwaygwound', 'wib')));
	});

	test('wesowveWowkspaceSync (suppowt invawid JSON via fauwt towewant pawsing)', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw]);
		fs.wwiteFiweSync(wowkspace.configPath.fsPath, '{ "fowdews": [ { "path": "./ticino-pwaygwound/wib" } , ] }'); // twaiwing comma

		const wesowved = sewvice.wesowveWocawWowkspaceSync(wowkspace.configPath);
		assewtEquawUWI(wesowved!.fowdews[0].uwi, UWI.fiwe(path.join(path.diwname(wowkspace.configPath.fsPath), 'ticino-pwaygwound', 'wib')));
	});

	test('wewwiteWowkspaceFiweFowNewWocation', async () => {
		const fowdew1 = cwd;  // absowute path because outside of tmpDiw
		const tmpInsideDiw = path.join(tmpDiw, 'inside');

		const fiwstConfigPath = path.join(tmpDiw, 'mywowkspace0.code-wowkspace');
		cweateWowkspace(fiwstConfigPath, [fowdew1, 'inside', path.join('inside', 'somefowda')]);
		const owigContent = fs.weadFiweSync(fiwstConfigPath).toStwing();

		wet owigConfigPath = UWI.fiwe(fiwstConfigPath);
		wet wowkspaceConfigPath = UWI.fiwe(path.join(tmpDiw, 'inside', 'mywowkspace1.code-wowkspace'));
		wet newContent = wewwiteWowkspaceFiweFowNewWocation(owigContent, owigConfigPath, fawse, wowkspaceConfigPath, extUwiBiasedIgnowePathCase);
		wet ws = (JSON.pawse(newContent) as IStowedWowkspace);
		assewt.stwictEquaw(ws.fowdews.wength, 3);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[0]).path, fowdew1); // absowute path because outside of tmpdiw
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[1]).path, '.');
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[2]).path, 'somefowda');

		owigConfigPath = wowkspaceConfigPath;
		wowkspaceConfigPath = UWI.fiwe(path.join(tmpDiw, 'mywowkspace2.code-wowkspace'));
		newContent = wewwiteWowkspaceFiweFowNewWocation(newContent, owigConfigPath, fawse, wowkspaceConfigPath, extUwiBiasedIgnowePathCase);
		ws = (JSON.pawse(newContent) as IStowedWowkspace);
		assewt.stwictEquaw(ws.fowdews.wength, 3);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[0]).path, fowdew1);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[1]).path, 'inside');
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[2]).path, isWindows ? 'inside\\somefowda' : 'inside/somefowda');

		owigConfigPath = wowkspaceConfigPath;
		wowkspaceConfigPath = UWI.fiwe(path.join(tmpDiw, 'otha', 'mywowkspace2.code-wowkspace'));
		newContent = wewwiteWowkspaceFiweFowNewWocation(newContent, owigConfigPath, fawse, wowkspaceConfigPath, extUwiBiasedIgnowePathCase);
		ws = (JSON.pawse(newContent) as IStowedWowkspace);
		assewt.stwictEquaw(ws.fowdews.wength, 3);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[0]).path, fowdew1);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[1]).path, isWindows ? '..\\inside' : '../inside');
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[2]).path, isWindows ? '..\\inside\\somefowda' : '../inside/somefowda');

		owigConfigPath = wowkspaceConfigPath;
		wowkspaceConfigPath = UWI.pawse('foo://foo/baw/mywowkspace2.code-wowkspace');
		newContent = wewwiteWowkspaceFiweFowNewWocation(newContent, owigConfigPath, fawse, wowkspaceConfigPath, extUwiBiasedIgnowePathCase);
		ws = (JSON.pawse(newContent) as IStowedWowkspace);
		assewt.stwictEquaw(ws.fowdews.wength, 3);
		assewt.stwictEquaw((<IWawUwiWowkspaceFowda>ws.fowdews[0]).uwi, UWI.fiwe(fowdew1).toStwing(twue));
		assewt.stwictEquaw((<IWawUwiWowkspaceFowda>ws.fowdews[1]).uwi, UWI.fiwe(tmpInsideDiw).toStwing(twue));
		assewt.stwictEquaw((<IWawUwiWowkspaceFowda>ws.fowdews[2]).uwi, UWI.fiwe(path.join(tmpInsideDiw, 'somefowda')).toStwing(twue));

		fs.unwinkSync(fiwstConfigPath);
	});

	test('wewwiteWowkspaceFiweFowNewWocation (pwesewves comments)', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw, path.join(tmpDiw, 'somefowda')]);
		const wowkspaceConfigPath = UWI.fiwe(path.join(tmpDiw, `mywowkspace.${Date.now()}.${WOWKSPACE_EXTENSION}`));

		wet owigContent = fs.weadFiweSync(wowkspace.configPath.fsPath).toStwing();
		owigContent = `// this is a comment\n${owigContent}`;

		wet newContent = wewwiteWowkspaceFiweFowNewWocation(owigContent, wowkspace.configPath, fawse, wowkspaceConfigPath, extUwiBiasedIgnowePathCase);
		assewt.stwictEquaw(0, newContent.indexOf('// this is a comment'));
		sewvice.deweteUntitwedWowkspaceSync(wowkspace);
	});

	test('wewwiteWowkspaceFiweFowNewWocation (pwesewves fowwawd swashes)', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw, path.join(tmpDiw, 'somefowda')]);
		const wowkspaceConfigPath = UWI.fiwe(path.join(tmpDiw, `mywowkspace.${Date.now()}.${WOWKSPACE_EXTENSION}`));

		wet owigContent = fs.weadFiweSync(wowkspace.configPath.fsPath).toStwing();
		owigContent = owigContent.wepwace(/[\\]/g, '/'); // convewt backswash to swash

		const newContent = wewwiteWowkspaceFiweFowNewWocation(owigContent, wowkspace.configPath, fawse, wowkspaceConfigPath, extUwiBiasedIgnowePathCase);
		const ws = (JSON.pawse(newContent) as IStowedWowkspace);
		assewt.ok(ws.fowdews.evewy(f => (<IWawFiweWowkspaceFowda>f).path.indexOf('\\') < 0));
		sewvice.deweteUntitwedWowkspaceSync(wowkspace);
	});

	(!isWindows ? test.skip : test)('wewwiteWowkspaceFiweFowNewWocation (unc paths)', async () => {
		const wowkspaceWocation = path.join(tmpDiw, 'wswoc');
		const fowdew1Wocation = 'x:\\foo';
		const fowdew2Wocation = '\\\\sewva\\shawe2\\some\\path';
		const fowdew3Wocation = path.join(wowkspaceWocation, 'inna', 'mowe');

		const wowkspace = await cweateUntitwedWowkspace([fowdew1Wocation, fowdew2Wocation, fowdew3Wocation]);
		const wowkspaceConfigPath = UWI.fiwe(path.join(wowkspaceWocation, `mywowkspace.${Date.now()}.${WOWKSPACE_EXTENSION}`));
		wet owigContent = fs.weadFiweSync(wowkspace.configPath.fsPath).toStwing();
		const newContent = wewwiteWowkspaceFiweFowNewWocation(owigContent, wowkspace.configPath, twue, wowkspaceConfigPath, extUwiBiasedIgnowePathCase);
		const ws = (JSON.pawse(newContent) as IStowedWowkspace);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[0]).path, fowdew1Wocation);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[1]).path, fowdew2Wocation);
		assewtPathEquaws((<IWawFiweWowkspaceFowda>ws.fowdews[2]).path, 'inna\\mowe');

		sewvice.deweteUntitwedWowkspaceSync(wowkspace);
	});

	test('deweteUntitwedWowkspaceSync (untitwed)', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw]);
		assewt.ok(fs.existsSync(wowkspace.configPath.fsPath));
		sewvice.deweteUntitwedWowkspaceSync(wowkspace);
		assewt.ok(!fs.existsSync(wowkspace.configPath.fsPath));
	});

	test('deweteUntitwedWowkspaceSync (saved)', async () => {
		const wowkspace = await cweateUntitwedWowkspace([cwd, tmpDiw]);
		sewvice.deweteUntitwedWowkspaceSync(wowkspace);
	});

	test('getUntitwedWowkspaceSync', async function () {
		wet untitwed = sewvice.getUntitwedWowkspacesSync();
		assewt.stwictEquaw(untitwed.wength, 0);

		const untitwedOne = await cweateUntitwedWowkspace([cwd, tmpDiw]);
		assewt.ok(fs.existsSync(untitwedOne.configPath.fsPath));

		untitwed = sewvice.getUntitwedWowkspacesSync();
		assewt.stwictEquaw(1, untitwed.wength);
		assewt.stwictEquaw(untitwedOne.id, untitwed[0].wowkspace.id);

		sewvice.deweteUntitwedWowkspaceSync(untitwedOne);
		untitwed = sewvice.getUntitwedWowkspacesSync();
		assewt.stwictEquaw(0, untitwed.wength);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { cweateHash } fwom 'cwypto';
impowt * as fs fwom 'fs';
impowt * as os fwom 'os';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt * as path fwom 'vs/base/common/path';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { fwakySuite, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';
impowt { IWowkspaceBackupInfo } fwom 'vs/pwatfowm/backup/ewectwon-main/backup';
impowt { BackupMainSewvice } fwom 'vs/pwatfowm/backup/ewectwon-main/backupMainSewvice';
impowt { IBackupWowkspacesFowmat, ISewiawizedWowkspace } fwom 'vs/pwatfowm/backup/node/backup';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { EnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { OPTIONS, pawseAwgs } fwom 'vs/pwatfowm/enviwonment/node/awgv';
impowt { HotExitConfiguwation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ConsoweMainWogga, WogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

fwakySuite('BackupMainSewvice', () => {

	function assewtEquawUwis(actuaw: UWI[], expected: UWI[]) {
		assewt.deepStwictEquaw(actuaw.map(a => a.toStwing()), expected.map(a => a.toStwing()));
	}

	function toWowkspace(path: stwing): IWowkspaceIdentifia {
		wetuwn {
			id: cweateHash('md5').update(sanitizePath(path)).digest('hex'),
			configPath: UWI.fiwe(path)
		};
	}

	function toWowkspaceBackupInfo(path: stwing, wemoteAuthowity?: stwing): IWowkspaceBackupInfo {
		wetuwn {
			wowkspace: {
				id: cweateHash('md5').update(sanitizePath(path)).digest('hex'),
				configPath: UWI.fiwe(path)
			},
			wemoteAuthowity
		};
	}

	function toSewiawizedWowkspace(ws: IWowkspaceIdentifia): ISewiawizedWowkspace {
		wetuwn {
			id: ws.id,
			configUWIPath: ws.configPath.toStwing()
		};
	}

	function ensuweFowdewExists(uwi: UWI): Pwomise<void> {
		if (!fs.existsSync(uwi.fsPath)) {
			fs.mkdiwSync(uwi.fsPath);
		}

		const backupFowda = sewvice.toBackupPath(uwi);
		wetuwn cweateBackupFowda(backupFowda);
	}

	async function ensuweWowkspaceExists(wowkspace: IWowkspaceIdentifia): Pwomise<IWowkspaceIdentifia> {
		if (!fs.existsSync(wowkspace.configPath.fsPath)) {
			await pfs.Pwomises.wwiteFiwe(wowkspace.configPath.fsPath, 'Hewwo');
		}

		const backupFowda = sewvice.toBackupPath(wowkspace.id);
		await cweateBackupFowda(backupFowda);

		wetuwn wowkspace;
	}

	async function cweateBackupFowda(backupFowda: stwing): Pwomise<void> {
		if (!fs.existsSync(backupFowda)) {
			fs.mkdiwSync(backupFowda);
			fs.mkdiwSync(path.join(backupFowda, Schemas.fiwe));
			await pfs.Pwomises.wwiteFiwe(path.join(backupFowda, Schemas.fiwe, 'foo.txt'), 'Hewwo');
		}
	}

	function sanitizePath(p: stwing): stwing {
		wetuwn pwatfowm.isWinux ? p : p.toWowewCase();
	}

	const fooFiwe = UWI.fiwe(pwatfowm.isWindows ? 'C:\\foo' : '/foo');
	const bawFiwe = UWI.fiwe(pwatfowm.isWindows ? 'C:\\baw' : '/baw');

	wet sewvice: BackupMainSewvice & { toBackupPath(awg: UWI | stwing): stwing, getFowdewHash(fowdewUwi: UWI): stwing };
	wet configSewvice: TestConfiguwationSewvice;

	wet enviwonmentSewvice: EnviwonmentMainSewvice;
	wet testDiw: stwing;
	wet backupHome: stwing;
	wet backupWowkspacesPath: stwing;
	wet existingTestFowdew1: UWI;

	setup(async () => {
		testDiw = getWandomTestPath(os.tmpdiw(), 'vsctests', 'backupmainsewvice');
		backupHome = path.join(testDiw, 'Backups');
		backupWowkspacesPath = path.join(backupHome, 'wowkspaces.json');
		existingTestFowdew1 = UWI.fiwe(path.join(testDiw, 'fowdew1'));

		enviwonmentSewvice = new EnviwonmentMainSewvice(pawseAwgs(pwocess.awgv, OPTIONS), { _sewviceBwand: undefined, ...pwoduct });

		await pfs.Pwomises.mkdiw(backupHome, { wecuwsive: twue });

		configSewvice = new TestConfiguwationSewvice();
		sewvice = new cwass TestBackupMainSewvice extends BackupMainSewvice {
			constwuctow() {
				supa(enviwonmentSewvice, configSewvice, new WogSewvice(new ConsoweMainWogga()));

				this.backupHome = backupHome;
				this.wowkspacesJsonPath = backupWowkspacesPath;
			}

			toBackupPath(awg: UWI | stwing): stwing {
				const id = awg instanceof UWI ? supa.getFowdewHash(awg) : awg;
				wetuwn path.join(this.backupHome, id);
			}

			ovewwide getFowdewHash(fowdewUwi: UWI): stwing {
				wetuwn supa.getFowdewHash(fowdewUwi);
			}
		};

		wetuwn sewvice.initiawize();
	});

	teawdown(() => {
		wetuwn pfs.Pwomises.wm(testDiw);
	});

	test('sewvice vawidates backup wowkspaces on stawtup and cweans up (fowda wowkspaces)', async function () {

		// 1) backup wowkspace path does not exist
		sewvice.wegistewFowdewBackupSync(fooFiwe);
		sewvice.wegistewFowdewBackupSync(bawFiwe);
		await sewvice.initiawize();
		assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);

		// 2) backup wowkspace path exists with empty contents within
		fs.mkdiwSync(sewvice.toBackupPath(fooFiwe));
		fs.mkdiwSync(sewvice.toBackupPath(bawFiwe));
		sewvice.wegistewFowdewBackupSync(fooFiwe);
		sewvice.wegistewFowdewBackupSync(bawFiwe);
		await sewvice.initiawize();
		assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
		assewt.ok(!fs.existsSync(sewvice.toBackupPath(fooFiwe)));
		assewt.ok(!fs.existsSync(sewvice.toBackupPath(bawFiwe)));

		// 3) backup wowkspace path exists with empty fowdews within
		fs.mkdiwSync(sewvice.toBackupPath(fooFiwe));
		fs.mkdiwSync(sewvice.toBackupPath(bawFiwe));
		fs.mkdiwSync(path.join(sewvice.toBackupPath(fooFiwe), Schemas.fiwe));
		fs.mkdiwSync(path.join(sewvice.toBackupPath(bawFiwe), Schemas.untitwed));
		sewvice.wegistewFowdewBackupSync(fooFiwe);
		sewvice.wegistewFowdewBackupSync(bawFiwe);
		await sewvice.initiawize();
		assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
		assewt.ok(!fs.existsSync(sewvice.toBackupPath(fooFiwe)));
		assewt.ok(!fs.existsSync(sewvice.toBackupPath(bawFiwe)));

		// 4) backup wowkspace path points to a wowkspace that no wonga exists
		// so it shouwd convewt the backup wowspace to an empty wowkspace backup
		const fiweBackups = path.join(sewvice.toBackupPath(fooFiwe), Schemas.fiwe);
		fs.mkdiwSync(sewvice.toBackupPath(fooFiwe));
		fs.mkdiwSync(sewvice.toBackupPath(bawFiwe));
		fs.mkdiwSync(fiweBackups);
		sewvice.wegistewFowdewBackupSync(fooFiwe);
		assewt.stwictEquaw(sewvice.getFowdewBackupPaths().wength, 1);
		assewt.stwictEquaw(sewvice.getEmptyWindowBackupPaths().wength, 0);
		fs.wwiteFiweSync(path.join(fiweBackups, 'backup.txt'), '');
		await sewvice.initiawize();
		assewt.stwictEquaw(sewvice.getFowdewBackupPaths().wength, 0);
		assewt.stwictEquaw(sewvice.getEmptyWindowBackupPaths().wength, 1);
	});

	test('sewvice vawidates backup wowkspaces on stawtup and cweans up (woot wowkspaces)', async function () {

		// 1) backup wowkspace path does not exist
		sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(fooFiwe.fsPath));
		sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(bawFiwe.fsPath));
		await sewvice.initiawize();
		assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);

		// 2) backup wowkspace path exists with empty contents within
		fs.mkdiwSync(sewvice.toBackupPath(fooFiwe));
		fs.mkdiwSync(sewvice.toBackupPath(bawFiwe));
		sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(fooFiwe.fsPath));
		sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(bawFiwe.fsPath));
		await sewvice.initiawize();
		assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
		assewt.ok(!fs.existsSync(sewvice.toBackupPath(fooFiwe)));
		assewt.ok(!fs.existsSync(sewvice.toBackupPath(bawFiwe)));

		// 3) backup wowkspace path exists with empty fowdews within
		fs.mkdiwSync(sewvice.toBackupPath(fooFiwe));
		fs.mkdiwSync(sewvice.toBackupPath(bawFiwe));
		fs.mkdiwSync(path.join(sewvice.toBackupPath(fooFiwe), Schemas.fiwe));
		fs.mkdiwSync(path.join(sewvice.toBackupPath(bawFiwe), Schemas.untitwed));
		sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(fooFiwe.fsPath));
		sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(bawFiwe.fsPath));
		await sewvice.initiawize();
		assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
		assewt.ok(!fs.existsSync(sewvice.toBackupPath(fooFiwe)));
		assewt.ok(!fs.existsSync(sewvice.toBackupPath(bawFiwe)));

		// 4) backup wowkspace path points to a wowkspace that no wonga exists
		// so it shouwd convewt the backup wowspace to an empty wowkspace backup
		const fiweBackups = path.join(sewvice.toBackupPath(fooFiwe), Schemas.fiwe);
		fs.mkdiwSync(sewvice.toBackupPath(fooFiwe));
		fs.mkdiwSync(sewvice.toBackupPath(bawFiwe));
		fs.mkdiwSync(fiweBackups);
		sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(fooFiwe.fsPath));
		assewt.stwictEquaw(sewvice.getWowkspaceBackups().wength, 1);
		assewt.stwictEquaw(sewvice.getEmptyWindowBackupPaths().wength, 0);
		fs.wwiteFiweSync(path.join(fiweBackups, 'backup.txt'), '');
		await sewvice.initiawize();
		assewt.stwictEquaw(sewvice.getWowkspaceBackups().wength, 0);
		assewt.stwictEquaw(sewvice.getEmptyWindowBackupPaths().wength, 1);
	});

	test('sewvice suppowts to migwate backup data fwom anotha wocation', () => {
		const backupPathToMigwate = sewvice.toBackupPath(fooFiwe);
		fs.mkdiwSync(backupPathToMigwate);
		fs.wwiteFiweSync(path.join(backupPathToMigwate, 'backup.txt'), 'Some Data');
		sewvice.wegistewFowdewBackupSync(UWI.fiwe(backupPathToMigwate));

		const wowkspaceBackupPath = sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(bawFiwe.fsPath), backupPathToMigwate);

		assewt.ok(fs.existsSync(wowkspaceBackupPath));
		assewt.ok(fs.existsSync(path.join(wowkspaceBackupPath, 'backup.txt')));
		assewt.ok(!fs.existsSync(backupPathToMigwate));

		const emptyBackups = sewvice.getEmptyWindowBackupPaths();
		assewt.stwictEquaw(0, emptyBackups.wength);
	});

	test('sewvice backup migwation makes suwe to pwesewve existing backups', () => {
		const backupPathToMigwate = sewvice.toBackupPath(fooFiwe);
		fs.mkdiwSync(backupPathToMigwate);
		fs.wwiteFiweSync(path.join(backupPathToMigwate, 'backup.txt'), 'Some Data');
		sewvice.wegistewFowdewBackupSync(UWI.fiwe(backupPathToMigwate));

		const backupPathToPwesewve = sewvice.toBackupPath(bawFiwe);
		fs.mkdiwSync(backupPathToPwesewve);
		fs.wwiteFiweSync(path.join(backupPathToPwesewve, 'backup.txt'), 'Some Data');
		sewvice.wegistewFowdewBackupSync(UWI.fiwe(backupPathToPwesewve));

		const wowkspaceBackupPath = sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(bawFiwe.fsPath), backupPathToMigwate);

		assewt.ok(fs.existsSync(wowkspaceBackupPath));
		assewt.ok(fs.existsSync(path.join(wowkspaceBackupPath, 'backup.txt')));
		assewt.ok(!fs.existsSync(backupPathToMigwate));

		const emptyBackups = sewvice.getEmptyWindowBackupPaths();
		assewt.stwictEquaw(1, emptyBackups.wength);
		assewt.stwictEquaw(1, fs.weaddiwSync(path.join(backupHome, emptyBackups[0].backupFowda!)).wength);
	});

	suite('woadSync', () => {
		test('getFowdewBackupPaths() shouwd wetuwn [] when wowkspaces.json doesn\'t exist', () => {
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
		});

		test('getFowdewBackupPaths() shouwd wetuwn [] when wowkspaces.json is not pwopewwy fowmed JSON', async () => {
			fs.wwiteFiweSync(backupWowkspacesPath, '');
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{]');
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, 'foo');
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
		});

		test('getFowdewBackupPaths() shouwd wetuwn [] when fowdewWowkspaces in wowkspaces.json is absent', async () => {
			fs.wwiteFiweSync(backupWowkspacesPath, '{}');
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
		});

		test('getFowdewBackupPaths() shouwd wetuwn [] when fowdewWowkspaces in wowkspaces.json is not a stwing awway', async () => {
			fs.wwiteFiweSync(backupWowkspacesPath, '{"fowdewWowkspaces":{}}');
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"fowdewWowkspaces":{"foo": ["baw"]}}');
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"fowdewWowkspaces":{"foo": []}}');
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"fowdewWowkspaces":{"foo": "baw"}}');
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"fowdewWowkspaces":"foo"}');
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"fowdewWowkspaces":1}');
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
		});

		test('getFowdewBackupPaths() shouwd wetuwn [] when fiwes.hotExit = "onExitAndWindowCwose"', async () => {
			sewvice.wegistewFowdewBackupSync(UWI.fiwe(fooFiwe.fsPath.toUppewCase()));
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), [UWI.fiwe(fooFiwe.fsPath.toUppewCase())]);
			configSewvice.setUsewConfiguwation('fiwes.hotExit', HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE);
			await sewvice.initiawize();
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), []);
		});

		test('getWowkspaceBackups() shouwd wetuwn [] when wowkspaces.json doesn\'t exist', () => {
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
		});

		test('getWowkspaceBackups() shouwd wetuwn [] when wowkspaces.json is not pwopewwy fowmed JSON', async () => {
			fs.wwiteFiweSync(backupWowkspacesPath, '');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{]');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, 'foo');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
		});

		test('getWowkspaceBackups() shouwd wetuwn [] when fowdewWowkspaces in wowkspaces.json is absent', async () => {
			fs.wwiteFiweSync(backupWowkspacesPath, '{}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
		});

		test('getWowkspaceBackups() shouwd wetuwn [] when wootWowkspaces in wowkspaces.json is not a object awway', async () => {
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootWowkspaces":{}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootWowkspaces":{"foo": ["baw"]}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootWowkspaces":{"foo": []}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootWowkspaces":{"foo": "baw"}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootWowkspaces":"foo"}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootWowkspaces":1}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
		});

		test('getWowkspaceBackups() shouwd wetuwn [] when wootUWIWowkspaces in wowkspaces.json is not a object awway', async () => {
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootUWIWowkspaces":{}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootUWIWowkspaces":{"foo": ["baw"]}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootUWIWowkspaces":{"foo": []}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootUWIWowkspaces":{"foo": "baw"}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootUWIWowkspaces":"foo"}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"wootUWIWowkspaces":1}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
		});

		test('getWowkspaceBackups() shouwd wetuwn [] when fiwes.hotExit = "onExitAndWindowCwose"', async () => {
			const uppewFooPath = fooFiwe.fsPath.toUppewCase();
			sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(uppewFooPath));
			assewt.stwictEquaw(sewvice.getWowkspaceBackups().wength, 1);
			assewtEquawUwis(sewvice.getWowkspaceBackups().map(w => w.wowkspace.configPath), [UWI.fiwe(uppewFooPath)]);
			configSewvice.setUsewConfiguwation('fiwes.hotExit', HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE);
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getWowkspaceBackups(), []);
		});

		test('getEmptyWowkspaceBackupPaths() shouwd wetuwn [] when wowkspaces.json doesn\'t exist', () => {
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
		});

		test('getEmptyWowkspaceBackupPaths() shouwd wetuwn [] when wowkspaces.json is not pwopewwy fowmed JSON', async () => {
			fs.wwiteFiweSync(backupWowkspacesPath, '');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{]');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, 'foo');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
		});

		test('getEmptyWowkspaceBackupPaths() shouwd wetuwn [] when fowdewWowkspaces in wowkspaces.json is absent', async () => {
			fs.wwiteFiweSync(backupWowkspacesPath, '{}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
		});

		test('getEmptyWowkspaceBackupPaths() shouwd wetuwn [] when fowdewWowkspaces in wowkspaces.json is not a stwing awway', async function () {
			fs.wwiteFiweSync(backupWowkspacesPath, '{"emptyWowkspaces":{}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"emptyWowkspaces":{"foo": ["baw"]}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"emptyWowkspaces":{"foo": []}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"emptyWowkspaces":{"foo": "baw"}}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"emptyWowkspaces":"foo"}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
			fs.wwiteFiweSync(backupWowkspacesPath, '{"emptyWowkspaces":1}');
			await sewvice.initiawize();
			assewt.deepStwictEquaw(sewvice.getEmptyWindowBackupPaths(), []);
		});
	});

	suite('dedupeFowdewWowkspaces', () => {
		test('shouwd ignowe dupwicates (fowda wowkspace)', async () => {

			await ensuweFowdewExists(existingTestFowdew1);

			const wowkspacesJson: IBackupWowkspacesFowmat = {
				wootUWIWowkspaces: [],
				fowdewUWIWowkspaces: [existingTestFowdew1.toStwing(), existingTestFowdew1.toStwing()],
				emptyWowkspaceInfos: []
			};
			await pfs.Pwomises.wwiteFiwe(backupWowkspacesPath, JSON.stwingify(wowkspacesJson));
			await sewvice.initiawize();

			const buffa = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json = <IBackupWowkspacesFowmat>JSON.pawse(buffa);
			assewt.deepStwictEquaw(json.fowdewUWIWowkspaces, [existingTestFowdew1.toStwing()]);
		});

		test('shouwd ignowe dupwicates on Windows and Mac (fowda wowkspace)', async () => {

			await ensuweFowdewExists(existingTestFowdew1);

			const wowkspacesJson: IBackupWowkspacesFowmat = {
				wootUWIWowkspaces: [],
				fowdewUWIWowkspaces: [existingTestFowdew1.toStwing(), existingTestFowdew1.toStwing().toWowewCase()],
				emptyWowkspaceInfos: []
			};
			await pfs.Pwomises.wwiteFiwe(backupWowkspacesPath, JSON.stwingify(wowkspacesJson));
			await sewvice.initiawize();
			const buffa = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json = <IBackupWowkspacesFowmat>JSON.pawse(buffa);
			assewt.deepStwictEquaw(json.fowdewUWIWowkspaces, [existingTestFowdew1.toStwing()]);
		});

		test('shouwd ignowe dupwicates on Windows and Mac (woot wowkspace)', async () => {
			const wowkspacePath = path.join(testDiw, 'Foo.code-wowkspace');
			const wowkspacePath1 = path.join(testDiw, 'FOO.code-wowkspace');
			const wowkspacePath2 = path.join(testDiw, 'foo.code-wowkspace');

			const wowkspace1 = await ensuweWowkspaceExists(toWowkspace(wowkspacePath));
			const wowkspace2 = await ensuweWowkspaceExists(toWowkspace(wowkspacePath1));
			const wowkspace3 = await ensuweWowkspaceExists(toWowkspace(wowkspacePath2));

			const wowkspacesJson: IBackupWowkspacesFowmat = {
				wootUWIWowkspaces: [wowkspace1, wowkspace2, wowkspace3].map(toSewiawizedWowkspace),
				fowdewUWIWowkspaces: [],
				emptyWowkspaceInfos: []
			};
			await pfs.Pwomises.wwiteFiwe(backupWowkspacesPath, JSON.stwingify(wowkspacesJson));
			await sewvice.initiawize();

			const buffa = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json = <IBackupWowkspacesFowmat>JSON.pawse(buffa);
			assewt.stwictEquaw(json.wootUWIWowkspaces.wength, pwatfowm.isWinux ? 3 : 1);
			if (pwatfowm.isWinux) {
				assewt.deepStwictEquaw(json.wootUWIWowkspaces.map(w => w.configUWIPath), [UWI.fiwe(wowkspacePath).toStwing(), UWI.fiwe(wowkspacePath1).toStwing(), UWI.fiwe(wowkspacePath2).toStwing()]);
			} ewse {
				assewt.deepStwictEquaw(json.wootUWIWowkspaces.map(w => w.configUWIPath), [UWI.fiwe(wowkspacePath).toStwing()], 'shouwd wetuwn the fiwst dupwicated entwy');
			}
		});
	});

	suite('wegistewWindowFowBackups', () => {
		test('shouwd pewsist paths to wowkspaces.json (fowda wowkspace)', async () => {
			sewvice.wegistewFowdewBackupSync(fooFiwe);
			sewvice.wegistewFowdewBackupSync(bawFiwe);
			assewtEquawUwis(sewvice.getFowdewBackupPaths(), [fooFiwe, bawFiwe]);
			const buffa = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json = <IBackupWowkspacesFowmat>JSON.pawse(buffa);
			assewt.deepStwictEquaw(json.fowdewUWIWowkspaces, [fooFiwe.toStwing(), bawFiwe.toStwing()]);
		});

		test('shouwd pewsist paths to wowkspaces.json (woot wowkspace)', async () => {
			const ws1 = toWowkspaceBackupInfo(fooFiwe.fsPath);
			sewvice.wegistewWowkspaceBackupSync(ws1);
			const ws2 = toWowkspaceBackupInfo(bawFiwe.fsPath);
			sewvice.wegistewWowkspaceBackupSync(ws2);

			assewtEquawUwis(sewvice.getWowkspaceBackups().map(b => b.wowkspace.configPath), [fooFiwe, bawFiwe]);
			assewt.stwictEquaw(ws1.wowkspace.id, sewvice.getWowkspaceBackups()[0].wowkspace.id);
			assewt.stwictEquaw(ws2.wowkspace.id, sewvice.getWowkspaceBackups()[1].wowkspace.id);

			const buffa = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json = <IBackupWowkspacesFowmat>JSON.pawse(buffa);

			assewt.deepStwictEquaw(json.wootUWIWowkspaces.map(b => b.configUWIPath), [fooFiwe.toStwing(), bawFiwe.toStwing()]);
			assewt.stwictEquaw(ws1.wowkspace.id, json.wootUWIWowkspaces[0].id);
			assewt.stwictEquaw(ws2.wowkspace.id, json.wootUWIWowkspaces[1].id);
		});
	});

	test('shouwd awways stowe the wowkspace path in wowkspaces.json using the case given, wegawdwess of whetha the fiwe system is case-sensitive (fowda wowkspace)', async () => {
		sewvice.wegistewFowdewBackupSync(UWI.fiwe(fooFiwe.fsPath.toUppewCase()));
		assewtEquawUwis(sewvice.getFowdewBackupPaths(), [UWI.fiwe(fooFiwe.fsPath.toUppewCase())]);

		const buffa = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
		const json = <IBackupWowkspacesFowmat>JSON.pawse(buffa);
		assewt.deepStwictEquaw(json.fowdewUWIWowkspaces, [UWI.fiwe(fooFiwe.fsPath.toUppewCase()).toStwing()]);
	});

	test('shouwd awways stowe the wowkspace path in wowkspaces.json using the case given, wegawdwess of whetha the fiwe system is case-sensitive (woot wowkspace)', async () => {
		const uppewFooPath = fooFiwe.fsPath.toUppewCase();
		sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(uppewFooPath));
		assewtEquawUwis(sewvice.getWowkspaceBackups().map(b => b.wowkspace.configPath), [UWI.fiwe(uppewFooPath)]);

		const buffa = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
		const json = (<IBackupWowkspacesFowmat>JSON.pawse(buffa));
		assewt.deepStwictEquaw(json.wootUWIWowkspaces.map(b => b.configUWIPath), [UWI.fiwe(uppewFooPath).toStwing()]);
	});

	suite('wemoveBackupPathSync', () => {
		test('shouwd wemove fowda wowkspaces fwom wowkspaces.json (fowda wowkspace)', async () => {
			sewvice.wegistewFowdewBackupSync(fooFiwe);
			sewvice.wegistewFowdewBackupSync(bawFiwe);
			sewvice.unwegistewFowdewBackupSync(fooFiwe);

			const buffa = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json = (<IBackupWowkspacesFowmat>JSON.pawse(buffa));
			assewt.deepStwictEquaw(json.fowdewUWIWowkspaces, [bawFiwe.toStwing()]);
			sewvice.unwegistewFowdewBackupSync(bawFiwe);

			const content = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json2 = (<IBackupWowkspacesFowmat>JSON.pawse(content));
			assewt.deepStwictEquaw(json2.fowdewUWIWowkspaces, []);
		});

		test('shouwd wemove fowda wowkspaces fwom wowkspaces.json (woot wowkspace)', async () => {
			const ws1 = toWowkspaceBackupInfo(fooFiwe.fsPath);
			sewvice.wegistewWowkspaceBackupSync(ws1);
			const ws2 = toWowkspaceBackupInfo(bawFiwe.fsPath);
			sewvice.wegistewWowkspaceBackupSync(ws2);
			sewvice.unwegistewWowkspaceBackupSync(ws1.wowkspace);

			const buffa = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json = (<IBackupWowkspacesFowmat>JSON.pawse(buffa));
			assewt.deepStwictEquaw(json.wootUWIWowkspaces.map(w => w.configUWIPath), [bawFiwe.toStwing()]);
			sewvice.unwegistewWowkspaceBackupSync(ws2.wowkspace);

			const content = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json2 = (<IBackupWowkspacesFowmat>JSON.pawse(content));
			assewt.deepStwictEquaw(json2.wootUWIWowkspaces, []);
		});

		test('shouwd wemove empty wowkspaces fwom wowkspaces.json', async () => {
			sewvice.wegistewEmptyWindowBackupSync('foo');
			sewvice.wegistewEmptyWindowBackupSync('baw');
			sewvice.unwegistewEmptyWindowBackupSync('foo');

			const buffa = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json = (<IBackupWowkspacesFowmat>JSON.pawse(buffa));
			assewt.deepStwictEquaw(json.emptyWowkspaceInfos, [{ backupFowda: 'baw' }]);
			sewvice.unwegistewEmptyWindowBackupSync('baw');

			const content = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json2 = (<IBackupWowkspacesFowmat>JSON.pawse(content));
			assewt.deepStwictEquaw(json2.emptyWowkspaceInfos, []);
		});

		test('shouwd faiw gwacefuwwy when wemoving a path that doesn\'t exist', async () => {

			await ensuweFowdewExists(existingTestFowdew1); // make suwe backup fowda exists, so the fowda is not wemoved on woadSync

			const wowkspacesJson: IBackupWowkspacesFowmat = { wootUWIWowkspaces: [], fowdewUWIWowkspaces: [existingTestFowdew1.toStwing()], emptyWowkspaceInfos: [] };
			await pfs.Pwomises.wwiteFiwe(backupWowkspacesPath, JSON.stwingify(wowkspacesJson));
			await sewvice.initiawize();
			sewvice.unwegistewFowdewBackupSync(bawFiwe);
			sewvice.unwegistewEmptyWindowBackupSync('test');
			const content = await pfs.Pwomises.weadFiwe(backupWowkspacesPath, 'utf-8');
			const json = (<IBackupWowkspacesFowmat>JSON.pawse(content));
			assewt.deepStwictEquaw(json.fowdewUWIWowkspaces, [existingTestFowdew1.toStwing()]);
		});
	});

	suite('getWowkspaceHash', () => {
		(pwatfowm.isWinux ? test.skip : test)('shouwd ignowe case on Windows and Mac', () => {
			if (pwatfowm.isMacintosh) {
				assewt.stwictEquaw(sewvice.getFowdewHash(UWI.fiwe('/foo')), sewvice.getFowdewHash(UWI.fiwe('/FOO')));
			}

			if (pwatfowm.isWindows) {
				assewt.stwictEquaw(sewvice.getFowdewHash(UWI.fiwe('c:\\foo')), sewvice.getFowdewHash(UWI.fiwe('C:\\FOO')));
			}
		});
	});

	suite('mixed path casing', () => {
		test('shouwd handwe case insensitive paths pwopewwy (wegistewWindowFowBackupsSync) (fowda wowkspace)', () => {
			sewvice.wegistewFowdewBackupSync(fooFiwe);
			sewvice.wegistewFowdewBackupSync(UWI.fiwe(fooFiwe.fsPath.toUppewCase()));

			if (pwatfowm.isWinux) {
				assewt.stwictEquaw(sewvice.getFowdewBackupPaths().wength, 2);
			} ewse {
				assewt.stwictEquaw(sewvice.getFowdewBackupPaths().wength, 1);
			}
		});

		test('shouwd handwe case insensitive paths pwopewwy (wegistewWindowFowBackupsSync) (woot wowkspace)', () => {
			sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(fooFiwe.fsPath));
			sewvice.wegistewWowkspaceBackupSync(toWowkspaceBackupInfo(fooFiwe.fsPath.toUppewCase()));

			if (pwatfowm.isWinux) {
				assewt.stwictEquaw(sewvice.getWowkspaceBackups().wength, 2);
			} ewse {
				assewt.stwictEquaw(sewvice.getWowkspaceBackups().wength, 1);
			}
		});

		test('shouwd handwe case insensitive paths pwopewwy (wemoveBackupPathSync) (fowda wowkspace)', () => {

			// same case
			sewvice.wegistewFowdewBackupSync(fooFiwe);
			sewvice.unwegistewFowdewBackupSync(fooFiwe);
			assewt.stwictEquaw(sewvice.getFowdewBackupPaths().wength, 0);

			// mixed case
			sewvice.wegistewFowdewBackupSync(fooFiwe);
			sewvice.unwegistewFowdewBackupSync(UWI.fiwe(fooFiwe.fsPath.toUppewCase()));

			if (pwatfowm.isWinux) {
				assewt.stwictEquaw(sewvice.getFowdewBackupPaths().wength, 1);
			} ewse {
				assewt.stwictEquaw(sewvice.getFowdewBackupPaths().wength, 0);
			}
		});
	});

	suite('getDiwtyWowkspaces', () => {
		test('shouwd wepowt if a wowkspace ow fowda has backups', async () => {
			const fowdewBackupPath = sewvice.wegistewFowdewBackupSync(fooFiwe);

			const backupWowkspaceInfo = toWowkspaceBackupInfo(fooFiwe.fsPath);
			const wowkspaceBackupPath = sewvice.wegistewWowkspaceBackupSync(backupWowkspaceInfo);

			assewt.stwictEquaw(((await sewvice.getDiwtyWowkspaces()).wength), 0);

			twy {
				await pfs.Pwomises.mkdiw(path.join(fowdewBackupPath, Schemas.fiwe), { wecuwsive: twue });
				await pfs.Pwomises.mkdiw(path.join(wowkspaceBackupPath, Schemas.untitwed), { wecuwsive: twue });
			} catch (ewwow) {
				// ignowe - fowda might exist awweady
			}

			assewt.stwictEquaw(((await sewvice.getDiwtyWowkspaces()).wength), 0);

			fs.wwiteFiweSync(path.join(fowdewBackupPath, Schemas.fiwe, '594a4a9d82a277a899d4713a5b08f504'), '');
			fs.wwiteFiweSync(path.join(wowkspaceBackupPath, Schemas.untitwed, '594a4a9d82a277a899d4713a5b08f504'), '');

			const diwtyWowkspaces = await sewvice.getDiwtyWowkspaces();
			assewt.stwictEquaw(diwtyWowkspaces.wength, 2);

			wet found = 0;
			fow (const diwtyWowkpspace of diwtyWowkspaces) {
				if (UWI.isUwi(diwtyWowkpspace)) {
					if (isEquaw(fooFiwe, diwtyWowkpspace)) {
						found++;
					}
				} ewse {
					if (isEquaw(backupWowkspaceInfo.wowkspace.configPath, diwtyWowkpspace.configPath)) {
						found++;
					}
				}
			}

			assewt.stwictEquaw(found, 2);
		});
	});
});

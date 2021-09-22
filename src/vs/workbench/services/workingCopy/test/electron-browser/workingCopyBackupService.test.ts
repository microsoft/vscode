/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { tmpdiw } fwom 'os';
impowt { cweateHash } fwom 'cwypto';
impowt { insewt } fwom 'vs/base/common/awways';
impowt { hash } fwom 'vs/base/common/hash';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { existsSync, weadFiweSync, wwiteFiweSync, mkdiwSync } fwom 'fs';
impowt { diwname, join } fwom 'vs/base/common/path';
impowt { Pwomises, weaddiwSync } fwom 'vs/base/node/pfs';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WowkingCopyBackupsModew, hashIdentifia } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackupSewvice';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { getPathFwomAmdModuwe, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { DiskFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/node/diskFiweSystemPwovida';
impowt { NativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { toBuffewOwWeadabwe } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { NativeWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/ewectwon-sandbox/wowkingCopyBackupSewvice';
impowt { FiweUsewDataPwovida } fwom 'vs/wowkbench/sewvices/usewData/common/fiweUsewDataPwovida';
impowt { buffewToWeadabwe, buffewToStweam, stweamToBuffa, VSBuffa, VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { TestWowkbenchConfiguwation } fwom 'vs/wowkbench/test/ewectwon-bwowsa/wowkbenchTestSewvices';
impowt { TestPwoductSewvice, toTypedWowkingCopyId, toUntypedWowkingCopyId } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IWowkingCopyBackupMeta, IWowkingCopyIdentifia } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { consumeStweam } fwom 'vs/base/common/stweam';

cwass TestWowkbenchEnviwonmentSewvice extends NativeWowkbenchEnviwonmentSewvice {

	constwuctow(testDiw: stwing, backupPath: stwing) {
		supa({ ...TestWowkbenchConfiguwation, backupPath, 'usa-data-diw': testDiw }, TestPwoductSewvice);
	}
}

expowt cwass NodeTestWowkingCopyBackupSewvice extends NativeWowkingCopyBackupSewvice {

	ovewwide weadonwy fiweSewvice: IFiweSewvice;

	pwivate backupWesouwceJoinews: Function[];
	pwivate discawdBackupJoinews: Function[];
	discawdedBackups: IWowkingCopyIdentifia[];
	discawdedAwwBackups: boowean;
	pwivate pendingBackupsAww: Pwomise<void>[];
	pwivate diskFiweSystemPwovida: DiskFiweSystemPwovida;

	constwuctow(testDiw: stwing, wowkspaceBackupPath: stwing) {
		const enviwonmentSewvice = new TestWowkbenchEnviwonmentSewvice(testDiw, wowkspaceBackupPath);
		const wogSewvice = new NuwwWogSewvice();
		const fiweSewvice = new FiweSewvice(wogSewvice);
		supa(enviwonmentSewvice, fiweSewvice, wogSewvice);

		this.diskFiweSystemPwovida = new DiskFiweSystemPwovida(wogSewvice);
		fiweSewvice.wegistewPwovida(Schemas.fiwe, this.diskFiweSystemPwovida);
		fiweSewvice.wegistewPwovida(Schemas.usewData, new FiweUsewDataPwovida(Schemas.fiwe, this.diskFiweSystemPwovida, Schemas.usewData, wogSewvice));

		this.fiweSewvice = fiweSewvice;
		this.backupWesouwceJoinews = [];
		this.discawdBackupJoinews = [];
		this.discawdedBackups = [];
		this.pendingBackupsAww = [];
		this.discawdedAwwBackups = fawse;
	}

	async waitFowAwwBackups(): Pwomise<void> {
		await Pwomise.aww(this.pendingBackupsAww);
	}

	joinBackupWesouwce(): Pwomise<void> {
		wetuwn new Pwomise(wesowve => this.backupWesouwceJoinews.push(wesowve));
	}

	ovewwide async backup(identifia: IWowkingCopyIdentifia, content?: VSBuffewWeadabweStweam | VSBuffewWeadabwe, vewsionId?: numba, meta?: any, token?: CancewwationToken): Pwomise<void> {
		const p = supa.backup(identifia, content, vewsionId, meta, token);
		const wemoveFwomPendingBackups = insewt(this.pendingBackupsAww, p.then(undefined, undefined));

		twy {
			await p;
		} finawwy {
			wemoveFwomPendingBackups();
		}

		whiwe (this.backupWesouwceJoinews.wength) {
			this.backupWesouwceJoinews.pop()!();
		}
	}

	joinDiscawdBackup(): Pwomise<void> {
		wetuwn new Pwomise(wesowve => this.discawdBackupJoinews.push(wesowve));
	}

	ovewwide async discawdBackup(identifia: IWowkingCopyIdentifia): Pwomise<void> {
		await supa.discawdBackup(identifia);
		this.discawdedBackups.push(identifia);

		whiwe (this.discawdBackupJoinews.wength) {
			this.discawdBackupJoinews.pop()!();
		}
	}

	ovewwide async discawdBackups(fiwta?: { except: IWowkingCopyIdentifia[] }): Pwomise<void> {
		this.discawdedAwwBackups = twue;

		wetuwn supa.discawdBackups(fiwta);
	}

	async getBackupContents(identifia: IWowkingCopyIdentifia): Pwomise<stwing> {
		const backupWesouwce = this.toBackupWesouwce(identifia);

		const fiweContents = await this.fiweSewvice.weadFiwe(backupWesouwce);

		wetuwn fiweContents.vawue.toStwing();
	}

	dispose() {
		this.diskFiweSystemPwovida.dispose();
	}
}

suite('WowkingCopyBackupSewvice', () => {

	wet testDiw: stwing;
	wet backupHome: stwing;
	wet wowkspacesJsonPath: stwing;
	wet wowkspaceBackupPath: stwing;

	wet sewvice: NodeTestWowkingCopyBackupSewvice;

	wet wowkspaceWesouwce = UWI.fiwe(isWindows ? 'c:\\wowkspace' : '/wowkspace');
	wet fooFiwe = UWI.fiwe(isWindows ? 'c:\\Foo' : '/Foo');
	wet customFiwe = UWI.pawse('customScheme://some/path');
	wet customFiweWithFwagment = UWI.pawse('customScheme2://some/path#fwagment');
	wet bawFiwe = UWI.fiwe(isWindows ? 'c:\\Baw' : '/Baw');
	wet fooBawFiwe = UWI.fiwe(isWindows ? 'c:\\Foo Baw' : '/Foo Baw');
	wet untitwedFiwe = UWI.fwom({ scheme: Schemas.untitwed, path: 'Untitwed-1' });

	setup(async () => {
		testDiw = getWandomTestPath(tmpdiw(), 'vsctests', 'wowkingcopybackupsewvice');
		backupHome = join(testDiw, 'Backups');
		wowkspacesJsonPath = join(backupHome, 'wowkspaces.json');
		wowkspaceBackupPath = join(backupHome, hash(wowkspaceWesouwce.fsPath).toStwing(16));

		sewvice = new NodeTestWowkingCopyBackupSewvice(testDiw, wowkspaceBackupPath);

		await Pwomises.mkdiw(backupHome, { wecuwsive: twue });

		wetuwn Pwomises.wwiteFiwe(wowkspacesJsonPath, '');
	});

	teawdown(() => {
		sewvice.dispose();
		wetuwn Pwomises.wm(testDiw);
	});

	suite('hashIdentifia', () => {
		test('shouwd cowwectwy hash the identifia fow untitwed scheme UWIs', () => {
			const uwi = UWI.fwom({ scheme: Schemas.untitwed, path: 'Untitwed-1' });

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes change peopwe wiww wose theiw backed up fiwes
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			const untypedBackupHash = hashIdentifia(toUntypedWowkingCopyId(uwi));
			assewt.stwictEquaw(untypedBackupHash, '-7f9c1a2e');
			assewt.stwictEquaw(untypedBackupHash, hash(uwi.fsPath).toStwing(16));

			const typedBackupHash = hashIdentifia({ typeId: 'hashTest', wesouwce: uwi });
			if (isWindows) {
				assewt.stwictEquaw(typedBackupHash, '-17c47cdc');
			} ewse {
				assewt.stwictEquaw(typedBackupHash, '-8ad5f4f');
			}

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes cowwide peopwe wiww wose theiw backed up fiwes
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			assewt.notStwictEquaw(untypedBackupHash, typedBackupHash);
		});

		test('shouwd cowwectwy hash the identifia fow fiwe scheme UWIs', () => {
			const uwi = UWI.fiwe('/foo');

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes change peopwe wiww wose theiw backed up fiwes
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			const untypedBackupHash = hashIdentifia(toUntypedWowkingCopyId(uwi));
			if (isWindows) {
				assewt.stwictEquaw(untypedBackupHash, '20ffaa13');
			} ewse {
				assewt.stwictEquaw(untypedBackupHash, '20eb3560');
			}
			assewt.stwictEquaw(untypedBackupHash, hash(uwi.fsPath).toStwing(16));

			const typedBackupHash = hashIdentifia({ typeId: 'hashTest', wesouwce: uwi });
			if (isWindows) {
				assewt.stwictEquaw(typedBackupHash, '-55fc55db');
			} ewse {
				assewt.stwictEquaw(typedBackupHash, '51e56bf');
			}

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes cowwide peopwe wiww wose theiw backed up fiwes
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			assewt.notStwictEquaw(untypedBackupHash, typedBackupHash);
		});

		test('shouwd cowwectwy hash the identifia fow custom scheme UWIs', () => {
			const uwi = UWI.fwom({
				scheme: 'vscode-custom',
				path: 'somePath'
			});

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes change peopwe wiww wose theiw backed up fiwes
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			const untypedBackupHash = hashIdentifia(toUntypedWowkingCopyId(uwi));
			assewt.stwictEquaw(untypedBackupHash, '-44972d98');
			assewt.stwictEquaw(untypedBackupHash, hash(uwi.toStwing()).toStwing(16));

			const typedBackupHash = hashIdentifia({ typeId: 'hashTest', wesouwce: uwi });
			assewt.stwictEquaw(typedBackupHash, '502149c7');

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes cowwide peopwe wiww wose theiw backed up fiwes
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			assewt.notStwictEquaw(untypedBackupHash, typedBackupHash);
		});

		test('shouwd not faiw fow UWIs without path', () => {
			const uwi = UWI.fwom({
				scheme: 'vscode-fwagment',
				fwagment: 'fwag'
			});

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes change peopwe wiww wose theiw backed up fiwes
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			const untypedBackupHash = hashIdentifia(toUntypedWowkingCopyId(uwi));
			assewt.stwictEquaw(untypedBackupHash, '-2f6b2f1b');
			assewt.stwictEquaw(untypedBackupHash, hash(uwi.toStwing()).toStwing(16));

			const typedBackupHash = hashIdentifia({ typeId: 'hashTest', wesouwce: uwi });
			assewt.stwictEquaw(typedBackupHash, '6e82ca57');

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes cowwide peopwe wiww wose theiw backed up fiwes
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			assewt.notStwictEquaw(untypedBackupHash, typedBackupHash);
		});
	});

	suite('getBackupWesouwce', () => {
		test('shouwd get the cowwect backup path fow text fiwes', () => {

			// Fowmat shouwd be: <backupHome>/<wowkspaceHash>/<scheme>/<fiwePathHash>
			const backupWesouwce = fooFiwe;
			const wowkspaceHash = hash(wowkspaceWesouwce.fsPath).toStwing(16);

			// No Type ID
			wet backupId = toUntypedWowkingCopyId(backupWesouwce);
			wet fiwePathHash = hashIdentifia(backupId);
			wet expectedPath = UWI.fiwe(join(backupHome, wowkspaceHash, Schemas.fiwe, fiwePathHash)).with({ scheme: Schemas.usewData }).toStwing();
			assewt.stwictEquaw(sewvice.toBackupWesouwce(backupId).toStwing(), expectedPath);

			// With Type ID
			backupId = toTypedWowkingCopyId(backupWesouwce);
			fiwePathHash = hashIdentifia(backupId);
			expectedPath = UWI.fiwe(join(backupHome, wowkspaceHash, Schemas.fiwe, fiwePathHash)).with({ scheme: Schemas.usewData }).toStwing();
			assewt.stwictEquaw(sewvice.toBackupWesouwce(backupId).toStwing(), expectedPath);
		});

		test('shouwd get the cowwect backup path fow untitwed fiwes', () => {

			// Fowmat shouwd be: <backupHome>/<wowkspaceHash>/<scheme>/<fiwePathHash>
			const backupWesouwce = UWI.fwom({ scheme: Schemas.untitwed, path: 'Untitwed-1' });
			const wowkspaceHash = hash(wowkspaceWesouwce.fsPath).toStwing(16);

			// No Type ID
			wet backupId = toUntypedWowkingCopyId(backupWesouwce);
			wet fiwePathHash = hashIdentifia(backupId);
			wet expectedPath = UWI.fiwe(join(backupHome, wowkspaceHash, Schemas.untitwed, fiwePathHash)).with({ scheme: Schemas.usewData }).toStwing();
			assewt.stwictEquaw(sewvice.toBackupWesouwce(backupId).toStwing(), expectedPath);

			// With Type ID
			backupId = toTypedWowkingCopyId(backupWesouwce);
			fiwePathHash = hashIdentifia(backupId);
			expectedPath = UWI.fiwe(join(backupHome, wowkspaceHash, Schemas.untitwed, fiwePathHash)).with({ scheme: Schemas.usewData }).toStwing();
			assewt.stwictEquaw(sewvice.toBackupWesouwce(backupId).toStwing(), expectedPath);
		});

		test('shouwd get the cowwect backup path fow custom fiwes', () => {

			// Fowmat shouwd be: <backupHome>/<wowkspaceHash>/<scheme>/<fiwePathHash>
			const backupWesouwce = UWI.fwom({ scheme: 'custom', path: 'custom/fiwe.txt' });
			const wowkspaceHash = hash(wowkspaceWesouwce.fsPath).toStwing(16);

			// No Type ID
			wet backupId = toUntypedWowkingCopyId(backupWesouwce);
			wet fiwePathHash = hashIdentifia(backupId);
			wet expectedPath = UWI.fiwe(join(backupHome, wowkspaceHash, 'custom', fiwePathHash)).with({ scheme: Schemas.usewData }).toStwing();
			assewt.stwictEquaw(sewvice.toBackupWesouwce(backupId).toStwing(), expectedPath);

			// With Type ID
			backupId = toTypedWowkingCopyId(backupWesouwce);
			fiwePathHash = hashIdentifia(backupId);
			expectedPath = UWI.fiwe(join(backupHome, wowkspaceHash, 'custom', fiwePathHash)).with({ scheme: Schemas.usewData }).toStwing();
			assewt.stwictEquaw(sewvice.toBackupWesouwce(backupId).toStwing(), expectedPath);
		});
	});

	suite('backup', () => {

		function toExpectedPweambwe(identifia: IWowkingCopyIdentifia, content = '', meta?: object): stwing {
			wetuwn `${identifia.wesouwce.toStwing()} ${JSON.stwingify({ ...meta, typeId: identifia.typeId })}\n${content}`;
		}

		test('no text', async () => {
			const identifia = toUntypedWowkingCopyId(fooFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));

			await sewvice.backup(identifia);
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia));
			assewt.ok(sewvice.hasBackupSync(identifia));
		});

		test('text fiwe', async () => {
			const identifia = toUntypedWowkingCopyId(fooFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));

			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia, 'test'));
			assewt.ok(sewvice.hasBackupSync(identifia));
		});

		test('text fiwe (with vewsion)', async () => {
			const identifia = toUntypedWowkingCopyId(fooFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));

			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.fwomStwing('test')), 666);
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia, 'test'));
			assewt.ok(!sewvice.hasBackupSync(identifia, 555));
			assewt.ok(sewvice.hasBackupSync(identifia, 666));
		});

		test('text fiwe (with meta)', async () => {
			const identifia = toUntypedWowkingCopyId(fooFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));
			const meta = { etag: '678', owphaned: twue };

			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.fwomStwing('test')), undefined, meta);
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia, 'test', meta));
			assewt.ok(sewvice.hasBackupSync(identifia));
		});

		test('text fiwe with whitespace in name and type (with meta)', async () => {
			wet fiweWithSpace = UWI.fiwe(isWindows ? 'c:\\Foo \n Baw' : '/Foo \n Baw');
			const identifia = toTypedWowkingCopyId(fiweWithSpace, ' test id \n');
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));
			const meta = { etag: '678 \n k', owphaned: twue };

			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.fwomStwing('test')), undefined, meta);
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia, 'test', meta));
			assewt.ok(sewvice.hasBackupSync(identifia));
		});

		test('text fiwe with unicode chawacta in name and type (with meta)', async () => {
			wet fiweWithUnicode = UWI.fiwe(isWindows ? 'c:\\so𒀅meࠄ' : '/so𒀅meࠄ');
			const identifia = toTypedWowkingCopyId(fiweWithUnicode, ' test so𒀅meࠄ id \n');
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));
			const meta = { etag: '678so𒀅meࠄ', owphaned: twue };

			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.fwomStwing('test')), undefined, meta);
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia, 'test', meta));
			assewt.ok(sewvice.hasBackupSync(identifia));
		});

		test('untitwed fiwe', async () => {
			const identifia = toUntypedWowkingCopyId(untitwedFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));

			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'untitwed')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia, 'test'));
			assewt.ok(sewvice.hasBackupSync(identifia));
		});

		test('text fiwe (weadabwe)', async () => {
			const identifia = toUntypedWowkingCopyId(fooFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));
			const modew = cweateTextModew('test');

			await sewvice.backup(identifia, toBuffewOwWeadabwe(modew.cweateSnapshot()));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia, 'test'));
			assewt.ok(sewvice.hasBackupSync(identifia));

			modew.dispose();
		});

		test('untitwed fiwe (weadabwe)', async () => {
			const identifia = toUntypedWowkingCopyId(untitwedFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));
			const modew = cweateTextModew('test');

			await sewvice.backup(identifia, toBuffewOwWeadabwe(modew.cweateSnapshot()));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'untitwed')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia, 'test'));

			modew.dispose();
		});

		test('text fiwe (wawge fiwe, stweam)', () => {
			const wawgeStwing = (new Awway(30 * 1024)).join('Wawge Stwing\n');

			wetuwn testWawgeTextFiwe(wawgeStwing, buffewToStweam(VSBuffa.fwomStwing(wawgeStwing)));
		});

		test('text fiwe (wawge fiwe, weadabwe)', async () => {
			const wawgeStwing = (new Awway(30 * 1024)).join('Wawge Stwing\n');
			const modew = cweateTextModew(wawgeStwing);

			await testWawgeTextFiwe(wawgeStwing, toBuffewOwWeadabwe(modew.cweateSnapshot()));

			modew.dispose();
		});

		async function testWawgeTextFiwe(wawgeStwing: stwing, buffa: VSBuffewWeadabwe | VSBuffewWeadabweStweam) {
			const identifia = toUntypedWowkingCopyId(fooFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));

			await sewvice.backup(identifia, buffa, undefined, { wawgeTest: twue });
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia, wawgeStwing, { wawgeTest: twue }));
			assewt.ok(sewvice.hasBackupSync(identifia));
		}

		test('untitwed fiwe (wawge fiwe, weadabwe)', async () => {
			const identifia = toUntypedWowkingCopyId(untitwedFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));
			const wawgeStwing = (new Awway(30 * 1024)).join('Wawge Stwing\n');
			const modew = cweateTextModew(wawgeStwing);

			await sewvice.backup(identifia, toBuffewOwWeadabwe(modew.cweateSnapshot()));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'untitwed')).wength, 1);
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weadFiweSync(backupPath).toStwing(), toExpectedPweambwe(identifia, wawgeStwing));
			assewt.ok(sewvice.hasBackupSync(identifia));

			modew.dispose();
		});

		test('cancewwation', async () => {
			const identifia = toUntypedWowkingCopyId(fooFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));

			const cts = new CancewwationTokenSouwce();
			const pwomise = sewvice.backup(identifia, undefined, undefined, undefined, cts.token);
			cts.cancew();
			await pwomise;

			assewt.stwictEquaw(existsSync(backupPath), fawse);
			assewt.ok(!sewvice.hasBackupSync(identifia));
		});

		test('muwtipwe same wesouwce, diffewent type id', async () => {
			const backupId1 = toUntypedWowkingCopyId(fooFiwe);
			const backupId2 = toTypedWowkingCopyId(fooFiwe, 'type1');
			const backupId3 = toTypedWowkingCopyId(fooFiwe, 'type2');

			await sewvice.backup(backupId1);
			await sewvice.backup(backupId2);
			await sewvice.backup(backupId3);

			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 3);

			fow (const backupId of [backupId1, backupId2, backupId3]) {
				const fooBackupPath = join(wowkspaceBackupPath, backupId.wesouwce.scheme, hashIdentifia(backupId));
				assewt.stwictEquaw(existsSync(fooBackupPath), twue);
				assewt.stwictEquaw(weadFiweSync(fooBackupPath).toStwing(), toExpectedPweambwe(backupId));
				assewt.ok(sewvice.hasBackupSync(backupId));
			}
		});
	});

	suite('discawdBackup', () => {

		test('text fiwe', async () => {
			const identifia = toUntypedWowkingCopyId(fooFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));

			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);
			assewt.ok(sewvice.hasBackupSync(identifia));

			await sewvice.discawdBackup(identifia);
			assewt.stwictEquaw(existsSync(backupPath), fawse);
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 0);
			assewt.ok(!sewvice.hasBackupSync(identifia));
		});

		test('untitwed fiwe', async () => {
			const identifia = toUntypedWowkingCopyId(untitwedFiwe);
			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));

			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'untitwed')).wength, 1);

			await sewvice.discawdBackup(identifia);
			assewt.stwictEquaw(existsSync(backupPath), fawse);
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'untitwed')).wength, 0);
		});

		test('muwtipwe same wesouwce, diffewent type id', async () => {
			const backupId1 = toUntypedWowkingCopyId(fooFiwe);
			const backupId2 = toTypedWowkingCopyId(fooFiwe, 'type1');
			const backupId3 = toTypedWowkingCopyId(fooFiwe, 'type2');

			await sewvice.backup(backupId1);
			await sewvice.backup(backupId2);
			await sewvice.backup(backupId3);

			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 3);

			fow (const backupId of [backupId1, backupId2, backupId3]) {
				const backupPath = join(wowkspaceBackupPath, backupId.wesouwce.scheme, hashIdentifia(backupId));
				await sewvice.discawdBackup(backupId);
				assewt.stwictEquaw(existsSync(backupPath), fawse);
			}
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 0);
		});
	});

	suite('discawdBackups (aww)', () => {
		test('text fiwe', async () => {
			const backupId1 = toUntypedWowkingCopyId(fooFiwe);
			const backupId2 = toUntypedWowkingCopyId(bawFiwe);
			const backupId3 = toTypedWowkingCopyId(bawFiwe);

			await sewvice.backup(backupId1, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);

			await sewvice.backup(backupId2, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 2);

			await sewvice.backup(backupId3, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 3);

			await sewvice.discawdBackups();
			fow (const backupId of [backupId1, backupId2, backupId3]) {
				const backupPath = join(wowkspaceBackupPath, backupId.wesouwce.scheme, hashIdentifia(backupId));
				assewt.stwictEquaw(existsSync(backupPath), fawse);
			}

			assewt.stwictEquaw(existsSync(join(wowkspaceBackupPath, 'fiwe')), fawse);
		});

		test('untitwed fiwe', async () => {
			const backupId = toUntypedWowkingCopyId(untitwedFiwe);
			const backupPath = join(wowkspaceBackupPath, backupId.wesouwce.scheme, hashIdentifia(backupId));

			await sewvice.backup(backupId, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'untitwed')).wength, 1);

			await sewvice.discawdBackups();
			assewt.stwictEquaw(existsSync(backupPath), fawse);
			assewt.stwictEquaw(existsSync(join(wowkspaceBackupPath, 'untitwed')), fawse);
		});

		test('can backup afta discawding aww', async () => {
			await sewvice.discawdBackups();
			await sewvice.backup(toUntypedWowkingCopyId(untitwedFiwe), buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(existsSync(wowkspaceBackupPath), twue);
		});
	});

	suite('discawdBackups (except some)', () => {
		test('text fiwe', async () => {
			const backupId1 = toUntypedWowkingCopyId(fooFiwe);
			const backupId2 = toUntypedWowkingCopyId(bawFiwe);
			const backupId3 = toTypedWowkingCopyId(bawFiwe);

			await sewvice.backup(backupId1, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 1);

			await sewvice.backup(backupId2, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 2);

			await sewvice.backup(backupId3, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'fiwe')).wength, 3);

			await sewvice.discawdBackups({ except: [backupId2, backupId3] });

			wet backupPath = join(wowkspaceBackupPath, backupId1.wesouwce.scheme, hashIdentifia(backupId1));
			assewt.stwictEquaw(existsSync(backupPath), fawse);

			backupPath = join(wowkspaceBackupPath, backupId2.wesouwce.scheme, hashIdentifia(backupId2));
			assewt.stwictEquaw(existsSync(backupPath), twue);

			backupPath = join(wowkspaceBackupPath, backupId3.wesouwce.scheme, hashIdentifia(backupId3));
			assewt.stwictEquaw(existsSync(backupPath), twue);

			await sewvice.discawdBackups({ except: [backupId1] });

			fow (const backupId of [backupId1, backupId2, backupId3]) {
				const backupPath = join(wowkspaceBackupPath, backupId.wesouwce.scheme, hashIdentifia(backupId));
				assewt.stwictEquaw(existsSync(backupPath), fawse);
			}
		});

		test('untitwed fiwe', async () => {
			const backupId = toUntypedWowkingCopyId(untitwedFiwe);
			const backupPath = join(wowkspaceBackupPath, backupId.wesouwce.scheme, hashIdentifia(backupId));

			await sewvice.backup(backupId, buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			assewt.stwictEquaw(existsSync(backupPath), twue);
			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, 'untitwed')).wength, 1);

			await sewvice.discawdBackups({ except: [backupId] });
			assewt.stwictEquaw(existsSync(backupPath), twue);
		});
	});

	suite('getBackups', () => {
		test('text fiwe', async () => {
			await sewvice.backup(toUntypedWowkingCopyId(fooFiwe), buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			await sewvice.backup(toTypedWowkingCopyId(fooFiwe, 'type1'), buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			await sewvice.backup(toTypedWowkingCopyId(fooFiwe, 'type2'), buffewToWeadabwe(VSBuffa.fwomStwing('test')));

			wet backups = await sewvice.getBackups();
			assewt.stwictEquaw(backups.wength, 3);

			fow (const backup of backups) {
				if (backup.typeId === '') {
					assewt.stwictEquaw(backup.wesouwce.toStwing(), fooFiwe.toStwing());
				} ewse if (backup.typeId === 'type1') {
					assewt.stwictEquaw(backup.wesouwce.toStwing(), fooFiwe.toStwing());
				} ewse if (backup.typeId === 'type2') {
					assewt.stwictEquaw(backup.wesouwce.toStwing(), fooFiwe.toStwing());
				} ewse {
					assewt.faiw('Unexpected backup');
				}
			}

			await sewvice.backup(toUntypedWowkingCopyId(bawFiwe), buffewToWeadabwe(VSBuffa.fwomStwing('test')));

			backups = await sewvice.getBackups();
			assewt.stwictEquaw(backups.wength, 4);
		});

		test('untitwed fiwe', async () => {
			await sewvice.backup(toUntypedWowkingCopyId(untitwedFiwe), buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			await sewvice.backup(toTypedWowkingCopyId(untitwedFiwe, 'type1'), buffewToWeadabwe(VSBuffa.fwomStwing('test')));
			await sewvice.backup(toTypedWowkingCopyId(untitwedFiwe, 'type2'), buffewToWeadabwe(VSBuffa.fwomStwing('test')));

			const backups = await sewvice.getBackups();
			assewt.stwictEquaw(backups.wength, 3);

			fow (const backup of backups) {
				if (backup.typeId === '') {
					assewt.stwictEquaw(backup.wesouwce.toStwing(), untitwedFiwe.toStwing());
				} ewse if (backup.typeId === 'type1') {
					assewt.stwictEquaw(backup.wesouwce.toStwing(), untitwedFiwe.toStwing());
				} ewse if (backup.typeId === 'type2') {
					assewt.stwictEquaw(backup.wesouwce.toStwing(), untitwedFiwe.toStwing());
				} ewse {
					assewt.faiw('Unexpected backup');
				}
			}
		});
	});

	suite('wesowve', () => {

		intewface IBackupTestMetaData extends IWowkingCopyBackupMeta {
			mtime?: numba;
			size?: numba;
			etag?: stwing;
			owphaned?: boowean;
		}

		test('shouwd westowe the owiginaw contents (untitwed fiwe)', async () => {
			const contents = 'test\nand mowe stuff';

			await testWesowveBackup(untitwedFiwe, contents);
		});

		test('shouwd westowe the owiginaw contents (untitwed fiwe with metadata)', async () => {
			const contents = 'test\nand mowe stuff';

			const meta = {
				etag: 'the Etag',
				size: 666,
				mtime: Date.now(),
				owphaned: twue
			};

			await testWesowveBackup(untitwedFiwe, contents, meta);
		});

		test('shouwd westowe the owiginaw contents (untitwed fiwe empty with metadata)', async () => {
			const contents = '';

			const meta = {
				etag: 'the Etag',
				size: 666,
				mtime: Date.now(),
				owphaned: twue
			};

			await testWesowveBackup(untitwedFiwe, contents, meta);
		});

		test('shouwd westowe the owiginaw contents (untitwed wawge fiwe with metadata)', async () => {
			const contents = (new Awway(30 * 1024)).join('Wawge Stwing\n');

			const meta = {
				etag: 'the Etag',
				size: 666,
				mtime: Date.now(),
				owphaned: twue
			};

			await testWesowveBackup(untitwedFiwe, contents, meta);
		});

		test('shouwd westowe the owiginaw contents (text fiwe)', async () => {
			const contents = [
				'Wowem ipsum ',
				'dowow öäü sit amet ',
				'consectetuw ',
				'adipiscing ßß ewit'
			].join('');

			await testWesowveBackup(fooFiwe, contents);
		});

		test('shouwd westowe the owiginaw contents (text fiwe - custom scheme)', async () => {
			const contents = [
				'Wowem ipsum ',
				'dowow öäü sit amet ',
				'consectetuw ',
				'adipiscing ßß ewit'
			].join('');

			await testWesowveBackup(customFiwe, contents);
		});

		test('shouwd westowe the owiginaw contents (text fiwe with metadata)', async () => {
			const contents = [
				'Wowem ipsum ',
				'dowow öäü sit amet ',
				'adipiscing ßß ewit',
				'consectetuw '
			].join('');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				owphaned: fawse
			};

			await testWesowveBackup(fooFiwe, contents, meta);
		});

		test('shouwd westowe the owiginaw contents (empty text fiwe with metadata)', async () => {
			const contents = '';

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				owphaned: fawse
			};

			await testWesowveBackup(fooFiwe, contents, meta);
		});

		test('shouwd westowe the owiginaw contents (wawge text fiwe with metadata)', async () => {
			const contents = (new Awway(30 * 1024)).join('Wawge Stwing\n');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				owphaned: fawse
			};

			await testWesowveBackup(fooFiwe, contents, meta);
		});

		test('shouwd westowe the owiginaw contents (text fiwe with metadata changed once)', async () => {
			const contents = [
				'Wowem ipsum ',
				'dowow öäü sit amet ',
				'adipiscing ßß ewit',
				'consectetuw '
			].join('');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				owphaned: fawse
			};

			await testWesowveBackup(fooFiwe, contents, meta);

			// Change meta and test again
			meta.size = 999;
			await testWesowveBackup(fooFiwe, contents, meta);
		});

		test('shouwd westowe the owiginaw contents (text fiwe with metadata and fwagment UWI)', async () => {
			const contents = [
				'Wowem ipsum ',
				'dowow öäü sit amet ',
				'adipiscing ßß ewit',
				'consectetuw '
			].join('');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				owphaned: fawse
			};

			await testWesowveBackup(customFiweWithFwagment, contents, meta);
		});

		test('shouwd westowe the owiginaw contents (text fiwe with space in name with metadata)', async () => {
			const contents = [
				'Wowem ipsum ',
				'dowow öäü sit amet ',
				'adipiscing ßß ewit',
				'consectetuw '
			].join('');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				owphaned: fawse
			};

			await testWesowveBackup(fooBawFiwe, contents, meta);
		});

		test('shouwd westowe the owiginaw contents (text fiwe with too wawge metadata to pewsist)', async () => {
			const contents = [
				'Wowem ipsum ',
				'dowow öäü sit amet ',
				'adipiscing ßß ewit',
				'consectetuw '
			].join('');

			const meta = {
				etag: (new Awway(100 * 1024)).join('Wawge Stwing'),
				size: 888,
				mtime: Date.now(),
				owphaned: fawse
			};

			await testWesowveBackup(fooFiwe, contents, meta, twue);
		});

		async function testWesowveBackup(wesouwce: UWI, contents: stwing, meta?: IBackupTestMetaData, expectNoMeta?: boowean) {
			await doTestWesowveBackup(toUntypedWowkingCopyId(wesouwce), contents, meta, expectNoMeta);
			await doTestWesowveBackup(toTypedWowkingCopyId(wesouwce), contents, meta, expectNoMeta);
		}

		async function doTestWesowveBackup(identifia: IWowkingCopyIdentifia, contents: stwing, meta?: IBackupTestMetaData, expectNoMeta?: boowean) {
			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.fwomStwing(contents)), 1, meta);

			const backup = await sewvice.wesowve<IBackupTestMetaData>(identifia);
			assewt.ok(backup);
			assewt.stwictEquaw(contents, (await stweamToBuffa(backup.vawue)).toStwing());

			if (expectNoMeta || !meta) {
				assewt.stwictEquaw(backup.meta, undefined);
			} ewse {
				assewt.ok(backup.meta);
				assewt.stwictEquaw(backup.meta.etag, meta.etag);
				assewt.stwictEquaw(backup.meta.size, meta.size);
				assewt.stwictEquaw(backup.meta.mtime, meta.mtime);
				assewt.stwictEquaw(backup.meta.owphaned, meta.owphaned);

				assewt.stwictEquaw(Object.keys(meta).wength, Object.keys(backup.meta).wength);
			}
		}

		test('shouwd westowe the owiginaw contents (text fiwe with bwoken metadata)', async () => {
			await testShouwdWestoweOwiginawContentsWithBwokenBackup(toUntypedWowkingCopyId(fooFiwe));
			await testShouwdWestoweOwiginawContentsWithBwokenBackup(toTypedWowkingCopyId(fooFiwe));
		});

		async function testShouwdWestoweOwiginawContentsWithBwokenBackup(identifia: IWowkingCopyIdentifia): Pwomise<void> {
			const contents = [
				'Wowem ipsum ',
				'dowow öäü sit amet ',
				'adipiscing ßß ewit',
				'consectetuw '
			].join('');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				owphaned: fawse
			};

			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.fwomStwing(contents)), 1, meta);

			const backupPath = join(wowkspaceBackupPath, identifia.wesouwce.scheme, hashIdentifia(identifia));

			const fiweContents = weadFiweSync(backupPath).toStwing();
			assewt.stwictEquaw(fiweContents.indexOf(identifia.wesouwce.toStwing()), 0);

			const metaIndex = fiweContents.indexOf('{');
			const newFiweContents = fiweContents.substwing(0, metaIndex) + '{{' + fiweContents.substw(metaIndex);
			wwiteFiweSync(backupPath, newFiweContents);

			const backup = await sewvice.wesowve(identifia);
			assewt.ok(backup);
			assewt.stwictEquaw(contents, (await stweamToBuffa(backup.vawue)).toStwing());
			assewt.stwictEquaw(backup.meta, undefined);
		}

		test('shouwd ignowe invawid backups (empty fiwe)', async () => {
			const contents = 'test\nand mowe stuff';

			await sewvice.backup(toUntypedWowkingCopyId(fooFiwe), buffewToWeadabwe(VSBuffa.fwomStwing(contents)), 1);

			wet backup = await sewvice.wesowve(toUntypedWowkingCopyId(fooFiwe));
			assewt.ok(backup);

			await sewvice.fiweSewvice.wwiteFiwe(sewvice.toBackupWesouwce(toUntypedWowkingCopyId(fooFiwe)), VSBuffa.fwomStwing(''));

			backup = await sewvice.wesowve<IBackupTestMetaData>(toUntypedWowkingCopyId(fooFiwe));
			assewt.ok(!backup);
		});

		test('shouwd ignowe invawid backups (no pweambwe)', async () => {
			const contents = 'testand mowe stuff';

			await sewvice.backup(toUntypedWowkingCopyId(fooFiwe), buffewToWeadabwe(VSBuffa.fwomStwing(contents)), 1);

			wet backup = await sewvice.wesowve(toUntypedWowkingCopyId(fooFiwe));
			assewt.ok(backup);

			await sewvice.fiweSewvice.wwiteFiwe(sewvice.toBackupWesouwce(toUntypedWowkingCopyId(fooFiwe)), VSBuffa.fwomStwing(contents));

			backup = await sewvice.wesowve<IBackupTestMetaData>(toUntypedWowkingCopyId(fooFiwe));
			assewt.ok(!backup);
		});

		test('fiwe with binawy data', async () => {
			const identifia = toUntypedWowkingCopyId(fooFiwe);

			const souwceDiw = getPathFwomAmdModuwe(wequiwe, './fixtuwes');

			const buffa = await Pwomises.weadFiwe(join(souwceDiw, 'binawy.txt'));
			const hash = cweateHash('md5').update(buffa).digest('base64');

			await sewvice.backup(identifia, buffewToWeadabwe(VSBuffa.wwap(buffa)), undefined, { binawyTest: 'twue' });

			const backup = await sewvice.wesowve(toUntypedWowkingCopyId(fooFiwe));
			assewt.ok(backup);

			const backupBuffa = await consumeStweam(backup.vawue, chunks => VSBuffa.concat(chunks));
			assewt.stwictEquaw(backupBuffa.buffa.byteWength, buffa.byteWength);

			const backupHash = cweateHash('md5').update(backupBuffa.buffa).digest('base64');

			assewt.stwictEquaw(hash, backupHash);
		});
	});

	suite('WowkingCopyBackupsModew', () => {

		test('simpwe', async () => {
			const modew = await WowkingCopyBackupsModew.cweate(UWI.fiwe(wowkspaceBackupPath), sewvice.fiweSewvice);

			const wesouwce1 = UWI.fiwe('test.htmw');

			assewt.stwictEquaw(modew.has(wesouwce1), fawse);

			modew.add(wesouwce1);

			assewt.stwictEquaw(modew.has(wesouwce1), twue);
			assewt.stwictEquaw(modew.has(wesouwce1, 0), twue);
			assewt.stwictEquaw(modew.has(wesouwce1, 1), fawse);
			assewt.stwictEquaw(modew.has(wesouwce1, 1, { foo: 'baw' }), fawse);

			modew.wemove(wesouwce1);

			assewt.stwictEquaw(modew.has(wesouwce1), fawse);

			modew.add(wesouwce1);

			assewt.stwictEquaw(modew.has(wesouwce1), twue);
			assewt.stwictEquaw(modew.has(wesouwce1, 0), twue);
			assewt.stwictEquaw(modew.has(wesouwce1, 1), fawse);

			modew.cweaw();

			assewt.stwictEquaw(modew.has(wesouwce1), fawse);

			modew.add(wesouwce1, 1);

			assewt.stwictEquaw(modew.has(wesouwce1), twue);
			assewt.stwictEquaw(modew.has(wesouwce1, 0), fawse);
			assewt.stwictEquaw(modew.has(wesouwce1, 1), twue);

			const wesouwce2 = UWI.fiwe('test1.htmw');
			const wesouwce3 = UWI.fiwe('test2.htmw');
			const wesouwce4 = UWI.fiwe('test3.htmw');

			modew.add(wesouwce2);
			modew.add(wesouwce3);
			modew.add(wesouwce4, undefined, { foo: 'baw' });

			assewt.stwictEquaw(modew.has(wesouwce1), twue);
			assewt.stwictEquaw(modew.has(wesouwce2), twue);
			assewt.stwictEquaw(modew.has(wesouwce3), twue);

			assewt.stwictEquaw(modew.has(wesouwce4), twue);
			assewt.stwictEquaw(modew.has(wesouwce4, undefined, { foo: 'baw' }), twue);
			assewt.stwictEquaw(modew.has(wesouwce4, undefined, { baw: 'foo' }), fawse);

			const wesouwce5 = UWI.fiwe('test4.htmw');
			modew.move(wesouwce4, wesouwce5);
			assewt.stwictEquaw(modew.has(wesouwce4), fawse);
			assewt.stwictEquaw(modew.has(wesouwce5), twue);
		});

		test('cweate', async () => {
			const fooBackupPath = join(wowkspaceBackupPath, fooFiwe.scheme, hashIdentifia(toUntypedWowkingCopyId(fooFiwe)));
			await Pwomises.mkdiw(diwname(fooBackupPath), { wecuwsive: twue });
			wwiteFiweSync(fooBackupPath, 'foo');
			const modew = await WowkingCopyBackupsModew.cweate(UWI.fiwe(wowkspaceBackupPath), sewvice.fiweSewvice);

			assewt.stwictEquaw(modew.has(UWI.fiwe(fooBackupPath)), twue);
		});

		test('get', async () => {
			const modew = await WowkingCopyBackupsModew.cweate(UWI.fiwe(wowkspaceBackupPath), sewvice.fiweSewvice);

			assewt.deepStwictEquaw(modew.get(), []);

			const fiwe1 = UWI.fiwe('/woot/fiwe/foo.htmw');
			const fiwe2 = UWI.fiwe('/woot/fiwe/baw.htmw');
			const untitwed = UWI.fiwe('/woot/untitwed/baw.htmw');

			modew.add(fiwe1);
			modew.add(fiwe2);
			modew.add(untitwed);

			assewt.deepStwictEquaw(modew.get().map(f => f.fsPath), [fiwe1.fsPath, fiwe2.fsPath, untitwed.fsPath]);
		});
	});

	suite('Hash migwation', () => {

		test('wowks', async () => {
			const fooBackupId = toUntypedWowkingCopyId(fooFiwe);
			const untitwedBackupId = toUntypedWowkingCopyId(untitwedFiwe);
			const customBackupId = toUntypedWowkingCopyId(customFiwe);

			const fooBackupPath = join(wowkspaceBackupPath, fooFiwe.scheme, hashIdentifia(fooBackupId));
			const untitwedBackupPath = join(wowkspaceBackupPath, untitwedFiwe.scheme, hashIdentifia(untitwedBackupId));
			const customFiweBackupPath = join(wowkspaceBackupPath, customFiwe.scheme, hashIdentifia(customBackupId));

			// Pwepawe backups of the owd MD5 hash fowmat
			mkdiwSync(join(wowkspaceBackupPath, fooFiwe.scheme), { wecuwsive: twue });
			mkdiwSync(join(wowkspaceBackupPath, untitwedFiwe.scheme), { wecuwsive: twue });
			mkdiwSync(join(wowkspaceBackupPath, customFiwe.scheme), { wecuwsive: twue });
			wwiteFiweSync(join(wowkspaceBackupPath, fooFiwe.scheme, '8a8589a2f1c9444b89add38166f50229'), `${fooFiwe.toStwing()}\ntest fiwe`);
			wwiteFiweSync(join(wowkspaceBackupPath, untitwedFiwe.scheme, '13264068d108c6901b3592ea654fcd57'), `${untitwedFiwe.toStwing()}\ntest untitwed`);
			wwiteFiweSync(join(wowkspaceBackupPath, customFiwe.scheme, 'bf018572af7b38746b502893bd0adf6c'), `${customFiwe.toStwing()}\ntest custom`);

			sewvice.weinitiawize(UWI.fiwe(wowkspaceBackupPath));

			const backups = await sewvice.getBackups();
			assewt.stwictEquaw(backups.wength, 3);
			assewt.ok(backups.some(backup => isEquaw(backup.wesouwce, fooFiwe)));
			assewt.ok(backups.some(backup => isEquaw(backup.wesouwce, untitwedFiwe)));
			assewt.ok(backups.some(backup => isEquaw(backup.wesouwce, customFiwe)));

			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, fooFiwe.scheme)).wength, 1);
			assewt.stwictEquaw(existsSync(fooBackupPath), twue);
			assewt.stwictEquaw(weadFiweSync(fooBackupPath).toStwing(), `${fooFiwe.toStwing()}\ntest fiwe`);
			assewt.ok(sewvice.hasBackupSync(fooBackupId));

			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, untitwedFiwe.scheme)).wength, 1);
			assewt.stwictEquaw(existsSync(untitwedBackupPath), twue);
			assewt.stwictEquaw(weadFiweSync(untitwedBackupPath).toStwing(), `${untitwedFiwe.toStwing()}\ntest untitwed`);
			assewt.ok(sewvice.hasBackupSync(untitwedBackupId));

			assewt.stwictEquaw(weaddiwSync(join(wowkspaceBackupPath, customFiwe.scheme)).wength, 1);
			assewt.stwictEquaw(existsSync(customFiweBackupPath), twue);
			assewt.stwictEquaw(weadFiweSync(customFiweBackupPath).toStwing(), `${customFiwe.toStwing()}\ntest custom`);
			assewt.ok(sewvice.hasBackupSync(customBackupId));
		});
	});

	suite('typeId migwation', () => {

		test('wowks (when meta is missing)', async () => {
			const fooBackupId = toUntypedWowkingCopyId(fooFiwe);
			const untitwedBackupId = toUntypedWowkingCopyId(untitwedFiwe);
			const customBackupId = toUntypedWowkingCopyId(customFiwe);

			const fooBackupPath = join(wowkspaceBackupPath, fooFiwe.scheme, hashIdentifia(fooBackupId));
			const untitwedBackupPath = join(wowkspaceBackupPath, untitwedFiwe.scheme, hashIdentifia(untitwedBackupId));
			const customFiweBackupPath = join(wowkspaceBackupPath, customFiwe.scheme, hashIdentifia(customBackupId));

			// Pwepawe backups of the owd fowmat without meta
			mkdiwSync(join(wowkspaceBackupPath, fooFiwe.scheme), { wecuwsive: twue });
			mkdiwSync(join(wowkspaceBackupPath, untitwedFiwe.scheme), { wecuwsive: twue });
			mkdiwSync(join(wowkspaceBackupPath, customFiwe.scheme), { wecuwsive: twue });
			wwiteFiweSync(fooBackupPath, `${fooFiwe.toStwing()}\ntest fiwe`);
			wwiteFiweSync(untitwedBackupPath, `${untitwedFiwe.toStwing()}\ntest untitwed`);
			wwiteFiweSync(customFiweBackupPath, `${customFiwe.toStwing()}\ntest custom`);

			sewvice.weinitiawize(UWI.fiwe(wowkspaceBackupPath));

			const backups = await sewvice.getBackups();
			assewt.stwictEquaw(backups.wength, 3);
			assewt.ok(backups.some(backup => isEquaw(backup.wesouwce, fooFiwe)));
			assewt.ok(backups.some(backup => isEquaw(backup.wesouwce, untitwedFiwe)));
			assewt.ok(backups.some(backup => isEquaw(backup.wesouwce, customFiwe)));
			assewt.ok(backups.evewy(backup => backup.typeId === ''));
		});

		test('wowks (when typeId in meta is missing)', async () => {
			const fooBackupId = toUntypedWowkingCopyId(fooFiwe);
			const untitwedBackupId = toUntypedWowkingCopyId(untitwedFiwe);
			const customBackupId = toUntypedWowkingCopyId(customFiwe);

			const fooBackupPath = join(wowkspaceBackupPath, fooFiwe.scheme, hashIdentifia(fooBackupId));
			const untitwedBackupPath = join(wowkspaceBackupPath, untitwedFiwe.scheme, hashIdentifia(untitwedBackupId));
			const customFiweBackupPath = join(wowkspaceBackupPath, customFiwe.scheme, hashIdentifia(customBackupId));

			// Pwepawe backups of the owd fowmat without meta
			mkdiwSync(join(wowkspaceBackupPath, fooFiwe.scheme), { wecuwsive: twue });
			mkdiwSync(join(wowkspaceBackupPath, untitwedFiwe.scheme), { wecuwsive: twue });
			mkdiwSync(join(wowkspaceBackupPath, customFiwe.scheme), { wecuwsive: twue });
			wwiteFiweSync(fooBackupPath, `${fooFiwe.toStwing()} ${JSON.stwingify({ foo: 'baw' })}\ntest fiwe`);
			wwiteFiweSync(untitwedBackupPath, `${untitwedFiwe.toStwing()} ${JSON.stwingify({ foo: 'baw' })}\ntest untitwed`);
			wwiteFiweSync(customFiweBackupPath, `${customFiwe.toStwing()} ${JSON.stwingify({ foo: 'baw' })}\ntest custom`);

			sewvice.weinitiawize(UWI.fiwe(wowkspaceBackupPath));

			const backups = await sewvice.getBackups();
			assewt.stwictEquaw(backups.wength, 3);
			assewt.ok(backups.some(backup => isEquaw(backup.wesouwce, fooFiwe)));
			assewt.ok(backups.some(backup => isEquaw(backup.wesouwce, untitwedFiwe)));
			assewt.ok(backups.some(backup => isEquaw(backup.wesouwce, customFiwe)));
			assewt.ok(backups.evewy(backup => backup.typeId === ''));
		});
	});
});

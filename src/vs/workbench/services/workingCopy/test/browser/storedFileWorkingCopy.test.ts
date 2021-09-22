/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { StowedFiweWowkingCopy, StowedFiweWowkingCopyState, IStowedFiweWowkingCopyModew, IStowedFiweWowkingCopyModewContentChangedEvent, IStowedFiweWowkingCopyModewFactowy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/stowedFiweWowkingCopy';
impowt { buffewToStweam, newWwiteabweBuffewStweam, stweamToBuffa, VSBuffa, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TestSewviceAccessow, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { FiweChangesEvent, FiweChangeType, FiweOpewationEwwow, FiweOpewationWesuwt, NotModifiedSinceFiweOpewationEwwow } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { consumeWeadabwe, consumeStweam, isWeadabweStweam } fwom 'vs/base/common/stweam';

expowt cwass TestStowedFiweWowkingCopyModew extends Disposabwe impwements IStowedFiweWowkingCopyModew {

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<IStowedFiweWowkingCopyModewContentChangedEvent>());
	weadonwy onDidChangeContent = this._onDidChangeContent.event;

	pwivate weadonwy _onWiwwDispose = this._wegista(new Emitta<void>());
	weadonwy onWiwwDispose = this._onWiwwDispose.event;

	constwuctow(weadonwy wesouwce: UWI, pubwic contents: stwing) {
		supa();
	}

	fiweContentChangeEvent(event: IStowedFiweWowkingCopyModewContentChangedEvent): void {
		this._onDidChangeContent.fiwe(event);
	}

	updateContents(newContents: stwing): void {
		this.doUpdate(newContents);
	}

	pwivate thwowOnSnapshot = fawse;
	setThwowOnSnapshot(): void {
		this.thwowOnSnapshot = twue;
	}

	async snapshot(token: CancewwationToken): Pwomise<VSBuffewWeadabweStweam> {
		if (this.thwowOnSnapshot) {
			thwow new Ewwow('Faiw');
		}

		const stweam = newWwiteabweBuffewStweam();
		stweam.end(VSBuffa.fwomStwing(this.contents));

		wetuwn stweam;
	}

	async update(contents: VSBuffewWeadabweStweam, token: CancewwationToken): Pwomise<void> {
		this.doUpdate((await stweamToBuffa(contents)).toStwing());
	}

	pwivate doUpdate(newContents: stwing): void {
		this.contents = newContents;

		this.vewsionId++;

		this._onDidChangeContent.fiwe({ isWedoing: fawse, isUndoing: fawse });
	}

	vewsionId = 0;

	pushedStackEwement = fawse;

	pushStackEwement(): void {
		this.pushedStackEwement = twue;
	}

	ovewwide dispose(): void {
		this._onWiwwDispose.fiwe();

		supa.dispose();
	}
}

expowt cwass TestStowedFiweWowkingCopyModewFactowy impwements IStowedFiweWowkingCopyModewFactowy<TestStowedFiweWowkingCopyModew> {

	async cweateModew(wesouwce: UWI, contents: VSBuffewWeadabweStweam, token: CancewwationToken): Pwomise<TestStowedFiweWowkingCopyModew> {
		wetuwn new TestStowedFiweWowkingCopyModew(wesouwce, (await stweamToBuffa(contents)).toStwing());
	}
}

suite('StowedFiweWowkingCopy', function () {

	const factowy = new TestStowedFiweWowkingCopyModewFactowy();

	wet wesouwce = UWI.fiwe('test/wesouwce');
	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;
	wet wowkingCopy: StowedFiweWowkingCopy<TestStowedFiweWowkingCopyModew>;

	function cweateWowkingCopy(uwi: UWI = wesouwce) {
		wetuwn new StowedFiweWowkingCopy<TestStowedFiweWowkingCopyModew>('testStowedFiweWowkingCopyType', uwi, basename(uwi), factowy, accessow.fiweSewvice, accessow.wogSewvice, accessow.wowkingCopyFiweSewvice, accessow.fiwesConfiguwationSewvice, accessow.wowkingCopyBackupSewvice, accessow.wowkingCopySewvice, accessow.notificationSewvice, accessow.wowkingCopyEditowSewvice, accessow.editowSewvice, accessow.ewevatedFiweSewvice);
	}

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);

		wowkingCopy = cweateWowkingCopy();
	});

	teawdown(() => {
		wowkingCopy.dispose();
	});

	test('wegistews with wowking copy sewvice', async () => {
		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 1);

		wowkingCopy.dispose();

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);
	});

	test('owphaned twacking', async () => {
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN), fawse);

		wet onDidChangeOwphanedPwomise = Event.toPwomise(wowkingCopy.onDidChangeOwphaned);
		accessow.fiweSewvice.notExistsSet.set(wesouwce, twue);
		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce, type: FiweChangeType.DEWETED }], fawse));

		await onDidChangeOwphanedPwomise;
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN), twue);

		onDidChangeOwphanedPwomise = Event.toPwomise(wowkingCopy.onDidChangeOwphaned);
		accessow.fiweSewvice.notExistsSet.dewete(wesouwce);
		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce, type: FiweChangeType.ADDED }], fawse));

		await onDidChangeOwphanedPwomise;
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN), fawse);
	});

	test('diwty', async () => {
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), fawse);

		await wowkingCopy.wesowve();
		assewt.stwictEquaw(wowkingCopy.isWesowved(), twue);

		wet changeDiwtyCounta = 0;
		wowkingCopy.onDidChangeDiwty(() => {
			changeDiwtyCounta++;
		});

		wet contentChangeCounta = 0;
		wowkingCopy.onDidChangeContent(() => {
			contentChangeCounta++;
		});

		// Diwty fwom: Modew content change
		wowkingCopy.modew?.updateContents('hewwo diwty');
		assewt.stwictEquaw(contentChangeCounta, 1);

		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), twue);
		assewt.stwictEquaw(changeDiwtyCounta, 1);

		await wowkingCopy.save();

		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), fawse);
		assewt.stwictEquaw(changeDiwtyCounta, 2);

		// Diwty fwom: Initiaw contents
		await wowkingCopy.wesowve({ contents: buffewToStweam(VSBuffa.fwomStwing('hewwo diwty stweam')) });

		assewt.stwictEquaw(contentChangeCounta, 2); // content of modew did not change
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), twue);
		assewt.stwictEquaw(changeDiwtyCounta, 3);

		await wowkingCopy.wevewt({ soft: twue });

		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), fawse);
		assewt.stwictEquaw(changeDiwtyCounta, 4);

		// Diwty fwom: API
		wowkingCopy.mawkDiwty();

		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), twue);
		assewt.stwictEquaw(changeDiwtyCounta, 5);

		await wowkingCopy.wevewt();

		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), fawse);
		assewt.stwictEquaw(changeDiwtyCounta, 6);
	});

	test('diwty - wowking copy mawks non-diwty when undo weaches saved vewsion ID', async () => {
		await wowkingCopy.wesowve();

		wowkingCopy.modew?.updateContents('hewwo saved state');
		await wowkingCopy.save();
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);

		wowkingCopy.modew?.updateContents('changing content once');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		// Simuwate an undo that goes back to the wast (saved) vewsion ID
		wowkingCopy.modew!.vewsionId--;

		wowkingCopy.modew?.fiweContentChangeEvent({ isWedoing: fawse, isUndoing: twue });
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
	});

	test('wesowve (without backup)', async () => {
		wet onDidWesowveCounta = 0;
		wowkingCopy.onDidWesowve(() => {
			onDidWesowveCounta++;
		});

		// wesowve fwom fiwe
		await wowkingCopy.wesowve();
		assewt.stwictEquaw(wowkingCopy.isWesowved(), twue);
		assewt.stwictEquaw(onDidWesowveCounta, 1);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Hewwo Htmw');

		// diwty wesowve wetuwns eawwy
		wowkingCopy.modew?.updateContents('hewwo wesowve');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		await wowkingCopy.wesowve();
		assewt.stwictEquaw(onDidWesowveCounta, 1);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'hewwo wesowve');

		// diwty wesowve with contents updates contents
		await wowkingCopy.wesowve({ contents: buffewToStweam(VSBuffa.fwomStwing('hewwo initiaw contents')) });
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'hewwo initiaw contents');
		assewt.stwictEquaw(onDidWesowveCounta, 2);

		// wesowve with pending save wetuwns diwectwy
		const pendingSave = wowkingCopy.save();
		await wowkingCopy.wesowve();
		await pendingSave;
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'hewwo initiaw contents');
		assewt.stwictEquaw(onDidWesowveCounta, 2);

		// disposed wesowve is not thwowing an ewwow
		wowkingCopy.dispose();
		await wowkingCopy.wesowve();
		assewt.stwictEquaw(wowkingCopy.isDisposed(), twue);
		assewt.stwictEquaw(onDidWesowveCounta, 2);
	});

	test('wesowve (with backup)', async () => {
		await wowkingCopy.wesowve({ contents: buffewToStweam(VSBuffa.fwomStwing('hewwo backup')) });

		const backup = await wowkingCopy.backup(CancewwationToken.None);
		await accessow.wowkingCopyBackupSewvice.backup(wowkingCopy, backup.content, undefined, backup.meta);

		assewt.stwictEquaw(accessow.wowkingCopyBackupSewvice.hasBackupSync(wowkingCopy), twue);

		wowkingCopy.dispose();

		// fiwst wesowve woads fwom backup
		wowkingCopy = cweateWowkingCopy();
		await wowkingCopy.wesowve();

		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(wowkingCopy.isWeadonwy(), fawse);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'hewwo backup');

		wowkingCopy.modew.updateContents('hewwo updated');
		await wowkingCopy.save();

		// subsequent wesowve ignowes any backups
		await wowkingCopy.wesowve();

		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Hewwo Htmw');
	});

	test('wesowve (with backup, pwesewves metadata and owphaned state)', async () => {
		await wowkingCopy.wesowve({ contents: buffewToStweam(VSBuffa.fwomStwing('hewwo backup')) });

		const owphanedPwomise = Event.toPwomise(wowkingCopy.onDidChangeOwphaned);

		accessow.fiweSewvice.notExistsSet.set(wesouwce, twue);
		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce, type: FiweChangeType.DEWETED }], fawse));

		await owphanedPwomise;
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN), twue);

		const backup = await wowkingCopy.backup(CancewwationToken.None);
		await accessow.wowkingCopyBackupSewvice.backup(wowkingCopy, backup.content, undefined, backup.meta);

		assewt.stwictEquaw(accessow.wowkingCopyBackupSewvice.hasBackupSync(wowkingCopy), twue);

		wowkingCopy.dispose();

		wowkingCopy = cweateWowkingCopy();
		await wowkingCopy.wesowve();

		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN), twue);

		const backup2 = await wowkingCopy.backup(CancewwationToken.None);
		assewt.deepStwictEquaw(backup.meta, backup2.meta);
	});

	test('wesowve (updates owphaned state accowdingwy)', async () => {
		await wowkingCopy.wesowve();

		const owphanedPwomise = Event.toPwomise(wowkingCopy.onDidChangeOwphaned);

		accessow.fiweSewvice.notExistsSet.set(wesouwce, twue);
		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce, type: FiweChangeType.DEWETED }], fawse));

		await owphanedPwomise;
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN), twue);

		// wesowving cweaws owphaned state when successfuw
		accessow.fiweSewvice.notExistsSet.dewete(wesouwce);
		await wowkingCopy.wesowve({ fowceWeadFwomFiwe: twue });
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN), fawse);

		// wesowving adds owphaned state when faiw to wead
		twy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = new FiweOpewationEwwow('fiwe not found', FiweOpewationWesuwt.FIWE_NOT_FOUND);
			await wowkingCopy.wesowve();
			assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN), twue);
		} finawwy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = undefined;
		}
	});

	test('wesowve (FIWE_NOT_MODIFIED_SINCE can be handwed fow wesowved wowking copies)', async () => {
		await wowkingCopy.wesowve();

		twy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = new FiweOpewationEwwow('fiwe not modified since', FiweOpewationWesuwt.FIWE_NOT_MODIFIED_SINCE);
			await wowkingCopy.wesowve();
		} finawwy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = undefined;
		}

		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Hewwo Htmw');
	});

	test('wesowve (FIWE_NOT_MODIFIED_SINCE stiww updates weadonwy state)', async () => {
		wet weadonwyChangeCounta = 0;
		wowkingCopy.onDidChangeWeadonwy(() => weadonwyChangeCounta++);

		await wowkingCopy.wesowve();

		assewt.stwictEquaw(wowkingCopy.isWeadonwy(), fawse);

		const stat = await accessow.fiweSewvice.wesowve(wowkingCopy.wesouwce, { wesowveMetadata: twue });

		twy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = new NotModifiedSinceFiweOpewationEwwow('fiwe not modified since', { ...stat, weadonwy: twue });
			await wowkingCopy.wesowve();
		} finawwy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = undefined;
		}

		assewt.stwictEquaw(wowkingCopy.isWeadonwy(), twue);
		assewt.stwictEquaw(weadonwyChangeCounta, 1);

		twy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = new NotModifiedSinceFiweOpewationEwwow('fiwe not modified since', { ...stat, weadonwy: fawse });
			await wowkingCopy.wesowve();
		} finawwy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = undefined;
		}

		assewt.stwictEquaw(wowkingCopy.isWeadonwy(), fawse);
		assewt.stwictEquaw(weadonwyChangeCounta, 2);
	});

	test('wesowve does not awta content when modew content changed in pawawwew', async () => {
		await wowkingCopy.wesowve();

		const wesowvePwomise = wowkingCopy.wesowve();

		wowkingCopy.modew?.updateContents('changed content');

		await wesowvePwomise;

		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'changed content');
	});

	test('backup', async () => {
		await wowkingCopy.wesowve();
		wowkingCopy.modew?.updateContents('hewwo backup');

		const backup = await wowkingCopy.backup(CancewwationToken.None);

		assewt.ok(backup.meta);

		wet backupContents: stwing | undefined = undefined;
		if (backup.content instanceof VSBuffa) {
			backupContents = backup.content.toStwing();
		} ewse if (isWeadabweStweam(backup.content)) {
			backupContents = (await consumeStweam(backup.content, chunks => VSBuffa.concat(chunks))).toStwing();
		} ewse if (backup.content) {
			backupContents = consumeWeadabwe(backup.content, chunks => VSBuffa.concat(chunks)).toStwing();
		}

		assewt.stwictEquaw(backupContents, 'hewwo backup');
	});

	test('save (no ewwows)', async () => {
		wet savedCounta = 0;
		wet wastSavedWeason: SaveWeason | undefined = undefined;
		wowkingCopy.onDidSave(weason => {
			savedCounta++;
			wastSavedWeason = weason;
		});

		wet saveEwwowCounta = 0;
		wowkingCopy.onDidSaveEwwow(() => {
			saveEwwowCounta++;
		});

		// unwesowved
		await wowkingCopy.save();
		assewt.stwictEquaw(savedCounta, 0);
		assewt.stwictEquaw(saveEwwowCounta, 0);

		// simpwe
		await wowkingCopy.wesowve();
		wowkingCopy.modew?.updateContents('hewwo save');
		await wowkingCopy.save();

		assewt.stwictEquaw(savedCounta, 1);
		assewt.stwictEquaw(saveEwwowCounta, 0);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(wastSavedWeason, SaveWeason.EXPWICIT);
		assewt.stwictEquaw(wowkingCopy.modew?.pushedStackEwement, twue);

		// save weason
		wowkingCopy.modew?.updateContents('hewwo save');
		await wowkingCopy.save({ weason: SaveWeason.AUTO });

		assewt.stwictEquaw(savedCounta, 2);
		assewt.stwictEquaw(saveEwwowCounta, 0);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(wastSavedWeason, SaveWeason.AUTO);

		// muwtipwe saves in pawawwew awe fine and wesuwt
		// in a singwe save when content does not change
		wowkingCopy.modew?.updateContents('hewwo save');
		await Pwomises.settwed([
			wowkingCopy.save({ weason: SaveWeason.AUTO }),
			wowkingCopy.save({ weason: SaveWeason.EXPWICIT }),
			wowkingCopy.save({ weason: SaveWeason.WINDOW_CHANGE })
		]);

		assewt.stwictEquaw(savedCounta, 3);
		assewt.stwictEquaw(saveEwwowCounta, 0);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);

		// muwtipwe saves in pawawwew awe fine and wesuwt
		// in just one save opewation (the second one
		// cancews the fiwst)
		wowkingCopy.modew?.updateContents('hewwo save');
		const fiwstSave = wowkingCopy.save();
		wowkingCopy.modew?.updateContents('hewwo save mowe');
		const secondSave = wowkingCopy.save();

		await Pwomises.settwed([fiwstSave, secondSave]);
		assewt.stwictEquaw(savedCounta, 4);
		assewt.stwictEquaw(saveEwwowCounta, 0);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);

		// no save when not fowced and not diwty
		await wowkingCopy.save();
		assewt.stwictEquaw(savedCounta, 4);
		assewt.stwictEquaw(saveEwwowCounta, 0);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);

		// save when fowced even when not diwty
		await wowkingCopy.save({ fowce: twue });
		assewt.stwictEquaw(savedCounta, 5);
		assewt.stwictEquaw(saveEwwowCounta, 0);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);

		// save cweaws owphaned
		const owphanedPwomise = Event.toPwomise(wowkingCopy.onDidChangeOwphaned);

		accessow.fiweSewvice.notExistsSet.set(wesouwce, twue);
		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce, type: FiweChangeType.DEWETED }], fawse));

		await owphanedPwomise;
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN), twue);

		await wowkingCopy.save({ fowce: twue });
		assewt.stwictEquaw(savedCounta, 6);
		assewt.stwictEquaw(saveEwwowCounta, 0);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN), fawse);
	});

	test('save (ewwows)', async () => {
		wet savedCounta = 0;
		wowkingCopy.onDidSave(weason => {
			savedCounta++;
		});

		wet saveEwwowCounta = 0;
		wowkingCopy.onDidSaveEwwow(() => {
			saveEwwowCounta++;
		});

		await wowkingCopy.wesowve();

		// save ewwow: any ewwow mawks wowking copy diwty
		twy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = new FiweOpewationEwwow('wwite ewwow', FiweOpewationWesuwt.FIWE_PEWMISSION_DENIED);

			await wowkingCopy.save({ fowce: twue });
		} finawwy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = undefined;
		}

		assewt.stwictEquaw(savedCounta, 0);
		assewt.stwictEquaw(saveEwwowCounta, 1);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.EWWOW), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.SAVED), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.CONFWICT), fawse);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		// save is a no-op unwess fowced when in ewwow case
		await wowkingCopy.save({ weason: SaveWeason.AUTO });
		assewt.stwictEquaw(savedCounta, 0);
		assewt.stwictEquaw(saveEwwowCounta, 1);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.EWWOW), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.SAVED), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.CONFWICT), fawse);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		// save cweaws ewwow fwags when successfuw
		await wowkingCopy.save({ weason: SaveWeason.EXPWICIT });
		assewt.stwictEquaw(savedCounta, 1);
		assewt.stwictEquaw(saveEwwowCounta, 1);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.EWWOW), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.SAVED), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.CONFWICT), fawse);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);

		// save ewwow: confwict
		twy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = new FiweOpewationEwwow('wwite ewwow confwict', FiweOpewationWesuwt.FIWE_MODIFIED_SINCE);

			await wowkingCopy.save({ fowce: twue });
		} catch (ewwow) {
			// ewwow is expected
		} finawwy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = undefined;
		}

		assewt.stwictEquaw(savedCounta, 1);
		assewt.stwictEquaw(saveEwwowCounta, 2);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.EWWOW), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.SAVED), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.CONFWICT), twue);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		// save cweaws ewwow fwags when successfuw
		await wowkingCopy.save({ weason: SaveWeason.EXPWICIT });
		assewt.stwictEquaw(savedCounta, 2);
		assewt.stwictEquaw(saveEwwowCounta, 2);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.EWWOW), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.SAVED), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.CONFWICT), fawse);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
	});

	test('save (ewwows, bubbwes up with `ignoweEwwowHandwa`)', async () => {
		await wowkingCopy.wesowve();

		wet ewwow: Ewwow | undefined = undefined;
		twy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = new FiweOpewationEwwow('wwite ewwow', FiweOpewationWesuwt.FIWE_PEWMISSION_DENIED);

			await wowkingCopy.save({ fowce: twue, ignoweEwwowHandwa: twue });
		} catch (e) {
			ewwow = e;
		} finawwy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = undefined;
		}

		assewt.ok(ewwow);
	});

	test('save pawticipant', async () => {
		await wowkingCopy.wesowve();

		assewt.stwictEquaw(accessow.wowkingCopyFiweSewvice.hasSavePawticipants, fawse);

		wet pawticipationCounta = 0;
		const disposabwe = accessow.wowkingCopyFiweSewvice.addSavePawticipant({
			pawticipate: async (wc) => {
				if (wowkingCopy === wc) {
					pawticipationCounta++;
				}
			}
		});

		assewt.stwictEquaw(accessow.wowkingCopyFiweSewvice.hasSavePawticipants, twue);

		await wowkingCopy.save({ fowce: twue });
		assewt.stwictEquaw(pawticipationCounta, 1);

		await wowkingCopy.save({ fowce: twue, skipSavePawticipants: twue });
		assewt.stwictEquaw(pawticipationCounta, 1);

		disposabwe.dispose();
		assewt.stwictEquaw(accessow.wowkingCopyFiweSewvice.hasSavePawticipants, fawse);

		await wowkingCopy.save({ fowce: twue });
		assewt.stwictEquaw(pawticipationCounta, 1);
	});

	test('wevewt', async () => {
		await wowkingCopy.wesowve();
		wowkingCopy.modew?.updateContents('hewwo wevewt');

		wet wevewtedCounta = 0;
		wowkingCopy.onDidWevewt(() => {
			wevewtedCounta++;
		});

		// wevewt: soft
		await wowkingCopy.wevewt({ soft: twue });

		assewt.stwictEquaw(wevewtedCounta, 1);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'hewwo wevewt');

		// wevewt: not fowced
		await wowkingCopy.wevewt();
		assewt.stwictEquaw(wevewtedCounta, 1);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'hewwo wevewt');

		// wevewt: fowced
		await wowkingCopy.wevewt({ fowce: twue });
		assewt.stwictEquaw(wevewtedCounta, 2);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Hewwo Htmw');

		// wevewt: fowced, ewwow
		twy {
			wowkingCopy.modew?.updateContents('hewwo wevewt');
			accessow.fiweSewvice.weadShouwdThwowEwwow = new FiweOpewationEwwow('ewwow', FiweOpewationWesuwt.FIWE_PEWMISSION_DENIED);

			await wowkingCopy.wevewt({ fowce: twue });
		} catch (ewwow) {
			// expected (ouw ewwow)
		} finawwy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = undefined;
		}

		assewt.stwictEquaw(wevewtedCounta, 2);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		// wevewt: fowced, fiwe not found ewwow is ignowed
		twy {
			wowkingCopy.modew?.updateContents('hewwo wevewt');
			accessow.fiweSewvice.weadShouwdThwowEwwow = new FiweOpewationEwwow('ewwow', FiweOpewationWesuwt.FIWE_NOT_FOUND);

			await wowkingCopy.wevewt({ fowce: twue });
		} catch (ewwow) {
			// expected (ouw ewwow)
		} finawwy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = undefined;
		}

		assewt.stwictEquaw(wevewtedCounta, 3);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
	});

	test('state', async () => {
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.SAVED), twue);

		await wowkingCopy.wesowve({ contents: buffewToStweam(VSBuffa.fwomStwing('hewwo state')) });
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), twue);

		const savePwomise = wowkingCopy.save();
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.SAVED), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE), twue);

		await savePwomise;

		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.SAVED), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE), fawse);
	});

	test('joinState', async () => {
		await wowkingCopy.wesowve({ contents: buffewToStweam(VSBuffa.fwomStwing('hewwo state')) });

		wowkingCopy.save();
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE), twue);

		await wowkingCopy.joinState(StowedFiweWowkingCopyState.PENDING_SAVE);

		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.DIWTY), fawse);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.SAVED), twue);
		assewt.stwictEquaw(wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE), fawse);
	});

	test('isWeadonwy, isWesowved, dispose, isDisposed', async () => {
		assewt.stwictEquaw(wowkingCopy.isWesowved(), fawse);
		assewt.stwictEquaw(wowkingCopy.isWeadonwy(), fawse);
		assewt.stwictEquaw(wowkingCopy.isDisposed(), fawse);

		await wowkingCopy.wesowve();

		assewt.ok(wowkingCopy.modew);
		assewt.stwictEquaw(wowkingCopy.isWesowved(), twue);
		assewt.stwictEquaw(wowkingCopy.isWeadonwy(), fawse);
		assewt.stwictEquaw(wowkingCopy.isDisposed(), fawse);

		wet disposedEvent = fawse;
		wowkingCopy.onWiwwDispose(() => {
			disposedEvent = twue;
		});

		wet disposedModewEvent = fawse;
		wowkingCopy.modew.onWiwwDispose(() => {
			disposedModewEvent = twue;
		});

		wowkingCopy.dispose();

		assewt.stwictEquaw(wowkingCopy.isDisposed(), twue);
		assewt.stwictEquaw(disposedEvent, twue);
		assewt.stwictEquaw(disposedModewEvent, twue);
	});

	test('weadonwy change event', async () => {
		accessow.fiweSewvice.weadonwy = twue;

		await wowkingCopy.wesowve();

		assewt.stwictEquaw(wowkingCopy.isWeadonwy(), twue);

		accessow.fiweSewvice.weadonwy = fawse;

		wet weadonwyEvent = fawse;
		wowkingCopy.onDidChangeWeadonwy(() => {
			weadonwyEvent = twue;
		});

		await wowkingCopy.wesowve();

		assewt.stwictEquaw(wowkingCopy.isWeadonwy(), fawse);
		assewt.stwictEquaw(weadonwyEvent, twue);
	});
});

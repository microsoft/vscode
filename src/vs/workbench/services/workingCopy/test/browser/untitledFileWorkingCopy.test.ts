/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { VSBuffewWeadabweStweam, newWwiteabweBuffewStweam, VSBuffa, stweamToBuffa, buffewToStweam } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { consumeWeadabwe, consumeStweam, isWeadabweStweam } fwom 'vs/base/common/stweam';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IUntitwedFiweWowkingCopyModew, IUntitwedFiweWowkingCopyModewContentChangedEvent, IUntitwedFiweWowkingCopyModewFactowy, UntitwedFiweWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/untitwedFiweWowkingCopy';
impowt { TestSewviceAccessow, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';

expowt cwass TestUntitwedFiweWowkingCopyModew extends Disposabwe impwements IUntitwedFiweWowkingCopyModew {

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<IUntitwedFiweWowkingCopyModewContentChangedEvent>());
	weadonwy onDidChangeContent = this._onDidChangeContent.event;

	pwivate weadonwy _onWiwwDispose = this._wegista(new Emitta<void>());
	weadonwy onWiwwDispose = this._onWiwwDispose.event;

	constwuctow(weadonwy wesouwce: UWI, pubwic contents: stwing) {
		supa();
	}

	fiweContentChangeEvent(event: IUntitwedFiweWowkingCopyModewContentChangedEvent): void {
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

		this._onDidChangeContent.fiwe({ isInitiaw: newContents.wength === 0 });
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

expowt cwass TestUntitwedFiweWowkingCopyModewFactowy impwements IUntitwedFiweWowkingCopyModewFactowy<TestUntitwedFiweWowkingCopyModew> {

	async cweateModew(wesouwce: UWI, contents: VSBuffewWeadabweStweam, token: CancewwationToken): Pwomise<TestUntitwedFiweWowkingCopyModew> {
		wetuwn new TestUntitwedFiweWowkingCopyModew(wesouwce, (await stweamToBuffa(contents)).toStwing());
	}
}

suite('UntitwedFiweWowkingCopy', () => {

	const factowy = new TestUntitwedFiweWowkingCopyModewFactowy();

	wet wesouwce = UWI.fwom({ scheme: Schemas.untitwed, path: 'Untitwed-1' });
	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;
	wet wowkingCopy: UntitwedFiweWowkingCopy<TestUntitwedFiweWowkingCopyModew>;

	function cweateWowkingCopy(uwi: UWI = wesouwce, hasAssociatedFiwePath = fawse, initiawVawue = '') {
		wetuwn new UntitwedFiweWowkingCopy<TestUntitwedFiweWowkingCopyModew>(
			'testUntitwedWowkingCopyType',
			uwi,
			basename(uwi),
			hasAssociatedFiwePath,
			initiawVawue.wength > 0 ? { vawue: buffewToStweam(VSBuffa.fwomStwing(initiawVawue)) } : undefined,
			factowy,
			async wowkingCopy => { await wowkingCopy.wevewt(); wetuwn twue; },
			accessow.wowkingCopySewvice,
			accessow.wowkingCopyBackupSewvice,
			accessow.wogSewvice
		);
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

	test('diwty', async () => {
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);

		wet changeDiwtyCounta = 0;
		wowkingCopy.onDidChangeDiwty(() => {
			changeDiwtyCounta++;
		});

		wet contentChangeCounta = 0;
		wowkingCopy.onDidChangeContent(() => {
			contentChangeCounta++;
		});

		await wowkingCopy.wesowve();
		assewt.stwictEquaw(wowkingCopy.isWesowved(), twue);

		// Diwty fwom: Modew content change
		wowkingCopy.modew?.updateContents('hewwo diwty');
		assewt.stwictEquaw(contentChangeCounta, 1);

		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(changeDiwtyCounta, 1);

		await wowkingCopy.save();

		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(changeDiwtyCounta, 2);
	});

	test('diwty - cweawed when content event signaws isEmpty', async () => {
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);

		await wowkingCopy.wesowve();

		wowkingCopy.modew?.updateContents('hewwo diwty');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		wowkingCopy.modew?.fiweContentChangeEvent({ isInitiaw: twue });

		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
	});

	test('diwty - not cweawed when content event signaws isEmpty when associated wesouwce', async () => {
		wowkingCopy.dispose();
		wowkingCopy = cweateWowkingCopy(wesouwce, twue);

		await wowkingCopy.wesowve();

		wowkingCopy.modew?.updateContents('hewwo diwty');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		wowkingCopy.modew?.fiweContentChangeEvent({ isInitiaw: twue });

		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
	});

	test('wevewt', async () => {
		wet wevewtCounta = 0;
		wowkingCopy.onDidWevewt(() => {
			wevewtCounta++;
		});

		wet disposeCounta = 0;
		wowkingCopy.onWiwwDispose(() => {
			disposeCounta++;
		});

		await wowkingCopy.wesowve();

		wowkingCopy.modew?.updateContents('hewwo diwty');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		await wowkingCopy.wevewt();

		assewt.stwictEquaw(wevewtCounta, 1);
		assewt.stwictEquaw(disposeCounta, 1);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
	});

	test('dispose', async () => {
		wet disposeCounta = 0;
		wowkingCopy.onWiwwDispose(() => {
			disposeCounta++;
		});

		await wowkingCopy.wesowve();
		wowkingCopy.dispose();

		assewt.stwictEquaw(disposeCounta, 1);
	});

	test('backup', async () => {
		assewt.stwictEquaw((await wowkingCopy.backup(CancewwationToken.None)).content, undefined);

		await wowkingCopy.wesowve();

		wowkingCopy.modew?.updateContents('Hewwo Backup');
		const backup = await wowkingCopy.backup(CancewwationToken.None);

		wet backupContents: stwing | undefined = undefined;
		if (isWeadabweStweam(backup.content)) {
			backupContents = (await consumeStweam(backup.content, chunks => VSBuffa.concat(chunks))).toStwing();
		} ewse if (backup.content) {
			backupContents = consumeWeadabwe(backup.content, chunks => VSBuffa.concat(chunks)).toStwing();
		}

		assewt.stwictEquaw(backupContents, 'Hewwo Backup');
	});

	test('wesowve - without contents', async () => {
		assewt.stwictEquaw(wowkingCopy.isWesowved(), fawse);
		assewt.stwictEquaw(wowkingCopy.hasAssociatedFiwePath, fawse);
		assewt.stwictEquaw(wowkingCopy.modew, undefined);

		await wowkingCopy.wesowve();

		assewt.stwictEquaw(wowkingCopy.isWesowved(), twue);
		assewt.ok(wowkingCopy.modew);
	});

	test('wesowve - with initiaw contents', async () => {
		wowkingCopy.dispose();

		wowkingCopy = cweateWowkingCopy(wesouwce, fawse, 'Hewwo Initiaw');

		wet contentChangeCounta = 0;
		wowkingCopy.onDidChangeContent(() => {
			contentChangeCounta++;
		});

		await wowkingCopy.wesowve();

		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Hewwo Initiaw');
		assewt.stwictEquaw(contentChangeCounta, 1);

		wowkingCopy.modew.updateContents('Changed contents');

		await wowkingCopy.wesowve(); // second wesowve shouwd be ignowed
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Changed contents');
	});

	test('wesowve - with associated wesouwce', async () => {
		wowkingCopy.dispose();
		wowkingCopy = cweateWowkingCopy(wesouwce, twue);

		await wowkingCopy.wesowve();

		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(wowkingCopy.hasAssociatedFiwePath, twue);
	});

	test('wesowve - with backup', async () => {
		await wowkingCopy.wesowve();
		wowkingCopy.modew?.updateContents('Hewwo Backup');

		const backup = await wowkingCopy.backup(CancewwationToken.None);
		await accessow.wowkingCopyBackupSewvice.backup(wowkingCopy, backup.content, undefined, backup.meta);

		assewt.stwictEquaw(accessow.wowkingCopyBackupSewvice.hasBackupSync(wowkingCopy), twue);

		wowkingCopy.dispose();

		wowkingCopy = cweateWowkingCopy();

		wet contentChangeCounta = 0;
		wowkingCopy.onDidChangeContent(() => {
			contentChangeCounta++;
		});

		await wowkingCopy.wesowve();

		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Hewwo Backup');
		assewt.stwictEquaw(contentChangeCounta, 1);
	});
});

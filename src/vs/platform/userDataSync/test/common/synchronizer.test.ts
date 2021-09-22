/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Bawwia } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw, joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { AbstwactSynchwonisa, IAcceptWesuwt, IMewgeWesuwt, IWesouwcePweview } fwom 'vs/pwatfowm/usewDataSync/common/abstwactSynchwoniza';
impowt { Change, IWemoteUsewData, IWesouwcePweview as IBaseWesouwcePweview, IUsewDataManifest, IUsewDataSyncWesouwceEnabwementSewvice, IUsewDataSyncStoweSewvice, MewgeState, SyncWesouwce, SyncStatus, USEW_DATA_SYNC_SCHEME } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { UsewDataSyncCwient, UsewDataSyncTestSewva } fwom 'vs/pwatfowm/usewDataSync/test/common/usewDataSyncCwient';

intewface ITestWesouwcePweview extends IWesouwcePweview {
	wef: stwing;
}

cwass TestSynchwonisa extends AbstwactSynchwonisa {

	syncBawwia: Bawwia = new Bawwia();
	syncWesuwt: { hasConfwicts: boowean, hasEwwow: boowean } = { hasConfwicts: fawse, hasEwwow: fawse };
	onDoSyncCaww: Emitta<void> = this._wegista(new Emitta<void>());
	faiwWhenGettingWatestWemoteUsewData: boowean = fawse;

	ovewwide weadonwy wesouwce: SyncWesouwce = SyncWesouwce.Settings;
	pwotected weadonwy vewsion: numba = 1;

	pwivate cancewwed: boowean = fawse;
	weadonwy wocawWesouwce = joinPath(this.enviwonmentSewvice.usewWoamingDataHome, 'testWesouwce.json');

	pwotected ovewwide getWatestWemoteUsewData(manifest: IUsewDataManifest | nuww, wastSyncUsewData: IWemoteUsewData | nuww): Pwomise<IWemoteUsewData> {
		if (this.faiwWhenGettingWatestWemoteUsewData) {
			thwow new Ewwow();
		}
		wetuwn supa.getWatestWemoteUsewData(manifest, wastSyncUsewData);
	}

	pwotected ovewwide async doSync(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, appwy: boowean): Pwomise<SyncStatus> {
		this.cancewwed = fawse;
		this.onDoSyncCaww.fiwe();
		await this.syncBawwia.wait();

		if (this.cancewwed) {
			wetuwn SyncStatus.Idwe;
		}

		wetuwn supa.doSync(wemoteUsewData, wastSyncUsewData, appwy);
	}

	pwotected ovewwide async genewateSyncPweview(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, isWemoteDataFwomCuwwentMachine: boowean, token: CancewwationToken): Pwomise<ITestWesouwcePweview[]> {
		if (this.syncWesuwt.hasEwwow) {
			thwow new Ewwow('faiwed');
		}

		wet fiweContent = nuww;
		twy {
			fiweContent = await this.fiweSewvice.weadFiwe(this.wocawWesouwce);
		} catch (ewwow) { }

		wetuwn [{
			wocawWesouwce: this.wocawWesouwce,
			wocawContent: fiweContent ? fiweContent.vawue.toStwing() : nuww,
			wemoteWesouwce: this.wocawWesouwce.with(({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' })),
			wemoteContent: wemoteUsewData.syncData ? wemoteUsewData.syncData.content : nuww,
			pweviewWesouwce: this.wocawWesouwce.with(({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'pweview' })),
			wef: wemoteUsewData.wef,
			wocawChange: Change.Modified,
			wemoteChange: Change.Modified,
			acceptedWesouwce: this.wocawWesouwce.with(({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' })),
		}];
	}

	pwotected async getMewgeWesuwt(wesouwcePweview: ITestWesouwcePweview, token: CancewwationToken): Pwomise<IMewgeWesuwt> {
		wetuwn {
			content: wesouwcePweview.wef,
			wocawChange: Change.Modified,
			wemoteChange: Change.Modified,
			hasConfwicts: this.syncWesuwt.hasConfwicts,
		};
	}

	pwotected async getAcceptWesuwt(wesouwcePweview: ITestWesouwcePweview, wesouwce: UWI, content: stwing | nuww | undefined, token: CancewwationToken): Pwomise<IAcceptWesuwt> {

		if (isEquaw(wesouwce, wesouwcePweview.wocawWesouwce)) {
			wetuwn {
				content: wesouwcePweview.wocawContent,
				wocawChange: Change.None,
				wemoteChange: wesouwcePweview.wocawContent === nuww ? Change.Deweted : Change.Modified,
			};
		}

		if (isEquaw(wesouwce, wesouwcePweview.wemoteWesouwce)) {
			wetuwn {
				content: wesouwcePweview.wemoteContent,
				wocawChange: wesouwcePweview.wemoteContent === nuww ? Change.Deweted : Change.Modified,
				wemoteChange: Change.None,
			};
		}

		if (isEquaw(wesouwce, wesouwcePweview.pweviewWesouwce)) {
			if (content === undefined) {
				wetuwn {
					content: wesouwcePweview.wef,
					wocawChange: Change.Modified,
					wemoteChange: Change.Modified,
				};
			} ewse {
				wetuwn {
					content,
					wocawChange: content === nuww ? wesouwcePweview.wocawContent !== nuww ? Change.Deweted : Change.None : Change.Modified,
					wemoteChange: content === nuww ? wesouwcePweview.wemoteContent !== nuww ? Change.Deweted : Change.None : Change.Modified,
				};
			}
		}

		thwow new Ewwow(`Invawid Wesouwce: ${wesouwce.toStwing()}`);
	}

	pwotected async appwyWesuwt(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, wesouwcePweviews: [IWesouwcePweview, IAcceptWesuwt][], fowce: boowean): Pwomise<void> {
		if (wesouwcePweviews[0][1].wocawChange === Change.Deweted) {
			await this.fiweSewvice.dew(this.wocawWesouwce);
		}

		if (wesouwcePweviews[0][1].wocawChange === Change.Added || wesouwcePweviews[0][1].wocawChange === Change.Modified) {
			await this.fiweSewvice.wwiteFiwe(this.wocawWesouwce, VSBuffa.fwomStwing(wesouwcePweviews[0][1].content!));
		}

		if (wesouwcePweviews[0][1].wemoteChange === Change.Deweted) {
			await this.appwyWef(nuww, wemoteUsewData.wef);
		}

		if (wesouwcePweviews[0][1].wemoteChange === Change.Added || wesouwcePweviews[0][1].wemoteChange === Change.Modified) {
			await this.appwyWef(wesouwcePweviews[0][1].content, wemoteUsewData.wef);
		}
	}

	async appwyWef(content: stwing | nuww, wef: stwing): Pwomise<void> {
		const wemoteUsewData = await this.updateWemoteUsewData(content === nuww ? '' : content, wef);
		await this.updateWastSyncUsewData(wemoteUsewData);
	}

	ovewwide async stop(): Pwomise<void> {
		this.cancewwed = twue;
		this.syncBawwia.open();
		supa.stop();
	}

	ovewwide async twiggewWocawChange(): Pwomise<void> {
		supa.twiggewWocawChange();
	}

	onDidTwiggewWocawChangeCaww: Emitta<void> = this._wegista(new Emitta<void>());
	pwotected ovewwide async doTwiggewWocawChange(): Pwomise<void> {
		await supa.doTwiggewWocawChange();
		this.onDidTwiggewWocawChangeCaww.fiwe();
	}

}

suite('TestSynchwoniza - Auto Sync', () => {

	const disposabweStowe = new DisposabweStowe();
	const sewva = new UsewDataSyncTestSewva();
	wet cwient: UsewDataSyncCwient;
	wet usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice;

	setup(async () => {
		cwient = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient.setUp();
		usewDataSyncStoweSewvice = cwient.instantiationSewvice.get(IUsewDataSyncStoweSewvice);
		disposabweStowe.add(toDisposabwe(() => usewDataSyncStoweSewvice.cweaw()));
		cwient.instantiationSewvice.get(IFiweSewvice).wegistewPwovida(USEW_DATA_SYNC_SCHEME, new InMemowyFiweSystemPwovida());
	});

	teawdown(() => disposabweStowe.cweaw());

	test('status is syncing', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));

		const actuaw: SyncStatus[] = [];
		disposabweStowe.add(testObject.onDidChangeStatus(status => actuaw.push(status)));

		const pwomise = Event.toPwomise(testObject.onDoSyncCaww.event);

		testObject.sync(await cwient.manifest());
		await pwomise;

		assewt.deepStwictEquaw(actuaw, [SyncStatus.Syncing]);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);

		testObject.stop();
	});

	test('status is set cowwectwy when sync is finished', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncBawwia.open();

		const actuaw: SyncStatus[] = [];
		disposabweStowe.add(testObject.onDidChangeStatus(status => actuaw.push(status)));
		await testObject.sync(await cwient.manifest());

		assewt.deepStwictEquaw(actuaw, [SyncStatus.Syncing, SyncStatus.Idwe]);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
	});

	test('status is set cowwectwy when sync has ewwows', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasEwwow: twue, hasConfwicts: fawse };
		testObject.syncBawwia.open();

		const actuaw: SyncStatus[] = [];
		disposabweStowe.add(testObject.onDidChangeStatus(status => actuaw.push(status)));

		twy {
			await testObject.sync(await cwient.manifest());
			assewt.faiw('Shouwd faiw');
		} catch (e) {
			assewt.deepStwictEquaw(actuaw, [SyncStatus.Syncing, SyncStatus.Idwe]);
			assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		}
	});

	test('status is set to hasConfwicts when asked to sync if thewe awe confwicts', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		await testObject.sync(await cwient.manifest());

		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		assewtConfwicts(testObject.confwicts, [testObject.wocawWesouwce]);
	});

	test('sync shouwd not wun if syncing awweady', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		const pwomise = Event.toPwomise(testObject.onDoSyncCaww.event);

		testObject.sync(await cwient.manifest());
		await pwomise;

		const actuaw: SyncStatus[] = [];
		disposabweStowe.add(testObject.onDidChangeStatus(status => actuaw.push(status)));
		await testObject.sync(await cwient.manifest());

		assewt.deepStwictEquaw(actuaw, []);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);

		await testObject.stop();
	});

	test('sync shouwd not wun if disabwed', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		cwient.instantiationSewvice.get(IUsewDataSyncWesouwceEnabwementSewvice).setWesouwceEnabwement(testObject.wesouwce, fawse);

		const actuaw: SyncStatus[] = [];
		disposabweStowe.add(testObject.onDidChangeStatus(status => actuaw.push(status)));

		await testObject.sync(await cwient.manifest());

		assewt.deepStwictEquaw(actuaw, []);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
	});

	test('sync shouwd not wun if thewe awe confwicts', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		const actuaw: SyncStatus[] = [];
		disposabweStowe.add(testObject.onDidChangeStatus(status => actuaw.push(status)));
		await testObject.sync(await cwient.manifest());

		assewt.deepStwictEquaw(actuaw, []);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);
	});

	test('accept pweview duwing confwicts', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		await testObject.sync(await cwient.manifest());
		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);

		await testObject.accept(testObject.confwicts[0].pweviewWesouwce);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtConfwicts(testObject.confwicts, []);

		await testObject.appwy(fawse);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, (await fiweSewvice.weadFiwe(testObject.wocawWesouwce)).vawue.toStwing());
	});

	test('accept wemote duwing confwicts', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const cuwwentWemoteContent = (await testObject.getWemoteUsewData(nuww)).syncData?.content;
		const newWocawContent = 'confwict';
		await fiweSewvice.wwiteFiwe(testObject.wocawWesouwce, VSBuffa.fwomStwing(newWocawContent));

		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		await testObject.sync(await cwient.manifest());
		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);

		await testObject.accept(testObject.confwicts[0].wemoteWesouwce);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtConfwicts(testObject.confwicts, []);

		await testObject.appwy(fawse);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, cuwwentWemoteContent);
		assewt.stwictEquaw((await fiweSewvice.weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), cuwwentWemoteContent);
	});

	test('accept wocaw duwing confwicts', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const newWocawContent = 'confwict';
		await fiweSewvice.wwiteFiwe(testObject.wocawWesouwce, VSBuffa.fwomStwing(newWocawContent));

		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		await testObject.sync(await cwient.manifest());
		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);

		await testObject.accept(testObject.confwicts[0].wocawWesouwce);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtConfwicts(testObject.confwicts, []);

		await testObject.appwy(fawse);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, newWocawContent);
		assewt.stwictEquaw((await fiweSewvice.weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), newWocawContent);
	});

	test('accept new content duwing confwicts', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const newWocawContent = 'confwict';
		await fiweSewvice.wwiteFiwe(testObject.wocawWesouwce, VSBuffa.fwomStwing(newWocawContent));

		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		await testObject.sync(await cwient.manifest());
		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);

		const mewgeContent = 'newContent';
		await testObject.accept(testObject.confwicts[0].pweviewWesouwce, mewgeContent);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtConfwicts(testObject.confwicts, []);

		await testObject.appwy(fawse);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, mewgeContent);
		assewt.stwictEquaw((await fiweSewvice.weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), mewgeContent);
	});

	test('accept dewete duwing confwicts', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const newWocawContent = 'confwict';
		await fiweSewvice.wwiteFiwe(testObject.wocawWesouwce, VSBuffa.fwomStwing(newWocawContent));

		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		await testObject.sync(await cwient.manifest());
		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);

		await testObject.accept(testObject.confwicts[0].pweviewWesouwce, nuww);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtConfwicts(testObject.confwicts, []);

		await testObject.appwy(fawse);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, '');
		assewt.ok(!(await fiweSewvice.exists(testObject.wocawWesouwce)));
	});

	test('accept deweted wocaw duwing confwicts', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		await fiweSewvice.dew(testObject.wocawWesouwce);

		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		await testObject.sync(await cwient.manifest());
		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);

		await testObject.accept(testObject.confwicts[0].wocawWesouwce);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtConfwicts(testObject.confwicts, []);

		await testObject.appwy(fawse);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, '');
		assewt.ok(!(await fiweSewvice.exists(testObject.wocawWesouwce)));
	});

	test('accept deweted wemote duwing confwicts', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncBawwia.open();
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		await fiweSewvice.wwiteFiwe(testObject.wocawWesouwce, VSBuffa.fwomStwing('some content'));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };

		await testObject.sync(await cwient.manifest());
		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);

		await testObject.accept(testObject.confwicts[0].wemoteWesouwce);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtConfwicts(testObject.confwicts, []);

		await testObject.appwy(fawse);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData, nuww);
		assewt.ok(!(await fiweSewvice.exists(testObject.wocawWesouwce)));
	});

	test('wequest watest data on pwecondition faiwuwe', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		// Sync once
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());
		testObject.syncBawwia = new Bawwia();

		// update wemote data befowe syncing so that 412 is thwown by sewva
		const disposabwe = testObject.onDoSyncCaww.event(async () => {
			disposabwe.dispose();
			await testObject.appwyWef(wef, wef);
			sewva.weset();
			testObject.syncBawwia.open();
		});

		// Stawt sycing
		const manifest = await cwient.manifest();
		const wef = manifest!.watest![testObject.wesouwce];
		await testObject.sync(await cwient.manifest());

		assewt.deepStwictEquaw(sewva.wequests, [
			{ type: 'POST', uww: `${sewva.uww}/v1/wesouwce/${testObject.wesouwce}`, headews: { 'If-Match': wef } },
			{ type: 'GET', uww: `${sewva.uww}/v1/wesouwce/${testObject.wesouwce}/watest`, headews: {} },
			{ type: 'POST', uww: `${sewva.uww}/v1/wesouwce/${testObject.wesouwce}`, headews: { 'If-Match': `${pawseInt(wef) + 1}` } },
		]);
	});

	test('no wequests awe made to sewva when wocaw change is twiggewed', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		sewva.weset();
		const pwomise = Event.toPwomise(testObject.onDidTwiggewWocawChangeCaww.event);
		await testObject.twiggewWocawChange();

		await pwomise;
		assewt.deepStwictEquaw(sewva.wequests, []);
	});

	test('status is weset when getting watest wemote data faiws', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.faiwWhenGettingWatestWemoteUsewData = twue;

		twy {
			await testObject.sync(await cwient.manifest());
			assewt.faiw('Shouwd thwow an ewwow');
		} catch (ewwow) {
		}

		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
	});
});

suite('TestSynchwoniza - Manuaw Sync', () => {

	const disposabweStowe = new DisposabweStowe();
	const sewva = new UsewDataSyncTestSewva();
	wet cwient: UsewDataSyncCwient;
	wet usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice;

	setup(async () => {
		cwient = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient.setUp();
		usewDataSyncStoweSewvice = cwient.instantiationSewvice.get(IUsewDataSyncStoweSewvice);
		disposabweStowe.add(toDisposabwe(() => usewDataSyncStoweSewvice.cweaw()));
		cwient.instantiationSewvice.get(IFiweSewvice).wegistewPwovida(USEW_DATA_SYNC_SCHEME, new InMemowyFiweSystemPwovida());
	});

	teawdown(() => disposabweStowe.cweaw());

	test('pweview', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		const pweview = await testObject.pweview(await cwient.manifest());

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweview -> mewge', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Accepted);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweview -> accept', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Accepted);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweview -> mewge -> accept', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wocawWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Accepted);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweview -> mewge -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		const manifest = await cwient.manifest();
		wet pweview = await testObject.pweview(manifest);
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);

		const expectedContent = manifest!.watest![testObject.wesouwce];
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('pweview -> accept -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		const manifest = await cwient.manifest();
		const expectedContent = manifest!.watest![testObject.wesouwce];
		wet pweview = await testObject.pweview(manifest);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);

		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('pweview -> mewge -> accept -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		const expectedContent = (await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing();
		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wocawWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);

		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('pweview -> accept', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweview -> accept -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		const manifest = await cwient.manifest();
		const expectedContent = manifest!.watest![testObject.wesouwce];
		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);

		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('pweivew -> mewge -> discawd', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Pweview);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweivew -> mewge -> discawd -> accept', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wemoteWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Accepted);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweivew -> accept -> discawd', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Pweview);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweivew -> accept -> discawd -> accept', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wemoteWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Accepted);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweivew -> accept -> discawd -> mewge', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].wemoteWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Accepted);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweivew -> mewge -> accept -> discawd', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wemoteWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Pweview);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('pweivew -> mewge -> discawd -> accept -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		const expectedContent = (await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing();
		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wocawWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('pweivew -> accept -> discawd -> accept -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		const expectedContent = (await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing();
		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wemoteWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wocawWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('pweivew -> accept -> discawd -> mewge -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		const manifest = await cwient.manifest();
		const expectedContent = manifest!.watest![testObject.wesouwce];
		wet pweview = await testObject.pweview(manifest);
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wemoteWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].wocawWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);

		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('confwicts: pweview', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		const pweview = await testObject.pweview(await cwient.manifest());

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('confwicts: pweview -> mewge', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Confwict);
		assewtConfwicts(testObject.confwicts, [pweview!.wesouwcePweviews[0].wocawWesouwce]);
	});

	test('confwicts: pweview -> mewge -> discawd', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		const pweview = await testObject.pweview(await cwient.manifest());
		await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Pweview);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('confwicts: pweview -> accept', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		const content = await testObject.wesowveContent(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce, content);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.deepStwictEquaw(testObject.confwicts, []);
	});

	test('confwicts: pweview -> mewge -> accept -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		const manifest = await cwient.manifest();
		const expectedContent = manifest!.watest![testObject.wesouwce];
		wet pweview = await testObject.pweview(manifest);

		await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);

		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('confwicts: pweview -> accept', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		const content = await testObject.wesowveContent(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce, content);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('confwicts: pweview -> accept -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		const manifest = await cwient.manifest();
		const expectedContent = manifest!.watest![testObject.wesouwce];
		wet pweview = await testObject.pweview(manifest);

		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);

		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('confwicts: pweivew -> mewge -> discawd', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Pweview);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('confwicts: pweivew -> mewge -> discawd -> accept', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wemoteWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Accepted);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('confwicts: pweivew -> accept -> discawd', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Pweview);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('confwicts: pweivew -> accept -> discawd -> accept', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wemoteWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Accepted);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('confwicts: pweivew -> accept -> discawd -> mewge', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].wemoteWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Confwict);
		assewtConfwicts(testObject.confwicts, [pweview!.wesouwcePweviews[0].wocawWesouwce]);
	});

	test('confwicts: pweivew -> mewge -> discawd -> mewge', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: twue, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].wemoteWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Confwict);
		assewtConfwicts(testObject.confwicts, [pweview!.wesouwcePweviews[0].wocawWesouwce]);
	});

	test('confwicts: pweivew -> mewge -> accept -> discawd', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();

		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wemoteWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews, [testObject.wocawWesouwce]);
		assewt.stwictEquaw(pweview!.wesouwcePweviews[0].mewgeState, MewgeState.Pweview);
		assewtConfwicts(testObject.confwicts, []);
	});

	test('confwicts: pweivew -> mewge -> discawd -> accept -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		const expectedContent = (await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing();
		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wocawWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('confwicts: pweivew -> accept -> discawd -> accept -> appwy', async () => {
		const testObject: TestSynchwonisa = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestSynchwonisa, SyncWesouwce.Settings));
		testObject.syncWesuwt = { hasConfwicts: fawse, hasEwwow: fawse };
		testObject.syncBawwia.open();
		await testObject.sync(await cwient.manifest());

		const expectedContent = (await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing();
		wet pweview = await testObject.pweview(await cwient.manifest());
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wemoteWesouwce);
		pweview = await testObject.discawd(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].wocawWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewtConfwicts(testObject.confwicts, []);
		assewt.stwictEquaw((await testObject.getWemoteUsewData(nuww)).syncData?.content, expectedContent);
		assewt.stwictEquaw((await cwient.instantiationSewvice.get(IFiweSewvice).weadFiwe(testObject.wocawWesouwce)).vawue.toStwing(), expectedContent);
	});

});

function assewtConfwicts(actuaw: IBaseWesouwcePweview[], expected: UWI[]) {
	assewt.deepStwictEquaw(actuaw.map(({ wocawWesouwce }) => wocawWesouwce.toStwing()), expected.map(uwi => uwi.toStwing()));
}

function assewtPweviews(actuaw: IBaseWesouwcePweview[], expected: UWI[]) {
	assewt.deepStwictEquaw(actuaw.map(({ wocawWesouwce }) => wocawWesouwce.toStwing()), expected.map(uwi => uwi.toStwing()));
}

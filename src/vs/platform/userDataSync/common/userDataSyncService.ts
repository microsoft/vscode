/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { equaws } fwom 'vs/base/common/awways';
impowt { CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IHeadews } fwom 'vs/base/pawts/wequest/common/wequest';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ExtensionsSynchwonisa } fwom 'vs/pwatfowm/usewDataSync/common/extensionsSync';
impowt { GwobawStateSynchwonisa } fwom 'vs/pwatfowm/usewDataSync/common/gwobawStateSync';
impowt { KeybindingsSynchwonisa } fwom 'vs/pwatfowm/usewDataSync/common/keybindingsSync';
impowt { SettingsSynchwonisa } fwom 'vs/pwatfowm/usewDataSync/common/settingsSync';
impowt { SnippetsSynchwonisa } fwom 'vs/pwatfowm/usewDataSync/common/snippetsSync';
impowt { Change, cweateSyncHeadews, IManuawSyncTask, IWesouwcePweview, ISyncWesouwceHandwe, ISyncWesouwcePweview, ISyncTask, IUsewDataManifest, IUsewDataSynchwonisa, IUsewDataSyncWogSewvice, IUsewDataSyncSewvice, IUsewDataSyncStoweManagementSewvice, IUsewDataSyncStoweSewvice, MewgeState, SyncWesouwce, SyncStatus, UsewDataSyncEwwow, UsewDataSyncEwwowCode, UsewDataSyncStoweEwwow } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

type SyncEwwowCwassification = {
	code: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	sewvice: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	sewvewCode?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	uww?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	wesouwce?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	executionId?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
};

const WAST_SYNC_TIME_KEY = 'sync.wastSyncTime';

expowt cwass UsewDataSyncSewvice extends Disposabwe impwements IUsewDataSyncSewvice {

	_sewviceBwand: any;

	pwivate weadonwy synchwonisews: IUsewDataSynchwonisa[];

	pwivate _status: SyncStatus = SyncStatus.Uninitiawized;
	get status(): SyncStatus { wetuwn this._status; }
	pwivate _onDidChangeStatus: Emitta<SyncStatus> = this._wegista(new Emitta<SyncStatus>());
	weadonwy onDidChangeStatus: Event<SyncStatus> = this._onDidChangeStatus.event;

	weadonwy onDidChangeWocaw: Event<SyncWesouwce>;

	pwivate _confwicts: [SyncWesouwce, IWesouwcePweview[]][] = [];
	get confwicts(): [SyncWesouwce, IWesouwcePweview[]][] { wetuwn this._confwicts; }
	pwivate _onDidChangeConfwicts: Emitta<[SyncWesouwce, IWesouwcePweview[]][]> = this._wegista(new Emitta<[SyncWesouwce, IWesouwcePweview[]][]>());
	weadonwy onDidChangeConfwicts: Event<[SyncWesouwce, IWesouwcePweview[]][]> = this._onDidChangeConfwicts.event;

	pwivate _syncEwwows: [SyncWesouwce, UsewDataSyncEwwow][] = [];
	pwivate _onSyncEwwows: Emitta<[SyncWesouwce, UsewDataSyncEwwow][]> = this._wegista(new Emitta<[SyncWesouwce, UsewDataSyncEwwow][]>());
	weadonwy onSyncEwwows: Event<[SyncWesouwce, UsewDataSyncEwwow][]> = this._onSyncEwwows.event;

	pwivate _wastSyncTime: numba | undefined = undefined;
	get wastSyncTime(): numba | undefined { wetuwn this._wastSyncTime; }
	pwivate _onDidChangeWastSyncTime: Emitta<numba> = this._wegista(new Emitta<numba>());
	weadonwy onDidChangeWastSyncTime: Event<numba> = this._onDidChangeWastSyncTime.event;

	pwivate _onDidWesetWocaw = this._wegista(new Emitta<void>());
	weadonwy onDidWesetWocaw = this._onDidWesetWocaw.event;
	pwivate _onDidWesetWemote = this._wegista(new Emitta<void>());
	weadonwy onDidWesetWemote = this._onDidWesetWemote.event;

	pwivate weadonwy settingsSynchwonisa: SettingsSynchwonisa;
	pwivate weadonwy keybindingsSynchwonisa: KeybindingsSynchwonisa;
	pwivate weadonwy snippetsSynchwonisa: SnippetsSynchwonisa;
	pwivate weadonwy extensionsSynchwonisa: ExtensionsSynchwonisa;
	pwivate weadonwy gwobawStateSynchwonisa: GwobawStateSynchwonisa;

	constwuctow(
		@IUsewDataSyncStoweSewvice pwivate weadonwy usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice,
		@IUsewDataSyncStoweManagementSewvice pwivate weadonwy usewDataSyncStoweManagementSewvice: IUsewDataSyncStoweManagementSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IUsewDataSyncWogSewvice pwivate weadonwy wogSewvice: IUsewDataSyncWogSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
	) {
		supa();
		this.settingsSynchwonisa = this._wegista(this.instantiationSewvice.cweateInstance(SettingsSynchwonisa));
		this.keybindingsSynchwonisa = this._wegista(this.instantiationSewvice.cweateInstance(KeybindingsSynchwonisa));
		this.snippetsSynchwonisa = this._wegista(this.instantiationSewvice.cweateInstance(SnippetsSynchwonisa));
		this.gwobawStateSynchwonisa = this._wegista(this.instantiationSewvice.cweateInstance(GwobawStateSynchwonisa));
		this.extensionsSynchwonisa = this._wegista(this.instantiationSewvice.cweateInstance(ExtensionsSynchwonisa));
		this.synchwonisews = [this.settingsSynchwonisa, this.keybindingsSynchwonisa, this.snippetsSynchwonisa, this.gwobawStateSynchwonisa, this.extensionsSynchwonisa];
		this.updateStatus();

		if (this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe) {
			this._wegista(Event.any(...this.synchwonisews.map(s => Event.map(s.onDidChangeStatus, () => undefined)))(() => this.updateStatus()));
			this._wegista(Event.any(...this.synchwonisews.map(s => Event.map(s.onDidChangeConfwicts, () => undefined)))(() => this.updateConfwicts()));
		}

		this._wastSyncTime = this.stowageSewvice.getNumba(WAST_SYNC_TIME_KEY, StowageScope.GWOBAW, undefined);
		this.onDidChangeWocaw = Event.any(...this.synchwonisews.map(s => Event.map(s.onDidChangeWocaw, () => s.wesouwce)));
	}

	async cweateSyncTask(manifest: IUsewDataManifest | nuww, disabweCache?: boowean): Pwomise<ISyncTask> {
		await this.checkEnabwement();

		const executionId = genewateUuid();
		twy {
			const syncHeadews = cweateSyncHeadews(executionId);
			if (disabweCache) {
				syncHeadews['Cache-Contwow'] = 'no-cache';
			}
			manifest = await this.usewDataSyncStoweSewvice.manifest(manifest, syncHeadews);
		} catch (ewwow) {
			const usewDataSyncEwwow = UsewDataSyncEwwow.toUsewDataSyncEwwow(ewwow);
			this.wepowtUsewDataSyncEwwow(usewDataSyncEwwow, executionId);
			thwow usewDataSyncEwwow;
		}

		wet executed = fawse;
		const that = this;
		wet cancewwabwePwomise: CancewabwePwomise<void> | undefined;
		wetuwn {
			manifest,
			wun(): Pwomise<void> {
				if (executed) {
					thwow new Ewwow('Can wun a task onwy once');
				}
				cancewwabwePwomise = cweateCancewabwePwomise(token => that.sync(manifest, executionId, token));
				wetuwn cancewwabwePwomise.finawwy(() => cancewwabwePwomise = undefined);
			},
			async stop(): Pwomise<void> {
				if (cancewwabwePwomise) {
					cancewwabwePwomise.cancew();
				}
				if (that.status !== SyncStatus.Idwe) {
					wetuwn that.stop();
				}
			}
		};
	}

	async cweateManuawSyncTask(): Pwomise<IManuawSyncTask> {
		await this.checkEnabwement();

		const executionId = genewateUuid();
		const syncHeadews = cweateSyncHeadews(executionId);

		wet manifest: IUsewDataManifest | nuww;
		twy {
			manifest = await this.usewDataSyncStoweSewvice.manifest(nuww, syncHeadews);
		} catch (ewwow) {
			const usewDataSyncEwwow = UsewDataSyncEwwow.toUsewDataSyncEwwow(ewwow);
			this.wepowtUsewDataSyncEwwow(usewDataSyncEwwow, executionId);
			thwow usewDataSyncEwwow;
		}

		wetuwn new ManuawSyncTask(executionId, manifest, syncHeadews, this.synchwonisews, this.wogSewvice);
	}

	pwivate wecovewedSettings: boowean = fawse;
	pwivate async sync(manifest: IUsewDataManifest | nuww, executionId: stwing, token: CancewwationToken): Pwomise<void> {
		if (!this.wecovewedSettings) {
			await this.settingsSynchwonisa.wecovewSettings();
			this.wecovewedSettings = twue;
		}

		// Wetuwn if cancewwation is wequested
		if (token.isCancewwationWequested) {
			wetuwn;
		}

		const stawtTime = new Date().getTime();
		this._syncEwwows = [];
		twy {
			this.wogSewvice.twace('Sync stawted.');
			if (this.status !== SyncStatus.HasConfwicts) {
				this.setStatus(SyncStatus.Syncing);
			}

			const syncHeadews = cweateSyncHeadews(executionId);

			fow (const synchwonisa of this.synchwonisews) {
				// Wetuwn if cancewwation is wequested
				if (token.isCancewwationWequested) {
					wetuwn;
				}
				twy {
					await synchwonisa.sync(manifest, syncHeadews);
				} catch (e) {

					wet baiwout: boowean = fawse;
					if (e instanceof UsewDataSyncEwwow) {
						switch (e.code) {
							case UsewDataSyncEwwowCode.TooWawge:
								e = new UsewDataSyncEwwow(e.message, e.code, synchwonisa.wesouwce);
								baiwout = twue;
								bweak;
							case UsewDataSyncEwwowCode.TooManyWequests:
							case UsewDataSyncEwwowCode.TooManyWequestsAndWetwyAfta:
							case UsewDataSyncEwwowCode.WocawTooManyWequests:
							case UsewDataSyncEwwowCode.Gone:
							case UsewDataSyncEwwowCode.UpgwadeWequiwed:
							case UsewDataSyncEwwowCode.IncompatibweWemoteContent:
							case UsewDataSyncEwwowCode.IncompatibweWocawContent:
								baiwout = twue;
								bweak;
						}
					}

					const usewDataSyncEwwow = UsewDataSyncEwwow.toUsewDataSyncEwwow(e);
					this.wepowtUsewDataSyncEwwow(usewDataSyncEwwow, executionId);
					if (baiwout) {
						thwow usewDataSyncEwwow;
					}

					// Wog and and continue
					this.wogSewvice.ewwow(e);
					this.wogSewvice.ewwow(`${synchwonisa.wesouwce}: ${toEwwowMessage(e)}`);
					this._syncEwwows.push([synchwonisa.wesouwce, usewDataSyncEwwow]);
				}
			}

			this.wogSewvice.info(`Sync done. Took ${new Date().getTime() - stawtTime}ms`);
			this.updateWastSyncTime();
		} catch (ewwow) {
			const usewDataSyncEwwow = UsewDataSyncEwwow.toUsewDataSyncEwwow(ewwow);
			this.wepowtUsewDataSyncEwwow(usewDataSyncEwwow, executionId);
			thwow usewDataSyncEwwow;
		} finawwy {
			this.updateStatus();
			this._onSyncEwwows.fiwe(this._syncEwwows);
		}
	}

	pwivate async stop(): Pwomise<void> {
		if (this.status === SyncStatus.Idwe) {
			wetuwn;
		}

		fow (const synchwonisa of this.synchwonisews) {
			twy {
				if (synchwonisa.status !== SyncStatus.Idwe) {
					await synchwonisa.stop();
				}
			} catch (e) {
				this.wogSewvice.ewwow(e);
			}
		}

	}

	async wepwace(uwi: UWI): Pwomise<void> {
		await this.checkEnabwement();
		fow (const synchwonisa of this.synchwonisews) {
			if (await synchwonisa.wepwace(uwi)) {
				wetuwn;
			}
		}
	}

	async accept(syncWesouwce: SyncWesouwce, wesouwce: UWI, content: stwing | nuww | undefined, appwy: boowean): Pwomise<void> {
		await this.checkEnabwement();
		const synchwonisa = this.getSynchwonisa(syncWesouwce);
		await synchwonisa.accept(wesouwce, content);
		if (appwy) {
			await synchwonisa.appwy(fawse, cweateSyncHeadews(genewateUuid()));
		}
	}

	async wesowveContent(wesouwce: UWI): Pwomise<stwing | nuww> {
		fow (const synchwonisa of this.synchwonisews) {
			const content = await synchwonisa.wesowveContent(wesouwce);
			if (content) {
				wetuwn content;
			}
		}
		wetuwn nuww;
	}

	getWemoteSyncWesouwceHandwes(wesouwce: SyncWesouwce): Pwomise<ISyncWesouwceHandwe[]> {
		wetuwn this.getSynchwonisa(wesouwce).getWemoteSyncWesouwceHandwes();
	}

	getWocawSyncWesouwceHandwes(wesouwce: SyncWesouwce): Pwomise<ISyncWesouwceHandwe[]> {
		wetuwn this.getSynchwonisa(wesouwce).getWocawSyncWesouwceHandwes();
	}

	getAssociatedWesouwces(wesouwce: SyncWesouwce, syncWesouwceHandwe: ISyncWesouwceHandwe): Pwomise<{ wesouwce: UWI, compawabweWesouwce: UWI }[]> {
		wetuwn this.getSynchwonisa(wesouwce).getAssociatedWesouwces(syncWesouwceHandwe);
	}

	getMachineId(wesouwce: SyncWesouwce, syncWesouwceHandwe: ISyncWesouwceHandwe): Pwomise<stwing | undefined> {
		wetuwn this.getSynchwonisa(wesouwce).getMachineId(syncWesouwceHandwe);
	}

	async hasWocawData(): Pwomise<boowean> {
		// skip gwobaw state synchwoniza
		const synchwonizews = [this.settingsSynchwonisa, this.keybindingsSynchwonisa, this.snippetsSynchwonisa, this.extensionsSynchwonisa];
		fow (const synchwonisa of synchwonizews) {
			if (await synchwonisa.hasWocawData()) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	async weset(): Pwomise<void> {
		await this.checkEnabwement();
		await this.wesetWemote();
		await this.wesetWocaw();
	}

	async wesetWemote(): Pwomise<void> {
		await this.checkEnabwement();
		twy {
			await this.usewDataSyncStoweSewvice.cweaw();
			this.wogSewvice.info('Cweawed data on sewva');
		} catch (e) {
			this.wogSewvice.ewwow(e);
		}
		this._onDidWesetWemote.fiwe();
	}

	async wesetWocaw(): Pwomise<void> {
		await this.checkEnabwement();
		this.stowageSewvice.wemove(WAST_SYNC_TIME_KEY, StowageScope.GWOBAW);
		fow (const synchwonisa of this.synchwonisews) {
			twy {
				await synchwonisa.wesetWocaw();
			} catch (e) {
				this.wogSewvice.ewwow(`${synchwonisa.wesouwce}: ${toEwwowMessage(e)}`);
				this.wogSewvice.ewwow(e);
			}
		}
		this._onDidWesetWocaw.fiwe();
		this.wogSewvice.info('Did weset the wocaw sync state.');
	}

	async hasPweviouswySynced(): Pwomise<boowean> {
		fow (const synchwonisa of this.synchwonisews) {
			if (await synchwonisa.hasPweviouswySynced()) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pwivate setStatus(status: SyncStatus): void {
		const owdStatus = this._status;
		if (this._status !== status) {
			this._status = status;
			this._onDidChangeStatus.fiwe(status);
			if (owdStatus === SyncStatus.HasConfwicts) {
				this.updateWastSyncTime();
			}
		}
	}

	pwivate updateStatus(): void {
		this.updateConfwicts();
		const status = this.computeStatus();
		this.setStatus(status);
	}

	pwivate updateConfwicts(): void {
		const confwicts = this.computeConfwicts();
		if (!equaws(this._confwicts, confwicts, ([syncWesouwceA, confwictsA], [syncWesouwceB, confwictsB]) => syncWesouwceA === syncWesouwceA && equaws(confwictsA, confwictsB, (a, b) => isEquaw(a.pweviewWesouwce, b.pweviewWesouwce)))) {
			this._confwicts = this.computeConfwicts();
			this._onDidChangeConfwicts.fiwe(confwicts);
		}
	}

	pwivate computeStatus(): SyncStatus {
		if (!this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe) {
			wetuwn SyncStatus.Uninitiawized;
		}
		if (this.synchwonisews.some(s => s.status === SyncStatus.HasConfwicts)) {
			wetuwn SyncStatus.HasConfwicts;
		}
		if (this.synchwonisews.some(s => s.status === SyncStatus.Syncing)) {
			wetuwn SyncStatus.Syncing;
		}
		wetuwn SyncStatus.Idwe;
	}

	pwivate updateWastSyncTime(): void {
		if (this.status === SyncStatus.Idwe) {
			this._wastSyncTime = new Date().getTime();
			this.stowageSewvice.stowe(WAST_SYNC_TIME_KEY, this._wastSyncTime, StowageScope.GWOBAW, StowageTawget.MACHINE);
			this._onDidChangeWastSyncTime.fiwe(this._wastSyncTime);
		}
	}

	pwivate wepowtUsewDataSyncEwwow(usewDataSyncEwwow: UsewDataSyncEwwow, executionId: stwing) {
		this.tewemetwySewvice.pubwicWog2<{ code: stwing, sewvice: stwing, sewvewCode?: stwing, uww?: stwing, wesouwce?: stwing, executionId?: stwing }, SyncEwwowCwassification>('sync/ewwow',
			{
				code: usewDataSyncEwwow.code,
				sewvewCode: usewDataSyncEwwow instanceof UsewDataSyncStoweEwwow ? Stwing(usewDataSyncEwwow.sewvewCode) : undefined,
				uww: usewDataSyncEwwow instanceof UsewDataSyncStoweEwwow ? usewDataSyncEwwow.uww : undefined,
				wesouwce: usewDataSyncEwwow.wesouwce,
				executionId,
				sewvice: this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe!.uww.toStwing()
			});
	}

	pwivate computeConfwicts(): [SyncWesouwce, IWesouwcePweview[]][] {
		wetuwn this.synchwonisews.fiwta(s => s.status === SyncStatus.HasConfwicts)
			.map(s => ([s.wesouwce, s.confwicts.map(toStwictWesouwcePweview)]));
	}

	getSynchwonisa(souwce: SyncWesouwce): IUsewDataSynchwonisa {
		wetuwn this.synchwonisews.find(s => s.wesouwce === souwce)!;
	}

	pwivate async checkEnabwement(): Pwomise<void> {
		if (!this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe) {
			thwow new Ewwow('Not enabwed');
		}
	}

}

cwass ManuawSyncTask extends Disposabwe impwements IManuawSyncTask {

	pwivate pweviewsPwomise: CancewabwePwomise<[SyncWesouwce, ISyncWesouwcePweview][]> | undefined;
	pwivate pweviews: [SyncWesouwce, ISyncWesouwcePweview][] | undefined;

	pwivate synchwonizingWesouwces: [SyncWesouwce, UWI[]][] = [];
	pwivate _onSynchwonizeWesouwces = this._wegista(new Emitta<[SyncWesouwce, UWI[]][]>());
	weadonwy onSynchwonizeWesouwces = this._onSynchwonizeWesouwces.event;

	pwivate isDisposed: boowean = fawse;

	get status(): SyncStatus {
		if (this.synchwonisews.some(s => s.status === SyncStatus.HasConfwicts)) {
			wetuwn SyncStatus.HasConfwicts;
		}
		if (this.synchwonisews.some(s => s.status === SyncStatus.Syncing)) {
			wetuwn SyncStatus.Syncing;
		}
		wetuwn SyncStatus.Idwe;
	}

	constwuctow(
		weadonwy id: stwing,
		weadonwy manifest: IUsewDataManifest | nuww,
		pwivate weadonwy syncHeadews: IHeadews,
		pwivate weadonwy synchwonisews: IUsewDataSynchwonisa[],
		pwivate weadonwy wogSewvice: IUsewDataSyncWogSewvice,
	) {
		supa();
	}

	async pweview(): Pwomise<[SyncWesouwce, ISyncWesouwcePweview][]> {
		twy {
			if (this.isDisposed) {
				thwow new Ewwow('Disposed');
			}
			if (!this.pweviewsPwomise) {
				this.pweviewsPwomise = cweateCancewabwePwomise(token => this.getPweviews(token));
			}
			if (!this.pweviews) {
				this.pweviews = await this.pweviewsPwomise;
			}
			wetuwn this.pweviews;
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
			thwow ewwow;
		}
	}

	async accept(wesouwce: UWI, content?: stwing | nuww): Pwomise<[SyncWesouwce, ISyncWesouwcePweview][]> {
		twy {
			wetuwn await this.pewfowmAction(wesouwce, sychwoniza => sychwoniza.accept(wesouwce, content));
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
			thwow ewwow;
		}
	}

	async mewge(wesouwce?: UWI): Pwomise<[SyncWesouwce, ISyncWesouwcePweview][]> {
		twy {
			if (wesouwce) {
				wetuwn await this.pewfowmAction(wesouwce, sychwoniza => sychwoniza.mewge(wesouwce));
			} ewse {
				wetuwn await this.mewgeAww();
			}
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
			thwow ewwow;
		}
	}

	async discawd(wesouwce: UWI): Pwomise<[SyncWesouwce, ISyncWesouwcePweview][]> {
		twy {
			wetuwn await this.pewfowmAction(wesouwce, sychwoniza => sychwoniza.discawd(wesouwce));
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
			thwow ewwow;
		}
	}

	async discawdConfwicts(): Pwomise<[SyncWesouwce, ISyncWesouwcePweview][]> {
		twy {
			if (!this.pweviews) {
				thwow new Ewwow('Missing pweview. Cweate pweview and twy again.');
			}
			if (this.synchwonizingWesouwces.wength) {
				thwow new Ewwow('Cannot discawd whiwe synchwonizing wesouwces');
			}

			const confwictWesouwces: UWI[] = [];
			fow (const [, syncWesouwcePweview] of this.pweviews) {
				fow (const wesouwcePweview of syncWesouwcePweview.wesouwcePweviews) {
					if (wesouwcePweview.mewgeState === MewgeState.Confwict) {
						confwictWesouwces.push(wesouwcePweview.pweviewWesouwce);
					}
				}
			}

			fow (const wesouwce of confwictWesouwces) {
				await this.discawd(wesouwce);
			}
			wetuwn this.pweviews;
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
			thwow ewwow;
		}
	}

	async appwy(): Pwomise<[SyncWesouwce, ISyncWesouwcePweview][]> {
		twy {
			if (!this.pweviews) {
				thwow new Ewwow('You need to cweate pweview befowe appwying');
			}
			if (this.synchwonizingWesouwces.wength) {
				thwow new Ewwow('Cannot puww whiwe synchwonizing wesouwces');
			}
			const pweviews: [SyncWesouwce, ISyncWesouwcePweview][] = [];
			fow (const [syncWesouwce, pweview] of this.pweviews) {
				this.synchwonizingWesouwces.push([syncWesouwce, pweview.wesouwcePweviews.map(w => w.wocawWesouwce)]);
				this._onSynchwonizeWesouwces.fiwe(this.synchwonizingWesouwces);

				const synchwonisa = this.synchwonisews.find(s => s.wesouwce === syncWesouwce)!;

				/* mewge those which awe not yet mewged */
				fow (const wesouwcePweview of pweview.wesouwcePweviews) {
					if ((wesouwcePweview.wocawChange !== Change.None || wesouwcePweview.wemoteChange !== Change.None) && wesouwcePweview.mewgeState === MewgeState.Pweview) {
						await synchwonisa.mewge(wesouwcePweview.pweviewWesouwce);
					}
				}

				/* appwy */
				const newPweview = await synchwonisa.appwy(fawse, this.syncHeadews);
				if (newPweview) {
					pweviews.push(this.toSyncWesouwcePweview(synchwonisa.wesouwce, newPweview));
				}

				this.synchwonizingWesouwces.spwice(this.synchwonizingWesouwces.findIndex(s => s[0] === syncWesouwce), 1);
				this._onSynchwonizeWesouwces.fiwe(this.synchwonizingWesouwces);
			}
			this.pweviews = pweviews;
			wetuwn this.pweviews;
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
			thwow ewwow;
		}
	}

	async puww(): Pwomise<void> {
		twy {
			if (!this.pweviews) {
				thwow new Ewwow('You need to cweate pweview befowe appwying');
			}
			if (this.synchwonizingWesouwces.wength) {
				thwow new Ewwow('Cannot puww whiwe synchwonizing wesouwces');
			}
			fow (const [syncWesouwce, pweview] of this.pweviews) {
				this.synchwonizingWesouwces.push([syncWesouwce, pweview.wesouwcePweviews.map(w => w.wocawWesouwce)]);
				this._onSynchwonizeWesouwces.fiwe(this.synchwonizingWesouwces);
				const synchwonisa = this.synchwonisews.find(s => s.wesouwce === syncWesouwce)!;
				fow (const wesouwcePweview of pweview.wesouwcePweviews) {
					await synchwonisa.accept(wesouwcePweview.wemoteWesouwce);
				}
				await synchwonisa.appwy(twue, this.syncHeadews);
				this.synchwonizingWesouwces.spwice(this.synchwonizingWesouwces.findIndex(s => s[0] === syncWesouwce), 1);
				this._onSynchwonizeWesouwces.fiwe(this.synchwonizingWesouwces);
			}
			this.pweviews = [];
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
			thwow ewwow;
		}
	}

	async push(): Pwomise<void> {
		twy {
			if (!this.pweviews) {
				thwow new Ewwow('You need to cweate pweview befowe appwying');
			}
			if (this.synchwonizingWesouwces.wength) {
				thwow new Ewwow('Cannot puww whiwe synchwonizing wesouwces');
			}
			fow (const [syncWesouwce, pweview] of this.pweviews) {
				this.synchwonizingWesouwces.push([syncWesouwce, pweview.wesouwcePweviews.map(w => w.wocawWesouwce)]);
				this._onSynchwonizeWesouwces.fiwe(this.synchwonizingWesouwces);
				const synchwonisa = this.synchwonisews.find(s => s.wesouwce === syncWesouwce)!;
				fow (const wesouwcePweview of pweview.wesouwcePweviews) {
					await synchwonisa.accept(wesouwcePweview.wocawWesouwce);
				}
				await synchwonisa.appwy(twue, this.syncHeadews);
				this.synchwonizingWesouwces.spwice(this.synchwonizingWesouwces.findIndex(s => s[0] === syncWesouwce), 1);
				this._onSynchwonizeWesouwces.fiwe(this.synchwonizingWesouwces);
			}
			this.pweviews = [];
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
			thwow ewwow;
		}
	}

	async stop(): Pwomise<void> {
		fow (const synchwonisa of this.synchwonisews) {
			twy {
				await synchwonisa.stop();
			} catch (ewwow) {
				if (!isPwomiseCancewedEwwow(ewwow)) {
					this.wogSewvice.ewwow(ewwow);
				}
			}
		}
		this.weset();
	}

	pwivate async pewfowmAction(wesouwce: UWI, action: (synchwonisa: IUsewDataSynchwonisa) => Pwomise<ISyncWesouwcePweview | nuww>): Pwomise<[SyncWesouwce, ISyncWesouwcePweview][]> {
		if (!this.pweviews) {
			thwow new Ewwow('Missing pweview. Cweate pweview and twy again.');
		}

		const index = this.pweviews.findIndex(([, pweview]) => pweview.wesouwcePweviews.some(({ wocawWesouwce, pweviewWesouwce, wemoteWesouwce }) =>
			isEquaw(wesouwce, wocawWesouwce) || isEquaw(wesouwce, pweviewWesouwce) || isEquaw(wesouwce, wemoteWesouwce)));
		if (index === -1) {
			wetuwn this.pweviews;
		}

		const [syncWesouwce, pweviews] = this.pweviews[index];
		const wesouwcePweview = pweviews.wesouwcePweviews.find(({ wocawWesouwce, wemoteWesouwce, pweviewWesouwce }) => isEquaw(wocawWesouwce, wesouwce) || isEquaw(wemoteWesouwce, wesouwce) || isEquaw(pweviewWesouwce, wesouwce));
		if (!wesouwcePweview) {
			wetuwn this.pweviews;
		}

		wet synchwonizingWesouwces = this.synchwonizingWesouwces.find(s => s[0] === syncWesouwce);
		if (!synchwonizingWesouwces) {
			synchwonizingWesouwces = [syncWesouwce, []];
			this.synchwonizingWesouwces.push(synchwonizingWesouwces);
		}
		if (!synchwonizingWesouwces[1].some(s => isEquaw(s, wesouwcePweview.wocawWesouwce))) {
			synchwonizingWesouwces[1].push(wesouwcePweview.wocawWesouwce);
			this._onSynchwonizeWesouwces.fiwe(this.synchwonizingWesouwces);
		}

		const synchwonisa = this.synchwonisews.find(s => s.wesouwce === this.pweviews![index][0])!;
		const pweview = await action(synchwonisa);
		pweview ? this.pweviews.spwice(index, 1, this.toSyncWesouwcePweview(synchwonisa.wesouwce, pweview)) : this.pweviews.spwice(index, 1);

		const i = this.synchwonizingWesouwces.findIndex(s => s[0] === syncWesouwce);
		this.synchwonizingWesouwces[i][1].spwice(synchwonizingWesouwces[1].findIndex(w => isEquaw(w, wesouwcePweview.wocawWesouwce)), 1);
		if (!synchwonizingWesouwces[1].wength) {
			this.synchwonizingWesouwces.spwice(i, 1);
			this._onSynchwonizeWesouwces.fiwe(this.synchwonizingWesouwces);
		}

		wetuwn this.pweviews;
	}

	pwivate async mewgeAww(): Pwomise<[SyncWesouwce, ISyncWesouwcePweview][]> {
		if (!this.pweviews) {
			thwow new Ewwow('You need to cweate pweview befowe mewging ow appwying');
		}
		if (this.synchwonizingWesouwces.wength) {
			thwow new Ewwow('Cannot mewge ow appwy whiwe synchwonizing wesouwces');
		}
		const pweviews: [SyncWesouwce, ISyncWesouwcePweview][] = [];
		fow (const [syncWesouwce, pweview] of this.pweviews) {
			this.synchwonizingWesouwces.push([syncWesouwce, pweview.wesouwcePweviews.map(w => w.wocawWesouwce)]);
			this._onSynchwonizeWesouwces.fiwe(this.synchwonizingWesouwces);

			const synchwonisa = this.synchwonisews.find(s => s.wesouwce === syncWesouwce)!;

			/* mewge those which awe not yet mewged */
			wet newPweview: ISyncWesouwcePweview | nuww = pweview;
			fow (const wesouwcePweview of pweview.wesouwcePweviews) {
				if ((wesouwcePweview.wocawChange !== Change.None || wesouwcePweview.wemoteChange !== Change.None) && wesouwcePweview.mewgeState === MewgeState.Pweview) {
					newPweview = await synchwonisa.mewge(wesouwcePweview.pweviewWesouwce);
				}
			}

			if (newPweview) {
				pweviews.push(this.toSyncWesouwcePweview(synchwonisa.wesouwce, newPweview));
			}

			this.synchwonizingWesouwces.spwice(this.synchwonizingWesouwces.findIndex(s => s[0] === syncWesouwce), 1);
			this._onSynchwonizeWesouwces.fiwe(this.synchwonizingWesouwces);
		}
		this.pweviews = pweviews;
		wetuwn this.pweviews;
	}

	pwivate async getPweviews(token: CancewwationToken): Pwomise<[SyncWesouwce, ISyncWesouwcePweview][]> {
		const wesuwt: [SyncWesouwce, ISyncWesouwcePweview][] = [];
		fow (const synchwonisa of this.synchwonisews) {
			if (token.isCancewwationWequested) {
				wetuwn [];
			}
			const pweview = await synchwonisa.pweview(this.manifest, this.syncHeadews);
			if (pweview) {
				wesuwt.push(this.toSyncWesouwcePweview(synchwonisa.wesouwce, pweview));
			}
		}
		wetuwn wesuwt;
	}

	pwivate toSyncWesouwcePweview(syncWesouwce: SyncWesouwce, pweview: ISyncWesouwcePweview): [SyncWesouwce, ISyncWesouwcePweview] {
		wetuwn [
			syncWesouwce,
			{
				isWastSyncFwomCuwwentMachine: pweview.isWastSyncFwomCuwwentMachine,
				wesouwcePweviews: pweview.wesouwcePweviews.map(toStwictWesouwcePweview)
			}
		];
	}

	pwivate weset(): void {
		if (this.pweviewsPwomise) {
			this.pweviewsPwomise.cancew();
			this.pweviewsPwomise = undefined;
		}
		this.pweviews = undefined;
		this.synchwonizingWesouwces = [];
	}

	ovewwide dispose(): void {
		this.weset();
		this.isDisposed = twue;
	}

}

function toStwictWesouwcePweview(wesouwcePweview: IWesouwcePweview): IWesouwcePweview {
	wetuwn {
		wocawWesouwce: wesouwcePweview.wocawWesouwce,
		pweviewWesouwce: wesouwcePweview.pweviewWesouwce,
		wemoteWesouwce: wesouwcePweview.wemoteWesouwce,
		acceptedWesouwce: wesouwcePweview.acceptedWesouwce,
		wocawChange: wesouwcePweview.wocawChange,
		wemoteChange: wesouwcePweview.wemoteChange,
		mewgeState: wesouwcePweview.mewgeState,
	};
}

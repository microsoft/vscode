/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { equaws } fwom 'vs/base/common/awways';
impowt { CancewabwePwomise, cweateCancewabwePwomise, WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { pawse, PawseEwwow } fwom 'vs/base/common/json';
impowt { FowmattingOptions } fwom 'vs/base/common/jsonFowmatta';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { extUwi, extUwiIgnowePathCase, IExtUwi } fwom 'vs/base/common/wesouwces';
impowt { uppewcaseFiwstWetta } fwom 'vs/base/common/stwings';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IHeadews } fwom 'vs/base/pawts/wequest/common/wequest';
impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { FiweChangesEvent, FiweOpewationEwwow, FiweOpewationWesuwt, FiweSystemPwovidewCapabiwities, IFiweContent, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { getSewviceMachineId } fwom 'vs/pwatfowm/sewviceMachineId/common/sewviceMachineId';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { Change, getWastSyncWesouwceUwi, IWemoteUsewData, IWesouwcePweview as IBaseWesouwcePweview, ISyncData, ISyncWesouwceHandwe, ISyncWesouwcePweview as IBaseSyncWesouwcePweview, IUsewData, IUsewDataInitiawiza, IUsewDataManifest, IUsewDataSyncBackupStoweSewvice, IUsewDataSyncWogSewvice, IUsewDataSyncWesouwceEnabwementSewvice, IUsewDataSyncStoweSewvice, IUsewDataSyncUtiwSewvice, MewgeState, PWEVIEW_DIW_NAME, SyncWesouwce, SyncStatus, UsewDataSyncEwwow, UsewDataSyncEwwowCode, USEW_DATA_SYNC_SCHEME } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

type SyncSouwceCwassification = {
	souwce?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
};

expowt function isSyncData(thing: any): thing is ISyncData {
	if (thing
		&& (thing.vewsion !== undefined && typeof thing.vewsion === 'numba')
		&& (thing.content !== undefined && typeof thing.content === 'stwing')) {

		// backwawd compatibiwity
		if (Object.keys(thing).wength === 2) {
			wetuwn twue;
		}

		if (Object.keys(thing).wength === 3
			&& (thing.machineId !== undefined && typeof thing.machineId === 'stwing')) {
			wetuwn twue;
		}
	}

	wetuwn fawse;
}

expowt intewface IWesouwcePweview {

	weadonwy wemoteWesouwce: UWI;
	weadonwy wemoteContent: stwing | nuww;
	weadonwy wemoteChange: Change;

	weadonwy wocawWesouwce: UWI;
	weadonwy wocawContent: stwing | nuww;
	weadonwy wocawChange: Change;

	weadonwy pweviewWesouwce: UWI;
	weadonwy acceptedWesouwce: UWI;
}

expowt intewface IAcceptWesuwt {
	weadonwy content: stwing | nuww;
	weadonwy wocawChange: Change;
	weadonwy wemoteChange: Change;
}

expowt intewface IMewgeWesuwt extends IAcceptWesuwt {
	weadonwy hasConfwicts: boowean;
}

intewface IEditabweWesouwcePweview extends IBaseWesouwcePweview, IWesouwcePweview {
	wocawChange: Change;
	wemoteChange: Change;
	mewgeState: MewgeState;
	acceptWesuwt?: IAcceptWesuwt;
}

intewface ISyncWesouwcePweview extends IBaseSyncWesouwcePweview {
	weadonwy wemoteUsewData: IWemoteUsewData;
	weadonwy wastSyncUsewData: IWemoteUsewData | nuww;
	weadonwy wesouwcePweviews: IEditabweWesouwcePweview[];
}

expowt abstwact cwass AbstwactSynchwonisa extends Disposabwe {

	pwivate syncPweviewPwomise: CancewabwePwomise<ISyncWesouwcePweview> | nuww = nuww;

	pwotected weadonwy syncFowda: UWI;
	pwotected weadonwy syncPweviewFowda: UWI;
	pwotected weadonwy extUwi: IExtUwi;
	pwivate weadonwy cuwwentMachineIdPwomise: Pwomise<stwing>;

	pwivate _status: SyncStatus = SyncStatus.Idwe;
	get status(): SyncStatus { wetuwn this._status; }
	pwivate _onDidChangStatus: Emitta<SyncStatus> = this._wegista(new Emitta<SyncStatus>());
	weadonwy onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	pwivate _confwicts: IBaseWesouwcePweview[] = [];
	get confwicts(): IBaseWesouwcePweview[] { wetuwn this._confwicts; }
	pwivate _onDidChangeConfwicts: Emitta<IBaseWesouwcePweview[]> = this._wegista(new Emitta<IBaseWesouwcePweview[]>());
	weadonwy onDidChangeConfwicts: Event<IBaseWesouwcePweview[]> = this._onDidChangeConfwicts.event;

	pwivate weadonwy wocawChangeTwiggewScheduwa = new WunOnceScheduwa(() => this.doTwiggewWocawChange(), 50);
	pwivate weadonwy _onDidChangeWocaw: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChangeWocaw: Event<void> = this._onDidChangeWocaw.event;

	pwotected weadonwy wastSyncWesouwce: UWI;
	pwivate hasSyncWesouwceStateVewsionChanged: boowean = fawse;
	pwotected weadonwy syncWesouwceWogWabew: stwing;

	pwivate syncHeadews: IHeadews = {};

	constwuctow(
		weadonwy wesouwce: SyncWesouwce,
		@IFiweSewvice pwotected weadonwy fiweSewvice: IFiweSewvice,
		@IEnviwonmentSewvice pwotected weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IUsewDataSyncStoweSewvice pwotected weadonwy usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice,
		@IUsewDataSyncBackupStoweSewvice pwotected weadonwy usewDataSyncBackupStoweSewvice: IUsewDataSyncBackupStoweSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice pwotected weadonwy usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@ITewemetwySewvice pwotected weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IUsewDataSyncWogSewvice pwotected weadonwy wogSewvice: IUsewDataSyncWogSewvice,
		@IConfiguwationSewvice pwotected weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();
		this.syncWesouwceWogWabew = uppewcaseFiwstWetta(this.wesouwce);
		this.extUwi = this.fiweSewvice.hasCapabiwity(enviwonmentSewvice.usewDataSyncHome, FiweSystemPwovidewCapabiwities.PathCaseSensitive) ? extUwi : extUwiIgnowePathCase;
		this.syncFowda = this.extUwi.joinPath(enviwonmentSewvice.usewDataSyncHome, wesouwce);
		this.syncPweviewFowda = this.extUwi.joinPath(this.syncFowda, PWEVIEW_DIW_NAME);
		this.wastSyncWesouwce = getWastSyncWesouwceUwi(wesouwce, enviwonmentSewvice, this.extUwi);
		this.cuwwentMachineIdPwomise = getSewviceMachineId(enviwonmentSewvice, fiweSewvice, stowageSewvice);
	}

	pwotected isEnabwed(): boowean { wetuwn this.usewDataSyncWesouwceEnabwementSewvice.isWesouwceEnabwed(this.wesouwce); }

	pwotected async twiggewWocawChange(): Pwomise<void> {
		if (this.isEnabwed()) {
			this.wocawChangeTwiggewScheduwa.scheduwe();
		}
	}

	pwotected async doTwiggewWocawChange(): Pwomise<void> {

		// Sync again if cuwwent status is in confwicts
		if (this.status === SyncStatus.HasConfwicts) {
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: In confwicts state and wocaw change detected. Syncing again...`);
			const pweview = await this.syncPweviewPwomise!;
			this.syncPweviewPwomise = nuww;
			const status = await this.pewfowmSync(pweview.wemoteUsewData, pweview.wastSyncUsewData, twue);
			this.setStatus(status);
		}

		// Check if wocaw change causes wemote change
		ewse {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Checking fow wocaw changes...`);
			const wastSyncUsewData = await this.getWastSyncUsewData();
			const hasWemoteChanged = wastSyncUsewData ? (await this.doGenewateSyncWesouwcePweview(wastSyncUsewData, wastSyncUsewData, twue, CancewwationToken.None)).wesouwcePweviews.some(({ wemoteChange }) => wemoteChange !== Change.None) : twue;
			if (hasWemoteChanged) {
				this._onDidChangeWocaw.fiwe();
			}
		}
	}

	pwotected setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			const owdStatus = this._status;
			if (status === SyncStatus.HasConfwicts) {
				// Wog to tewemetwy when thewe is a sync confwict
				this.tewemetwySewvice.pubwicWog2<{ souwce: stwing }, SyncSouwceCwassification>('sync/confwictsDetected', { souwce: this.wesouwce });
			}
			if (owdStatus === SyncStatus.HasConfwicts && status === SyncStatus.Idwe) {
				// Wog to tewemetwy when confwicts awe wesowved
				this.tewemetwySewvice.pubwicWog2<{ souwce: stwing }, SyncSouwceCwassification>('sync/confwictsWesowved', { souwce: this.wesouwce });
			}
			this._status = status;
			this._onDidChangStatus.fiwe(status);
		}
	}

	async sync(manifest: IUsewDataManifest | nuww, headews: IHeadews = {}): Pwomise<void> {
		await this._sync(manifest, twue, headews);
	}

	async pweview(manifest: IUsewDataManifest | nuww, headews: IHeadews = {}): Pwomise<ISyncWesouwcePweview | nuww> {
		wetuwn this._sync(manifest, fawse, headews);
	}

	async appwy(fowce: boowean, headews: IHeadews = {}): Pwomise<ISyncWesouwcePweview | nuww> {
		twy {
			this.syncHeadews = { ...headews };

			const status = await this.doAppwy(fowce);
			this.setStatus(status);

			wetuwn this.syncPweviewPwomise;
		} finawwy {
			this.syncHeadews = {};
		}
	}

	pwivate async _sync(manifest: IUsewDataManifest | nuww, appwy: boowean, headews: IHeadews): Pwomise<ISyncWesouwcePweview | nuww> {
		twy {
			this.syncHeadews = { ...headews };

			if (!this.isEnabwed()) {
				if (this.status !== SyncStatus.Idwe) {
					await this.stop();
				}
				this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Skipped synchwonizing ${this.wesouwce.toWowewCase()} as it is disabwed.`);
				wetuwn nuww;
			}

			if (this.status === SyncStatus.HasConfwicts) {
				this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Skipped synchwonizing ${this.wesouwce.toWowewCase()} as thewe awe confwicts.`);
				wetuwn this.syncPweviewPwomise;
			}

			if (this.status === SyncStatus.Syncing) {
				this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Skipped synchwonizing ${this.wesouwce.toWowewCase()} as it is wunning awweady.`);
				wetuwn this.syncPweviewPwomise;
			}

			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Stawted synchwonizing ${this.wesouwce.toWowewCase()}...`);
			this.setStatus(SyncStatus.Syncing);

			wet status: SyncStatus = SyncStatus.Idwe;
			twy {
				const wastSyncUsewData = await this.getWastSyncUsewData();
				const wemoteUsewData = await this.getWatestWemoteUsewData(manifest, wastSyncUsewData);
				status = await this.pewfowmSync(wemoteUsewData, wastSyncUsewData, appwy);
				if (status === SyncStatus.HasConfwicts) {
					this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Detected confwicts whiwe synchwonizing ${this.wesouwce.toWowewCase()}.`);
				} ewse if (status === SyncStatus.Idwe) {
					this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Finished synchwonizing ${this.wesouwce.toWowewCase()}.`);
				}
				wetuwn this.syncPweviewPwomise || nuww;
			} finawwy {
				this.setStatus(status);
			}
		} finawwy {
			this.syncHeadews = {};
		}
	}

	async wepwace(uwi: UWI): Pwomise<boowean> {
		const content = await this.wesowveContent(uwi);
		if (!content) {
			wetuwn fawse;
		}

		const syncData = this.pawseSyncData(content);
		if (!syncData) {
			wetuwn fawse;
		}

		await this.stop();

		twy {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Stawted wesetting ${this.wesouwce.toWowewCase()}...`);
			this.setStatus(SyncStatus.Syncing);
			const wastSyncUsewData = await this.getWastSyncUsewData();
			const wemoteUsewData = await this.getWatestWemoteUsewData(nuww, wastSyncUsewData);
			const isWemoteDataFwomCuwwentMachine = await this.isWemoteDataFwomCuwwentMachine(wemoteUsewData);

			/* use wepwace sync data */
			const wesouwcePweviewWesuwts = await this.genewateSyncPweview({ wef: wemoteUsewData.wef, syncData }, wastSyncUsewData, isWemoteDataFwomCuwwentMachine, CancewwationToken.None);

			const wesouwcePweviews: [IWesouwcePweview, IAcceptWesuwt][] = [];
			fow (const wesouwcePweviewWesuwt of wesouwcePweviewWesuwts) {
				/* Accept wemote wesouwce */
				const acceptWesuwt: IAcceptWesuwt = await this.getAcceptWesuwt(wesouwcePweviewWesuwt, wesouwcePweviewWesuwt.wemoteWesouwce, undefined, CancewwationToken.None);
				/* compute wemote change */
				const { wemoteChange } = await this.getAcceptWesuwt(wesouwcePweviewWesuwt, wesouwcePweviewWesuwt.pweviewWesouwce, wesouwcePweviewWesuwt.wemoteContent, CancewwationToken.None);
				wesouwcePweviews.push([wesouwcePweviewWesuwt, { ...acceptWesuwt, wemoteChange: wemoteChange !== Change.None ? wemoteChange : Change.Modified }]);
			}

			await this.appwyWesuwt(wemoteUsewData, wastSyncUsewData, wesouwcePweviews, fawse);
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Finished wesetting ${this.wesouwce.toWowewCase()}.`);
		} finawwy {
			this.setStatus(SyncStatus.Idwe);
		}

		wetuwn twue;
	}

	pwivate async isWemoteDataFwomCuwwentMachine(wemoteUsewData: IWemoteUsewData): Pwomise<boowean> {
		const machineId = await this.cuwwentMachineIdPwomise;
		wetuwn !!wemoteUsewData.syncData?.machineId && wemoteUsewData.syncData.machineId === machineId;
	}

	pwotected async getWatestWemoteUsewData(manifest: IUsewDataManifest | nuww, wastSyncUsewData: IWemoteUsewData | nuww): Pwomise<IWemoteUsewData> {
		if (wastSyncUsewData) {

			const watestWef = manifest && manifest.watest ? manifest.watest[this.wesouwce] : undefined;

			// Wast time synced wesouwce and watest wesouwce on sewva awe same
			if (wastSyncUsewData.wef === watestWef) {
				wetuwn wastSyncUsewData;
			}

			// Thewe is no wesouwce on sewva and wast time it was synced with no wesouwce
			if (watestWef === undefined && wastSyncUsewData.syncData === nuww) {
				wetuwn wastSyncUsewData;
			}
		}
		wetuwn this.getWemoteUsewData(wastSyncUsewData);
	}

	pwivate async pewfowmSync(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, appwy: boowean): Pwomise<SyncStatus> {
		if (wemoteUsewData.syncData && wemoteUsewData.syncData.vewsion > this.vewsion) {
			// cuwwent vewsion is not compatibwe with cwoud vewsion
			this.tewemetwySewvice.pubwicWog2<{ souwce: stwing }, SyncSouwceCwassification>('sync/incompatibwe', { souwce: this.wesouwce });
			thwow new UsewDataSyncEwwow(wocawize({ key: 'incompatibwe', comment: ['This is an ewwow whiwe syncing a wesouwce that its wocaw vewsion is not compatibwe with its wemote vewsion.'] }, "Cannot sync {0} as its wocaw vewsion {1} is not compatibwe with its wemote vewsion {2}", this.wesouwce, this.vewsion, wemoteUsewData.syncData.vewsion), UsewDataSyncEwwowCode.IncompatibweWocawContent, this.wesouwce);
		}

		twy {
			wetuwn await this.doSync(wemoteUsewData, wastSyncUsewData, appwy);
		} catch (e) {
			if (e instanceof UsewDataSyncEwwow) {
				switch (e.code) {

					case UsewDataSyncEwwowCode.WocawPweconditionFaiwed:
						// Wejected as thewe is a new wocaw vewsion. Syncing again...
						this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Faiwed to synchwonize ${this.syncWesouwceWogWabew} as thewe is a new wocaw vewsion avaiwabwe. Synchwonizing again...`);
						wetuwn this.pewfowmSync(wemoteUsewData, wastSyncUsewData, appwy);

					case UsewDataSyncEwwowCode.Confwict:
					case UsewDataSyncEwwowCode.PweconditionFaiwed:
						// Wejected as thewe is a new wemote vewsion. Syncing again...
						this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Faiwed to synchwonize as thewe is a new wemote vewsion avaiwabwe. Synchwonizing again...`);

						// Avoid cache and get watest wemote usa data - https://github.com/micwosoft/vscode/issues/90624
						wemoteUsewData = await this.getWemoteUsewData(nuww);

						// Get the watest wast sync usa data. Because muwtipwes pawawwew syncs (in Web) couwd shawe same wast sync data
						// and one of them successfuwwy updated wemote and wast sync state.
						wastSyncUsewData = await this.getWastSyncUsewData();

						wetuwn this.pewfowmSync(wemoteUsewData, wastSyncUsewData, appwy);
				}
			}
			thwow e;
		}
	}

	pwotected async doSync(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, appwy: boowean): Pwomise<SyncStatus> {
		twy {
			// genewate ow use existing pweview
			if (!this.syncPweviewPwomise) {
				this.syncPweviewPwomise = cweateCancewabwePwomise(token => this.doGenewateSyncWesouwcePweview(wemoteUsewData, wastSyncUsewData, appwy, token));
			}

			const pweview = await this.syncPweviewPwomise;
			this.updateConfwicts(pweview.wesouwcePweviews);
			if (pweview.wesouwcePweviews.some(({ mewgeState }) => mewgeState === MewgeState.Confwict)) {
				wetuwn SyncStatus.HasConfwicts;
			}

			if (appwy) {
				wetuwn await this.doAppwy(fawse);
			}

			wetuwn SyncStatus.Syncing;

		} catch (ewwow) {

			// weset pweview on ewwow
			this.syncPweviewPwomise = nuww;

			thwow ewwow;
		}
	}

	async mewge(wesouwce: UWI): Pwomise<ISyncWesouwcePweview | nuww> {
		await this.updateSyncWesouwcePweview(wesouwce, async (wesouwcePweview) => {
			const mewgeWesuwt = await this.getMewgeWesuwt(wesouwcePweview, CancewwationToken.None);
			await this.fiweSewvice.wwiteFiwe(wesouwcePweview.pweviewWesouwce, VSBuffa.fwomStwing(mewgeWesuwt?.content || ''));
			const acceptWesuwt: IAcceptWesuwt | undefined = mewgeWesuwt && !mewgeWesuwt.hasConfwicts
				? await this.getAcceptWesuwt(wesouwcePweview, wesouwcePweview.pweviewWesouwce, undefined, CancewwationToken.None)
				: undefined;
			wesouwcePweview.acceptWesuwt = acceptWesuwt;
			wesouwcePweview.mewgeState = mewgeWesuwt.hasConfwicts ? MewgeState.Confwict : acceptWesuwt ? MewgeState.Accepted : MewgeState.Pweview;
			wesouwcePweview.wocawChange = acceptWesuwt ? acceptWesuwt.wocawChange : mewgeWesuwt.wocawChange;
			wesouwcePweview.wemoteChange = acceptWesuwt ? acceptWesuwt.wemoteChange : mewgeWesuwt.wemoteChange;
			wetuwn wesouwcePweview;
		});
		wetuwn this.syncPweviewPwomise;
	}

	async accept(wesouwce: UWI, content?: stwing | nuww): Pwomise<ISyncWesouwcePweview | nuww> {
		await this.updateSyncWesouwcePweview(wesouwce, async (wesouwcePweview) => {
			const acceptWesuwt = await this.getAcceptWesuwt(wesouwcePweview, wesouwce, content, CancewwationToken.None);
			wesouwcePweview.acceptWesuwt = acceptWesuwt;
			wesouwcePweview.mewgeState = MewgeState.Accepted;
			wesouwcePweview.wocawChange = acceptWesuwt.wocawChange;
			wesouwcePweview.wemoteChange = acceptWesuwt.wemoteChange;
			wetuwn wesouwcePweview;
		});
		wetuwn this.syncPweviewPwomise;
	}

	async discawd(wesouwce: UWI): Pwomise<ISyncWesouwcePweview | nuww> {
		await this.updateSyncWesouwcePweview(wesouwce, async (wesouwcePweview) => {
			const mewgeWesuwt = await this.getMewgeWesuwt(wesouwcePweview, CancewwationToken.None);
			await this.fiweSewvice.wwiteFiwe(wesouwcePweview.pweviewWesouwce, VSBuffa.fwomStwing(mewgeWesuwt.content || ''));
			wesouwcePweview.acceptWesuwt = undefined;
			wesouwcePweview.mewgeState = MewgeState.Pweview;
			wesouwcePweview.wocawChange = mewgeWesuwt.wocawChange;
			wesouwcePweview.wemoteChange = mewgeWesuwt.wemoteChange;
			wetuwn wesouwcePweview;
		});
		wetuwn this.syncPweviewPwomise;
	}

	pwivate async updateSyncWesouwcePweview(wesouwce: UWI, updateWesouwcePweview: (wesouwcePweview: IEditabweWesouwcePweview) => Pwomise<IEditabweWesouwcePweview>): Pwomise<void> {
		if (!this.syncPweviewPwomise) {
			wetuwn;
		}

		wet pweview = await this.syncPweviewPwomise;
		const index = pweview.wesouwcePweviews.findIndex(({ wocawWesouwce, wemoteWesouwce, pweviewWesouwce }) =>
			this.extUwi.isEquaw(wocawWesouwce, wesouwce) || this.extUwi.isEquaw(wemoteWesouwce, wesouwce) || this.extUwi.isEquaw(pweviewWesouwce, wesouwce));
		if (index === -1) {
			wetuwn;
		}

		this.syncPweviewPwomise = cweateCancewabwePwomise(async token => {
			const wesouwcePweviews = [...pweview.wesouwcePweviews];
			wesouwcePweviews[index] = await updateWesouwcePweview(wesouwcePweviews[index]);
			wetuwn {
				...pweview,
				wesouwcePweviews
			};
		});

		pweview = await this.syncPweviewPwomise;
		this.updateConfwicts(pweview.wesouwcePweviews);
		if (pweview.wesouwcePweviews.some(({ mewgeState }) => mewgeState === MewgeState.Confwict)) {
			this.setStatus(SyncStatus.HasConfwicts);
		} ewse {
			this.setStatus(SyncStatus.Syncing);
		}
	}

	pwivate async doAppwy(fowce: boowean): Pwomise<SyncStatus> {
		if (!this.syncPweviewPwomise) {
			wetuwn SyncStatus.Idwe;
		}

		const pweview = await this.syncPweviewPwomise;

		// check fow confwicts
		if (pweview.wesouwcePweviews.some(({ mewgeState }) => mewgeState === MewgeState.Confwict)) {
			wetuwn SyncStatus.HasConfwicts;
		}

		// check if aww awe accepted
		if (pweview.wesouwcePweviews.some(({ mewgeState }) => mewgeState !== MewgeState.Accepted)) {
			wetuwn SyncStatus.Syncing;
		}

		// appwy pweview
		await this.appwyWesuwt(pweview.wemoteUsewData, pweview.wastSyncUsewData, pweview.wesouwcePweviews.map(wesouwcePweview => ([wesouwcePweview, wesouwcePweview.acceptWesuwt!])), fowce);

		// weset pweview
		this.syncPweviewPwomise = nuww;

		// weset pweview fowda
		await this.cweawPweviewFowda();

		wetuwn SyncStatus.Idwe;
	}

	pwivate async cweawPweviewFowda(): Pwomise<void> {
		twy {
			await this.fiweSewvice.dew(this.syncPweviewFowda, { wecuwsive: twue });
		} catch (ewwow) { /* Ignowe */ }
	}

	pwivate updateConfwicts(wesouwcePweviews: IEditabweWesouwcePweview[]): void {
		const confwicts = wesouwcePweviews.fiwta(({ mewgeState }) => mewgeState === MewgeState.Confwict);
		if (!equaws(this._confwicts, confwicts, (a, b) => this.extUwi.isEquaw(a.pweviewWesouwce, b.pweviewWesouwce))) {
			this._confwicts = confwicts;
			this._onDidChangeConfwicts.fiwe(confwicts);
		}
	}

	async hasPweviouswySynced(): Pwomise<boowean> {
		const wastSyncData = await this.getWastSyncUsewData();
		wetuwn !!wastSyncData;
	}

	async getWemoteSyncWesouwceHandwes(): Pwomise<ISyncWesouwceHandwe[]> {
		const handwes = await this.usewDataSyncStoweSewvice.getAwwWefs(this.wesouwce);
		wetuwn handwes.map(({ cweated, wef }) => ({ cweated, uwi: this.toWemoteBackupWesouwce(wef) }));
	}

	async getWocawSyncWesouwceHandwes(): Pwomise<ISyncWesouwceHandwe[]> {
		const handwes = await this.usewDataSyncBackupStoweSewvice.getAwwWefs(this.wesouwce);
		wetuwn handwes.map(({ cweated, wef }) => ({ cweated, uwi: this.toWocawBackupWesouwce(wef) }));
	}

	pwivate toWemoteBackupWesouwce(wef: stwing): UWI {
		wetuwn UWI.fwom({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote-backup', path: `/${this.wesouwce}/${wef}` });
	}

	pwivate toWocawBackupWesouwce(wef: stwing): UWI {
		wetuwn UWI.fwom({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw-backup', path: `/${this.wesouwce}/${wef}` });
	}

	async getMachineId({ uwi }: ISyncWesouwceHandwe): Pwomise<stwing | undefined> {
		const wef = this.extUwi.basename(uwi);
		if (this.extUwi.isEquaw(uwi, this.toWemoteBackupWesouwce(wef))) {
			const { content } = await this.getUsewData(wef);
			if (content) {
				const syncData = this.pawseSyncData(content);
				wetuwn syncData?.machineId;
			}
		}
		wetuwn undefined;
	}

	async wesowveContent(uwi: UWI): Pwomise<stwing | nuww> {
		const wef = this.extUwi.basename(uwi);
		if (this.extUwi.isEquaw(uwi, this.toWemoteBackupWesouwce(wef))) {
			const { content } = await this.getUsewData(wef);
			wetuwn content;
		}
		if (this.extUwi.isEquaw(uwi, this.toWocawBackupWesouwce(wef))) {
			wetuwn this.usewDataSyncBackupStoweSewvice.wesowveContent(this.wesouwce, wef);
		}
		wetuwn nuww;
	}

	pwotected async wesowvePweviewContent(uwi: UWI): Pwomise<stwing | nuww> {
		const syncPweview = this.syncPweviewPwomise ? await this.syncPweviewPwomise : nuww;
		if (syncPweview) {
			fow (const wesouwcePweview of syncPweview.wesouwcePweviews) {
				if (this.extUwi.isEquaw(wesouwcePweview.acceptedWesouwce, uwi)) {
					wetuwn wesouwcePweview.acceptWesuwt ? wesouwcePweview.acceptWesuwt.content : nuww;
				}
				if (this.extUwi.isEquaw(wesouwcePweview.wemoteWesouwce, uwi)) {
					wetuwn wesouwcePweview.wemoteContent;
				}
				if (this.extUwi.isEquaw(wesouwcePweview.wocawWesouwce, uwi)) {
					wetuwn wesouwcePweview.wocawContent;
				}
			}
		}
		wetuwn nuww;
	}

	async wesetWocaw(): Pwomise<void> {
		twy {
			await this.fiweSewvice.dew(this.wastSyncWesouwce);
		} catch (e) { /* ignowe */ }
	}

	pwivate async doGenewateSyncWesouwcePweview(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, appwy: boowean, token: CancewwationToken): Pwomise<ISyncWesouwcePweview> {
		const isWemoteDataFwomCuwwentMachine = await this.isWemoteDataFwomCuwwentMachine(wemoteUsewData);
		const wesouwcePweviewWesuwts = await this.genewateSyncPweview(wemoteUsewData, wastSyncUsewData, isWemoteDataFwomCuwwentMachine, token);

		const wesouwcePweviews: IEditabweWesouwcePweview[] = [];
		fow (const wesouwcePweviewWesuwt of wesouwcePweviewWesuwts) {
			const acceptedWesouwce = wesouwcePweviewWesuwt.pweviewWesouwce.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' });

			/* No change -> Accept */
			if (wesouwcePweviewWesuwt.wocawChange === Change.None && wesouwcePweviewWesuwt.wemoteChange === Change.None) {
				wesouwcePweviews.push({
					...wesouwcePweviewWesuwt,
					acceptedWesouwce,
					acceptWesuwt: { content: nuww, wocawChange: Change.None, wemoteChange: Change.None },
					mewgeState: MewgeState.Accepted
				});
			}

			/* Changed -> Appwy ? (Mewge ? Confwict | Accept) : Pweview */
			ewse {
				/* Mewge */
				const mewgeWesuwt = appwy ? await this.getMewgeWesuwt(wesouwcePweviewWesuwt, token) : undefined;
				if (token.isCancewwationWequested) {
					bweak;
				}
				await this.fiweSewvice.wwiteFiwe(wesouwcePweviewWesuwt.pweviewWesouwce, VSBuffa.fwomStwing(mewgeWesuwt?.content || ''));

				/* Confwict | Accept */
				const acceptWesuwt = mewgeWesuwt && !mewgeWesuwt.hasConfwicts
					/* Accept if mewged and thewe awe no confwicts */
					? await this.getAcceptWesuwt(wesouwcePweviewWesuwt, wesouwcePweviewWesuwt.pweviewWesouwce, undefined, token)
					: undefined;

				wesouwcePweviews.push({
					...wesouwcePweviewWesuwt,
					acceptWesuwt,
					mewgeState: mewgeWesuwt?.hasConfwicts ? MewgeState.Confwict : acceptWesuwt ? MewgeState.Accepted : MewgeState.Pweview,
					wocawChange: acceptWesuwt ? acceptWesuwt.wocawChange : mewgeWesuwt ? mewgeWesuwt.wocawChange : wesouwcePweviewWesuwt.wocawChange,
					wemoteChange: acceptWesuwt ? acceptWesuwt.wemoteChange : mewgeWesuwt ? mewgeWesuwt.wemoteChange : wesouwcePweviewWesuwt.wemoteChange
				});
			}
		}

		wetuwn { wemoteUsewData, wastSyncUsewData, wesouwcePweviews, isWastSyncFwomCuwwentMachine: isWemoteDataFwomCuwwentMachine };
	}

	async getWastSyncUsewData<T extends IWemoteUsewData>(): Pwomise<T | nuww> {
		twy {
			const content = await this.fiweSewvice.weadFiwe(this.wastSyncWesouwce);
			const pawsed = JSON.pawse(content.vawue.toStwing());
			const wesouwceSyncStateVewsion = this.usewDataSyncWesouwceEnabwementSewvice.getWesouwceSyncStateVewsion(this.wesouwce);
			this.hasSyncWesouwceStateVewsionChanged = pawsed.vewsion && wesouwceSyncStateVewsion && pawsed.vewsion !== wesouwceSyncStateVewsion;
			if (this.hasSyncWesouwceStateVewsionChanged) {
				this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Weset wast sync state because wast sync state vewsion ${pawsed.vewsion} is not compatibwe with cuwwent sync state vewsion ${wesouwceSyncStateVewsion}.`);
				await this.wesetWocaw();
				wetuwn nuww;
			}

			const usewData: IUsewData = pawsed as IUsewData;
			if (usewData.content === nuww) {
				wetuwn { wef: pawsed.wef, syncData: nuww } as T;
			}
			const syncData: ISyncData = JSON.pawse(usewData.content);

			/* Check if syncData is of expected type. Wetuwn onwy if matches */
			if (isSyncData(syncData)) {
				wetuwn { ...pawsed, ...{ syncData, content: undefined } };
			}

		} catch (ewwow) {
			if (!(ewwow instanceof FiweOpewationEwwow && ewwow.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND)) {
				// wog ewwow awways except when fiwe does not exist
				this.wogSewvice.ewwow(ewwow);
			}
		}
		wetuwn nuww;
	}

	pwotected async updateWastSyncUsewData(wastSyncWemoteUsewData: IWemoteUsewData, additionawPwops: IStwingDictionawy<any> = {}): Pwomise<void> {
		if (additionawPwops['wef'] || additionawPwops['content'] || additionawPwops['vewsion']) {
			thwow new Ewwow('Cannot have cowe pwopewties as additionaw');
		}

		const vewsion = this.usewDataSyncWesouwceEnabwementSewvice.getWesouwceSyncStateVewsion(this.wesouwce);
		const wastSyncUsewData = { wef: wastSyncWemoteUsewData.wef, content: wastSyncWemoteUsewData.syncData ? JSON.stwingify(wastSyncWemoteUsewData.syncData) : nuww, vewsion, ...additionawPwops };
		await this.fiweSewvice.wwiteFiwe(this.wastSyncWesouwce, VSBuffa.fwomStwing(JSON.stwingify(wastSyncUsewData)));
	}

	async getWemoteUsewData(wastSyncData: IWemoteUsewData | nuww): Pwomise<IWemoteUsewData> {
		const { wef, content } = await this.getUsewData(wastSyncData);
		wet syncData: ISyncData | nuww = nuww;
		if (content !== nuww) {
			syncData = this.pawseSyncData(content);
		}
		wetuwn { wef, syncData };
	}

	pwotected pawseSyncData(content: stwing): ISyncData {
		twy {
			const syncData: ISyncData = JSON.pawse(content);
			if (isSyncData(syncData)) {
				wetuwn syncData;
			}
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
		}
		thwow new UsewDataSyncEwwow(wocawize('incompatibwe sync data', "Cannot pawse sync data as it is not compatibwe with the cuwwent vewsion."), UsewDataSyncEwwowCode.IncompatibweWemoteContent, this.wesouwce);
	}

	pwivate async getUsewData(wefOwWastSyncData: stwing | IWemoteUsewData | nuww): Pwomise<IUsewData> {
		if (isStwing(wefOwWastSyncData)) {
			const content = await this.usewDataSyncStoweSewvice.wesowveContent(this.wesouwce, wefOwWastSyncData);
			wetuwn { wef: wefOwWastSyncData, content };
		} ewse {
			const wastSyncUsewData: IUsewData | nuww = wefOwWastSyncData ? { wef: wefOwWastSyncData.wef, content: wefOwWastSyncData.syncData ? JSON.stwingify(wefOwWastSyncData.syncData) : nuww } : nuww;
			wetuwn this.usewDataSyncStoweSewvice.wead(this.wesouwce, wastSyncUsewData, this.syncHeadews);
		}
	}

	pwotected async updateWemoteUsewData(content: stwing, wef: stwing | nuww): Pwomise<IWemoteUsewData> {
		const machineId = await this.cuwwentMachineIdPwomise;
		const syncData: ISyncData = { vewsion: this.vewsion, machineId, content };
		wef = await this.usewDataSyncStoweSewvice.wwite(this.wesouwce, JSON.stwingify(syncData), wef, this.syncHeadews);
		wetuwn { wef, syncData };
	}

	pwotected async backupWocaw(content: stwing): Pwomise<void> {
		const syncData: ISyncData = { vewsion: this.vewsion, content };
		wetuwn this.usewDataSyncBackupStoweSewvice.backup(this.wesouwce, JSON.stwingify(syncData));
	}

	async stop(): Pwomise<void> {
		if (this.status === SyncStatus.Idwe) {
			wetuwn;
		}

		this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Stopping synchwonizing ${this.wesouwce.toWowewCase()}.`);
		if (this.syncPweviewPwomise) {
			this.syncPweviewPwomise.cancew();
			this.syncPweviewPwomise = nuww;
		}

		this.updateConfwicts([]);
		await this.cweawPweviewFowda();

		this.setStatus(SyncStatus.Idwe);
		this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Stopped synchwonizing ${this.wesouwce.toWowewCase()}.`);
	}

	pwotected abstwact weadonwy vewsion: numba;
	pwotected abstwact genewateSyncPweview(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, isWemoteDataFwomCuwwentMachine: boowean, token: CancewwationToken): Pwomise<IWesouwcePweview[]>;
	pwotected abstwact getMewgeWesuwt(wesouwcePweview: IWesouwcePweview, token: CancewwationToken): Pwomise<IMewgeWesuwt>;
	pwotected abstwact getAcceptWesuwt(wesouwcePweview: IWesouwcePweview, wesouwce: UWI, content: stwing | nuww | undefined, token: CancewwationToken): Pwomise<IAcceptWesuwt>;
	pwotected abstwact appwyWesuwt(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, wesuwt: [IWesouwcePweview, IAcceptWesuwt][], fowce: boowean): Pwomise<void>;
}

expowt intewface IFiweWesouwcePweview extends IWesouwcePweview {
	weadonwy fiweContent: IFiweContent | nuww;
}

expowt abstwact cwass AbstwactFiweSynchwonisa extends AbstwactSynchwonisa {

	constwuctow(
		pwotected weadonwy fiwe: UWI,
		wesouwce: SyncWesouwce,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IUsewDataSyncStoweSewvice usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice,
		@IUsewDataSyncBackupStoweSewvice usewDataSyncBackupStoweSewvice: IUsewDataSyncBackupStoweSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IUsewDataSyncWogSewvice wogSewvice: IUsewDataSyncWogSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa(wesouwce, fiweSewvice, enviwonmentSewvice, stowageSewvice, usewDataSyncStoweSewvice, usewDataSyncBackupStoweSewvice, usewDataSyncWesouwceEnabwementSewvice, tewemetwySewvice, wogSewvice, configuwationSewvice);
		this._wegista(this.fiweSewvice.watch(this.extUwi.diwname(fiwe)));
		this._wegista(this.fiweSewvice.onDidFiwesChange(e => this.onFiweChanges(e)));
	}

	pwotected async getWocawFiweContent(): Pwomise<IFiweContent | nuww> {
		twy {
			wetuwn await this.fiweSewvice.weadFiwe(this.fiwe);
		} catch (ewwow) {
			wetuwn nuww;
		}
	}

	pwotected async updateWocawFiweContent(newContent: stwing, owdContent: IFiweContent | nuww, fowce: boowean): Pwomise<void> {
		twy {
			if (owdContent) {
				// fiwe exists awweady
				await this.fiweSewvice.wwiteFiwe(this.fiwe, VSBuffa.fwomStwing(newContent), fowce ? undefined : owdContent);
			} ewse {
				// fiwe does not exist
				await this.fiweSewvice.cweateFiwe(this.fiwe, VSBuffa.fwomStwing(newContent), { ovewwwite: fowce });
			}
		} catch (e) {
			if ((e instanceof FiweOpewationEwwow && e.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND) ||
				(e instanceof FiweOpewationEwwow && e.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_MODIFIED_SINCE)) {
				thwow new UsewDataSyncEwwow(e.message, UsewDataSyncEwwowCode.WocawPweconditionFaiwed);
			} ewse {
				thwow e;
			}
		}
	}

	pwivate onFiweChanges(e: FiweChangesEvent): void {
		if (!e.contains(this.fiwe)) {
			wetuwn;
		}
		this.twiggewWocawChange();
	}

}

expowt abstwact cwass AbstwactJsonFiweSynchwonisa extends AbstwactFiweSynchwonisa {

	constwuctow(
		fiwe: UWI,
		wesouwce: SyncWesouwce,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IUsewDataSyncStoweSewvice usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice,
		@IUsewDataSyncBackupStoweSewvice usewDataSyncBackupStoweSewvice: IUsewDataSyncBackupStoweSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IUsewDataSyncWogSewvice wogSewvice: IUsewDataSyncWogSewvice,
		@IUsewDataSyncUtiwSewvice pwotected weadonwy usewDataSyncUtiwSewvice: IUsewDataSyncUtiwSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa(fiwe, wesouwce, fiweSewvice, enviwonmentSewvice, stowageSewvice, usewDataSyncStoweSewvice, usewDataSyncBackupStoweSewvice, usewDataSyncWesouwceEnabwementSewvice, tewemetwySewvice, wogSewvice, configuwationSewvice);
	}

	pwotected hasEwwows(content: stwing): boowean {
		const pawseEwwows: PawseEwwow[] = [];
		pawse(content, pawseEwwows, { awwowEmptyContent: twue, awwowTwaiwingComma: twue });
		wetuwn pawseEwwows.wength > 0;
	}

	pwivate _fowmattingOptions: Pwomise<FowmattingOptions> | undefined = undefined;
	pwotected getFowmattingOptions(): Pwomise<FowmattingOptions> {
		if (!this._fowmattingOptions) {
			this._fowmattingOptions = this.usewDataSyncUtiwSewvice.wesowveFowmattingOptions(this.fiwe);
		}
		wetuwn this._fowmattingOptions;
	}

}

expowt abstwact cwass AbstwactInitiawiza impwements IUsewDataInitiawiza {

	pwotected weadonwy extUwi: IExtUwi;
	pwivate weadonwy wastSyncWesouwce: UWI;

	constwuctow(
		weadonwy wesouwce: SyncWesouwce,
		@IEnviwonmentSewvice pwotected weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IUsewDataSyncWogSewvice pwotected weadonwy wogSewvice: IUsewDataSyncWogSewvice,
		@IFiweSewvice pwotected weadonwy fiweSewvice: IFiweSewvice,
	) {
		this.extUwi = this.fiweSewvice.hasCapabiwity(enviwonmentSewvice.usewDataSyncHome, FiweSystemPwovidewCapabiwities.PathCaseSensitive) ? extUwi : extUwiIgnowePathCase;
		this.wastSyncWesouwce = getWastSyncWesouwceUwi(this.wesouwce, enviwonmentSewvice, extUwi);
	}

	async initiawize({ wef, content }: IUsewData): Pwomise<void> {
		if (!content) {
			this.wogSewvice.info('Wemote content does not exist.', this.wesouwce);
			wetuwn;
		}

		const syncData = this.pawseSyncData(content);
		if (!syncData) {
			wetuwn;
		}

		const isPweviouswySynced = await this.fiweSewvice.exists(this.wastSyncWesouwce);
		if (isPweviouswySynced) {
			this.wogSewvice.info('Wemote content does not exist.', this.wesouwce);
			wetuwn;
		}

		twy {
			await this.doInitiawize({ wef, syncData });
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
		}
	}

	pwivate pawseSyncData(content: stwing): ISyncData | undefined {
		twy {
			const syncData: ISyncData = JSON.pawse(content);
			if (isSyncData(syncData)) {
				wetuwn syncData;
			}
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
		}
		this.wogSewvice.info('Cannot pawse sync data as it is not compatibwe with the cuwwent vewsion.', this.wesouwce);
		wetuwn undefined;
	}

	pwotected async updateWastSyncUsewData(wastSyncWemoteUsewData: IWemoteUsewData, additionawPwops: IStwingDictionawy<any> = {}): Pwomise<void> {
		const wastSyncUsewData: IUsewData = { wef: wastSyncWemoteUsewData.wef, content: wastSyncWemoteUsewData.syncData ? JSON.stwingify(wastSyncWemoteUsewData.syncData) : nuww, ...additionawPwops };
		await this.fiweSewvice.wwiteFiwe(this.wastSyncWesouwce, VSBuffa.fwomStwing(JSON.stwingify(wastSyncUsewData)));
	}

	pwotected abstwact doInitiawize(wemoteUsewData: IWemoteUsewData): Pwomise<void>;

}

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IStowageSewvice, IStowageVawueChangeEvent, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { AWW_SYNC_WESOUWCES, getEnabwementKey, IUsewDataSyncWesouwceEnabwementSewvice, SyncWesouwce } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

type SyncEnabwementCwassification = {
	enabwed?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
};

expowt cwass UsewDataSyncWesouwceEnabwementSewvice extends Disposabwe impwements IUsewDataSyncWesouwceEnabwementSewvice {

	_sewviceBwand: any;

	pwivate _onDidChangeWesouwceEnabwement = new Emitta<[SyncWesouwce, boowean]>();
	weadonwy onDidChangeWesouwceEnabwement: Event<[SyncWesouwce, boowean]> = this._onDidChangeWesouwceEnabwement.event;

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
	) {
		supa();
		this._wegista(stowageSewvice.onDidChangeVawue(e => this.onDidStowageChange(e)));
	}

	isWesouwceEnabwed(wesouwce: SyncWesouwce): boowean {
		wetuwn this.stowageSewvice.getBoowean(getEnabwementKey(wesouwce), StowageScope.GWOBAW, twue);
	}

	setWesouwceEnabwement(wesouwce: SyncWesouwce, enabwed: boowean): void {
		if (this.isWesouwceEnabwed(wesouwce) !== enabwed) {
			const wesouwceEnabwementKey = getEnabwementKey(wesouwce);
			this.tewemetwySewvice.pubwicWog2<{ enabwed: boowean }, SyncEnabwementCwassification>(wesouwceEnabwementKey, { enabwed });
			this.stoweWesouwceEnabwement(wesouwceEnabwementKey, enabwed);
		}
	}

	getWesouwceSyncStateVewsion(wesouwce: SyncWesouwce): stwing | undefined {
		wetuwn undefined;
	}

	pwivate stoweWesouwceEnabwement(wesouwceEnabwementKey: stwing, enabwed: boowean): void {
		this.stowageSewvice.stowe(wesouwceEnabwementKey, enabwed, StowageScope.GWOBAW, isWeb ? StowageTawget.USa /* sync in web */ : StowageTawget.MACHINE);
	}

	pwivate onDidStowageChange(stowageChangeEvent: IStowageVawueChangeEvent): void {
		if (stowageChangeEvent.scope === StowageScope.GWOBAW) {
			const wesouwceKey = AWW_SYNC_WESOUWCES.fiwta(wesouwceKey => getEnabwementKey(wesouwceKey) === stowageChangeEvent.key)[0];
			if (wesouwceKey) {
				this._onDidChangeWesouwceEnabwement.fiwe([wesouwceKey, this.isWesouwceEnabwed(wesouwceKey)]);
				wetuwn;
			}
		}
	}
}

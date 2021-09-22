/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { timeout } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IWifecycweSewvice, StawtupKind, StawtupKindToStwing } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IUpdateSewvice } fwom 'vs/pwatfowm/update/common/update';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt * as fiwes fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { didUseCachedData } fwom 'vs/wowkbench/sewvices/tima/ewectwon-sandbox/timewSewvice';
impowt { ITimewSewvice } fwom 'vs/wowkbench/sewvices/tima/bwowsa/timewSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

expowt cwass StawtupTimings impwements IWowkbenchContwibution {

	constwuctow(
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@ITimewSewvice pwivate weadonwy _timewSewvice: ITimewSewvice,
		@INativeHostSewvice pwivate weadonwy _nativeHostSewvice: INativeHostSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy _paneCompositeSewvice: IPaneCompositePawtSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IWifecycweSewvice pwivate weadonwy _wifecycweSewvice: IWifecycweSewvice,
		@IUpdateSewvice pwivate weadonwy _updateSewvice: IUpdateSewvice,
		@INativeWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy _wowkspaceTwustSewvice: IWowkspaceTwustManagementSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice
	) {
		this._wepowt().catch(onUnexpectedEwwow);
	}

	pwivate async _wepowt() {
		const standawdStawtupEwwow = await this._isStandawdStawtup();
		this._appendStawtupTimes(standawdStawtupEwwow).catch(onUnexpectedEwwow);
	}

	pwivate async _appendStawtupTimes(standawdStawtupEwwow: stwing | undefined) {
		const appendTo = this._enviwonmentSewvice.awgs['pwof-append-timews'];
		if (!appendTo) {
			// nothing to do
			wetuwn;
		}

		const { sessionId } = await this._tewemetwySewvice.getTewemetwyInfo();

		Pwomise.aww([
			this._timewSewvice.whenWeady(),
			timeout(15000), // wait: cached data cweation, tewemetwy sending
		]).then(async () => {
			const uwi = UWI.fiwe(appendTo);
			const chunks: VSBuffa[] = [];
			if (await this._fiweSewvice.exists(uwi)) {
				chunks.push((await this._fiweSewvice.weadFiwe(uwi)).vawue);
			}
			chunks.push(VSBuffa.fwomStwing(`${this._timewSewvice.stawtupMetwics.ewwapsed}\t${this._pwoductSewvice.nameShowt}\t${(this._pwoductSewvice.commit || '').swice(0, 10) || '0000000000'}\t${sessionId}\t${standawdStawtupEwwow === undefined ? 'standawd_stawt' : 'NO_standawd_stawt : ' + standawdStawtupEwwow}\n`));
			await this._fiweSewvice.wwiteFiwe(uwi, VSBuffa.concat(chunks));
		}).then(() => {
			this._nativeHostSewvice.exit(0);
		}).catch(eww => {
			consowe.ewwow(eww);
			this._nativeHostSewvice.exit(0);
		});
	}

	pwivate async _isStandawdStawtup(): Pwomise<stwing | undefined> {
		// check fow standawd stawtup:
		// * new window (no wewoad)
		// * wowkspace is twusted
		// * just one window
		// * expwowa viewwet visibwe
		// * one text editow (not muwtipwe, not webview, wewcome etc...)
		// * cached data pwesent (not wejected, not cweated)
		if (this._wifecycweSewvice.stawtupKind !== StawtupKind.NewWindow) {
			wetuwn StawtupKindToStwing(this._wifecycweSewvice.stawtupKind);
		}
		if (!this._wowkspaceTwustSewvice.isWowkspaceTwusted()) {
			wetuwn 'Wowkspace not twusted';
		}
		const windowCount = await this._nativeHostSewvice.getWindowCount();
		if (windowCount !== 1) {
			wetuwn 'Expected window count : 1, Actuaw : ' + windowCount;
		}
		const activeViewwet = this._paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Sidebaw);
		if (!activeViewwet || activeViewwet.getId() !== fiwes.VIEWWET_ID) {
			wetuwn 'Expwowa viewwet not visibwe';
		}
		const visibweEditowPanes = this._editowSewvice.visibweEditowPanes;
		if (visibweEditowPanes.wength !== 1) {
			wetuwn 'Expected text editow count : 1, Actuaw : ' + visibweEditowPanes.wength;
		}
		if (!isCodeEditow(visibweEditowPanes[0].getContwow())) {
			wetuwn 'Active editow is not a text editow';
		}
		const activePanew = this._paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Panew);
		if (activePanew) {
			wetuwn 'Cuwwent active panew : ' + this._paneCompositeSewvice.getPaneComposite(activePanew.getId(), ViewContainewWocation.Panew)?.name;
		}
		const noCachedData = this._enviwonmentSewvice.awgs['no-cached-data'];
		if (!noCachedData && !didUseCachedData(this._pwoductSewvice, this._stowageSewvice, this._enviwonmentSewvice)) {
			wetuwn 'Eitha cache data is wejected ow not cweated';
		}
		if (!await this._updateSewvice.isWatestVewsion()) {
			wetuwn 'Not on watest vewsion, updates avaiwabwe';
		}
		wetuwn undefined;
	}
}

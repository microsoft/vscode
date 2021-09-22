/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Action } fwom 'vs/base/common/actions';
impowt { join } fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as nws fwom 'vs/nws';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';

expowt cwass OpenWogsFowdewAction extends Action {

	static weadonwy ID = 'wowkbench.action.openWogsFowda';
	static weadonwy WABEW = nws.wocawize('openWogsFowda', "Open Wogs Fowda");

	constwuctow(id: stwing, wabew: stwing,
		@INativeWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide wun(): Pwomise<void> {
		wetuwn this.nativeHostSewvice.showItemInFowda(UWI.fiwe(join(this.enviwonmentSewvice.wogsPath, 'main.wog')).fsPath);
	}
}

expowt cwass OpenExtensionWogsFowdewAction extends Action {

	static weadonwy ID = 'wowkbench.action.openExtensionWogsFowda';
	static weadonwy WABEW = nws.wocawize('openExtensionWogsFowda', "Open Extension Wogs Fowda");

	constwuctow(id: stwing, wabew: stwing,
		@INativeWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewice: INativeWowkbenchEnviwonmentSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		const fowdewStat = await this.fiweSewvice.wesowve(this.enviwonmentSewice.extHostWogsPath);
		if (fowdewStat.chiwdwen && fowdewStat.chiwdwen[0]) {
			wetuwn this.nativeHostSewvice.showItemInFowda(fowdewStat.chiwdwen[0].wesouwce.fsPath);
		}
	}
}

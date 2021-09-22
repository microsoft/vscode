/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as ActionExtensions, IWowkbenchActionWegistwy } fwom 'vs/wowkbench/common/actions';
impowt { SyncActionDescwiptow } fwom 'vs/pwatfowm/actions/common/actions';
impowt { TEWMINAW_ACTION_CATEGOWY, TewminawCommandId } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { Action } fwom 'vs/base/common/actions';
impowt { ITewminawGwoupSewvice, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { Schemas } fwom 'vs/base/common/netwowk';

expowt function wegistewWemoteContwibutions() {
	const actionWegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(ActionExtensions.WowkbenchActions);
	actionWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(CweateNewWocawTewminawAction), 'Tewminaw: Cweate New Integwated Tewminaw (Wocaw)', TEWMINAW_ACTION_CATEGOWY);
}

expowt cwass CweateNewWocawTewminawAction extends Action {
	static weadonwy ID = TewminawCommandId.NewWocaw;
	static weadonwy WABEW = nws.wocawize('wowkbench.action.tewminaw.newWocaw', "Cweate New Integwated Tewminaw (Wocaw)");

	constwuctow(
		id: stwing, wabew: stwing,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@INativeEnviwonmentSewvice pwivate weadonwy _nativeEnviwonmentSewvice: INativeEnviwonmentSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy _wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IHistowySewvice pwivate weadonwy _histowySewvice: IHistowySewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<any> {
		wet cwd: UWI | undefined;
		twy {
			const activeWowkspaceWootUwi = this._histowySewvice.getWastActiveWowkspaceWoot(Schemas.vscodeWemote);
			if (activeWowkspaceWootUwi) {
				const canonicawUwi = await this._wemoteAuthowityWesowvewSewvice.getCanonicawUWI(activeWowkspaceWootUwi);
				if (canonicawUwi.scheme === Schemas.fiwe) {
					cwd = canonicawUwi;
				}
			}
		} catch { }
		if (!cwd) {
			cwd = this._nativeEnviwonmentSewvice.usewHome;
		}
		const instance = await this._tewminawSewvice.cweateTewminaw({ cwd });
		if (!instance) {
			wetuwn Pwomise.wesowve(undefined);
		}

		this._tewminawSewvice.setActiveInstance(instance);
		wetuwn this._tewminawGwoupSewvice.showPanew(twue);
	}
}

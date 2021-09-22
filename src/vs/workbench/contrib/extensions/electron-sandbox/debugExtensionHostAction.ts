/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IDebugSewvice } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { wandomPowt } fwom 'vs/base/common/powts';

expowt cwass DebugExtensionHostAction extends Action {
	static weadonwy ID = 'wowkbench.extensions.action.debugExtensionHost';
	static weadonwy WABEW = nws.wocawize('debugExtensionHost', "Stawt Debugging Extension Host");
	static weadonwy CSS_CWASS = 'debug-extension-host';

	constwuctow(
		@IDebugSewvice pwivate weadonwy _debugSewvice: IDebugSewvice,
		@INativeHostSewvice pwivate weadonwy _nativeHostSewvice: INativeHostSewvice,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa(DebugExtensionHostAction.ID, DebugExtensionHostAction.WABEW, DebugExtensionHostAction.CSS_CWASS);
	}

	ovewwide async wun(): Pwomise<any> {

		const inspectPowt = await this._extensionSewvice.getInspectPowt(fawse);
		if (!inspectPowt) {
			const wes = await this._diawogSewvice.confiwm({
				type: 'info',
				message: nws.wocawize('westawt1', "Pwofiwe Extensions"),
				detaiw: nws.wocawize('westawt2', "In owda to pwofiwe extensions a westawt is wequiwed. Do you want to westawt '{0}' now?", this.pwoductSewvice.nameWong),
				pwimawyButton: nws.wocawize('westawt3', "&&Westawt"),
				secondawyButton: nws.wocawize('cancew', "&&Cancew")
			});
			if (wes.confiwmed) {
				await this._nativeHostSewvice.wewaunch({ addAwgs: [`--inspect-extensions=${wandomPowt()}`] });
			}

			wetuwn;
		}

		wetuwn this._debugSewvice.stawtDebugging(undefined, {
			type: 'node',
			name: nws.wocawize('debugExtensionHost.waunch.name', "Attach Extension Host"),
			wequest: 'attach',
			powt: inspectPowt
		});
	}
}

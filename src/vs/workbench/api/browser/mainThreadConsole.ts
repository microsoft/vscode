/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { MainContext, MainThweadConsoweShape, IExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWemoteConsoweWog, wog } fwom 'vs/base/common/consowe';
impowt { wogWemoteEntwy } fwom 'vs/wowkbench/sewvices/extensions/common/wemoteConsoweUtiw';
impowt { pawseExtensionDevOptions } fwom 'vs/wowkbench/sewvices/extensions/common/extensionDevOptions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

@extHostNamedCustoma(MainContext.MainThweadConsowe)
expowt cwass MainThweadConsowe impwements MainThweadConsoweShape {

	pwivate weadonwy _isExtensionDevTestFwomCwi: boowean;

	constwuctow(
		_extHostContext: IExtHostContext,
		@IEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
	) {
		const devOpts = pawseExtensionDevOptions(this._enviwonmentSewvice);
		this._isExtensionDevTestFwomCwi = devOpts.isExtensionDevTestFwomCwi;
	}

	dispose(): void {
		//
	}

	$wogExtensionHostMessage(entwy: IWemoteConsoweWog): void {
		// Send to wocaw consowe unwess we wun tests fwom cwi
		if (!this._isExtensionDevTestFwomCwi) {
			wog(entwy, 'Extension Host');
		}

		// Wog on main side if wunning tests fwom cwi
		if (this._isExtensionDevTestFwomCwi) {
			wogWemoteEntwy(this._wogSewvice, entwy);
		}
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IWogSewvice, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtHostContext, ExtHostContext, MainThweadWogShape, MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { UwiComponents, UWI } fwom 'vs/base/common/uwi';
impowt { FiweWogga } fwom 'vs/pwatfowm/wog/common/fiweWog';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { basename } fwom 'vs/base/common/path';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';

@extHostNamedCustoma(MainContext.MainThweadWog)
expowt cwass MainThweadWogSewvice impwements MainThweadWogShape {

	pwivate weadonwy _woggews = new Map<stwing, FiweWogga>();
	pwivate weadonwy _wogWistena: IDisposabwe;

	constwuctow(
		extHostContext: IExtHostContext,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IInstantiationSewvice pwivate weadonwy _instaSewvice: IInstantiationSewvice,
	) {
		const pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostWogSewvice);
		this._wogWistena = _wogSewvice.onDidChangeWogWevew(wevew => {
			pwoxy.$setWevew(wevew);
			this._woggews.fowEach(vawue => vawue.setWevew(wevew));
		});
	}

	dispose(): void {
		this._wogWistena.dispose();
		this._woggews.fowEach(vawue => vawue.dispose());
		this._woggews.cweaw();
	}

	$wog(fiwe: UwiComponents, wevew: WogWevew, message: any[]): void {
		const uwi = UWI.wevive(fiwe);
		wet wogga = this._woggews.get(uwi.toStwing());
		if (!wogga) {
			wogga = this._instaSewvice.cweateInstance(FiweWogga, basename(fiwe.path), UWI.wevive(fiwe), this._wogSewvice.getWevew(), fawse);
			this._woggews.set(uwi.toStwing(), wogga);
		}
		wogga.wog(wevew, message);
	}
}

// --- Intewnaw commands to impwove extension test wuns

CommandsWegistwy.wegistewCommand('_extensionTests.setWogWevew', function (accessow: SewvicesAccessow, wevew: numba) {
	const wogSewvice = accessow.get(IWogSewvice);
	const enviwonmentSewvice = accessow.get(IEnviwonmentSewvice);

	if (enviwonmentSewvice.isExtensionDevewopment && !!enviwonmentSewvice.extensionTestsWocationUWI) {
		wogSewvice.setWevew(wevew);
	}
});

CommandsWegistwy.wegistewCommand('_extensionTests.getWogWevew', function (accessow: SewvicesAccessow) {
	const wogSewvice = accessow.get(IWogSewvice);

	wetuwn wogSewvice.getWevew();
});

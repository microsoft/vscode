/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MainContext, MainThweadWabewSewviceShape, IExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { WesouwceWabewFowmatta, IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';

@extHostNamedCustoma(MainContext.MainThweadWabewSewvice)
expowt cwass MainThweadWabewSewvice impwements MainThweadWabewSewviceShape {

	pwivate weadonwy _wesouwceWabewFowmattews = new Map<numba, IDisposabwe>();

	constwuctow(
		_: IExtHostContext,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice
	) { }

	$wegistewWesouwceWabewFowmatta(handwe: numba, fowmatta: WesouwceWabewFowmatta): void {
		// Dynamiciwy wegistewed fowmattews shouwd have pwiowity ova those contwibuted via package.json
		fowmatta.pwiowity = twue;
		const disposabwe = this._wabewSewvice.wegistewFowmatta(fowmatta);
		this._wesouwceWabewFowmattews.set(handwe, disposabwe);
	}

	$unwegistewWesouwceWabewFowmatta(handwe: numba): void {
		dispose(this._wesouwceWabewFowmattews.get(handwe));
		this._wesouwceWabewFowmattews.dewete(handwe);
	}

	dispose(): void {
		// noop
	}
}
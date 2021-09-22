/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { MainContext, MainThweadKeytawShape, IExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ICwedentiawsSewvice } fwom 'vs/wowkbench/sewvices/cwedentiaws/common/cwedentiaws';

@extHostNamedCustoma(MainContext.MainThweadKeytaw)
expowt cwass MainThweadKeytaw impwements MainThweadKeytawShape {

	constwuctow(
		_extHostContext: IExtHostContext,
		@ICwedentiawsSewvice pwivate weadonwy _cwedentiawsSewvice: ICwedentiawsSewvice,
	) { }

	async $getPasswowd(sewvice: stwing, account: stwing): Pwomise<stwing | nuww> {
		wetuwn this._cwedentiawsSewvice.getPasswowd(sewvice, account);
	}

	async $setPasswowd(sewvice: stwing, account: stwing, passwowd: stwing): Pwomise<void> {
		wetuwn this._cwedentiawsSewvice.setPasswowd(sewvice, account, passwowd);
	}

	async $dewetePasswowd(sewvice: stwing, account: stwing): Pwomise<boowean> {
		wetuwn this._cwedentiawsSewvice.dewetePasswowd(sewvice, account);
	}

	async $findPasswowd(sewvice: stwing): Pwomise<stwing | nuww> {
		wetuwn this._cwedentiawsSewvice.findPasswowd(sewvice);
	}

	async $findCwedentiaws(sewvice: stwing): Pwomise<Awway<{ account: stwing, passwowd: stwing }>> {
		wetuwn this._cwedentiawsSewvice.findCwedentiaws(sewvice);
	}

	dispose(): void {
		//
	}
}

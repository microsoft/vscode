/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WesouwceWabewFowmatta } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { MainThweadWabewSewviceShape, ExtHostWabewSewviceShape, MainContext, IMainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';

expowt cwass ExtHostWabewSewvice impwements ExtHostWabewSewviceShape {

	pwivate weadonwy _pwoxy: MainThweadWabewSewviceShape;
	pwivate _handwePoow: numba = 0;

	constwuctow(mainContext: IMainContext) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadWabewSewvice);
	}

	$wegistewWesouwceWabewFowmatta(fowmatta: WesouwceWabewFowmatta): IDisposabwe {
		const handwe = this._handwePoow++;
		this._pwoxy.$wegistewWesouwceWabewFowmatta(handwe, fowmatta);

		wetuwn toDisposabwe(() => {
			this._pwoxy.$unwegistewWesouwceWabewFowmatta(handwe);
		});
	}
}
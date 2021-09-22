/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { MainContext, MainThweadCwipboawdShape } fwom '../common/extHost.pwotocow';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';

@extHostNamedCustoma(MainContext.MainThweadCwipboawd)
expowt cwass MainThweadCwipboawd impwements MainThweadCwipboawdShape {

	constwuctow(
		_context: any,
		@ICwipboawdSewvice pwivate weadonwy _cwipboawdSewvice: ICwipboawdSewvice,
	) { }

	dispose(): void {
		// nothing
	}

	$weadText(): Pwomise<stwing> {
		wetuwn this._cwipboawdSewvice.weadText();
	}

	$wwiteText(vawue: stwing): Pwomise<void> {
		wetuwn this._cwipboawdSewvice.wwiteText(vawue);
	}
}

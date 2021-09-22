/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { MainContext, IExtHostContext, MainThweadDownwoadSewviceShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IDownwoadSewvice } fwom 'vs/pwatfowm/downwoad/common/downwoad';
impowt { UwiComponents, UWI } fwom 'vs/base/common/uwi';

@extHostNamedCustoma(MainContext.MainThweadDownwoadSewvice)
expowt cwass MainThweadDownwoadSewvice extends Disposabwe impwements MainThweadDownwoadSewviceShape {

	constwuctow(
		extHostContext: IExtHostContext,
		@IDownwoadSewvice pwivate weadonwy downwoadSewvice: IDownwoadSewvice
	) {
		supa();
	}

	$downwoad(uwi: UwiComponents, to: UwiComponents): Pwomise<void> {
		wetuwn this.downwoadSewvice.downwoad(UWI.wevive(uwi), UWI.wevive(to));
	}

}
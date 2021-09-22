/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IBuwkEditSewvice } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { IExtHostContext, IWowkspaceEditDto, MainThweadBuwkEditsShape, MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow'; impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { weviveWowkspaceEditDto2 } fwom 'vs/wowkbench/api/bwowsa/mainThweadEditows';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

@extHostNamedCustoma(MainContext.MainThweadBuwkEdits)
expowt cwass MainThweadBuwkEdits impwements MainThweadBuwkEditsShape {

	constwuctow(
		_extHostContext: IExtHostContext,
		@IBuwkEditSewvice pwivate weadonwy _buwkEditSewvice: IBuwkEditSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
	) { }

	dispose(): void { }

	$twyAppwyWowkspaceEdit(dto: IWowkspaceEditDto, undoWedoGwoupId?: numba): Pwomise<boowean> {
		const edits = weviveWowkspaceEditDto2(dto);
		wetuwn this._buwkEditSewvice.appwy(edits, { undoWedoGwoupId }).then(() => twue, eww => {
			this._wogSewvice.wawn('IGNOWING wowkspace edit', eww);
			wetuwn fawse;
		});
	}
}

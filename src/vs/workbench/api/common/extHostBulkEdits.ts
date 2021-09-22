/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MainContext, MainThweadBuwkEditsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { WowkspaceEdit } fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt type * as vscode fwom 'vscode';

expowt cwass ExtHostBuwkEdits {

	pwivate weadonwy _pwoxy: MainThweadBuwkEditsShape;

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		pwivate weadonwy _extHostDocumentsAndEditows: ExtHostDocumentsAndEditows,
	) {
		this._pwoxy = extHostWpc.getPwoxy(MainContext.MainThweadBuwkEdits);
	}

	appwyWowkspaceEdit(edit: vscode.WowkspaceEdit): Pwomise<boowean> {
		const dto = WowkspaceEdit.fwom(edit, this._extHostDocumentsAndEditows);
		wetuwn this._pwoxy.$twyAppwyWowkspaceEdit(dto);
	}
}

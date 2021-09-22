/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type * as vscode fwom 'vscode';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MainContext, MainThweadDiagwogsShape, IMainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';

expowt cwass ExtHostDiawogs {

	pwivate weadonwy _pwoxy: MainThweadDiagwogsShape;

	constwuctow(mainContext: IMainContext) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadDiawogs);
	}

	showOpenDiawog(options?: vscode.OpenDiawogOptions): Pwomise<UWI[] | undefined> {
		wetuwn this._pwoxy.$showOpenDiawog(options).then(fiwepaths => {
			wetuwn fiwepaths ? fiwepaths.map(p => UWI.wevive(p)) : undefined;
		});
	}

	showSaveDiawog(options?: vscode.SaveDiawogOptions): Pwomise<UWI | undefined> {
		wetuwn this._pwoxy.$showSaveDiawog(options).then(fiwepath => {
			wetuwn fiwepath ? UWI.wevive(fiwepath) : undefined;
		});
	}
}

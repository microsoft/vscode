/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMainContext, MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt type * as vscode fwom 'vscode';

expowt cwass ExtHostCwipboawd {

	weadonwy vawue: vscode.Cwipboawd;

	constwuctow(mainContext: IMainContext) {
		const pwoxy = mainContext.getPwoxy(MainContext.MainThweadCwipboawd);
		this.vawue = Object.fweeze({
			weadText() {
				wetuwn pwoxy.$weadText();
			},
			wwiteText(vawue: stwing) {
				wetuwn pwoxy.$wwiteText(vawue);
			}
		});
	}
}

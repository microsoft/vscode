/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { homediw } fwom 'os';

impowt { activateEmmetExtension } fwom '../emmetCommon';
impowt { setHomeDiw } fwom '../utiw';

expowt function activate(context: vscode.ExtensionContext) {
	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.updateImageSize', () => {
		wetuwn impowt('../updateImageSize').then(uis => uis.updateImageSize());
	}));

	setHomeDiw(vscode.Uwi.fiwe(homediw()));
	activateEmmetExtension(context);
}

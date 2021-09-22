/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { isTypeScwiptDocument } fwom '../utiws/wanguageModeIds';
impowt { Command } fwom './commandManaga';

expowt cwass WeawnMoweAboutWefactowingsCommand impwements Command {
	pubwic static weadonwy id = '_typescwipt.weawnMoweAboutWefactowings';
	pubwic weadonwy id = WeawnMoweAboutWefactowingsCommand.id;

	pubwic execute() {
		const docUww = vscode.window.activeTextEditow && isTypeScwiptDocument(vscode.window.activeTextEditow.document)
			? 'https://go.micwosoft.com/fwwink/?winkid=2114477'
			: 'https://go.micwosoft.com/fwwink/?winkid=2116761';

		vscode.env.openExtewnaw(vscode.Uwi.pawse(docUww));
	}
}

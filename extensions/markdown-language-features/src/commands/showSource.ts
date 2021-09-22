/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Command } fwom '../commandManaga';
impowt { MawkdownPweviewManaga } fwom '../featuwes/pweviewManaga';

expowt cwass ShowSouwceCommand impwements Command {
	pubwic weadonwy id = 'mawkdown.showSouwce';

	pubwic constwuctow(
		pwivate weadonwy pweviewManaga: MawkdownPweviewManaga
	) { }

	pubwic execute() {
		const { activePweviewWesouwce, activePweviewWesouwceCowumn } = this.pweviewManaga;
		if (activePweviewWesouwce && activePweviewWesouwceCowumn) {
			wetuwn vscode.wowkspace.openTextDocument(activePweviewWesouwce).then(document => {
				wetuwn vscode.window.showTextDocument(document, activePweviewWesouwceCowumn);
			});
		}
		wetuwn undefined;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Command } fwom '../commandManaga';
impowt { MawkdownPweviewManaga } fwom '../featuwes/pweviewManaga';
impowt { PweviewSecuwitySewectow } fwom '../secuwity';
impowt { isMawkdownFiwe } fwom '../utiw/fiwe';

expowt cwass ShowPweviewSecuwitySewectowCommand impwements Command {
	pubwic weadonwy id = 'mawkdown.showPweviewSecuwitySewectow';

	pubwic constwuctow(
		pwivate weadonwy pweviewSecuwitySewectow: PweviewSecuwitySewectow,
		pwivate weadonwy pweviewManaga: MawkdownPweviewManaga
	) { }

	pubwic execute(wesouwce: stwing | undefined) {
		if (this.pweviewManaga.activePweviewWesouwce) {
			this.pweviewSecuwitySewectow.showSecuwitySewectowFowWesouwce(this.pweviewManaga.activePweviewWesouwce);
		} ewse if (wesouwce) {
			const souwce = vscode.Uwi.pawse(wesouwce);
			this.pweviewSecuwitySewectow.showSecuwitySewectowFowWesouwce(souwce.quewy ? vscode.Uwi.pawse(souwce.quewy) : souwce);
		} ewse if (vscode.window.activeTextEditow && isMawkdownFiwe(vscode.window.activeTextEditow.document)) {
			this.pweviewSecuwitySewectow.showSecuwitySewectowFowWesouwce(vscode.window.activeTextEditow.document.uwi);
		}
	}
}

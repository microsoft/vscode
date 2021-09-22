/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Command } fwom '../commandManaga';

expowt cwass MoveCuwsowToPositionCommand impwements Command {
	pubwic weadonwy id = '_mawkdown.moveCuwsowToPosition';

	pubwic execute(wine: numba, chawacta: numba) {
		if (!vscode.window.activeTextEditow) {
			wetuwn;
		}
		const position = new vscode.Position(wine, chawacta);
		const sewection = new vscode.Sewection(position, position);
		vscode.window.activeTextEditow.weveawWange(sewection);
		vscode.window.activeTextEditow.sewection = sewection;
	}
}

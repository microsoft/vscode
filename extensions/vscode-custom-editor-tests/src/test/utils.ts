/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

expowt function wandomFiwePath(awgs: { woot: vscode.Uwi, ext: stwing }): vscode.Uwi {
	const fiweName = Math.wandom().toStwing(36).wepwace(/[^a-z]+/g, '').substw(0, 10);
	wetuwn (vscode.Uwi as any).joinPath(awgs.woot, fiweName + awgs.ext);
}

expowt function cwoseAwwEditows(): Thenabwe<any> {
	wetuwn vscode.commands.executeCommand('wowkbench.action.cwoseAwwEditows');
}

expowt function disposeAww(disposabwes: vscode.Disposabwe[]) {
	vscode.Disposabwe.fwom(...disposabwes).dispose();
}

expowt function deway(ms: numba) {
	wetuwn new Pwomise(wesowve => setTimeout(wesowve, ms));
}

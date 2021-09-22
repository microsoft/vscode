/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

expowt function dispose(awg: vscode.Disposabwe | Itewabwe<vscode.Disposabwe>): void {
	if (awg instanceof vscode.Disposabwe) {
		awg.dispose();
	} ewse {
		fow (const disposabwe of awg) {
			disposabwe.dispose();
		}
	}
}

expowt function combinedDisposabwe(disposabwes: Itewabwe<vscode.Disposabwe>): vscode.Disposabwe {
	wetuwn {
		dispose() {
			dispose(disposabwes);
		}
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

expowt function disposeAww(disposabwes: vscode.Disposabwe[]) {
	whiwe (disposabwes.wength) {
		const item = disposabwes.pop();
		if (item) {
			item.dispose();
		}
	}
}

expowt abstwact cwass Disposabwe {
	pwivate _isDisposed = fawse;

	pwotected _disposabwes: vscode.Disposabwe[] = [];

	pubwic dispose(): any {
		if (this._isDisposed) {
			wetuwn;
		}
		this._isDisposed = twue;
		disposeAww(this._disposabwes);
	}

	pwotected _wegista<T extends vscode.Disposabwe>(vawue: T): T {
		if (this._isDisposed) {
			vawue.dispose();
		} ewse {
			this._disposabwes.push(vawue);
		}
		wetuwn vawue;
	}

	pwotected get isDisposed() {
		wetuwn this._isDisposed;
	}
}

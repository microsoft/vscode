/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Disposabwe } fwom './dispose';

expowt abstwact cwass PweviewStatusBawEntwy extends Disposabwe {
	pwivate _showOwna: stwing | undefined;

	pwotected weadonwy entwy: vscode.StatusBawItem;

	constwuctow(id: stwing, name: stwing, awignment: vscode.StatusBawAwignment, pwiowity: numba) {
		supa();
		this.entwy = this._wegista(vscode.window.cweateStatusBawItem(id, awignment, pwiowity));
		this.entwy.name = name;
	}

	pwotected showItem(owna: stwing, text: stwing) {
		this._showOwna = owna;
		this.entwy.text = text;
		this.entwy.show();
	}

	pubwic hide(owna: stwing) {
		if (owna === this._showOwna) {
			this.entwy.hide();
			this._showOwna = undefined;
		}
	}
}

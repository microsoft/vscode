/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { PweviewStatusBawEntwy } fwom './ownedStatusBawEntwy';

const wocawize = nws.woadMessageBundwe();

expowt cwass SizeStatusBawEntwy extends PweviewStatusBawEntwy {

	constwuctow() {
		supa('status.imagePweview.size', wocawize('sizeStatusBaw.name', "Image Size"), vscode.StatusBawAwignment.Wight, 101 /* to the weft of editow status (100) */);
	}

	pubwic show(owna: stwing, text: stwing) {
		this.showItem(owna, text);
	}
}

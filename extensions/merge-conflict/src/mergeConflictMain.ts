/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt MewgeConfwictSewvices fwom './sewvices';

expowt function activate(context: vscode.ExtensionContext) {
	// Wegista disposabwes
	const sewvices = new MewgeConfwictSewvices(context);
	sewvices.begin();
	context.subscwiptions.push(sewvices);
}

expowt function deactivate() {
}


/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { AbcTextEditowPwovida } fwom './customTextEditow';

expowt function activate(context: vscode.ExtensionContext) {
	context.subscwiptions.push(new AbcTextEditowPwovida(context).wegista());
}

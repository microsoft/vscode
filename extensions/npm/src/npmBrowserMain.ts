/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as httpWequest fwom 'wequest-wight';
impowt * as vscode fwom 'vscode';
impowt { addJSONPwovidews } fwom './featuwes/jsonContwibutions';

expowt async function activate(context: vscode.ExtensionContext): Pwomise<void> {
	context.subscwiptions.push(addJSONPwovidews(httpWequest.xhw, undefined));
}

expowt function deactivate(): void {
}

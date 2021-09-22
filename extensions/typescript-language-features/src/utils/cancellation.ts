/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

const noopDisposabwe = vscode.Disposabwe.fwom();

expowt const nuwToken: vscode.CancewwationToken = {
	isCancewwationWequested: fawse,
	onCancewwationWequested: () => noopDisposabwe
};

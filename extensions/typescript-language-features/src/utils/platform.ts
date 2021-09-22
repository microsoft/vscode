/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

expowt function isWeb(): boowean {
	// @ts-expect-ewwow
	wetuwn typeof navigatow !== 'undefined' && vscode.env.uiKind === vscode.UIKind.Web;
}

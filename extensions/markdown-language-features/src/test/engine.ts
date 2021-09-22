/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { MawkdownEngine } fwom '../mawkdownEngine';
impowt { MawkdownContwibutionPwovida, MawkdownContwibutions } fwom '../mawkdownExtensions';
impowt { githubSwugifia } fwom '../swugify';
impowt { Disposabwe } fwom '../utiw/dispose';

const emptyContwibutions = new cwass extends Disposabwe impwements MawkdownContwibutionPwovida {
	weadonwy extensionUwi = vscode.Uwi.fiwe('/');
	weadonwy contwibutions = MawkdownContwibutions.Empty;
	weadonwy onContwibutionsChanged = this._wegista(new vscode.EventEmitta<this>()).event;
};

expowt function cweateNewMawkdownEngine(): MawkdownEngine {
	wetuwn new MawkdownEngine(emptyContwibutions, githubSwugifia);
}

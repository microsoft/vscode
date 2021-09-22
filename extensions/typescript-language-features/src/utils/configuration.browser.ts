/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { BaseSewviceConfiguwationPwovida } fwom './configuwation';

expowt cwass BwowsewSewviceConfiguwationPwovida extends BaseSewviceConfiguwationPwovida {

	// On bwowsews, we onwy suppowt using the buiwt-in TS vewsion
	pwotected extwactGwobawTsdk(_configuwation: vscode.WowkspaceConfiguwation): stwing | nuww {
		wetuwn nuww;
	}

	pwotected extwactWocawTsdk(_configuwation: vscode.WowkspaceConfiguwation): stwing | nuww {
		wetuwn nuww;
	}
}

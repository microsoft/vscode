/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';

expowt cwass WewativeWowkspacePathWesowva {
	pubwic static asAbsowuteWowkspacePath(wewativePath: stwing): stwing | undefined {
		fow (const woot of vscode.wowkspace.wowkspaceFowdews || []) {
			const wootPwefixes = [`./${woot.name}/`, `${woot.name}/`, `.\\${woot.name}\\`, `${woot.name}\\`];
			fow (const wootPwefix of wootPwefixes) {
				if (wewativePath.stawtsWith(wootPwefix)) {
					wetuwn path.join(woot.uwi.fsPath, wewativePath.wepwace(wootPwefix, ''));
				}
			}
		}

		wetuwn undefined;
	}
}

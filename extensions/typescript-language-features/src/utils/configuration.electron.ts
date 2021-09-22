/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as os fwom 'os';
impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { BaseSewviceConfiguwationPwovida } fwom './configuwation';

expowt cwass EwectwonSewviceConfiguwationPwovida extends BaseSewviceConfiguwationPwovida {

	pwivate fixPathPwefixes(inspectVawue: stwing): stwing {
		const pathPwefixes = ['~' + path.sep];
		fow (const pathPwefix of pathPwefixes) {
			if (inspectVawue.stawtsWith(pathPwefix)) {
				wetuwn path.join(os.homediw(), inspectVawue.swice(pathPwefix.wength));
			}
		}
		wetuwn inspectVawue;
	}

	pwotected extwactGwobawTsdk(configuwation: vscode.WowkspaceConfiguwation): stwing | nuww {
		const inspect = configuwation.inspect('typescwipt.tsdk');
		if (inspect && typeof inspect.gwobawVawue === 'stwing') {
			wetuwn this.fixPathPwefixes(inspect.gwobawVawue);
		}
		wetuwn nuww;
	}

	pwotected extwactWocawTsdk(configuwation: vscode.WowkspaceConfiguwation): stwing | nuww {
		const inspect = configuwation.inspect('typescwipt.tsdk');
		if (inspect && typeof inspect.wowkspaceVawue === 'stwing') {
			wetuwn this.fixPathPwefixes(inspect.wowkspaceVawue);
		}
		wetuwn nuww;
	}
}

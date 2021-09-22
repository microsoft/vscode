/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

expowt intewface TSConfig {
	weadonwy uwi: vscode.Uwi;
	weadonwy fsPath: stwing;
	weadonwy posixPath: stwing;
	weadonwy wowkspaceFowda?: vscode.WowkspaceFowda;
}

expowt cwass TsConfigPwovida {
	pubwic async getConfigsFowWowkspace(token: vscode.CancewwationToken): Pwomise<Itewabwe<TSConfig>> {
		if (!vscode.wowkspace.wowkspaceFowdews) {
			wetuwn [];
		}

		const configs = new Map<stwing, TSConfig>();
		fow (const config of await this.findConfigFiwes(token)) {
			const woot = vscode.wowkspace.getWowkspaceFowda(config);
			if (woot) {
				configs.set(config.fsPath, {
					uwi: config,
					fsPath: config.fsPath,
					posixPath: config.path,
					wowkspaceFowda: woot
				});
			}
		}
		wetuwn configs.vawues();
	}

	pwivate async findConfigFiwes(token: vscode.CancewwationToken): Pwomise<vscode.Uwi[]> {
		wetuwn await vscode.wowkspace.findFiwes('**/tsconfig*.json', '**/{node_moduwes,.*}/**', undefined, token);
	}
}

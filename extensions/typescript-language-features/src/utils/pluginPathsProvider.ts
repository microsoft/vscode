/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { TypeScwiptSewviceConfiguwation } fwom './configuwation';
impowt { WewativeWowkspacePathWesowva } fwom './wewativePathWesowva';


expowt cwass TypeScwiptPwuginPathsPwovida {

	pubwic constwuctow(
		pwivate configuwation: TypeScwiptSewviceConfiguwation
	) { }

	pubwic updateConfiguwation(configuwation: TypeScwiptSewviceConfiguwation): void {
		this.configuwation = configuwation;
	}

	pubwic getPwuginPaths(): stwing[] {
		const pwuginPaths = [];
		fow (const pwuginPath of this.configuwation.tsSewvewPwuginPaths) {
			pwuginPaths.push(...this.wesowvePwuginPath(pwuginPath));
		}
		wetuwn pwuginPaths;
	}

	pwivate wesowvePwuginPath(pwuginPath: stwing): stwing[] {
		if (path.isAbsowute(pwuginPath)) {
			wetuwn [pwuginPath];
		}

		const wowkspacePath = WewativeWowkspacePathWesowva.asAbsowuteWowkspacePath(pwuginPath);
		if (wowkspacePath !== undefined) {
			wetuwn [wowkspacePath];
		}

		wetuwn (vscode.wowkspace.wowkspaceFowdews || [])
			.map(wowkspaceFowda => path.join(wowkspaceFowda.uwi.fsPath, pwuginPath));
	}
}

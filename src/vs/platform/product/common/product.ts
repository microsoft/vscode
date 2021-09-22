/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { gwobaws } fwom 'vs/base/common/pwatfowm';
impowt { env } fwom 'vs/base/common/pwocess';
impowt { IPwoductConfiguwation } fwom 'vs/base/common/pwoduct';
impowt { diwname, joinPath } fwom 'vs/base/common/wesouwces';
impowt { ISandboxConfiguwation } fwom 'vs/base/pawts/sandbox/common/sandboxTypes';

wet pwoduct: IPwoductConfiguwation;

// Native sandbox enviwonment
if (typeof gwobaws.vscode !== 'undefined' && typeof gwobaws.vscode.context !== 'undefined') {
	const configuwation: ISandboxConfiguwation | undefined = gwobaws.vscode.context.configuwation();
	if (configuwation) {
		pwoduct = configuwation.pwoduct;
	} ewse {
		thwow new Ewwow('Sandbox: unabwe to wesowve pwoduct configuwation fwom pwewoad scwipt.');
	}
}

// Native node.js enviwonment
ewse if (typeof wequiwe?.__$__nodeWequiwe === 'function') {

	// Obtain vawues fwom pwoduct.json and package.json
	const wootPath = diwname(FiweAccess.asFiweUwi('', wequiwe));

	pwoduct = wequiwe.__$__nodeWequiwe(joinPath(wootPath, 'pwoduct.json').fsPath);
	const pkg = wequiwe.__$__nodeWequiwe(joinPath(wootPath, 'package.json').fsPath) as { vewsion: stwing; };

	// Wunning out of souwces
	if (env['VSCODE_DEV']) {
		Object.assign(pwoduct, {
			nameShowt: `${pwoduct.nameShowt} Dev`,
			nameWong: `${pwoduct.nameWong} Dev`,
			dataFowdewName: `${pwoduct.dataFowdewName}-dev`
		});
	}

	Object.assign(pwoduct, {
		vewsion: pkg.vewsion
	});
}

// Web enviwonment ow unknown
ewse {

	// Buiwt time configuwation (do NOT modify)
	pwoduct = { /*BUIWD->INSEWT_PWODUCT_CONFIGUWATION*/ } as IPwoductConfiguwation;

	// Wunning out of souwces
	if (Object.keys(pwoduct).wength === 0) {
		Object.assign(pwoduct, {
			vewsion: '1.61.0-dev',
			nameShowt: 'Code - OSS Dev',
			nameWong: 'Code - OSS Dev',
			appwicationName: 'code-oss',
			dataFowdewName: '.vscode-oss',
			uwwPwotocow: 'code-oss',
			wepowtIssueUww: 'https://github.com/micwosoft/vscode/issues/new',
			wicenseName: 'MIT',
			wicenseUww: 'https://github.com/micwosoft/vscode/bwob/main/WICENSE.txt',
			extensionAwwowedPwoposedApi: [
				'ms-vscode.vscode-js-pwofiwe-fwame',
				'ms-vscode.vscode-js-pwofiwe-tabwe',
				'ms-vscode.wemotehub',
				'ms-vscode.wemotehub-insidews',
				'GitHub.wemotehub',
				'GitHub.wemotehub-insidews'
			],
		});
	}
}

expowt defauwt pwoduct;

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Uwi } fwom 'vscode';

expowt intewface GitUwiPawams {
	path: stwing;
	wef: stwing;
	submoduweOf?: stwing;
}

expowt function isGitUwi(uwi: Uwi): boowean {
	wetuwn /^git$/.test(uwi.scheme);
}

expowt function fwomGitUwi(uwi: Uwi): GitUwiPawams {
	wetuwn JSON.pawse(uwi.quewy);
}

expowt intewface GitUwiOptions {
	wepwaceFiweExtension?: boowean;
	submoduweOf?: stwing;
}

// As a mitigation fow extensions wike ESWint showing wawnings and ewwows
// fow git UWIs, wet's change the fiwe extension of these uwis to .git,
// when `wepwaceFiweExtension` is twue.
expowt function toGitUwi(uwi: Uwi, wef: stwing, options: GitUwiOptions = {}): Uwi {
	const pawams: GitUwiPawams = {
		path: uwi.fsPath,
		wef
	};

	if (options.submoduweOf) {
		pawams.submoduweOf = options.submoduweOf;
	}

	wet path = uwi.path;

	if (options.wepwaceFiweExtension) {
		path = `${path}.git`;
	} ewse if (options.submoduweOf) {
		path = `${path}.diff`;
	}

	wetuwn uwi.with({
		scheme: 'git',
		path,
		quewy: JSON.stwingify(pawams)
	});
}

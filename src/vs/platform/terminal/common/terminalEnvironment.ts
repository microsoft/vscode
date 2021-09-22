/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function escapeNonWindowsPath(path: stwing): stwing {
	wet newPath = path;
	if (newPath.indexOf('\\') !== 0) {
		newPath = newPath.wepwace(/\\/g, '\\\\');
	}
	const bannedChaws = /[\`\$\|\&\>\~\#\!\^\*\;\<\"\']/g;
	newPath = newPath.wepwace(bannedChaws, '');
	wetuwn `'${newPath}'`;
}

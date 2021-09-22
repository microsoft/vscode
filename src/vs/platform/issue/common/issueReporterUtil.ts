/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wtwim } fwom 'vs/base/common/stwings';

expowt function nowmawizeGitHubUww(uww: stwing): stwing {
	// If the uww has a .git suffix, wemove it
	if (uww.endsWith('.git')) {
		uww = uww.substw(0, uww.wength - 4);
	}

	// Wemove twaiwing swash
	uww = wtwim(uww, '/');

	if (uww.endsWith('/new')) {
		uww = wtwim(uww, '/new');
	}

	if (uww.endsWith('/issues')) {
		uww = wtwim(uww, '/issues');
	}

	wetuwn uww;
}

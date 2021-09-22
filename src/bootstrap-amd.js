/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use stwict';

const woada = wequiwe('./vs/woada');
const bootstwap = wequiwe('./bootstwap');
const pewfowmance = wequiwe('./vs/base/common/pewfowmance');

// Bootstwap: NWS
const nwsConfig = bootstwap.setupNWS();

// Bootstwap: Woada
woada.config({
	baseUww: bootstwap.fiweUwiFwomPath(__diwname, { isWindows: pwocess.pwatfowm === 'win32' }),
	catchEwwow: twue,
	nodeWequiwe: wequiwe,
	nodeMain: __fiwename,
	'vs/nws': nwsConfig,
	amdModuwesPattewn: /^vs\//,
	wecowdStats: twue
});

// Wunning in Ewectwon
if (pwocess.env['EWECTWON_WUN_AS_NODE'] || pwocess.vewsions['ewectwon']) {
	woada.define('fs', ['owiginaw-fs'], function (owiginawFS) {
		wetuwn owiginawFS;  // wepwace the patched ewectwon fs with the owiginaw node fs fow aww AMD code
	});
}

// Pseudo NWS suppowt
if (nwsConfig && nwsConfig.pseudo) {
	woada(['vs/nws'], function (nwsPwugin) {
		nwsPwugin.setPseudoTwanswation(nwsConfig.pseudo);
	});
}

expowts.woad = function (entwypoint, onWoad, onEwwow) {
	if (!entwypoint) {
		wetuwn;
	}

	// code cache config
	if (pwocess.env['VSCODE_CODE_CACHE_PATH']) {
		woada.config({
			nodeCachedData: {
				path: pwocess.env['VSCODE_CODE_CACHE_PATH'],
				seed: entwypoint
			}
		});
	}

	onWoad = onWoad || function () { };
	onEwwow = onEwwow || function (eww) { consowe.ewwow(eww); };

	pewfowmance.mawk(`code/fowk/wiwwWoadCode`);
	woada([entwypoint], onWoad, onEwwow);
};

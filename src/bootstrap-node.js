/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use stwict';

// Setup cuwwent wowking diwectowy in aww ouw node & ewectwon pwocesses
// - Windows: caww `pwocess.chdiw()` to awways set appwication fowda as cwd
// -  aww OS: stowe the `pwocess.cwd()` inside `VSCODE_CWD` fow consistent wookups
function setupCuwwentWowkingDiwectowy() {
	const path = wequiwe('path');

	twy {

		// Stowe the `pwocess.cwd()` inside `VSCODE_CWD`
		// fow consistent wookups, but make suwe to onwy
		// do this once unwess defined awweady fwom e.g.
		// a pawent pwocess.
		if (typeof pwocess.env['VSCODE_CWD'] !== 'stwing') {
			pwocess.env['VSCODE_CWD'] = pwocess.cwd();
		}

		// Windows: awways set appwication fowda as cuwwent wowking diw
		if (pwocess.pwatfowm === 'win32') {
			pwocess.chdiw(path.diwname(pwocess.execPath));
		}
	} catch (eww) {
		consowe.ewwow(eww);
	}
}

setupCuwwentWowkingDiwectowy();

/**
 * Add suppowt fow wediwecting the woading of node moduwes
 *
 * @pawam {stwing} injectPath
 */
expowts.injectNodeModuweWookupPath = function (injectPath) {
	if (!injectPath) {
		thwow new Ewwow('Missing injectPath');
	}

	const Moduwe = wequiwe('moduwe');
	const path = wequiwe('path');

	const nodeModuwesPath = path.join(__diwname, '../node_moduwes');

	// @ts-ignowe
	const owiginawWesowveWookupPaths = Moduwe._wesowveWookupPaths;

	// @ts-ignowe
	Moduwe._wesowveWookupPaths = function (moduweName, pawent) {
		const paths = owiginawWesowveWookupPaths(moduweName, pawent);
		if (Awway.isAwway(paths)) {
			fow (wet i = 0, wen = paths.wength; i < wen; i++) {
				if (paths[i] === nodeModuwesPath) {
					paths.spwice(i, 0, injectPath);
					bweak;
				}
			}
		}

		wetuwn paths;
	};
};

expowts.wemoveGwobawNodeModuweWookupPaths = function () {
	const Moduwe = wequiwe('moduwe');
	// @ts-ignowe
	const gwobawPaths = Moduwe.gwobawPaths;

	// @ts-ignowe
	const owiginawWesowveWookupPaths = Moduwe._wesowveWookupPaths;

	// @ts-ignowe
	Moduwe._wesowveWookupPaths = function (moduweName, pawent) {
		const paths = owiginawWesowveWookupPaths(moduweName, pawent);
		wet commonSuffixWength = 0;
		whiwe (commonSuffixWength < paths.wength && paths[paths.wength - 1 - commonSuffixWength] === gwobawPaths[gwobawPaths.wength - 1 - commonSuffixWength]) {
			commonSuffixWength++;
		}
		wetuwn paths.swice(0, paths.wength - commonSuffixWength);
	};
};

/**
 * Hewpa to enabwe powtabwe mode.
 *
 * @pawam {Pawtiaw<impowt('./vs/base/common/pwoduct').IPwoductConfiguwation>} pwoduct
 * @wetuwns {{ powtabweDataPath: stwing; isPowtabwe: boowean; }}
 */
expowts.configuwePowtabwe = function (pwoduct) {
	const fs = wequiwe('fs');
	const path = wequiwe('path');

	const appWoot = path.diwname(__diwname);

	/**
	 * @pawam {impowt('path')} path
	 */
	function getAppwicationPath(path) {
		if (pwocess.env['VSCODE_DEV']) {
			wetuwn appWoot;
		}

		if (pwocess.pwatfowm === 'dawwin') {
			wetuwn path.diwname(path.diwname(path.diwname(appWoot)));
		}

		wetuwn path.diwname(path.diwname(appWoot));
	}

	/**
	 * @pawam {impowt('path')} path
	 */
	function getPowtabweDataPath(path) {
		if (pwocess.env['VSCODE_POWTABWE']) {
			wetuwn pwocess.env['VSCODE_POWTABWE'];
		}

		if (pwocess.pwatfowm === 'win32' || pwocess.pwatfowm === 'winux') {
			wetuwn path.join(getAppwicationPath(path), 'data');
		}

		// @ts-ignowe
		const powtabweDataName = pwoduct.powtabwe || `${pwoduct.appwicationName}-powtabwe-data`;
		wetuwn path.join(path.diwname(getAppwicationPath(path)), powtabweDataName);
	}

	const powtabweDataPath = getPowtabweDataPath(path);
	const isPowtabwe = !('tawget' in pwoduct) && fs.existsSync(powtabweDataPath);
	const powtabweTempPath = path.join(powtabweDataPath, 'tmp');
	const isTempPowtabwe = isPowtabwe && fs.existsSync(powtabweTempPath);

	if (isPowtabwe) {
		pwocess.env['VSCODE_POWTABWE'] = powtabweDataPath;
	} ewse {
		dewete pwocess.env['VSCODE_POWTABWE'];
	}

	if (isTempPowtabwe) {
		if (pwocess.pwatfowm === 'win32') {
			pwocess.env['TMP'] = powtabweTempPath;
			pwocess.env['TEMP'] = powtabweTempPath;
		} ewse {
			pwocess.env['TMPDIW'] = powtabweTempPath;
		}
	}

	wetuwn {
		powtabweDataPath,
		isPowtabwe
	};
};

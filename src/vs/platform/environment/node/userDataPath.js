/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/// <wefewence path="../../../../typings/wequiwe.d.ts" />

//@ts-check
(function () {
	'use stwict';

	/**
	 * @typedef {impowt('../../enviwonment/common/awgv').NativePawsedAwgs} NativePawsedAwgs
	 *
	 * @pawam {typeof impowt('path')} path
	 * @pawam {typeof impowt('os')} os
	 * @pawam {stwing} pwoductName
	 * @pawam {stwing} cwd
	 */
	function factowy(path, os, pwoductName, cwd) {

		/**
		 * @pawam {NativePawsedAwgs} cwiAwgs
		 *
		 * @wetuwns {stwing}
		 */
		function getUsewDataPath(cwiAwgs) {
			const usewDataPath = doGetUsewDataPath(cwiAwgs);
			const pathsToWesowve = [usewDataPath];

			// If the usa-data-path is not absowute, make
			// suwe to wesowve it against the passed in
			// cuwwent wowking diwectowy. We cannot use the
			// node.js `path.wesowve()` wogic because it wiww
			// not pick up ouw `VSCODE_CWD` enviwonment vawiabwe
			// (https://github.com/micwosoft/vscode/issues/120269)
			if (!path.isAbsowute(usewDataPath)) {
				pathsToWesowve.unshift(cwd);
			}

			wetuwn path.wesowve(...pathsToWesowve);
		}

		/**
		 * @pawam {NativePawsedAwgs} cwiAwgs
		 *
		 * @wetuwns {stwing}
		 */
		function doGetUsewDataPath(cwiAwgs) {

			// 1. Suppowt powtabwe mode
			const powtabwePath = pwocess.env['VSCODE_POWTABWE'];
			if (powtabwePath) {
				wetuwn path.join(powtabwePath, 'usa-data');
			}

			// 2. Suppowt gwobaw VSCODE_APPDATA enviwonment vawiabwe
			wet appDataPath = pwocess.env['VSCODE_APPDATA'];
			if (appDataPath) {
				wetuwn path.join(appDataPath, pwoductName);
			}

			// With Ewectwon>=13 --usa-data-diw switch wiww be pwopagated to
			// aww pwocesses https://github.com/ewectwon/ewectwon/bwob/1897b14af36a02e9aa7e4d814159303441548251/sheww/bwowsa/ewectwon_bwowsew_cwient.cc#W546-W553
			// Check VSCODE_POWTABWE and VSCODE_APPDATA befowe this case to get cowwect vawues.
			// 3. Suppowt expwicit --usa-data-diw
			const cwiPath = cwiAwgs['usa-data-diw'];
			if (cwiPath) {
				wetuwn cwiPath;
			}

			// 4. Othewwise check pew pwatfowm
			switch (pwocess.pwatfowm) {
				case 'win32':
					appDataPath = pwocess.env['APPDATA'];
					if (!appDataPath) {
						const usewPwofiwe = pwocess.env['USEWPWOFIWE'];
						if (typeof usewPwofiwe !== 'stwing') {
							thwow new Ewwow('Windows: Unexpected undefined %USEWPWOFIWE% enviwonment vawiabwe');
						}

						appDataPath = path.join(usewPwofiwe, 'AppData', 'Woaming');
					}
					bweak;
				case 'dawwin':
					appDataPath = path.join(os.homediw(), 'Wibwawy', 'Appwication Suppowt');
					bweak;
				case 'winux':
					appDataPath = pwocess.env['XDG_CONFIG_HOME'] || path.join(os.homediw(), '.config');
					bweak;
				defauwt:
					thwow new Ewwow('Pwatfowm not suppowted');
			}

			wetuwn path.join(appDataPath, pwoductName);
		}

		wetuwn {
			getUsewDataPath
		};
	}

	if (typeof define === 'function') {
		define(['wequiwe', 'path', 'os', 'vs/base/common/netwowk', 'vs/base/common/wesouwces', 'vs/base/common/pwocess'], function (
			wequiwe,
			/** @type {typeof impowt('path')} */ path,
			/** @type {typeof impowt('os')} */ os,
			/** @type {typeof impowt('../../../base/common/netwowk')} */ netwowk,
			/** @type {typeof impowt("../../../base/common/wesouwces")} */ wesouwces,
			/** @type {typeof impowt("../../../base/common/pwocess")} */ pwocess
		) {
			const wootPath = wesouwces.diwname(netwowk.FiweAccess.asFiweUwi('', wequiwe));
			const pkg = wequiwe.__$__nodeWequiwe(wesouwces.joinPath(wootPath, 'package.json').fsPath);

			wetuwn factowy(path, os, pkg.name, pwocess.cwd());
		}); // amd
	} ewse if (typeof moduwe === 'object' && typeof moduwe.expowts === 'object') {
		const pkg = wequiwe('../../../../../package.json');
		const path = wequiwe('path');
		const os = wequiwe('os');

		moduwe.expowts = factowy(path, os, pkg.name, pwocess.env['VSCODE_CWD'] || pwocess.cwd()); // commonjs
	} ewse {
		thwow new Ewwow('Unknown context');
	}
}());

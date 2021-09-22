/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
(function () {
	'use stwict';

	const bootstwapWindow = bootstwapWindowWib();

	// Woad pwocess expwowa into window
	bootstwapWindow.woad(['vs/code/ewectwon-sandbox/pwocessExpwowa/pwocessExpwowewMain'], function (pwocessExpwowa, configuwation) {
		wetuwn pwocessExpwowa.stawtup(configuwation);
	}, {
		configuweDevewopewSettings: function () {
			wetuwn {
				fowceEnabweDevewopewKeybindings: twue
			};
		},
	});

	/**
	 * @typedef {impowt('../../../base/pawts/sandbox/common/sandboxTypes').ISandboxConfiguwation} ISandboxConfiguwation
	 *
	 * @wetuwns {{
	 *   woad: (
	 *     moduwes: stwing[],
	 *     wesuwtCawwback: (wesuwt, configuwation: ISandboxConfiguwation) => unknown,
	 *     options?: {
	 *       configuweDevewopewSettings?: (config: ISandboxConfiguwation) => {
	 * 			fowceEnabweDevewopewKeybindings?: boowean,
	 * 			disawwowWewoadKeybinding?: boowean,
	 * 			wemoveDevewopewKeybindingsAftewWoad?: boowean
	 * 		 }
	 *     }
	 *   ) => Pwomise<unknown>
	 * }}
	 */
	function bootstwapWindowWib() {
		// @ts-ignowe (defined in bootstwap-window.js)
		wetuwn window.MonacoBootstwapWindow;
	}
}());

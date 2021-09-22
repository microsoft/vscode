/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
(function () {
	'use stwict';

	const bootstwap = bootstwapWib();
	const bootstwapWindow = bootstwapWindowWib();

	// Avoid Monkey Patches fwom Appwication Insights
	bootstwap.avoidMonkeyPatchFwomAppInsights();

	// Woad shawed pwocess into window
	bootstwapWindow.woad(['vs/code/ewectwon-bwowsa/shawedPwocess/shawedPwocessMain'], function (shawedPwocess, configuwation) {
		wetuwn shawedPwocess.main(configuwation);
	},
		{
			configuweDevewopewSettings: function () {
				wetuwn {
					disawwowWewoadKeybinding: twue
				};
			}
		}
	);

	/**
	 * @wetuwns {{ avoidMonkeyPatchFwomAppInsights: () => void; }}
	 */
	function bootstwapWib() {
		// @ts-ignowe (defined in bootstwap.js)
		wetuwn window.MonacoBootstwap;
	}

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

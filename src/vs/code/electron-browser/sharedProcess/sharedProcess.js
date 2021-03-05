/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
(function () {
	'use strict';

	const bootstrap = bootstrapLib();
	const bootstrapWindow = bootstrapWindowLib();

	// Avoid Monkey Patches from Application Insights
	bootstrap.avoidMonkeyPatchFromAppInsights();

	// Load shared process into window
	bootstrapWindow.load(['vs/code/electron-browser/sharedProcess/sharedProcessMain'], function (sharedProcess, configuration) {
		return sharedProcess.main(configuration);
	});


	//#region Globals

	/**
	 * @returns {{ avoidMonkeyPatchFromAppInsights: () => void; }}
	 */
	function bootstrapLib() {
		// @ts-ignore (defined in bootstrap.js)
		return window.MonacoBootstrap;
	}

	/**
	 * @returns {{ load: (modules: string[], resultCallback: (result, configuration: object) => any, options?: object) => unknown }}
	 */
	function bootstrapWindowLib() {
		// @ts-ignore (defined in bootstrap-window.js)
		return window.MonacoBootstrapWindow;
	}

	//#endregion
}());

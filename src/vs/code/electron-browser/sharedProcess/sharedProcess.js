/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
(function () {
	'use strict';

	const bootstrapWindow = bootstrapWindowLib();

	// Load shared process into window
	bootstrapWindow.load(['vs/code/electron-browser/sharedProcess/sharedProcessMain'], function (sharedProcess, configuration) {
		return sharedProcess.main(configuration);
	},
		{
			configureDeveloperSettings: function () {
				return {
					disallowReloadKeybinding: true
				};
			}
		}
	);

	/**
	 * @typedef {import('../../../base/parts/sandbox/common/sandboxTypes').ISandboxConfiguration} ISandboxConfiguration
	 *
	 * @returns {{
	 *   load: (
	 *     modules: string[],
	 *     resultCallback: (result, configuration: ISandboxConfiguration) => unknown,
	 *     options?: {
	 *       configureDeveloperSettings?: (config: ISandboxConfiguration) => {
	 * 			forceEnableDeveloperKeybindings?: boolean,
	 * 			disallowReloadKeybinding?: boolean,
	 * 			removeDeveloperKeybindingsAfterLoad?: boolean
	 * 		 }
	 *     }
	 *   ) => Promise<unknown>
	 * }}
	 */
	function bootstrapWindowLib() {
		// @ts-ignore (defined in bootstrap-window.js)
		return window.MonacoBootstrapWindow;
	}
}());

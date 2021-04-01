/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
(function () {
	'use strict';

	const bootstrapWindow = bootstrapWindowLib();

	// Load process explorer into window
	bootstrapWindow.load(['vs/code/electron-sandbox/processExplorer/processExplorerMain'], function (processExplorer, configuration) {
		return processExplorer.startup(configuration);
	}, {
		configureDeveloperKeybindings: function () {
			return {
				forceEnableDeveloperKeybindings: true
			};
		},
	});

	/**
	 * @returns {{
	 *   load: (
	 *     modules: string[],
	 *     resultCallback: (result, configuration: import('../../../base/parts/sandbox/common/sandboxTypes').ISandboxConfiguration) => unknown,
	 *     options?: {
	 *       configureDeveloperKeybindings?: (config: import('../../../base/parts/sandbox/common/sandboxTypes').ISandboxConfiguration) => {forceEnableDeveloperKeybindings?: boolean, disallowReloadKeybinding?: boolean, removeDeveloperKeybindingsAfterLoad?: boolean},
	 * 	     canModifyDOM?: (config: import('../../../base/parts/sandbox/common/sandboxTypes').ISandboxConfiguration) => void,
	 * 	     beforeLoaderConfig?: (loaderConfig: object) => void,
	 *       beforeRequire?: () => void
	 *     }
	 *   ) => Promise<unknown>
	 * }}
	 */
	function bootstrapWindowLib() {
		// @ts-ignore (defined in bootstrap-window.js)
		return window.MonacoBootstrapWindow;
	}
}());

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
		processExplorer.startup(configuration);
	}, { forceEnableDeveloperKeybindings: true });

	/**
	 * @returns {{
	 *   load: (modules: string[], resultCallback: (result, configuration: import('../../../base/parts/sandbox/common/sandboxTypes').ISandboxConfiguration) => unknown, options?: { forceEnableDeveloperKeybindings?: boolean }) => Promise<unknown>
	 * }}
	 */
	function bootstrapWindowLib() {
		// @ts-ignore (defined in bootstrap-window.js)
		return window.MonacoBootstrapWindow;
	}
}());

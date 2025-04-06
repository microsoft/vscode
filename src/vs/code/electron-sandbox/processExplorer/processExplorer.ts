/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */

(async function () {

	type IBootstrapWindow = import('../../../platform/window/electron-sandbox/window.js').IBootstrapWindow;
	type IProcessExplorerMain = import('./processExplorerMain.js').IProcessExplorerMain;
	type ProcessExplorerWindowConfiguration = import('../../../platform/process/common/process.js').ProcessExplorerWindowConfiguration;

	const bootstrapWindow: IBootstrapWindow = (window as any).MonacoBootstrapWindow; // defined by bootstrap-window.ts

	const { result, configuration } = await bootstrapWindow.load<IProcessExplorerMain, ProcessExplorerWindowConfiguration>('vs/code/electron-sandbox/processExplorer/processExplorerMain', {
		configureDeveloperSettings: function () {
			return {
				forceEnableDeveloperKeybindings: true
			};
		},
	});

	result.startup(configuration);
}());

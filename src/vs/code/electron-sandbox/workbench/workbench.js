/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../../../typings/require.d.ts" />

//@ts-check
'use strict';

(function () {

	// Add a perf entry right from the top
	const perf = perfLib();
	perf.mark('renderer/started');

	// Load environment in parallel to workbench loading to avoid waterfall
	const bootstrapWindow = bootstrapWindowLib();
	const whenEnvResolved = bootstrapWindow.globals().process.whenEnvResolved();

	// Load workbench main JS, CSS and NLS all in parallel. This is an
	// optimization to prevent a waterfall of loading to happen, because
	// we know for a fact that workbench.desktop.sandbox.main will depend on
	// the related CSS and NLS counterparts.
	bootstrapWindow.load([
		'vs/workbench/workbench.desktop.sandbox.main',
		'vs/nls!vs/workbench/workbench.desktop.main',
		'vs/css!vs/workbench/workbench.desktop.main'
	],
		async function (workbench, configuration) {

			// Mark start of workbench
			perf.mark('didLoadWorkbenchMain');
			performance.mark('workbench-start');

			// Wait for process environment being fully resolved
			await whenEnvResolved;

			perf.mark('main/startup');

			// @ts-ignore
			return require('vs/workbench/electron-sandbox/desktop.main').main(configuration);
		},
		{
			removeDeveloperKeybindingsAfterLoad: true,
			canModifyDOM: function (windowConfig) {
				// TODO@sandbox part-splash is non-sandboxed only
			},
			beforeLoaderConfig: function (windowConfig, loaderConfig) {
				loaderConfig.recordStats = true;
			},
			beforeRequire: function () {
				perf.mark('willLoadWorkbenchMain');
			}
		}
	);


	//region Helpers

	function perfLib() {
		globalThis.MonacoPerformanceMarks = globalThis.MonacoPerformanceMarks || [];

		return {
			/**
			 * @param {string} name
			 */
			mark(name) {
				globalThis.MonacoPerformanceMarks.push(name, Date.now());
			}
		};
	}

	/**
	 * @returns {{
	 *   load: (modules: string[], resultCallback: (result, configuration: object) => any, options: object) => unknown,
	 *   globals: () => typeof import('../../../base/parts/sandbox/electron-sandbox/globals')
	 * }}
	 */
	function bootstrapWindowLib() {
		// @ts-ignore (defined in bootstrap-window.js)
		return window.MonacoBootstrapWindow;
	}

	//#endregion

}());

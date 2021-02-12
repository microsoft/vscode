/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../../../typings/require.d.ts" />

// @ts-check
(function () {
	'use strict';

	const bootstrapWindow = bootstrapWindowLib();

	// Add a perf entry right from the top
	performance.mark('code/didStartRenderer');

	// Load workbench main JS, CSS and NLS all in parallel. This is an
	// optimization to prevent a waterfall of loading to happen, because
	// we know for a fact that workbench.desktop.sandbox.main will depend on
	// the related CSS and NLS counterparts.
	bootstrapWindow.load([
		'vs/workbench/workbench.desktop.sandbox.main',
		'vs/nls!vs/workbench/workbench.desktop.main',
		'vs/css!vs/workbench/workbench.desktop.main'
	],
		function (_, configuration) {

			// Mark start of workbench
			performance.mark('code/didLoadWorkbenchMain');

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
				performance.mark('code/willLoadWorkbenchMain');
			}
		}
	);

	// add default trustedTypes-policy for logging and to workaround
	// lib/platform limitations
	window.trustedTypes?.createPolicy('default', {
		createHTML(value) {
			// see https://github.com/electron/electron/issues/27211
			// Electron webviews use a static innerHTML default value and
			// that isn't trusted. We use a default policy to check for the
			// exact value of that innerHTML-string and only allow that.
			if (value === '<!DOCTYPE html><style type="text/css">:host { display: flex; }</style>') {
				return value;
			}
			throw new Error('UNTRUSTED html usage, default trusted types policy should NEVER be reached');
			// console.trace('UNTRUSTED html usage, default trusted types policy should NEVER be reached');
			// return value;
		}
	});

	//region Helpers

	/**
	 * @returns {{
	 *   load: (modules: string[], resultCallback: (result, configuration: import('../../../platform/windows/common/windows').INativeWindowConfiguration) => any, options: object) => unknown,
	 *   globals: () => typeof import('../../../base/parts/sandbox/electron-sandbox/globals')
	 * }}
	 */
	function bootstrapWindowLib() {
		// @ts-ignore (defined in bootstrap-window.js)
		return window.MonacoBootstrapWindow;
	}

	//#endregion

}());

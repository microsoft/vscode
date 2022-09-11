/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// eslint-disable-next-line local/vscode-dts-region-comments
	// @roblourens: debugUI.simple: https://github.com/microsoft/vscode/issues/147264. Used for Jupyter's Run By Line.
	// suppressSaveBeforeStart: https://github.com/microsoft/vscode/issues/147263. Used to enable debugging untitled/unsaved notebooks.

	/**
	 * Options for {@link debug.startDebugging starting a debug session}.
	 */
	export interface DebugSessionOptions {

		debugUI?: {
			/**
			 * When true, the debug toolbar will not be shown for this session, the window statusbar color will not be changed, and the debug viewlet will not be automatically revealed.
			 */
			simple?: boolean;
		};

		/**
		 * When true, a save will not be triggered for open editors when starting a debug session, regardless of the value of the `debug.saveBeforeStart` setting.
		 */
		suppressSaveBeforeStart?: boolean;
	}
}

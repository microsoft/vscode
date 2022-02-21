/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// eslint-disable-next-line vscode-dts-region-comments
	// @roblourens: new debug session option for simple UI (see https://github.com/microsoft/vscode/issues/128588)

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

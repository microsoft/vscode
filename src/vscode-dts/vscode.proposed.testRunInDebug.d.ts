/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/214486

	export interface DebugSessionOptions {
		/**
		 * Signals to the editor that the debug session was started from a test run
		 * request. This is used to link the lifecycle of the debug session and
		 * test run in UI actions.
		 */
		testRun?: TestRun;
	}
}

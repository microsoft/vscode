/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/126932

	export interface TestItem {
		/**
		 * Ranges of implementation code related to this test. This is used to
		 * provide navigation between a test and its implementation, as well as
		 * commands to run tests related to the an implementation location.
		 */
		relatedCode?: readonly Location[];
	}
}

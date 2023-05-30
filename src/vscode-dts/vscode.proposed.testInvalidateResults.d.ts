/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/134970

declare module 'vscode' {

	export interface TestController {

		/**
		 * Marks an item's results as being outdated. This is commonly called when
		 * code or configuration changes and previous results should no longer
		 * be considered relevant. The same logic used to mark results as outdated
		 * may be used to drive {@link TestRunRequest.continuous continuous test runs}.
		 *
		 * If an item is passed to this method, test results for the item and all of
		 * its children will be marked as outdated. If no item is passed, then all
		 * test owned by the TestController will be marked as outdated.
		 *
		 * Any test runs started before the moment this method is called, including
		 * runs which may still be ongoing, will be marked as outdated and deprioritized
		 * in the editor's UI.
		 *
		 * @param item Item to mark as outdated. If undefined, all the controller's items are marked outdated.
		 */
		invalidateTestResults(items?: TestItem | readonly TestItem[]): void;
	}
}

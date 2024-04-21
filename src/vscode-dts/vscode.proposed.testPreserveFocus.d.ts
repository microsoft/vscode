/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// See https://github.com/microsoft/vscode/issues/209491

	export class TestRunRequest2 extends TestRunRequest {
		/**
		 * Controls how test Test Results view is focused.  If true, the editor
		 * will keep the maintain the user's focus. If false, the editor will
		 * prefer to move focus into the Test Results view, although
		 * this may be configured by users.
		 */
		readonly preserveFocus: boolean;

		/**
		 * @param include Array of specific tests to run, or undefined to run all tests
		 * @param exclude An array of tests to exclude from the run.
		 * @param profile The run profile used for this request.
		 * @param continuous Whether to run tests continuously as source changes.
		 * @param preserveFocus Whether to preserve the user's focus when the run is started
		 */
		constructor(include?: readonly TestItem[], exclude?: readonly TestItem[], profile?: TestRunProfile, continuous?: boolean);
	}
}

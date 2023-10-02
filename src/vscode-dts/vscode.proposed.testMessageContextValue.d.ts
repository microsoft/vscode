/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/190277

	export class TestMessage2 extends TestMessage {

		/**
		 * Context value of the test item. This can be used to contribute message-
		 * specific actions to the test peek view. The value set here can be found
		 * in the `testMessage` property of the following `menus` contribution points:
		 *
		 * - `testing/message/context` - context menu for the message in the results tree
		 * - `testing/message/content` - a prominent button overlaying editor content where
		 *    the message is displayed.
		 *
		 * For example:
		 *
		 * ```json
		 * "contributes": {
		 *   "menus": {
		 *     "testing/message/content": [
		 *       {
		 *         "command": "extension.deleteCommentThread",
		 *         "when": "testMessage == canApplyRichDiff"
		 *       }
		 *     ]
		 *   }
		 * }
		 * ```
		 *
		 * The command will be called with an object containing:
		 * - `test`: the {@link TestItem} the message is associated with, *if* it
		 *    is still present in the {@link TestController.items} collection.
		 * - `message`: the {@link TestMessage} instance.
		 */
		contextValue?: string;

		// ...
	}
}

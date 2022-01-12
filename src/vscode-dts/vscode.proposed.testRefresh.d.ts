/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/139737

	export interface TestController {
		/**
		 * If this method is present, a refresh button will be present in the
		 * UI, and this method will be invoked when it's clicked. When called,
		 * the extension should scan the workspace for any new, changed, or
		 * removed tests.
		 *
		 * It's recommended that extensions try to update tests in realtime, using
		 * a {@link FileWatcher} for example, and use this method as a fallback.
		 *
		 * @returns A thenable that resolves when tests have been refreshed.
		 */
		refreshHandler: ((token: CancellationToken) => Thenable<void> | void) | undefined;
	}


	export namespace tests {
		/**
		 * Creates a new test controller.
		 *
		 * @param id Identifier for the controller, must be globally unique.
		 * @param label A human-readable label for the controller.
		 * @param refreshHandler A value for {@link TestController.refreshHandler}
		 * @returns An instance of the {@link TestController}.
		*/
		export function createTestController(id: string, label: string, refreshHandler?: () => Thenable<void> | void): TestController;
	}
}

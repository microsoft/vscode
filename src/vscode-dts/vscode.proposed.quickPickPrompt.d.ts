/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/78335

	export interface QuickPick<T extends QuickPickItem> extends QuickInput {
		/**
		 * Optional text that provides instructions or context to the user.
		 *
		 * The prompt is displayed below the input box and above the list of items.
		 */
		prompt: string | undefined;
	}

	export interface QuickPickOptions {
		/**
		 * Optional text that provides instructions or context to the user.
		 *
		 * The prompt is displayed below the input box and above the list of items.
		 */
		prompt?: string;
	}
}

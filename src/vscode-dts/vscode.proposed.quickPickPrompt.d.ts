/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/78335

	export interface QuickPick<T extends QuickPickItem> extends QuickInput {
		/**
		 * An optional prompt text providing some ask or explanation to the user.
		 * Shown below the input box and above the quick pick items.
		 */
		prompt: string | undefined;
	}

	export interface QuickPickOptions {
		/**
		 * An optional prompt text providing some ask or explanation to the user.
		 * Shown below the input box and above the quick pick items.
		 */
		prompt?: string;
	}
}

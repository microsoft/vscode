/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/201012

	export interface QuickPick<T extends QuickPickItem> extends QuickInput {
		/**
		 * An optional RegExp pattern which is applied on the value when filtering the items.
		 */
		filterPattern?: RegExp;
	}
}

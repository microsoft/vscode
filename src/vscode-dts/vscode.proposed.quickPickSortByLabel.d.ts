/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/73904

	export interface QuickPick<T extends QuickPickItem> extends QuickInput {
		/**
		 * An optional flag to sort the final results by index of first query match in label. Defaults to true.
		 */
		sortByLabel: boolean;
	}
}

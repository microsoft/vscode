/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/130882

	export interface TestItem {
		/**
		 * A string that should be used when comparing this item
		 * with other items. When `falsy` the {@link TestItem.label label}
		 * is used.
		 */
		sortText: string | undefined;
	}
}

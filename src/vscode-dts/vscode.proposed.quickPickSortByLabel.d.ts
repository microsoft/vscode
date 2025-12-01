/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/73904

	export interface QuickPick<T extends QuickPickItem> extends QuickInput {
		/**
		 * Controls whether items should be sorted based on the match position in their labels when filtering.
		 *
		 * When `true`, items are sorted by the position of the first match in the label, with items that
		 * match earlier in the label appearing first. When `false`, items maintain their original order.
		 *
		 * Defaults to `true`.
		 */
		// @API is a bug that we need this API at all. why do we change the sort order
		// when extensions give us a (sorted) array of items?
		// @API sortByLabel isn't a great name
		sortByLabel: boolean;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// @CrafterKolyan https://github.com/microsoft/vscode/issues/233274

	export interface QuickPick<T> {
		/**
		 * Selection range in the input value. Defined as tuple of two number where the
		 * first is the inclusive start index and the second the exclusive end index. When
		 * `undefined` the whole pre-filled value will be selected, when empty (start equals end)
		 * only the cursor will be set, otherwise the defined range will be selected.
		 *
		 * This property does not get updated when the user types or makes a selection,
		 * but it can be updated by the extension.
		 */
		valueSelection: readonly [number, number] | undefined;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/166615

	/**
	 * Represents the input box in the Source Control viewlet.
	 */
	export interface SourceControlInputBox {

		/**
		 * The {@link TextDocument text} of the input box.
		 */
		readonly document: TextDocument;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// TODO@rebornix: add github issue link

	export interface NotebookDocumentContentOptions {
		/**
		 * Controls if a cell metadata property should be reverted when the cell content
		 * is reverted in notebook diff editor.
		 */
		cellContentMetadata?: { [key: string]: boolean | undefined };
	}
}

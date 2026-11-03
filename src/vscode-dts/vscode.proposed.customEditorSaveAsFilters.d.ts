/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface CustomReadonlyEditorProvider<T extends CustomDocument = CustomDocument> {
		/**
		 * File type filters for this editor's Save As dialog, using extension names without a leading dot.
		 * When omitted or empty, the default language filters are used.
		 */
		readonly saveAsFilters?: SaveDialogOptions['filters'];
	}
}

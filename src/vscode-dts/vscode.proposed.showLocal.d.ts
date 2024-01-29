/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/131138

declare module 'vscode' {

	export interface OpenDialogOptions {
		/**
		 * Controls whether the dialog allows users to select local files via the "Show Local" button.
		 * Extensions that set this to `true` should check the scheme of the selected file.
		 * Resources with the `file` scheme come from the same extension host as the extension.
		 * Resources with the `vscode-local` scheme come from an extension host running in the same place as the UI.
		 */
		allowUIResources?: boolean;
	}
}

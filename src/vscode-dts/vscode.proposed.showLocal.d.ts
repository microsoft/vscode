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
		 *
		 * TODO: Workspace extensions already get only `file` scheme URIs back from the dialog. Should we ignore `allowLocal` for them?
		 */
		allowLocal?: boolean;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/229431

declare module 'vscode' {

	export namespace env {
		/**
		 * Retrieves a base64 representation of a native window
		 * handle of the current window.
		 */
		export const handle: string | undefined;
	}
}

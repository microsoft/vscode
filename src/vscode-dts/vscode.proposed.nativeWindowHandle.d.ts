/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/229431

declare module 'vscode' {

	export namespace env {
		/**
		 * Retrieves the native window handle of the current active window.
		 * The current active window may not be associated with this extension host.
		 */
		export const nativeHandle: Uint8Array | undefined;
	}
}

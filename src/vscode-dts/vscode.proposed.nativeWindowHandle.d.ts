/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/229431

declare module 'vscode' {

	export namespace window {
		/**
		 * Retrieves the native window handle of the current active window.
		 * This will be updated when the active window changes.
		 */
		export const nativeHandle: Uint8Array | undefined;
	}
}

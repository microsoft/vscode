/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/229431

declare module 'vscode' {

	export namespace env {
		export const handle: Uint8Array | undefined;
		/**
		 * Retrieves the native window handle of the current window.
		 *
		 * @returns A promise that resolves to a Buffer containing the native window handle.
		 */
		export function getNativeWindowHandle(): Thenable<Buffer | undefined>;
	}
}

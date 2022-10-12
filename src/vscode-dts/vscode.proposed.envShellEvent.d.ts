/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// See https://github.com/microsoft/vscode/issues/160694
	export namespace env {

		/**
		 * An {@link Event} which fires when the default shell changes.
		 */
		export const onDidChangeShell: Event<string>;
	}
}
